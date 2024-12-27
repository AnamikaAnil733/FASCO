const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin/adminController")
const customerController =require("../controllers/admin/customerController")
const categoryController =require("../controllers/admin/categoryController")
const productController =require("../controllers/admin/productController")
const {userAuth,adminAuth} = require("../middleware/auth");
const multer = require("multer");
const path = require("path");

// Multer configuration
const storage = multer.memoryStorage();

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === "image/png" || file.mimetype === "image/jpg" || file.mimetype === "image/jpeg") {
            cb(null, true);
        } else {
            cb(new Error('Only .png, .jpg and .jpeg format allowed!'), false);
        }
    }
});

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

// Handle product image upload
router.post("/addProducts", adminAuth, upload.array('images', 3), (req, res, next) => {
    try {
        if (req.fileValidationError) {
            return res.status(400).json({ status: false, message: req.fileValidationError });
        }
        if (!req.files || req.files.length !== 3) {
            return res.status(400).json({ status: false, message: 'Please upload exactly 3 product images' });
        }
        next();
    } catch (error) {
        if (error instanceof multer.MulterError) {
            if (error.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ status: false, message: 'File size is too large. Maximum size is 5MB.' });
            }
            if (error.code === 'LIMIT_FILE_COUNT') {
                return res.status(400).json({ status: false, message: 'Please upload exactly 3 images.' });
            }
            return res.status(400).json({ status: false, message: error.message });
        }
        next(error);
    }
}, productController.addProducts)
router.get("/editproduct/:id",adminAuth,productController.getEditProduct)
// Update product with images
router.post("/updateProduct/:id", 
    adminAuth, 
    upload.array('images', 3),
    productController.updateProduct
);
router.post("/deleteProductImage", adminAuth, productController.deleteProductImage)

module.exports = router