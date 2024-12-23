const express = require("express")
const router =express.Router();
const userController = require("../controllers/user/userController");
const passport = require("passport");


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


router.get('/auth/google',passport.authenticate('google',{scope:['profile','email']}));
router.get('/auth/google/callback',passport.authenticate('google',{failureRedirect:'/signup'}),(req,res)=>{
    req.session.user = req.session.passport.user
    res.redirect('/')
})








module.exports = router;