// const Product = require("../../models/productSchema");
// const Category = require("../../models/categorySchema");
// const User = require("../../models/userSchema")

// const fs = require("fs");
// const path = require("path")
// const sharp = require("sharp")


// const getProductAddPage = async(req,res)=>{
//     try {
//         const category = await Category.find({isListed:true})
//         res.render("product-add",{
//             cat:category,
//         })
        
//     } catch (error) {

//         res.redirect("/pageerror")
        
//     }

// }



// const addProducts = async(req,res)=>{
//     try {
//         const products = req.body;
//         const productExists = await Product.findOne({
//             ProductName:products.ProductName,
//         })
//         if(!productExists){
//             const images = [];
//         }

//         if(req.files && req.files.length>0){
//             for(let i=0;i<req.files.length;i++){
//                 const originalImagePath = req.files[i].path
//                 const resizedImagePath = path.join('public','uploads','product-images',req.files[i].filename)
//                 await sharp(originalImagePath.resize({width:450,heigth:450}).toFile(resizedImagePath));
//                 images.push(req.files[i].filename)
//             }
//         }
//         const categoryId = await Category.findOne({name:products.category})

//         if(!categoryId){
//             return res.status(400).join("Invalid category name")
        

//         const newProduct = new Product({
//             ProductName:products.productName,
//             description:products.description,
//             category:categoryId._id,
//             regularPrice:products.regularPrice,
//             salesPrice:products.salesPrice,
//             createdOn: new Date(),
//             quantity:products.quantity,
//             size:products.size,
//             color:products.color,
//             productImage:images,
//             status:'Available'
//         })

//         await newProduct.save();
//         return res.redirect("/admin/addProducts")
//     }else{
//         return res.status(400).json("Product already exist ,please try with another name")

//     }
        
//     } catch (error) {
//         console.error("Error saving product",error);
//         return res.redirect("/admin/pageerror")
        
//     }
// }


// const getAllProducts = async (req,res)=>{
//     try {

//         const search = req.query.search || "";
//         const page = req.query.page || "";
//         const limit = 4;

//         const productData = await Product.find({
//             $or:[
//                 {productName:{$regex:new RegExp(".*"+search+".*","i")}}

//             ],
//         }).limit(limit*1).skip((page-1)*limit).populate('category').exec();

//         const count = await Product.find({
//             $or:[
//                 {productName:{$regex:new RegExp(".*"+search+".*","i")}}
//             ],
//         }).countDocuments()

//         const category = await Category.find({isListed:true});

//         if(category){
//             res.render("products",{
//                 data:productData,
//                 currentPage:page,
//                 totalPages:page,
//                 totalPages:Math.ceil(count/limit),
//                 cat:category,

//             })
//         }else{

//             res.render("page-404")
//         }
        
//     } catch (error) {

//         res.redirect("/pageerror")
        
//     }
// }

// module.exports ={

//     getProductAddPage,
//     addProducts,
//     getAllProducts,


// }



const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const User = require("../../models/userSchema");

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

// Render Add Product Page
const getProductAddPage = async (req, res) => {
  try {
    const category = await Category.find({ isListed: true });
    res.render("product-add", { cat: category });
  } catch (error) {
    console.error("Error loading product add page:", error);
    res.redirect("/pageerror");
  }
};

// Add New Product
const addProducts = async (req, res) => {
  try {
    const products = req.body;

    // Check if product already exists
    const productExists = await Product.findOne({
      ProductName: products.ProductName,
    });
    if (productExists) {
      return res.status(400).json("Product already exists, try a different name.");
    }

    // Handle images
    const images = [];
    if (req.files && req.files.length > 0) {
      for (let i = 0; i < req.files.length; i++) {
        const originalImagePath = req.files[i].path;
        const resizedImagePath = path.join(
          "public",
          "uploads",
          "product-images",
          req.files[i].filename
        );

        await sharp(originalImagePath)
          .resize({ width: 450, height: 450 })
          .toFile(resizedImagePath);

        images.push(req.files[i].filename);
      }
    }

    // Validate category
    const categoryId = await Category.findOne({ name: products.category });
    if (!categoryId) {
      return res.status(400).json("Invalid category name.");
    }

    // Create and save the product
    const newProduct = new Product({
      ProductName: products.ProductName,
      description: products.description,
      category: categoryId._id,
      regularPrice: products.regularPrice,
      salesPrice: products.salesPrice,
      createdOn: new Date(),
      quantity: products.quantity,
      size: products.size,
      color: products.color,
      productImage: images,
      status: "Available",
    });

    await newProduct.save();
    res.redirect("/admin/addProducts");
  } catch (error) {
    console.error("Error saving product:", error);
    res.redirect("/admin/pageerror");
  }
};

// Get All Products with Pagination
const getAllProducts = async (req, res) => {
  try {
    const search = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const limit = 4;

    // Fetch products with search and pagination
    const productData = await Product.find({
      productName: { $regex: new RegExp(".*" + search + ".*", "i") },
    })
      .limit(limit)
      .skip((page - 1) * limit)
      .populate("category")
      .exec();

    // Count total products
    const count = await Product.countDocuments({
      productName: { $regex: new RegExp(".*" + search + ".*", "i") },
    });

    // Fetch listed categories
    const category = await Category.find({ isListed: true });

    // Render products page
    if (category) {
      res.render("products", {
        data: productData,
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        cat: category,
      });
    } else {
      res.render("page-404");
    }
  } catch (error) {
    console.error("Error fetching products:", error);
    res.redirect("/pageerror");
  }
};

module.exports = {
  getProductAddPage,
  addProducts,
  getAllProducts,
};
