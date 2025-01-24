const User = require("../../models/userSchema");
const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const Order = require("../../models/orderSchema");
const Cart = require("../../models/cartSchema");
const Wishlist = require('../../models/wishlistSchema');
const Coupon = require('../../models/couponSchema');
const env = require("dotenv").config();
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const Address = require('../../models/addressSchema');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');

// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Load homepage
const loadHomepage = async (req, res) => {
  try {
    // Get active categories
    const categories = await Category.find({ isListed: true });
    
    // Get unblocked products from active categories
    const baseQuery = {
      isBlocked: false,
      category: { $in: categories.map(category => category._id) }
    };

    // Get new arrivals (latest 8 products)
    const newArrivals = await Product.find(baseQuery)
      .populate('category')
      .select('productName salesPrice regularPrice variants category isBlocked')
      .sort({ createdAt: -1 })
      .limit(8)
      .lean();

    // Get top selling products based on order count (8 products)
    const topSelling = await Order.aggregate([
      { $unwind: "$items" },
      { $group: { 
        _id: "$items.productId",
        totalQuantity: { $sum: "$items.quantity" }
      }},
      { $sort: { totalQuantity: -1 } },
      { $limit: 8 }
    ]);

    // Get full product details for top selling products
    const topSellingProductIds = topSelling.map(item => item._id);
    const topSellingProducts = await Product.find({
      _id: { $in: topSellingProductIds },
      ...baseQuery
    })
    .populate('category')
    .select('productName salesPrice regularPrice variants category isBlocked')
    .lean();

    // Sort topSellingProducts to match the order from aggregation
    const topSellingProductsOrdered = topSellingProductIds.map(id => 
      topSellingProducts.find(product => product._id.toString() === id.toString())
    ).filter(Boolean);

    // Get user's wishlist if logged in
    let wishlistProducts = [];
    if (req.session.user) {
      const wishlist = await Wishlist.findOne({ userId: req.session.user._id });
      if (wishlist) {
        wishlistProducts = wishlist.products.map(item => item.productId.toString());
      }
    }
    
    res.render("home", {
      message: req.session.user,
      newArrivals,
      topSellingProducts: topSellingProductsOrdered,
      categories,
      wishlistProducts
    });
  } catch (error) {
    console.error('Error in loadHomepage:', error);
    res.status(500).render('500');
  }
};
// Load signup page
const loadSignup = async (req, res) => {
  try {
    res.render("signup");
  } catch (error) {
    console.log("signup page not loading:", error);
    res.status(500).send("Sever error")
  }
};

// Generate OTP
function generateOtp(){
  return Math.floor(100000 + Math.random()*900000).toString();
}

// Send verification email
async function sendVerificationEmail(email,otp) {
  try{
    const transporter = nodemailer.createTransport({
      service:"gmail",
      port:587,
      secure:false,
      requireTLS:true,
      auth:{
        user:process.env.NODEMAILER_EMAIL,
        pass:process.env.NODEMAILER_PASSWORD
      }
    })

    const info = await transporter.sendMail({
      from:process.env.NODEMAILER_EMAIL,
      to:email,
      subject:"Verify your account",
      text:`Your OTP is ${otp}`,
      html:`<b>Your OTP:${otp}</b>`
    })
    
    return info.accepted.length > 0
  } catch (error){
    console.error("Error sending email", error);
    return false


  }
}

// Handle signup request
const Signup = async (req, res) => {
  try {
    const {name,phone,email,password,cPassword} = req.body;
    if(password !== cPassword){
      return res.render("signup",{message:"Password do not match"});
    }
    const findUser = await User.findOne({email});
    if(findUser){
      return res.render("signup",{message:"User with this mail already exists"})
    }
    const otp = generateOtp();
    const emailSent = await sendVerificationEmail(email,otp);
    if(!emailSent){
      return res.json({ error: "email-error" });
    }
    req.session.userOtp = otp;
    req.session.userData = {name,phone,email,password};

    res.render("verify-otp");
    console.log("OTP Sent",otp);
  } catch (error) {
    console.error("signup error:", error);
    res.redirect("/pageNotFound")


  }
};

// Load page not found page
const pageNotFound = async (req, res) => {
  try {
    res.render("page-404");
  } catch (error) {
    res.redirect("/pageNotFound")   
  }
};

// Secure password
const securePassword = async(password)=>{
  try{
    const passwordHash = await bcrypt.hash(password,10)
    return passwordHash
  }catch(error){

  }
};

// Verify OTP
const verifyOtp = async (req, res) => {
  try {
    const { otp } = req.body;
    console.log("Received OTP:", otp);
  
    // Validate OTP
    if (otp !== req.session.userOtp) {
      return res.status(400).json({ success: false, message: "Invalid OTP, please try again" });
    }
  
    const user = req.session.userData;
  
    // Check for duplicate email
    const existingUser = await User.findOne({ email: user.email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "User with this email already exists" });
    }
  
    // Hash the password
    const passwordHash = await securePassword(user.password);
  
    // Prepare user data for saving
    const saveUserData = new User({
      name: user.name,
      email: user.email,
      phone: user.phone,
      password: passwordHash,
       
    });
  
    // Save the new user to the database
    await saveUserData.save();
  
    // Store the user ID in the session
    req.session.user = saveUserData._id;
  
    // Respond with success
    res.json({ success: true, redirectUrl: "/" });
  } catch (error) {
    console.error("Error Verifying OTP:", error.message);
    res.status(500).json({ success: false, message: "An error occurred" });
  }
};

// Resend OTP
const resendOtp = async(req,res)=>{
  try{
   const {email} = req.session.userData;
   if(!email){
    return res.status(400).json({success:false,message:"Email not found in session"})
   }
   const otp = generateOtp();
   req.session.userOtp = otp;
   const emailSent = await sendVerificationEmail(email,otp);
   if(emailSent){
    console.log("Resend OTP:",otp);
    return res.status(200).json({success:true,message:"OTP Resend Successfully"})
   }else{
    return res.status(500).json({success:false,message:"Failed to Resend OTP. Please try again"});
   } 
  }catch(error){
    console.error("Error resending OTP:",error)
    return res.status(500).json({success:false,message:"Internal Sever Error. Please try again"});
  }
};

// Load login page
const loadLogin = async (req, res) => {
  try {
   
    if(!req.session.user){
      const error = req.session.loginError;
      req.session.loginError = ''
      return res.render("login",{message:error})
    }else{
      res.redirect("/")
    }
  } catch (error) {
    res.redirect("/pageNotFound")  
  }
};

// Handle login request
const login = async(req,res)=>{
  try{
    const {email,password} = req.body;
    const findUser = await User.findOne({isAdmin:0,email:email});
    if(!findUser){
      req.session.loginError = "User not found";
      return res.redirect("/login")
    }
    if(findUser.isBlocked){
      return res.render("login",{message:"User is blocked by admin", success: false})
    }

    const passwordMatch = await bcrypt.compare(password,findUser.password);
    if(!passwordMatch){
      return res.render("login",{message:"Incorrect password", success: false})
    }
   
    req.session.user = findUser;
    res.redirect("/")

  }catch(error){
    console.error("login error",error)
    res.render("login",{message:"login failed. Please try again later"})

  }
};

