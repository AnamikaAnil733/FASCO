const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin/adminController")
const customerController =require("../controllers/admin/customerController")
const categoryController =require("../controllers/admin/categoryController")
const productController =require("../controllers/admin/productController")
const orderController = require("../controllers/admin/orderController")
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

router.get("/login",adminController.loadLogin);
router.post("/login",adminController.login);
router.get("/",adminAuth,adminController.loadDashbord);
router.get("/pageerror",adminController.pageerror)
router.get("/logout",adminController.logout)
router.get("/users",adminAuth,customerController.customerInfo)
router.get("/blockCustomer",adminAuth,customerController.customerBlocked)
router.get("/unblockCustomer",adminAuth,customerController.customerunBlocked)
router.get("/category",adminAuth,categoryController.categoryInfo)
router.post("/addCategory",adminAuth,categoryController.addCategory)
router.get("/listCategory",adminAuth,categoryController.getListCategory);
router.get("/unlistCategory",adminAuth,categoryController.getUnListCategory)
router.get("/editCategory",adminAuth,categoryController.getEditCategory)
router.post("/editCategory/:id",adminAuth,categoryController.editCategory)



router.get("/addproducts",adminAuth,productController.getProductAddPage)

// Product routes
router.get("/products", adminAuth, productController.getAllProducts);
router.get("/blockProduct", adminAuth, productController.blockProduct);
router.get("/unblockProduct", adminAuth, productController.unblockProduct);
router.post("/addProducts", adminAuth, productUpload, productController.addProducts);
router.get("/editProduct/:id", adminAuth, productController.getEditProduct);
router.post("/updateProduct/:id", adminAuth, updateProductUpload, productController.updateProduct);
router.delete("/deleteProductImage", adminAuth, productController.deleteProductImage);

// Order Management Routes
router.get('/orderList', adminAuth, orderController.getAllOrders);  // Keep the old route for compatibility
router.get('/orders', adminAuth, orderController.getAllOrders);
router.get('/orders/:orderId', adminAuth, orderController.getOrderDetails);
router.post('/updateOrderStatus', adminAuth, orderController.updateOrderStatus);
router.post('/cancelOrder', adminAuth, orderController.cancelOrder);

module.exports = router