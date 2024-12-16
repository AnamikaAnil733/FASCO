const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin/adminController")
const customerController =require("../controllers/admin/customerController")
const {userAuth,adminAuth} = require("../middleware/auth")


router.get("/login",adminController.loadLogin);
router.post("/login",adminController.login);
router.get("/",adminAuth,adminController.loadDashbord);
router.get("/pageerror",adminController.pageerror)
router.get("/logout",adminController.logout)
router.get("/users",adminAuth,customerController.customerInfo)




module.exports = router