// Handle logout request
const logout = async(req,res)=>{
  try{
  req.session.destroy((err)=>{
    if(err){
      console.log("Seesion destructure error",err.message)
      return res.redirect("/pageNotFound")
    }
    return res.redirect("/login")
  })
  }catch(error){
    console.log("logout error",error);
    res.redirect("/PageNotFound")

  }
};

// Load product detail page
const loadProductDetails = async (req, res) => {
    try {
        const productId = req.params.id;
        const product = await Product.findById(productId)
            .populate('category')
            .select('productName description category regularPrice salesPrice productOffer variants')
            .lean();

        if (!product) {
            return res.status(404).render('404', { 
                message: 'Product not found',
                user: req.session.user 
            });
        }

        if (!product.variants || product.variants.length === 0) {
            return res.status(403).render('404', { 
                message: 'This product is currently unavailable',
                user: req.session.user 
            });
        }

        // Ensure each variant has the required fields
        product.variants = product.variants.map(variant => ({
            ...variant,
            quantity: variant.quantity || 0,
            images: variant.images || []
        }));

        // Find only related products from the same category
        const relatedProducts = await Product.find({
            _id: { $ne: productId }, // Exclude current product
            category: product.category._id,
            isBlocked: false,
            'variants.0': { $exists: true } // Ensure product has at least one variant
        })
        .populate('category')
        .select('productName description brand category regularPrice salesPrice productOffer variants')
        .limit(4) // Show up to 4 related products
        .lean();

        // Process related products to ensure they have the required fields
        const processedRelatedProducts = relatedProducts.map(relatedProduct => ({
            ...relatedProduct,
            variants: relatedProduct.variants.map(variant => ({
                ...variant,
                quantity: variant.quantity || 0,
                images: variant.images || []
            }))
        }));

        res.render("product-detail", {
            message: req.session.user,
            product: product,
            relatedProducts: processedRelatedProducts,
            title: product.productName,
            user: req.session.user
        });
    } catch (error) {
        console.error("Error in product details:", error);
        res.status(500).render('404', { 
            message: 'Error loading product details',
            user: req.session.user 
        });
    }
};

// Load forgot password page
const loadForgotPassword = async (req, res) => {
  try {
    res.render('forgot-password');
  } catch (error) {
    console.error("Error loading forgot password page:", error);
    res.status(500).send("Server error");
  }
};

// Handle forgot password request
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.render('forgot-password', { message: 'User not found with this email' });
    }

    // Generate password reset token (valid for 1 hour)
    const resetToken = generateOtp();
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    // Send password reset email
    const resetLink = `${req.protocol}://${req.get('host')}/reset-password/${resetToken}`;
    const emailSent = await sendPasswordResetEmail(email, resetLink);

    if (!emailSent) {
      return res.render('forgot-password', { message: 'Error sending reset email' });
    }

    res.render('forgot-password', { 
      message: 'Password reset link has been sent to your email',
      success: true 
    });

  } catch (error) {
    console.error("Error in forgot password:", error);
    res.render('forgot-password', { message: 'Something went wrong' });
  }
};

// Load reset password page
const loadResetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.render('reset-password', { message: 'Password reset token is invalid or expired' });
    }

    res.render('reset-password', { token });
  } catch (error) {
    console.error("Error loading reset password page:", error);
    res.status(500).send("Server error");
  }
};

// Handle password reset
const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password, confirmPassword } = req.body;

    if (password !== confirmPassword) {
      return res.render('reset-password', { 
        message: 'Passwords do not match',
        token 
      });
    }

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.render('reset-password', { message: 'Password reset token is invalid or expired' });
    }

    // Update password
    user.password = await securePassword(password);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.render('login', { message: 'Password has been reset successfully' });
  } catch (error) {
    console.error("Error resetting password:", error);
    res.render('reset-password', { 
      message: 'Error resetting password',
      token: req.params.token 
    });
  }
};

// Send password reset email
async function sendPasswordResetEmail(email, resetLink) {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.NODEMAILER_EMAIL,
        pass: process.env.NODEMAILER_PASSWORD
      }
    });

    const info = await transporter.sendMail({
      from: process.env.NODEMAILER_EMAIL,
      to: email,
      subject: "Password Reset Request",
      text: `Click the following link to reset your password: ${resetLink}`,
      html: `
        <h2>Password Reset Request</h2>
        <p>Click the following link to reset your password:</p>
        <a href="${resetLink}">Reset Password</a>
        <p>This link will expire in 1 hour.</p>
        <p>If you did not request this, please ignore this email.</p>
      `
    });
    
    return info.accepted.length > 0;
  } catch (error) {
    console.error("Error sending password reset email:", error);
    return false;
  }
}

// Load account page
const loadAccount = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect('/login');
    }
    const user = await User.findById(req.session.user._id);
    res.render("account", {
      user: user,
      message: req.session.user
    });
  } catch (error) {
    console.error("Error loading account page:", error);
    res.status(500).send("Server error");
  }
};

// Update user profile
const updateProfile = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect('/login');
    }

    const { name, phone } = req.body;
    const userId = req.session.user._id;

    const updateData = {
      name,
      phone
    };

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true }
    );

    req.session.user = updatedUser;
    res.redirect('/userProfile');
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).send("Server error");
  }
};

// Change password
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const userId = req.session.user._id;

    // Validate passwords match
    if (newPassword !== confirmPassword) {
      return res.json({ 
        success: false, 
        message: 'New passwords do not match' 
      });
    }

    // Get user from database
    const user = await User.findById(userId);
    if (!user) {
      return res.json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Check current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      return res.json({ 
        success: false, 
        message: 'Current password is incorrect' 
      });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password
    user.password = hashedPassword;
    await user.save();

    res.json({ 
      success: true, 
      message: 'Password updated successfully' 
    });
  } catch (error) {
    console.error('Error in changePassword:', error);
    res.json({ 
      success: false, 
      message: 'An error occurred while changing password' 
    });
  }
};

// Load addresses page
const loadAddresses = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const addressData = await Address.findOne({ userId: userId });
    
    res.render("address-book", {
      addresses: addressData ? addressData.address : [],
      user: req.session.user
    });
  } catch (error) {
    console.error('Error in loadAddresses:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Add new address
const addAddress = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const addressData = req.body;

    // Find user's address document
    let userAddress = await Address.findOne({ userId });
    if (!userAddress) {
      // Create new address document if it doesn't exist
      userAddress = new Address({
        userId,
        address: []
      });
    }

    // Add new address to array
    userAddress.address.push(addressData);
    await userAddress.save();

    res.json({
      success: true,
      message: 'Address added successfully'
    });
  } catch (error) {
    console.error('Error adding address:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding address'
    });
  }
};

// Edit address
const editAddress = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const addressId = req.params.addressId;
    const updatedData = req.body;

    // Find and update the specific address
    const result = await Address.updateOne(
      { 
        userId,
        'address._id': addressId 
      },
      { 
        $set: {
          'address.$': {
            ...updatedData,
            _id: addressId
          }
        }
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    res.json({
      success: true,
      message: 'Address updated successfully'
    });
  } catch (error) {
    console.error('Error updating address:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating address'
    });
  }
};

