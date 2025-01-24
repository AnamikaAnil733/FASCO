const express = require('express');
const router = express.Router();
const userController = require("../controllers/user/userController");
const passport = require("passport");
const { userAuth } = require("../middleware/auth");

router.get("/pageNotFound",userController.pageNotFound)
router.get("/",userController.loadHomepage)
router.get("/shop",userController.loadShop)
router.get("/signup",userController.loadSignup)
router.post("/signup",userController.Signup)
router.post("/verify-otp",userController.verifyOtp)
router.post("/resend-otp",userController.resendOtp)
router.get("/login",userController.loadLogin);
router.post("/login",userController.login);
router.get("/logout",userController.logout);
// router.get("/product/:id", userController.getProductDetail);
router.get('/product/:id', userController.loadProductDetails);

// Account Routes
router.get("/userProfile",userAuth, userController.loadAccount);
router.post("/update-profile",userAuth, userController.updateProfile);

// Order Routes
router.get('/orders', userAuth, userController.getOrders);
router.get('/order/success/:orderId', userAuth, userController.getOrderSuccess);
router.get('/order/:orderId', userAuth, userController.getOrderDetails);
router.get('/orders/:orderId/invoice', userAuth, userController.downloadInvoice);
router.post('/cancel-order/:orderId', userAuth, userController.cancelOrder);
router.post('/orders/:orderId/return/:productId', userAuth, userController.returnProduct);
router.post('/order/create', userAuth, userController.createOrder);
router.post('/order/verify-payment', userAuth, userController.verifyPayment);
router.post('/orders/:orderId/retry-payment', userAuth, userController.retryPayment);

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
router.post('/address/add', userAuth, userController.addAddress);
router.put('/address/edit/:addressId', userAuth, userController.editAddress);
router.delete('/address/delete/:addressId', userAuth, userController.deleteAddress);

// Coupon Routes
router.get('/coupons/available', userAuth, userController.getAvailableCoupons);
router.post('/coupons/validate', userAuth, userController.validateCoupon);

// Cart Routes
router.post('/cart/add', userAuth, userController.addToCart);
router.get('/cart', userAuth, userController.getCart);
router.put('/cart/update', userAuth, userController.updateCartItem);
router.delete('/cart/remove/:productId/:variantIndex', userAuth, userController.removeFromCart);
router.get('/cart/count', userAuth, userController.getCartCount);
// Checkout Routes
router.get('/checkout', userAuth, userController.loadCheckout);

// Wishlist Routes
router.get('/wishlist', userAuth, userController.loadWishlist);
router.post('/wishlist/add', userAuth, userController.addToWishlist);
router.delete('/wishlist/remove/:productId', userAuth, userController.removeFromWishlist);
router.get('/wishlist/count', userAuth, userController.getWishlistCount);
router.get('/check-wishlist-status/:productId', userAuth, userController.checkWishlistStatus);
// router.post('/add-to-wishlist', userAuth, userController.addToWishlist);
// router.post('/remove-from-wishlist', userAuth, userController.removeFromWishlist);
// router.get('/get-wishlist-count', userAuth, userController.getWishlistCount);

router.get('/wallet', userAuth, userController.getWallet);

// Check authentication status endpoint
router.get('/check-auth', (req, res) => {
    res.json({ isLoggedIn: req.session.user ? true : false });
});

module.exports = router;