const User = require("../../models/userSchema");
const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const env = require("dotenv").config();
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");


const loadHomepage = async (req, res) => {
    try {
        // Get active categories
        const categories = await Category.find({ isListed: true });
        
        // Get unblocked products from active categories
        const products = await Product.find({
            isBlocked: false,
            category: { $in: categories.map(category => category._id) }
        }).sort({ createdAt: -1 });  // Sort by newest first
        
        res.render("home", {
            message: req.session.user,
            products: products
        });
    } catch (error) {
        console.error("Error loading home page:", error);
        res.status(500).send("Server error");
    }
};

  const loadSignup = async (req, res) => {
    try {
  
      res.render("signup");
    } catch (error) {
      console.log("signup page not loading:", error);
      res.status(500).send("Sever error")
    }
  };


function generateOtp(){
  return Math.floor(100000 + Math.random()*900000).toString();
}

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




  const pageNotFound = async (req, res) => {
    try {
      res.render("page-404");
    } catch (error) {
      res.redirect("/pageNotFound")   
    }
  };


  const securePassword = async(password)=>{
    try{
      const passwordHash = await bcrypt.hash(password,10)
      return passwordHash
    }catch(error){

    }
  };

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

  const getProductDetail = async (req, res) => {
    try {
        const id = req.params.id;
        const product = await Product.findById(id).populate('category');
        
        if (!product) {
            return res.status(404).render('404', { message: 'Product not found' });
        }

        if (product.isBlocked) {
            return res.status(403).render('404', { message: 'This product is currently unavailable' });
        }

        res.render("product-detail", {
            message: req.session.user,
            product: product
        });
    } catch (error) {
        console.error("Error getting product details:", error);
        res.status(500).send("Server error");
    }
  };




  module.exports = {
    loadHomepage,
    loadSignup,
    Signup,
    pageNotFound,
    verifyOtp,
    resendOtp,
    loadLogin,
    login,
    logout,
    getProductDetail
  };