// Delete address
const deleteAddress = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const addressId = req.params.addressId;

    const result = await Address.updateOne(
      { userId },
      { $pull: { address: { _id: addressId } } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    res.json({
      success: true,
      message: 'Address deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting address:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting address'
    });
  }
};

// Get all orders for the user
const getOrders = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const orders = await Order.find({ userId })
      .populate({
        path: 'items.productId',
        select: 'productName brand variants regularPrice salesPrice',
        model: 'Product'
      })
      .sort({ createdAt: -1 });

    // Add default value for totalAmount if undefined and calculate finalAmount
    const processedOrders = orders.map(order => {
      const orderObj = order.toObject();
      const totalAmount = orderObj.totalAmount || 0;
      const discountedAmount = orderObj.coupon?.discountedAmount || 0;
      const finalAmount = totalAmount - discountedAmount;

      return {
        ...orderObj,
        totalAmount,
        finalAmount,
        createdOn: orderObj.createdAt
      };
    });

    res.render('orders', {
      orders: processedOrders,
      message: req.session.user
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).send('Server error');
  }
};

// Get specific order details
const getOrderDetails = async (req, res) => {
    try {
        const orderId = req.params.orderId;
        console.log('Getting order details for:', orderId);

        const order = await Order.findById(orderId)
            .populate({
                path: 'items.productId',
                select: 'productName brand variants images',
                model: 'Product'
            })
            .select('items totalAmount status paymentMethod paymentStatus createdAt shippingAddress coupon finalAmount invoiceNumber invoiceDate deliveryDate orderId userId')
            .lean();  // Convert to plain JavaScript object

        if (!order) {
            console.log('Order not found:', orderId);
            return res.redirect('/orders');
        }

        // Verify that the order belongs to the current user
        if (order.userId.toString() !== req.session.user._id.toString()) {
            console.log('Order does not belong to current user');
            return res.redirect('/orders');
        }

        console.log('Found order:', order);
        console.log('Order status:', order.status);
        console.log('Invoice number:', order.invoiceNumber);

        // Format the order data
        const formattedOrder = {
            _id: order._id,
            orderId: order._id,
            items: order.items,
            totalAmount: order.totalAmount,
            status: order.status || 'Processing',
            paymentMethod: order.paymentMethod,
            paymentStatus: order.paymentStatus,
            createdAt: order.createdAt,
            shippingAddress: order.shippingAddress,
            coupon: order.coupon ? {
                code: order.coupon.code,
                discountedAmount: order.coupon.discountAmount || 0
            } : null,
            finalAmount: order.coupon ? (order.totalAmount - (order.coupon.discountAmount || 0)) : order.totalAmount,
            invoiceNumber: order.invoiceNumber,
            invoiceDate: order.invoiceDate,
            deliveryDate: order.deliveryDate
        };

        res.render('order-details', {
            order: formattedOrder,
            user: req.session.user
        });
    } catch (error) {
        console.error('Error fetching order details:', error);
        return res.redirect('/orders');
    }
};

// Get order success
const getOrderSuccess = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    console.log('Getting order success page for order:', orderId);

    // Find the order and populate product details
    const order = await Order.findById(orderId)
      .populate({
        path: 'items.productId',
        select: 'productName brand variants images',
        model: 'Product'
      });

    if (!order) {
      console.log('Order not found:', orderId);
      return res.redirect('/orders');
    }

    // Verify that the order belongs to the current user
    if (order.userId.toString() !== req.session.user._id.toString()) {
      console.log('Order does not belong to current user');
      return res.redirect('/orders');
    }

    console.log('Found order:', order);

    // Format the order data
    const formattedOrder = {
      ...order.toObject(),
      finalAmount: order.coupon ? (order.totalAmount - (order.coupon.discountAmount || 0)) : order.totalAmount
    };

    res.render('order-success', {
      title: 'Order Success',
      order: formattedOrder,
      user: req.session.user
    });
  } catch (error) {
    console.error('Error getting order success:', error);
    return res.redirect('/orders');
  }
};

// Add to cart
const addToCart = async (req, res) => {
  try {
    console.log('Add to cart request body:', req.body);
    const userId = req.session.user._id;
    const { productId, quantity, variantIndex } = req.body;
    
    // Get product details
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    // Check variant stock
    const variant = product.variants[variantIndex];
    if (!variant) {
      return res.status(404).json({ success: false, message: "Product variant not found" });
    }

    // Find or create cart
    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, items: [] });
    }

    // Check if product already exists in cart
    const existingItem = cart.items.find(item => 
      item.productId.toString() === productId && 
      item.variantIndex === variantIndex
    );

    if (existingItem) {
      const newQuantity = existingItem.quantity + quantity;
      
      // Check against actual stock
      if (newQuantity > variant.quantity) {
        return res.status(400).json({
          success: false,
          message: `Cannot add ${quantity} more items. Only ${variant.quantity} units available in stock. You already have ${existingItem.quantity} in your cart.`
        });
      }

      // Also check against max limit of 5
      if (newQuantity > 5) {
        return res.status(400).json({
          success: false,
          message: `Cannot add ${quantity} more items. Maximum limit is 5 items per product. You already have ${existingItem.quantity} in your cart.`
        });
      }
      
      // Update existing item
      existingItem.quantity = newQuantity;
      existingItem.totalPrice = product.salesPrice * newQuantity;
    } else {
      // Check new item quantity against stock
      if (quantity > variant.quantity) {
        return res.status(400).json({
          success: false,
          message: `Cannot add ${quantity} items. Only ${variant.quantity} units available in stock.`
        });
      }

      // Check against max limit of 5
      if (quantity > 5) {
        return res.status(400).json({
          success: false,
          message: "Maximum quantity limit is 5 items per product"
        });
      }

      // Add new item
      cart.items.push({
        productId,
        variantIndex,
        quantity,
        price: product.salesPrice,
        totalPrice: product.salesPrice * quantity
      });
    }

    await cart.save();
    res.json({ success: true });
  } catch (error) {
    console.error("Error adding to cart:", error);
    res.status(500).json({ success: false, message: 'Error adding to cart' });
  }
};

// Get cart
const getCart = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const cart = await Cart.findOne({ userId })
      .populate({
        path: 'items.productId',
        select: 'productName variants regularPrice salesPrice',
        model: 'Product'
      })
      .lean();  // Convert to plain JavaScript object

    console.log("Cart data:", cart);

    // Get error message if exists and clear it
    const cartError = req.session.cartError;
    req.session.cartError = null;

    if (!cart) {
      return res.render('cart', { 
        cart: null,
        message: req.session.user,
        error: cartError
      });
    }

    // Update prices and check stock
    cart.items = cart.items.filter(item => {
      // Remove items with deleted products
      if (!item.productId) return false;
      
      // Check if variant exists
      const variant = item.productId.variants[item.variantIndex];
      if (!variant) return false;

      // Update price if needed
      const currentPrice = item.productId.salesPrice || item.productId.regularPrice;
      if (currentPrice !== item.price) {
        item.price = currentPrice;
        item.totalPrice = currentPrice * item.quantity;
      }

      return true;
    });
    
    res.render('cart', { 
      cart,
      message: req.session.user,
      error: cartError
    });
  } catch (error) {
    console.error("Error getting cart:", error);
    res.render('cart', { 
      cart: null,
      message: req.session.user,
      error: "Unable to load cart. Please try again." 
    });
  }
};

