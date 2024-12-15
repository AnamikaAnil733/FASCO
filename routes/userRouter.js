const express = require("express")
const router =express.Router();
const userController = require("../controllers/user/userController")


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











module.exports = router;