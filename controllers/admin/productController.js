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
//         console.log('Received product data:', products);

//         // Check if product already exists
//         const productExists = await Product.findOne({
//           product: products.product,
//         });

//         if (productExists) {
//           console.log('Product already exists');
//           return res.status(400).json({ error: "Product already exists, try a different name." });
//         }

//         // Handle images
//         const images = [];
//         if (req.files && req.files.length > 0) {
//           for (let i = 0; i < req.files.length; i++) {
//             const originalImagePath = req.files[i].path
//             const filename = `processed-${Date.now()}-${req.files[i].filename}`;
//             const resizedImagePath = path.join('public','uploads','product-images',filename)
//             try {
//               console.log('Processing image:', {
//                 originalPath: originalImagePath,
//                 resizedPath: resizedImagePath,
//                 fileInfo: req.files[i]
//               });

//               // Basic image processing without format detection
//               await sharp(originalImagePath)
//                 .resize(800, 800, {
//                   fit: 'contain',
//                   background: { r: 255, g: 255, b: 255, alpha: 1 }
//                 })
//                 .jpeg({ quality: 90 })  // Convert all images to JPEG
//                 .toFile(path.resolve(resizedImagePath));

//               // Clean up original file
//               fs.unlink(originalImagePath, (err) => {
//                 if (err) console.error('Error deleting original file:', err);
//               });

//               images.push(filename);
//               console.log('Image processed successfully:', filename);
//             } catch (error) {
//               console.error('Detailed error information:', {
//                 error: error.message,
//                 stack: error.stack,
//                 file: req.files[i],
//                 originalPath: originalImagePath,
//                 resizedPath: resizedImagePath
//               });
              
//               // Clean up any files in case of error
//               try {
//                 if (fs.existsSync(originalImagePath)) {
//                   fs.unlinkSync(originalImagePath);
//                 }
//                 if (fs.existsSync(resizedImagePath)) {
//                   fs.unlinkSync(resizedImagePath);
//                 }
//               } catch (cleanupError) {
//                 console.error('Error during cleanup:', cleanupError);
//               }

//               return res.status(400).json({ 
//                 status: false, 
//                 message: `Error processing image: ${error.message}. Please try a different image file.`
//               });
//             }
//           }
//         }
//         // Create and save the product
//         const newProduct = new Product({
//           product: products.product,
//           description: products.description,
//           brand: products.brand,
//           category: products.category,
//           regularPrice: products.regularPrice,
//           salesPrice: products.salesPrice,
//           quantity: products.quantity,
//           color: products.color,
//           productImage: images,
//           status: "Available",
//         });

//         console.log('Saving product:', newProduct);
//         await newProduct.save();
//         res.redirect("/admin/products")
//       } catch (error) {
//         console.error("Error saving product",error);
//         res.status(500).json({ error: error.message });
        
//       }

//     }
// }


// const getAllProducts = async (req,res)=>{
//     try {

//         const search = req.query.search || "";
//         const page = req.query.page || "";
//         const limit = 4;

//         const productData = await Product.find({

//           $or:[
//               {productName:{$regex:new RegExp(".*"+search+".*","i")}}

//           ],
//         }).limit(limit*1).skip((page-1)*limit).populate('category').exec();

//         const count = await Product.find({
//           $or:[
//               {productName:{$regex:new RegExp(".*"+search+".*","i")}}
//           ],

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

    // console.log('Received product data:', products);

    // Check if product already exists
    const productExists = await Product.findOne({
      product: products.product,
    });

    if (productExists) {
      console.log('Product already exists');
      return res.status(400).json({ error: "Product already exists, try a different name." });
    }

    // Handle images
    const images = [];
    if (req.files && req.files.length > 0) {
      for (let i = 0; i < req.files.length; i++) {
        const originalImagePath = req.files[i].path;
        const filename = `processed-${Date.now()}-${req.files[i].filename}`;
        const resizedImagePath = path.join(
          "public",
          "uploads",
          "product-images",
          filename
        );

        try {
          console.log('Processing image:', {
            originalPath: originalImagePath,
            resizedPath: resizedImagePath,
            fileInfo: req.files[i]
          });

          // Process image with different input and output paths
          await sharp(originalImagePath)
            .resize(800, 800, {
              fit: 'contain',
              background: { r: 255, g: 255, b: 255, alpha: 1 }
            })
            .jpeg({ quality: 90 })
            .toFile(path.resolve(resizedImagePath));

          // Clean up original file after successful processing
          fs.unlink(originalImagePath, (err) => {
            if (err) console.error('Error deleting original file:', err);
          });

          // Store the new filename
          images.push(filename);
          console.log('Image processed successfully:', filename);
        } catch (error) {
          console.error('Detailed error information:', {
            error: error.message,
            stack: error.stack,
            file: req.files[i],
            originalPath: originalImagePath,
            resizedPath: resizedImagePath
          });
          
          // Clean up any files in case of error
          try {
            if (fs.existsSync(originalImagePath)) {
              fs.unlinkSync(originalImagePath);
            }
            if (fs.existsSync(resizedImagePath)) {
              fs.unlinkSync(resizedImagePath);
            }
          } catch (cleanupError) {
            console.error('Error during cleanup:', cleanupError);
          }

          return res.status(400).json({ 
            status: false, 
            message: `Error processing image: ${error.message}. Please try a different image file.`
          });
        }
      }
    }

    // Create and save the product
    const newProduct = new Product({
      product: products.product,
      description: products.description,
      brand: products.brand,
      category: products.category,
      regularPrice: products.regularPrice,
      salesPrice: products.salesPrice,
      quantity: products.quantity,
      color: products.color,
      productImage: images,
      status: "Available",
    });

    console.log('Saving product:', newProduct);
    await newProduct.save();
    res.redirect("/admin/products");
  } catch (error) {
    console.error("Error saving product:", error);
    res.status(500).json({ error: error.message });
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
      product: { $regex: new RegExp(".*" + search + ".*", "i") },
    })
      .limit(limit)
      .skip((page - 1) * limit)
      .populate("category")
      .sort({ createdAt: -1 })
      .exec();

    // Count total products
    const count = await Product.countDocuments({
      product: { $regex: new RegExp(".*" + search + ".*", "i") },
    });

    // Fetch listed categories
    const category = await Category.find({ isListed: true });

    // console.log('Products found:', productData);
    // console.log('Categories:', category);

    // Render products page
    if (category) {
      res.render("products", {
        products: productData,
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        categories: category,
        search: search
      });
    } else {
      res.render("page-404");
    }
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ error: error.message });
  }
};