// Update cart item
const updateCartItem = async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    const userId = req.session.user._id;

    if (!productId || !quantity) {
      return res.status(400).json({ 
        success: false, 
        message: "Product ID and quantity are required" 
      });
    }

    // Find cart and populate product details
    const cart = await Cart.findOne({ userId }).populate('items.productId');
    if (!cart) {
      return res.status(404).json({ success: false, message: "Cart not found" });
    }

    const item = cart.items.find(item => 
      item.productId._id.toString() === productId
    );

    if (!item) {
      return res.status(404).json({ success: false, message: "Item not found in cart" });
    }

    // Get variant stock
    const variantStock = item.productId.variants[item.variantIndex].quantity;

    // Check against actual stock
    if (quantity > variantStock) {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot update quantity. Only ${variantStock} units available in stock.`,
        currentQuantity: item.quantity
      });
    }

    // Check against max limit of 5
    if (quantity > 5) {
      return res.status(400).json({ 
        success: false, 
        message: "Maximum quantity limit is 5 items per product",
        currentQuantity: item.quantity
      });
    }

    // Get current price from product
    const price = item.productId.salesPrice || item.productId.price;
    
    // Update quantity and recalculate total
    item.quantity = parseInt(quantity);
    item.price = price;
    item.totalPrice = parseFloat((price * quantity).toFixed(2));

    await cart.save();
    res.json({ 
      success: true, 
      message: "Cart updated successfully",
      newQuantity: quantity,
      newTotal: item.totalPrice
    });
  } catch (error) {
    console.error("Error updating cart:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to update cart. Please try again.",
      error: error.message 
    });
  }
};

// Remove from cart
const removeFromCart = async (req, res) => {
  try {
    const { productId, variantIndex } = req.params;
    const userId = req.session.user._id;

    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    // Remove only the specific variant of the product
    cart.items = cart.items.filter(item => 
      !(item.productId.toString() === productId && item.variantIndex.toString() === variantIndex)
    );

    await cart.save();
    res.json({ success: true, message: "Item removed from cart" });
  } catch (error) {
    console.error("Error removing from cart:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get cart count
const getCartCount = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const cart = await Cart.findOne({ userId });
    const count = cart ? cart.items.length : 0;
    res.json({ count });
  } catch (error) {
    console.error("Error getting cart count:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Load checkout page
const loadCheckout = async (req, res) => {
  try {
    const userId = req.session.user._id;
    console.log('Loading checkout for user:', userId);
    
    // Get cart and address data
    const [cart, addressData] = await Promise.all([
      Cart.findOne({ userId }).populate('items.productId'),
      Address.findOne({ userId: userId }).lean()  // Use lean() for better performance
    ]);

    console.log('Raw Address Data:', JSON.stringify(addressData, null, 2));

    if (!cart || !cart.items || cart.items.length === 0) {
      console.log('No cart items found, redirecting to cart');
      return res.redirect('/cart');
    }

    // Check for out-of-stock items
    const outOfStockItems = cart.items.filter(item => 
      item.productId && 
      item.productId.variants && 
      item.productId.variants[item.variantIndex] && 
      item.productId.variants[item.variantIndex].quantity === 0
    );

    if (outOfStockItems.length > 0) {
      console.log('Out of stock items found, redirecting to cart');
      req.session.cartError = 'Some items in your cart are out of stock. Please remove them to proceed with checkout.';
      return res.redirect('/cart');
    }

    // Remove any cart items with invalid product references
    cart.items = cart.items.filter(item => item.productId);
    await cart.save();

    // If all items were invalid, redirect to cart
    if (cart.items.length === 0) {
      console.log('All cart items were invalid, redirecting to cart');
      return res.redirect('/cart');
    }

    // Calculate total and process addresses
    const total = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
    let addresses = [];
    
    if (addressData && addressData.address) {
      addresses = addressData.address.map(addr => ({
        _id: addr._id,
        addressType: addr.addressType || '',
        name: addr.name || '',
        landMark: addr.landMark || '',
        city: addr.city || '',
        state: addr.state || '',
        pincode: addr.pincode || '',
        phone: addr.phone || '',
        altPhone: addr.altPhone || ''
      }));
    }

    console.log('Processed addresses:', JSON.stringify(addresses, null, 2));
    
    // Pass data to view
    res.render('checkout', {
      title: 'Checkout',
      cart,
      addresses,
      total,
      user: req.session.user
    });
  } catch (error) {
    console.error('Error loading checkout:', error);
    res.status(500).render('error', { message: 'Error loading checkout page' });
  }
};

// Create order
const createOrder = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const { addressId, paymentMethod, couponCode } = req.body;
        
        console.log('Creating order for user:', userId);
        console.log('Address ID:', addressId);
        console.log('Payment Method:', paymentMethod);
        console.log('Coupon Code:', couponCode);

        // Get cart and address
        const [cart, addressDoc] = await Promise.all([
            Cart.findOne({ userId }).populate('items.productId'),
            Address.findOne({ userId })
        ]);

        console.log('Cart found:', cart ? 'Yes' : 'No');
        console.log('Address doc found:', addressDoc ? 'Yes' : 'No');

        if (!cart || !cart.items || cart.items.length === 0) {
            console.log('Cart is empty or not found');
            return res.status(400).json({ success: false, message: 'Cart is empty' });
        }

        if (!addressDoc || !addressDoc.address) {
            console.log('Address document not found');
            return res.status(400).json({ success: false, message: 'No addresses found' });
        }

        // Find selected address
        const selectedAddress = addressDoc.address.find(addr => addr._id.toString() === addressId);
        console.log('Selected address found:', selectedAddress ? 'Yes' : 'No');
        
        if (!selectedAddress) {
            console.log('Invalid address ID:', addressId);
            console.log('Available addresses:', addressDoc.address.map(a => ({ id: a._id.toString(), type: a.addressType })));
            return res.status(400).json({ success: false, message: 'Invalid address selected' });
        }

          // Verify stock availability for all items
    for (const item of cart.items) {
      const product = await Product.findById(item.productId._id);
      if (!product || !product.variants || !product.variants[item.variantIndex]) {
        return res.status(400).json({ 
          success: false, 
          message: `Product ${item.productId.productName} is no longer available` 
        });
      }

      const variant = product.variants[item.variantIndex];
      if (!variant.quantity || variant.quantity < item.quantity) {
        return res.status(400).json({ 
          success: false, 
          message: `Insufficient stock for ${item.productId.productName}` 
        });
      }
    }

        const total = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
        console.log('Order subtotal:', total);
        
        // Handle coupon if provided
        let finalAmount = total;
        let couponDetails = null;
        console.log("COUPON CODE",couponCode)
        if (couponCode) {
            const coupon = await Coupon.findOne({ 
                code: couponCode.toUpperCase(),
                startDate: { $lte: new Date() },
                endDate: { $gte: new Date() },
                isActive: true
            });

            if (coupon && total >= coupon.minimumPurchase) {
                let discountAmount = 0;
                if (coupon.discountType === 'percentage') {
                    discountAmount = Math.round((total * coupon.discountAmount) / 100);
                    if (coupon.maximumDiscount) {
                        discountAmount = Math.min(discountAmount, coupon.maximumDiscount);
                    }
                } else {
                    discountAmount = coupon.discountAmount;
                }

                finalAmount = total - discountAmount;
                couponDetails = {
                    code: coupon.code,
                    discountType: coupon.discountType,
                    discountAmount: discountAmount,  // Store the actual discount amount, not the percentage/fixed value
                    discountedAmount: discountAmount
                };
                console.log("Calculated discount:", {
                    originalTotal: total,
                    discountAmount,
                    finalAmount,
                    couponDetails
                });

                // Increment coupon usage count
                await Coupon.findByIdAndUpdate(coupon._id, {
                    $inc: { usedCount: 1 }
                });
            }
        }

        console.log('Final amount after discount:', finalAmount);

        // Map cart items to order items
        const orderItems = cart.items.map(item => {
            console.log('Processing item:', {
                productId: item.productId._id,
                quantity: item.quantity,
                price: item.price,
                totalPrice: item.totalPrice,
                variantIndex: item.variantIndex
            });
            return {
                productId: item.productId._id,
                quantity: item.quantity,
                price: item.price,
                totalPrice: item.totalPrice,
                variantIndex: item.variantIndex
            };
        });

        // Create order in database
        const order = new Order({
            userId,
            items: orderItems,
            shippingAddress: {
                addressType: selectedAddress.addressType,
                name: selectedAddress.name,
                landMark: selectedAddress.landMark,
                city: selectedAddress.city,
                state: selectedAddress.state,
                pincode: selectedAddress.pincode,
                phone: selectedAddress.phone,
                altPhone: selectedAddress.altPhone
            },
            totalAmount: total,  // Original total before discount
            finalAmount: finalAmount,
            coupon: couponDetails,
            paymentMethod,
            paymentStatus: 'PENDING',
            status: 'Pending'
        });

        console.log('Order object created:', order);

        await order.save();
        console.log('Order saved successfully:', order._id);

        if (paymentMethod === 'COD') {
            // Update order status for COD
            order.paymentStatus = 'PENDING';
            order.status = 'Processing';
            await order.save();
            console.log('Order updated for COD payment');
            
            // Update product quantities
            console.log('Updating product quantities for COD order');
            for (const item of order.items) {
                try {
                    console.log('Updating quantity for product:', item.productId, 'variant index:', item.variantIndex);
                    const product = await Product.findById(item.productId);
                    
                    if (!product || !product.variants[item.variantIndex]) {
                        console.log('Product or variant not found');
                        continue;
                    }
                    
                    const currentQuantity = product.variants[item.variantIndex].quantity;
                    console.log('Current quantity:', currentQuantity);
                    
                    if (currentQuantity < item.quantity) {
                        throw new Error(`Not enough stock for product ${item.productId}`);
                    }
                    
                    product.variants[item.variantIndex].quantity = currentQuantity - item.quantity;
                    await product.save();
                    
                    console.log('New quantity:', product.variants[item.variantIndex].quantity);
                } catch (error) {
                    console.error('Error updating product quantity:', error);
                    throw error;
                }
            }
            console.log('Product quantities updated');

            // Clear cart
            await Cart.findOneAndUpdate(
                { userId },
                { $set: { items: [] } }
            );
            console.log('Cart cleared');

            return res.json({ 
                success: true, 
                orderId: order._id 
            });
        }

        // Create Razorpay order
        console.log('Creating Razorpay order for amount:', finalAmount * 100);
        const razorpayOrder = await razorpay.orders.create({
            amount: finalAmount * 100, // Convert to paise
            currency: 'INR',
            receipt: order._id.toString()
        });
        console.log('Razorpay order created:', razorpayOrder.id);

        // Update order with Razorpay order ID
        order.razorpayOrderId = razorpayOrder.id;
        await order.save();
        console.log('Order updated with Razorpay order ID');

        res.json({
            success: true,
            orderId: order._id,
            amount: finalAmount * 100,
            razorpayOrderId: razorpayOrder.id
        });

      } catch (error) {
        console.error('Error in create order:', error);
        const errorResponse = {
            success: false,
            message: error.message || 'An error occurred during order creation'
        };
        
        // If we have created an order, include its ID in the response
        if (typeof order !== 'undefined' && order._id) {
            errorResponse.orderId = order._id;
        }
        
        res.status(400).json(errorResponse);
    }
};

// Verify Razorpay payment
const verifyPayment = async (req, res) => {
    try {
        const {
            orderId,
            razorpay_payment_id,
            razorpay_order_id,
            razorpay_signature
        } = req.body;

        console.log('Payment verification request received:', {
            orderId,
            razorpay_payment_id,
            razorpay_order_id,
            razorpay_signature
        });

        // Verify signature
        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest("hex");

        console.log('Signature verification:', {
            expected: expectedSignature,
            received: razorpay_signature
        });

        if (expectedSignature !== razorpay_signature) {
            console.log('Signature verification failed');
            return res.status(400).json({
                success: false,
                message: 'Invalid payment signature'
            });
        }

        // Update order status
        const order = await Order.findById(orderId);
        console.log('Order found:', order ? 'Yes' : 'No');
        
        if (!order) {
            console.log('Order not found with ID:', orderId);
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Verify Razorpay payment status
        try {
            console.log('Fetching payment details from Razorpay');
            const payment = await razorpay.payments.fetch(razorpay_payment_id);
            console.log('Payment details:', payment);

            if (payment.status !== 'captured') {
                console.log('Payment not captured:', payment.status);
                return res.status(400).json({
                    success: false,
                    message: 'Payment not completed'
                });
            }
        } catch (paymentError) {
            console.error('Error fetching payment details:', paymentError);
            return res.status(400).json({
                success: false,
                message: 'Error verifying payment status'
            });
        }

        console.log('Updating order status');
        order.paymentStatus = 'COMPLETED';
        order.status = 'Processing';
        order.razorpayPaymentId = razorpay_payment_id;
        await order.save();
        console.log('Order status updated');

        // Update product quantities
        console.log('Updating product quantities');
        for (const item of order.items) {
            try {
                console.log('Updating quantity for product:', item.productId, 'variant index:', item.variantIndex);
                const product = await Product.findById(item.productId);
                
                if (!product || !product.variants[item.variantIndex]) {
                    console.log('Product or variant not found');
                    continue;
                }
                
                const currentQuantity = product.variants[item.variantIndex].quantity;
                console.log('Current quantity:', currentQuantity);
                
                if (currentQuantity < item.quantity) {
                    throw new Error(`Not enough stock for product ${item.productId}`);
                }
                
                product.variants[item.variantIndex].quantity = currentQuantity - item.quantity;
                await product.save();
                
                console.log('New quantity:', product.variants[item.variantIndex].quantity);
            } catch (error) {
                console.error('Error updating product quantity:', error);
                throw error;
            }
        }
        console.log('Product quantities updated');

        // Clear cart
        console.log('Clearing cart for user:', order.userId);
        await Cart.findOneAndUpdate(
            { userId: order.userId },
            { $set: { items: [] } }
        );
        console.log('Cart cleared');

        res.json({ success: true });

    } catch (error) {
        console.error('Error verifying payment:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({
            success: false,
            message: 'Payment verification failed: ' + (error.message || 'Unknown error')
        });
    }
};

// Retry payment for failed orders
const retryPayment = async (req, res) => {
    try {
        const orderId = req.params.orderId;
        console.log('Retry payment request for order:', orderId);

        const order = await Order.findById(orderId);
        console.log('Found order:', {
            id: order?._id,
            status: order?.status,
            paymentStatus: order?.paymentStatus,
            paymentMethod: order?.paymentMethod,
            finalAmount: order?.finalAmount
        });

        if (!order) {
            console.log('Order not found:', orderId);
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        if (order.userId.toString() !== req.session.user._id.toString()) {
            console.log('Unauthorized access:', {
                orderId,
                orderUserId: order.userId,
                sessionUserId: req.session.user._id
            });
            return res.status(403).json({
                success: false,
                message: 'Unauthorized'
            });
        }

        // Check if payment can be retried
        if (order.paymentStatus !== 'PENDING' || order.paymentMethod !== 'RAZORPAY') {
            console.log('Invalid payment retry attempt:', {
                orderId,
                paymentStatus: order.paymentStatus,
                paymentMethod: order.paymentMethod
            });
            return res.status(400).json({
                success: false,
                message: 'Payment cannot be retried for this order'
            });
        }

        // Create new Razorpay order
        console.log('Creating Razorpay order:', {
            amount: order.finalAmount,
            receipt: order._id.toString()
        });

        const razorpayOrder = await razorpay.orders.create({
            amount: Math.round(order.finalAmount * 100), // amount in paise
            currency: 'INR',
            receipt: order._id.toString(),
            notes: {
                orderId: order._id.toString()
            }
        });

        console.log('Created Razorpay order:', razorpayOrder);

        // Update order with new Razorpay order ID
        order.razorpayOrderId = razorpayOrder.id;
        await order.save();

        console.log('Updated order with new Razorpay order ID:', {
            orderId: order._id,
            razorpayOrderId: razorpayOrder.id
        });

        res.json({
            success: true,
            key_id: process.env.RAZORPAY_KEY_ID,
            order_id: razorpayOrder.id
        });

    } catch (error) {
        console.error('Error in retry payment:', {
            error: error.message,
            stack: error.stack
        });
        res.status(500).json({
            success: false,
            message: 'Failed to initiate payment: ' + error.message
        });
    }
};

// Cancel order
const cancelOrder = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const userId = req.session.user._id;

    const order = await Order.findOne({ _id: orderId, userId });
    
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }

    // Only allow cancellation of processing orders
    if (order.status !== 'Processing') {
      return res.status(400).json({
        success: false,
        message: 'Order cannot be cancelled in its current status'
      });
    }

    // Restock the products
    for (const item of order.items) {
      try {
        const product = await Product.findById(item.productId);
        if (product && product.variants) {
          // Use first variant if variantIndex is not specified
          const variantIndex = item.variantIndex || 0;
          
          // Ensure the variant exists
          if (!product.variants[variantIndex]) {
            product.variants[variantIndex] = {
              color: 'default',
              images: [],
              quantity: 0
            };
          }

          // Update the quantity
          const currentQuantity = product.variants[variantIndex].quantity || 0;
          product.variants[variantIndex].quantity = currentQuantity + parseInt(item.quantity);
          await product.save();
          
          console.log(`Restocked product ${product._id}, variant ${variantIndex}, new quantity: ${product.variants[variantIndex].quantity}`);
        }
      } catch (err) {
        console.error('Error restocking product:', err);
      }
    }

    // Update order status
    order.status = 'Cancelled';
    order.cancelledAt = new Date();
    await order.save();

    // Process refund for Razorpay payments
    console.log('Checking payment details:', {
        method: order.paymentMethod,
        status: order.paymentStatus,
        orderId: order.orderId
    });

    if (order.paymentMethod === 'RAZORPAY' && order.paymentStatus === 'COMPLETED') {
        console.log('Processing refund for Razorpay payment');
        
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Calculate refund amount
        let refundAmount = order.totalAmount;
        if (order.coupon?.discountedAmount) {
            refundAmount -= order.coupon.discountedAmount;
        }

        console.log('Refund calculation:', {
            totalAmount: order.totalAmount,
            couponDiscount: order.coupon?.discountedAmount,
            finalRefund: refundAmount
        });

        // Initialize wallet if needed
        if (!user.wallet) {
            user.wallet = { balance: 0, transactions: [] };
        }

        // Update wallet balance
        const previousBalance = user.wallet.balance || 0;
        user.wallet.balance = previousBalance + refundAmount;

        // Add transaction record
        user.wallet.transactions.push({
            amount: refundAmount,
            type: 'credit',
            description: `Refund for cancelled order #${order.orderId}`,
            date: new Date(),
            orderId: order.orderId,
            status: 'success'
        });

        console.log('Wallet update:', {
            previousBalance,
            refundAmount,
            newBalance: user.wallet.balance
        });

        // Save user with updated wallet
        await user.save();
        console.log('Refund processed successfully');

        return res.json({
            success: true,
            message: 'Order cancelled and refund processed to wallet'
        });
    }

    res.json({ 
        success: true, 
        message: 'Order cancelled successfully' 
    });
  } catch (error) {
    console.error('Error cancelling order:', error);
    res.status(500).json({ 
        success: false, 
        message: 'Error cancelling order' 
    });
  }
};

