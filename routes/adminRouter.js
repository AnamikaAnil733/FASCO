const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin/adminController")
const customerController =require("../controllers/admin/customerController")
const categoryController =require("../controllers/admin/categoryController")
const productController =require("../controllers/admin/productController")
const {userAuth,adminAuth} = require("../middleware/auth");
const multer = require("multer");
const upload = require("../helpers/multer");
const uploads = multer({storage:upload});

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
router.post("/addCategoryOffer",adminAuth,categoryController.addCategoryOffer)
router.post("/removeCategoryOffer",adminAuth,categoryController.removeCategoryOffer)
router.get("/listCategory",adminAuth,categoryController.getListCategory);
router.get("/unlistCategory",adminAuth,categoryController.getUnListCategory)
router.get("/editCategory",adminAuth,categoryController.getEditCategory)
router.post("/editCategory/:id",adminAuth,categoryController.editCategory)



router.get("/addproducts",adminAuth,productController.getProductAddPage)

router.post("/addProducts", upload.array('images', 4), async (req, res, next) => {
    try {
        if (req.fileValidationError) {
            return res.status(400).json({ status: false, message: req.fileValidationError });
        }
        next();
    } catch (error) {
        if (error instanceof multer.MulterError) {
            if (error.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ status: false, message: 'File size is too large. Maximum size is 5MB.' });
            }
            return res.status(400).json({ status: false, message: error.message });
        }
        next(error);
    }
}, productController.addProducts)
router.get("/products",adminAuth,productController.getAllProducts)


router.get("/blockProduct",adminAuth,productController.blockProduct);
router.get("/unblockProduct",adminAuth,productController.unblockProduct);
router.get("/editproduct/:id",adminAuth,productController.getEditProduct)
router.post("/updateProduct/:id", adminAuth, upload.array('images', 4), productController.updateProduct)

module.exports = router