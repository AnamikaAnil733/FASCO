const User = require("../../models/userSchema");
const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const Order = require("../../models/orderSchema");
const Cart = require("../../models/cartSchema");
const env = require("dotenv").config();
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const Address = require('../../models/addressSchema');

// Load homepage
const loadHomepage = async (req, res) => {
  try {
    // Get active categories
    const categories = await Category.find({ isListed: true });
    
    // Get unblocked products from active categories with variants
    const products = await Product.find({
      isBlocked: false,
      category: { $in: categories.map(category => category._id) }
    })
    .populate('category')
    .sort({ createdAt: -1 })  // Sort by newest first
    .lean();
    
    res.render("home", {
      message: req.session.user,
      products: products,
      categories: categories
    });
  } catch (error) {
    console.error("Error loading home page:", error);
    res.status(500).send("Server error");
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
      return res.render("login",{message:"User is blocked by admin"})
    }

    const passwordMatch = await bcrypt.compare(password,findUser.password);
    if(!passwordMatch){
      return res.render("login",{message:"Incorrect password"})
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
            .select('productName description brand category regularPrice salesPrice productOffer variants')
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
    const {
      addressType,
      name,
      city,
      landMark,
      state,
      pincode,
      phone,
      altPhone
    } = req.body;

    let addressDoc = await Address.findOne({ userId: userId });
    
    if (!addressDoc) {
      addressDoc = new Address({
        userId: userId,
        address: []
      });
    }

    addressDoc.address.push({
      addressType,
      name,
      city,
      landMark,
      state,
      pincode,
      phone,
      altPhone
    });

    await addressDoc.save();
    res.json({ success: true, message: 'Address added successfully' });
  } catch (error) {
    console.error('Error in addAddress:', error);
    res.status(500).json({ success: false, message: 'Failed to add address' });
  }
};

// Edit address
const editAddress = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const addressId = req.params.id;
    const {
      addressType,
      name,
      city,
      landMark,
      state,
      pincode,
      phone,
      altPhone
    } = req.body;

    const result = await Address.updateOne(
      { 
        userId: userId,
        'address._id': addressId 
      },
      {
        $set: {
          'address.$.addressType': addressType,
          'address.$.name': name,
          'address.$.city': city,
          'address.$.landMark': landMark,
          'address.$.state': state,
          'address.$.pincode': pincode,
          'address.$.phone': phone,
          'address.$.altPhone': altPhone
        }
      }
    );

    if (result.modifiedCount > 0) {
      res.json({ success: true, message: 'Address updated successfully' });
    } else {
      res.status(404).json({ success: false, message: 'Address not found' });
    }
  } catch (error) {
    console.error('Error in editAddress:', error);
    res.status(500).json({ success: false, message: 'Failed to update address' });
  }
};

// Delete address
const deleteAddress = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const addressId = req.params.id;

    const result = await Address.updateOne(
      { userId: userId },
      { $pull: { address: { _id: addressId } } }
    );

    if (result.modifiedCount > 0) {
      res.json({ success: true, message: 'Address deleted successfully' });
    } else {
      res.status(404).json({ success: false, message: 'Address not found' });
    }
  } catch (error) {
    console.error('Error in deleteAddress:', error);
    res.status(500).json({ success: false, message: 'Failed to delete address' });
  }
};

// Get all orders for the user
const getOrders = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const orders = await Order.find({ userId })
      .populate('items.productId')
      .sort({ createdOn: -1 });

    console.log('Found orders:', orders);

    // Add default value for totalAmount if undefined
    const processedOrders = orders.map(order => ({
      ...order.toObject(),
      totalAmount: order.totalAmount || 0
    }));

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
    const userId = req.session.user._id;

    const order = await Order.findOne({ _id: orderId, userId })
      .populate({
        path: 'items.productId',
        select: 'name price images brand'
      });

    if (!order) {
      return res.status(404).render('error', { 
        message: 'Order not found',
        error: { status: 404 } 
      });
    }

    // Add a check for required data
    if (!order.shippingAddress) {
      console.error('Order missing shipping address:', order);
      return res.status(500).render('error', {
        message: 'Order data is incomplete',
        error: { status: 500 }
      });
    }

    // Format shipping address
    const formattedOrder = {
      ...order,
      shippingAddress: {
        name: order.shippingAddress.name || 'N/A',
        landMark: order.shippingAddress.landMark || 'N/A',
        addressType: order.shippingAddress.addressType || 'N/A',
        city: order.shippingAddress.city || 'N/A',
        state: order.shippingAddress.state || 'N/A',
        pincode: order.shippingAddress.pincode || 'N/A',
        phone: order.shippingAddress.phone || 'N/A',
        altPhone: order.shippingAddress.altPhone || ''
      }
    };

    res.render('order-details', {
      order: formattedOrder,
      message: req.session.user
    });
  } catch (error) {
    console.error('Error fetching order details:', error);
    res.status(500).render('error', {
      message: 'Error fetching order details',
      error: { status: 500 }
    });
  }
};

// Get order success
const getOrderSuccess = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    console.log('Getting order success page for order:', orderId);

    // Find the order
    const order = await Order.findOne({ orderId })
      .populate('items.productId')
      .lean();

    if (!order) {
      console.log('Order not found:', orderId);
      return res.redirect('/orders');
    }

    console.log('Found order:', order);

    res.render('order-success', {
      title: 'Order Success',
      order,
      user: req.session.user
    });
  } catch (error) {
    console.error('Error getting order success:', error);
    res.redirect('/orders');
  }
};