// Load shop page
const loadShop = async (req, res) => {
  try {
    const page = parseInt(req.query.page)||1;
    const limit = 9;
    const skip = (page-1)*limit;
    const category = req.query.category;
    const maxPrice = parseInt(req.query.maxPrice) || 100000;
    const search = req.query.search ? req.query.search.trim() : '';
    let sort = '-createdAt'; // Default sort by newest

    // Handle sorting
    switch(req.query.sort) {
      case 'name_asc':
        sort = 'productName';
        break;
      case 'name_desc':
        sort = '-productName';
        break;
      case 'price_asc':
        sort = 'salesPrice';
        break;
      case 'price_desc':
        sort = '-salesPrice';
        break;
      case 'newest':
        sort = '-createdAt';
        break;
      case 'default':
      default:
        sort = '-createdAt';
    }

    // Build query
    let query = { isBlocked: false };
    
    // Add category filter
    if (category) {
      query.category = category;
    }
    
    // Add price filter
    query.salesPrice = { $lte: maxPrice };
    
    // Add search filter
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { productName: searchRegex },
        { description: searchRegex },
      ];
    }

    console.log('Search Query:', search);
    console.log('MongoDB Query:', JSON.stringify(query, null, 2));

    // Get products with filters
    const products = await Product.find(query)
      .populate('category')
      .select('productName salesPrice regularPrice variants category isBlocked')
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean();

    console.log('Found Products:', products.length);

    // Get wishlist products if user is logged in
    let wishlistProducts = [];
    if (req.session.user) {
      const userId = req.session.user._id;
      const wishlist = await Wishlist.findOne({ userId });
      if (wishlist) {
        wishlistProducts = wishlist.products.map(item => item.productId.toString());
      }
    }

    // Get all categories for filter
    const categories = await Category.find({ isListed: true });
    const totalPages = Math.ceil(await Product.countDocuments(query) / limit);

    res.render("shop", {
      products,
      categories,
      category,
      maxPrice,
      search,
      sort: req.query.sort || 'default',
      message: req.session.user,
      currentPage:page,
      totalpages:totalPages,
      wishlistProducts
    });
  } catch (error) {
    console.error("Error loading shop page:", error);
    res.status(500).send("Server error");
  }
};

