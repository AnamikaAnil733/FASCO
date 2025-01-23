const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin/adminController");
const customerController = require("../controllers/admin/customerController")
const categoryController = require("../controllers/admin/categoryController")
const productController = require("../controllers/admin/productController")
const orderController = require("../controllers/admin/orderController")
const couponController = require('../controllers/admin/couponController');
const {userAuth,adminAuth} = require("../middleware/auth");
const multer = require("multer");
const path = require("path");

// Multer configuration
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    if (file.mimetype === "image/png" || file.mimetype === "image/jpg" || file.mimetype === "image/jpeg") {
        cb(null, true);
    } else {
        cb(new Error('Only .png, .jpg and .jpeg format allowed!'), false);
    }
};

const uploadConfig = {
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: fileFilter
};

// Create multer instances for different routes
const productUpload = multer(uploadConfig).fields([
    { name: 'mainImages', maxCount: 3 },
    { name: 'variantImages', maxCount: 15 } // 5 variants * 3 images each
]);

const updateProductUpload = multer(uploadConfig).fields([
    { name: 'mainImages', maxCount: 3 },
    { name: 'variantImages', maxCount: 15 }
]);

// Admin authentication routes
router.get("/", adminAuth, adminController.loadDashbord);
router.get("/login", adminController.loadLogin);
router.post("/login", adminController.login);
router.get("/logout", adminController.logout);

// Dashboard routes
router.get("/dashboard", adminAuth, adminController.loadDashbord);
router.get("/sales-data", adminAuth, adminController.getSalesDataAPI);

// Customer routes
router.get("/users",adminAuth,customerController.customerInfo)
router.get("/blockCustomer",adminAuth,customerController.customerBlocked)
router.get("/unblockCustomer",adminAuth,customerController.customerunBlocked)

// Category routes
router.get("/category",adminAuth,categoryController.categoryInfo)
router.post("/addCategory",adminAuth,categoryController.addCategory)
router.get("/listCategory",adminAuth,categoryController.getListCategory);
router.get("/unlistCategory",adminAuth,categoryController.getUnListCategory)
router.get("/editCategory",adminAuth,categoryController.getEditCategory)
router.post("/editCategory/:id",adminAuth,categoryController.editCategory)
router.post("/updateCategoryOffer", adminAuth, categoryController.updateCategoryOffer);
router.post("/removeCategoryOffer", adminAuth, categoryController.removeCategoryOffer);

// Product routes
router.get("/addproducts",adminAuth,productController.getProductAddPage)
router.get("/products", adminAuth, productController.getAllProducts);
router.get("/blockProduct", adminAuth, productController.blockProduct);
router.get("/unblockProduct", adminAuth, productController.unblockProduct);
router.post("/addProducts", adminAuth, productUpload, productController.addProducts);
router.get("/editProduct/:id", adminAuth, productController.getEditProduct);
router.post("/updateProduct/:id", adminAuth, updateProductUpload, productController.updateProduct);
router.delete("/deleteProductImage", adminAuth, productController.deleteProductImage);
router.post("/updateProductOffer", adminAuth, productController.updateProductOffer);
router.post("/removeProductOffer", adminAuth, productController.removeProductOffer);

// Order Management Routes
router.get('/orderList', adminAuth, orderController.getAllOrders);  // Keep the old route for compatibility
router.get('/orders', adminAuth, orderController.getAllOrders);
router.get('/orders/:orderId', adminAuth, orderController.getOrderDetails);
router.post('/orders/update-status', adminAuth, orderController.updateOrderStatus);
router.post('/orders/cancel', adminAuth, orderController.cancelOrder);
router.post('/orders/:orderId/return/:productId/:action', adminAuth, orderController.handleReturn);

// Coupon Management Routes
router.get('/coupons', adminAuth, couponController.getAllCoupons);
router.post('/coupons/create', adminAuth, couponController.createCoupon);
router.delete('/coupons/:id', adminAuth, couponController.deleteCoupon);

// Sales Report routes
router.get("/sales-report", adminAuth, adminController.loadSalesReport);
router.get("/download-excel-report", adminAuth, adminController.downloadExcelReport);
router.get("/download-pdf-report", adminAuth, adminController.downloadPdfReport);

// Add download routes
router.get('/download-sales-report', adminAuth, adminController.downloadSalesReport);

module.exports = router;