// Add to cart
const addToCart = async (req, res) => {
  try {
    console.log('Add to cart request body:', req.body);
    const userId = req.session.user._id;
    const { productId, quantity, variantIndex } = req.body;
    
    // Validate quantity
    const MAX_QUANTITY = 5;
    if (quantity > MAX_QUANTITY) {
      return res.status(400).json({
        success: false,
        message: "Maximum quantity limit is 5 items per product"
      });
    }

    // Get product details
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
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
      if (newQuantity > MAX_QUANTITY) {
        return res.status(400).json({
          success: false,
          message: `Cannot add ${quantity} more items. Maximum limit is 5 items per product. You already have ${existingItem.quantity} in your cart.`
        });
      }
      
      // Update existing item
      existingItem.quantity = newQuantity;
      existingItem.totalPrice = product.salesPrice * newQuantity;
    } else {
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
        select: 'productName variants regularPrice salesPrice'
      })
      .lean();  // Convert to plain JavaScript object

    console.log("Cart data:", cart);

    if (!cart) {
      return res.render('cart', { 
        cart: null,
        message: req.session.user 
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
      message: req.session.user
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

    const MAX_QUANTITY = 5;
    if (quantity > MAX_QUANTITY) {
      return res.status(400).json({ 
        success: false, 
        message: "Maximum quantity limit is 5 items per product",
        currentQuantity: item.quantity
      });
    }

    // Validate quantity against stock
    const variantStock = item.productId.variants[item.variantIndex].quantity;
    if (quantity > variantStock) {
      return res.status(400).json({ 
        success: false, 
        message: "Requested quantity exceeds available stock",
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

// Place order
const placeOrder = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const { addressId, paymentMethod = 'COD' } = req.body;

    console.log('Placing order for user:', userId, 'with address:', addressId);

    // Get cart and address
    const [cart, addressDoc] = await Promise.all([
      Cart.findOne({ userId }).populate('items.productId'),
      Address.findOne({ userId })
    ]);

    if (!cart || !cart.items || cart.items.length === 0) {
      console.log('Cart is empty');
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    if (!addressDoc || !addressDoc.address) {
      console.log('No addresses found');
      return res.status(400).json({ success: false, message: 'No addresses found' });
    }

    // Find the selected address
    const selectedAddress = addressDoc.address.find(addr => addr._id.toString() === addressId);
    
    if (!selectedAddress) {
      console.log('Invalid address ID:', addressId);
      console.log('Available addresses:', addressDoc.address.map(a => ({ id: a._id.toString(), type: a.addressType })));
      return res.status(400).json({ success: false, message: 'Invalid address' });
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

    console.log('Found selected address:', selectedAddress);

    // Calculate total
    const total = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);

    // Create order
    const order = new Order({
      userId,
      items: cart.items.map(item => ({
        productId: item.productId._id,
        quantity: item.quantity,
        price: item.price,
        totalPrice: item.totalPrice,
        variantIndex: item.variantIndex
      })),
      totalAmount: total,
      shippingAddress: {
        addressType: selectedAddress.addressType,
        name: selectedAddress.name,
        street: selectedAddress.street,
        landMark: selectedAddress.landMark,
        city: selectedAddress.city,
        state: selectedAddress.state,
        pincode: selectedAddress.pincode,
        phone: selectedAddress.phone,
        altPhone: selectedAddress.altPhone || ''
      },
      paymentMethod,
      paymentStatus: 'Pending',
      orderStatus: 'Pending'
    });

    console.log('Creating order with data:', JSON.stringify(order, null, 2));

    // Save the order first
    await order.save();
    console.log('Order created:', order._id);

    // Update stock for each product
    for (const item of cart.items) {
      await Product.updateOne(
        { 
          _id: item.productId._id,
          'variants.quantity': { $gte: item.quantity }
        },
        { 
          $inc: { 
            [`variants.${item.variantIndex}.quantity`]: -item.quantity 
          }
        }
      );
      console.log(`Updated stock for product ${item.productId._id}, variant ${item.variantIndex}`);
    }

    // Clear cart
    cart.items = [];
    await cart.save();
    console.log('Cart cleared');

    res.json({ success: true, orderId: order.orderId });
  } catch (error) {
    console.error('Error placing order:', error);
    res.status(500).json({ success: false, message: 'Error placing order. Please try again.' });
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

    // Only allow cancellation of pending or processing orders
    if (order.orderStatus !== 'Pending' && order.orderStatus !== 'Processing') {
      return res.status(400).json({
        success: false,
        message: 'Order cannot be cancelled in its current status'
      });
    }

    // Update order status
    order.orderStatus = 'Cancelled';
    order.cancelledAt = new Date();
    await order.save();

    // If payment was made, initiate refund process here
    if (order.paymentStatus === 'Paid') {
      // Add refund logic here
      order.paymentStatus = 'Refund Pending';
      await order.save();
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
        { brand: searchRegex }
      ];
    }

    console.log('Search Query:', search);
    console.log('MongoDB Query:', JSON.stringify(query, null, 2));

    // Get products with filters
    const products = await Product.find(query)
      .populate('category')
      .sort(sort)
      .lean();

    console.log('Found Products:', products.length);

    // Get all categories for filter
    const categories = await Category.find({ isListed: true });

    res.render("shop", {
      products,
      categories,
      category,
      maxPrice,
      search,
      sort: req.query.sort || 'default',
      message: req.session.user
    });
  } catch (error) {
    console.error("Error loading shop page:", error);
    res.status(500).send("Server error");
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
    placeOrder,
    cancelOrder
};