// Load wishlist page
const loadWishlist = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const wishlist = await Wishlist.findOne({ userId })
      .populate({
        path: 'products.productId',
        select: 'productName salesPrice regularPrice productOffer offerStartDate offerEndDate variants category isBlocked',
        populate: {
          path: 'category',
          select: 'isListed categoryOffer offerStartDate offerEndDate'
        }
      })
      .lean()
      .then(wishlist => {
        if (!wishlist) return { products: [] };

        // Calculate effective offer for each product
        const updatedProducts = wishlist.products.map(item => {
          const product = item.productId;
          if (!product) return item;

          const now = new Date();
          let effectiveOffer = 0;

          // Check product offer
          if (product.productOffer && product.offerStartDate && product.offerEndDate) {
            if (now >= new Date(product.offerStartDate) && now <= new Date(product.offerEndDate)) {
              effectiveOffer = product.productOffer;
            }
          }

          // Check category offer
          if (product.category.categoryOffer && product.category.offerStartDate && product.category.offerEndDate) {
            if (now >= new Date(product.category.offerStartDate) && now <= new Date(product.category.offerEndDate)) {
              effectiveOffer = Math.max(effectiveOffer, product.category.categoryOffer);
            }
          }

          // Calculate final price
          const finalPrice = Math.round(product.regularPrice - (product.regularPrice * effectiveOffer / 100));
          
          return {
            ...item,
            productId: {
              ...product,
              effectiveOffer,
              salesPrice: finalPrice
            }
          };
        });

        return {
          ...wishlist,
          products: updatedProducts
        };
      });

    // Filter out products that are blocked or from unlisted categories
    const validProducts = wishlist ? wishlist.products.filter(item => 
      item.productId && 
      !item.productId.isBlocked && 
      item.productId.category && 
      item.productId.category.isListed
    ) : [];

    res.render('wishlist', {
      message: req.session.user,
      products: validProducts
    });
  } catch (error) {
    console.error("Error loading wishlist:", error);
    res.status(500).send("Server error");
  }
};