const blockProduct = async (req,res)=>{
  try {
    let id= req.query.id;
    await Product.updateOne({_id:id},{$set:{isBlocked:true}})
    res.redirect("/admin/products")
    
  } catch (error) {
    res.redirect("/pageerror")
    
  }
}

const unblockProduct = async (req,res)=>{
  try {
    let id= req.query.id;
    await Product.updateOne({_id:id},{$set:{isBlocked:false}})
    res.redirect("/admin/products")
    
  } catch (error) {
    res.redirect("/pageerror")
    
  }
}


// const getEditProduct = async (req,res)=>{
//   try {
// const id = req.query.id;
// const product = await Product.findOne({_id:id})
// const category = await Category.find({})
// res.render("editproduct",{
//   product:product,
//   cat:category,
// })


    
//   } catch (error) {


//     res.redirect("/pageerror")
    
//   }
// }
const getEditProduct = async (req, res) => {
  try {
    // console.log("hiii")
    const id = req.params.id;
    // console.log("Product ID:", id); // Debugging


    const product = await Product.findOne({ _id: id });
    // console.log("Product:", product); // Debugging

    if (!product) {
      return res.status(404).send("Product not found.");
    }

    const category = await Category.find({});
    res.render("editproduct", {
      product: product,
      cat: category,
    });
  } catch (error) {
    console.error("Error fetching product:", error); // Debugging
    res.redirect("/pageerror");
  }
};


const updateProduct = async (req, res) => {
  console.log('j')
    try {
      console.log("--------------------------------------------");
      console.log("UPDATE PRODUCT")
      console.log(req.body)
        const productId = req.params.id;
        const {
            name,
            description,
            regularPrice,
            salesPrice,
            quantity,
            color,
            category
        } = req.body;

        // Find the existing product
        const existingProduct = await Product.findById(productId);
        if (!existingProduct) {
            return res.status(404).json({ error: "Product not found" });
        }

        // Handle image updates
        let images = existingProduct.images;
        if (req.files && req.files.length > 0) {
            // Process new images
            for (let i = 0; i < req.files.length; i++) {
                const file = req.files[i];
                const filename = `${Date.now()}-${i}-${file.originalname}`;
                const processedPath = path.join('public', 'uploads', 'product-images', filename);
                
                try {
                    // Process and save the image
                    await sharp(file.path)
                        .resize(800, 800, { fit: 'contain' })
                        .toFile(processedPath);

                    // Delete the original uploaded file
                    fs.unlink(file.path, (err) => {
                        if (err) console.error('Error deleting original file:', err);
                    });

                    // If there's an existing image at this position, delete it
                    if (images[i]) {
                        const oldImagePath = path.join('public', 'uploads', 'product-images', images[i]);
                        fs.unlink(oldImagePath, (err) => {
                            if (err) console.error('Error deleting old image:', err);
                        });
                    }

                    // Update the image array
                    images[i] = filename;
                } catch (error) {
                    console.error('Error processing image:', error);
                    throw error;
                }
            }
        }

        // Update the product
        const updatedProduct = await Product.findByIdAndUpdate(
            productId,
            {
                product:name,
                description:description,
                regularPrice:regularPrice,
                salesPrice:salesPrice,
                quantity:Number(quantity),
                color:color,
                category:category,
                images
            },
            { new: true }
        );
        if(updatedProduct)
        {
          console.log("Data Save sucessfully")
          return res.status(404).json({success:true});
        }
        else
        {
          console.log("Did Not UpDate")
        }
        // res.redirect('/admin/products');
    } catch (error) {
        console.error('Error updating product:', error);
        res.status(500).json({ error: "Error updating product" });
    }
};

module.exports = {
    getProductAddPage,
    addProducts,
    getAllProducts,
    blockProduct,
    unblockProduct,
    getEditProduct,
    updateProduct
};
