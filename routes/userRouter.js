const express = require("express")
const router =express.Router();
const userController = require("../controllers/user/userController");
const passport = require("passport");
const { userAuth } = require("../middleware/auth");

router.get("/pageNotFound",userController.pageNotFound)
router.get("/",userController.loadHomepage)
// router.get("/shop",userController.loadHomepage)
router.get("/signup",userController.loadSignup)
router.post("/signup",userController.Signup)
router.post("/verify-otp",userController.verifyOtp)
router.post("/resend-otp",userController.resendOtp)
router.get("/login",userController.loadLogin);
router.post("/login",userController.login);
router.get("/logout",userController.logout);
router.get("/product/:id", userController.getProductDetail);

// Account Routes
router.get("/userProfile", userController.loadAccount);
router.post("/update-profile", userController.updateProfile);

// Order Routes
router.get("/orders", userAuth, userController.getOrders);
router.get("/order/:orderId", userAuth, userController.getOrderDetails);

// Forgot Password Routes
router.get("/forgot-password", userController.loadForgotPassword);
router.post("/forgot-password", userController.forgotPassword);
router.get("/reset-password/:token", userController.loadResetPassword);
router.post("/reset-password/:token", userController.resetPassword);

router.get('/auth/google',passport.authenticate('google',{scope:['profile','email']}));
router.get('/auth/google/callback',passport.authenticate('google',{failureRedirect:'/signup'}),(req,res)=>{
    req.session.user = req.session.passport.user
    res.redirect('/')
})

router.post('/change-password',userAuth, userController.changePassword);

// Address Management Routes
router.get('/address-book', userAuth, userController.loadAddresses);
router.get('/manage-addresses', userAuth, userController.loadAddresses);
router.post('/add-address', userAuth, userController.addAddress);
router.post('/edit-address/:id', userAuth, userController.editAddress);
router.delete('/delete-address/:id', userAuth, userController.deleteAddress);

module.exports = router;