// Add to wishlist
const addToWishlist = async (req, res) => {
  try {
    console.log('Adding to wishlist:', {
      userId: req.session.user._id,
      productId: req.body.productId
    });

    const userId = req.session.user._id;
    const productId = req.body.productId;

    let wishlist = await Wishlist.findOne({ userId });
    console.log('Existing wishlist:', wishlist);

    if (!wishlist) {
      console.log('Creating new wishlist');
      wishlist = new Wishlist({
        userId,
        products: [{ productId }]
      });
    } else {
      // Check if product already exists in wishlist
      const productExists = wishlist.products.some(item => 
        item.productId.toString() === productId
      );
      console.log('Product exists in wishlist:', productExists);

      if (!productExists) {
        console.log('Adding product to existing wishlist');
        wishlist.products.push({ productId });
      } else {
        console.log('Product already in wishlist');
        return res.json({ success: false, message: 'Product already in wishlist' });
      }
    }

    const savedWishlist = await wishlist.save();
    console.log('Saved wishlist:', savedWishlist);
    res.json({ success: true, message: 'Product added to wishlist' });
  } catch (error) {
    console.error("Error adding to wishlist:", error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Remove from wishlist
const removeFromWishlist = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const productId = req.params.productId;

    const result = await Wishlist.updateOne(
      { userId },
      { $pull: { products: { productId } } }
    );

    if (result.modifiedCount > 0) {
      res.json({ success: true, message: 'Product removed from wishlist' });
    } else {
      res.json({ success: false, message: 'Product not found in wishlist' });
    }
  } catch (error) {
    console.error("Error removing from wishlist:", error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Check if product is in wishlist
const checkWishlistStatus = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const productId = req.params.productId;

        const wishlist = await Wishlist.findOne({ userId });
        const isInWishlist = wishlist ? 
            wishlist.products.some(item => item.productId.toString() === productId) : 
            false;

        res.json({ isInWishlist });
    } catch (error) {
        console.error("Error checking wishlist status:", error);
        res.status(500).json({ error: "Server error" });
    }
};

// Validate coupon
const validateCoupon = async (req, res) => {
    try {
        const { code, totalAmount } = req.body;
        const userId = req.session.user._id;

        console.log('Validating coupon:', { code, totalAmount, userId });

        // Find the coupon
        const coupon = await Coupon.findOne({ 
            code: code.toUpperCase(),
            startDate: { $lte: new Date() },
            endDate: { $gte: new Date() },
            isActive: true
        });

        console.log('Found coupon:', coupon);

        if (!coupon) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid coupon code or coupon has expired' 
            });
        }

        // Check if usage limit is reached
        if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
            return res.status(400).json({ 
                success: false, 
                message: 'Coupon usage limit has been reached' 
            });
        }

        // Check minimum purchase amount
        if (totalAmount < coupon.minimumPurchase) {
            return res.status(400).json({ 
                success: false, 
                message: `Minimum purchase amount of ₹${coupon.minimumPurchase} required` 
            });
        }

        // Check if user has already used this coupon
        const order = await Order.findOne({
            user: userId,
            'coupon.code': code.toUpperCase()
        });

        if (order) {
            return res.status(400).json({ 
                success: false, 
                message: 'You have already used this coupon' 
            });
        }

        res.json({
            success: true,
            coupon: {
                code: coupon.code,
                discountType: coupon.discountType,
                discountAmount: coupon.discountAmount,
                maximumDiscount: coupon.maximumDiscount
            }
        });

    } catch (error) {
        console.error('Error validating coupon:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error validating coupon: ' + error.message
        });
    }
};

// Get available coupons
const getAvailableCoupons = async (req, res) => {
    try {
        console.log('Fetching available coupons...');
        const currentDate = new Date();
        
        const coupons = await Coupon.find({
            startDate: { $lte: currentDate },
            endDate: { $gte: currentDate },
            isActive: true,
            $or: [
                { usageLimit: { $exists: false } },
                {
                    $expr: {
                        $or: [
                            { $eq: ["$usageLimit", null] },
                            { $gt: ["$usageLimit", "$usedCount"] }
                        ]
                    }
                }
            ]
        }).select('code description discountType discountAmount minimumPurchase maximumDiscount');

        console.log('Found coupons:', coupons);

        res.json({
            success: true,
            coupons: coupons
        });
    } catch (error) {
        console.error('Detailed error fetching coupons:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching available coupons: ' + error.message
        });
    }
};


// Handle product return request
const returnProduct = async (req, res) => {
    try {
        const { orderId, productId } = req.params;
        const { returnReason } = req.body;
        const userId = req.session.user._id;

        // Find the order
        const order = await Order.findById(orderId);
        
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        // Verify order belongs to user
        if (order.userId.toString() !== userId.toString()) {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        // Check if order is delivered
        if (order.status !== 'Delivered') {
            return res.status(400).json({ message: 'Order must be delivered to request return' });
        }

        // Check if return is within 7 days of delivery
        const deliveryDate = order.deliveryDate || order.updatedAt; // fallback to last update if delivery date not set
        const daysSinceDelivery = Math.floor((new Date() - deliveryDate) / (1000 * 60 * 60 * 24));
        
        if (daysSinceDelivery > 7) {
            return res.status(400).json({ message: 'Returns are only accepted within 7 days of delivery' });
        }

        // Find the specific product in the order
        const orderItem = order.items.find(item => item.productId.toString() === productId);
        
        if (!orderItem) {
            return res.status(404).json({ message: 'Product not found in order' });
        }

        // Check if product is already returned
        if (orderItem.isReturned) {
            return res.status(400).json({ message: 'Product return already requested' });
        }

        if (!returnReason || returnReason.trim().length === 0) {
            return res.status(400).json({ message: 'Please provide a reason for return' });
        }

        // Mark the product as returned and save the reason
        orderItem.isReturned = true;
        orderItem.returnReason = returnReason.trim();
        await order.save();

        res.status(200).json({ message: 'Return request submitted successfully' });
    } catch (error) {
        console.error('Error processing return request:', error);
        res.status(500).json({ message: 'Failed to process return request' });
    }
};


const getWallet = async (req, res) => {
  try {
      const user = await User.findById(req.session.user._id);
      res.render('wallet', {
          user: user,
          title: 'My Wallet'
      });
  } catch (error) {
      console.error('Error fetching wallet:', error);
      res.redirect('/error');
  }
};

// Download invoice
const downloadInvoice = async (req, res) => {
    try {
        const orderId = req.params.orderId;
        console.log('Generating invoice for order:', orderId);

        const order = await Order.findById(orderId)
            .populate('items.productId')
            .lean();

        if (!order) {
            console.log('Order not found:', orderId);
            return res.status(404).send('Order not found');
        }

        if (order.userId.toString() !== req.session.user._id) {
            console.log('Unauthorized access attempt');
            return res.status(403).send('Unauthorized');
        }

        if (order.status !== 'Delivered' || !order.invoiceNumber) {
            console.log('Invoice not available. Status:', order.status, 'Invoice number:', order.invoiceNumber);
            return res.status(400).send('Invoice not available');
        }

        const finalAmount = order.coupon ? 
            (order.totalAmount - (order.coupon.discountAmount || 0)) : 
            order.totalAmount;

        // Create PDF document
        const doc = new PDFDocument({
            size: 'A4',
            margin: 50
        });

        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="invoice-${order.invoiceNumber}.pdf"`);
        doc.pipe(res);

        // Header
        doc.fontSize(24)
           .text('INVOICE', { align: 'center' })
           .moveDown(2);

        // Invoice Details (Right-aligned)
        doc.fontSize(10)
           .text(`Invoice Number: ${order.invoiceNumber}`, { align: 'right' })
           .text(`Date: ${new Date(order.invoiceDate).toLocaleDateString('en-IN')}`, { align: 'right' })
           .moveDown(2);

        // Order Details
        doc.fontSize(12)
           .text('Order Details', { underline: true })
           .moveDown();

        doc.fontSize(10)
           .text(`Order ID: ${order.orderId}`)
           .text(`Order Date: ${new Date(order.createdAt).toLocaleDateString('en-IN')}`)
           .text(`Payment Method: ${order.paymentMethod}`)
           .moveDown(2);

        // Customer Details
        doc.fontSize(12)
           .text('Customer Details', { underline: true })
           .moveDown();

        doc.fontSize(10)
           .text(`Name: ${order.shippingAddress.name}`)
           .text(`Address: ${order.shippingAddress.landMark}`)
           .text(`${order.shippingAddress.city}, ${order.shippingAddress.state} - ${order.shippingAddress.pincode}`)
           .text(`Phone: ${order.shippingAddress.phone}`)
           .moveDown(2);

        // Items Table
        const tableTop = doc.y;
        const productX = 50;
        const quantityX = 350;
        const priceX = 400;
        const totalX = 500;

        // Table Headers
        doc.fontSize(10)
           .text('Product', productX, tableTop)
           .text('Qty', quantityX, tableTop)
           .text('Price', priceX, tableTop)
           .text('Total', totalX, tableTop);

        // Underline
        doc.moveTo(50, tableTop + 15)
           .lineTo(550, tableTop + 15)
           .stroke();

        let yPos = tableTop + 30;

        // Table Rows
        order.items.forEach(item => {
            doc.text(item.productId.productName, productX, yPos, { width: 280 })
               .text(item.quantity.toString(), quantityX, yPos)
               .text(`₹${item.price.toFixed(2)}`, priceX, yPos)
               .text(`₹${item.totalPrice.toFixed(2)}`, totalX, yPos);
            yPos += 20;
        });

        yPos += 20;

        // Underline after items
        doc.moveTo(50, yPos)
           .lineTo(550, yPos)
           .stroke();

        yPos += 20;

        // Totals section (Right-aligned)
        doc.text('Subtotal:', 400, yPos)
           .text(`₹${order.totalAmount.toFixed(2)}`, 500, yPos);

        if (order.coupon) {
            yPos += 20;
            doc.text(`Discount (${order.coupon.code}):`, 400, yPos)
               .text(`-₹${order.coupon.discountAmount.toFixed(2)}`, 500, yPos);
        }

        yPos += 30;
        doc.fontSize(12)
           .text('Total Amount:', 400, yPos)
           .text(`₹${finalAmount.toFixed(2)}`, 500, yPos);

        // Footer
        doc.fontSize(10)
           .text('Thank you for shopping with us!', 50, doc.page.height - 100, {
               align: 'center',
               width: doc.page.width - 100
           });

        doc.end();
        console.log('Successfully generated PDF invoice');

    } catch (error) {
        console.error('Error generating invoice:', error);
        res.status(500).send('Error generating invoice. Please try again later.');
    }
};

// Get wishlist count
const getWishlistCount = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const wishlist = await Wishlist.findOne({ userId });
        const count = wishlist ? wishlist.products.length : 0;
        
        res.json({
            success: true,
            count: count
        });
    } catch (error) {
        console.error('Error getting wishlist count:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get wishlist count'
        });
    }
};

module.exports = {
    loadHomepage,
    loadShop,
    loadSignup,
    Signup,
    pageNotFound,
    verifyOtp,
    resendOtp,
    loadLogin,
    login,
    logout,
    loadProductDetails,
    loadForgotPassword,
    forgotPassword,
    loadResetPassword,
    resetPassword,
    loadAccount,
    updateProfile,
    changePassword,
    loadAddresses,
    addAddress,
    editAddress,
    deleteAddress,
    getOrders,
    getOrderDetails,
    getOrderSuccess,
    addToCart,
    getCart,
    updateCartItem,
    removeFromCart,
    getCartCount,
    loadCheckout,
    createOrder,
    verifyPayment,
    retryPayment,
    cancelOrder,
    returnProduct,
    loadWishlist,
    addToWishlist,
    removeFromWishlist,
    validateCoupon,
    getAvailableCoupons,
    getWallet,
    downloadInvoice,
    getWishlistCount,
    checkWishlistStatus
};
