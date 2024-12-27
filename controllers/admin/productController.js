const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const User = require("../../models/userSchema");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

// Create necessary directories
const uploadDir = path.join(__dirname, "../../public/uploads");
const productImagesDir = path.join(uploadDir, "product-images");

// Ensure directories exist
[uploadDir, productImagesDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

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
        console.log('Received product data:', products);

        // Check if product already exists
        const productExists = await Product.findOne({
            productName: products.productName
        });

        if (productExists) {
            console.log('Product already exists');
            return res.status(400).json({ 
                status: false, 
                message: "Product already exists, try a different name." 
            });
        }

        // Handle images
        const images = [];
        if (!req.files || req.files.length !== 3) {
            return res.status(400).json({ 
                status: false, 
                message: "Please upload exactly 3 product images" 
            });
        }

        // Process all images
        for (const file of req.files) {
            try {
                console.log('Processing file:', {
                    originalname: file.originalname,
                    mimetype: file.mimetype,
                    size: file.size,
                    hasBuffer: !!file.buffer
                });

                const fileName = `${Date.now()}-${file.originalname.replace(/\s+/g, '-')}`;
                const filePath = path.join(__dirname, '../../public/uploads/product-images', fileName);

                // Ensure the directory exists
                const dir = path.dirname(filePath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }

                if (!file.buffer) {
                    throw new Error('No buffer found in uploaded file');
                }

                // Process and save the image
                const image = sharp(file.buffer);
                const metadata = await image.metadata();
                
                // Only resize if the image is larger than 800x800
                if (metadata.width > 800 || metadata.height > 800) {
                    await image
                        .resize(800, 800, {
                            fit: 'contain',
                            background: { r: 255, g: 255, b: 255, alpha: 1 }
                        })
                        .toFormat('jpeg')
                        .jpeg({ quality: 90 })
                        .toFile(filePath);
                } else {
                    // If image is smaller, just convert to jpeg without resizing
                    await image
                        .toFormat('jpeg')
                        .jpeg({ quality: 90 })
                        .toFile(filePath);
                }

                images.push(fileName);
            } catch (error) {
                console.error('Error processing image:', error);
                return res.status(400).json({ 
                    status: false, 
                    message: "Error processing image. Please ensure all files are valid images." 
                });
            }
        }

        // Create new product
        const newProduct = new Product({
            productName: products.productName,
            description: products.description,
            brand: products.brand || '',
            category: products.category,
            regularPrice: products.regularPrice,
            salesPrice: products.salesPrice,
            quantity: products.quantity,
            color: products.color,
            productImage: images,
            status: "Available"
        });

        await newProduct.save();
        return res.status(200).json({ 
            status: true, 
            message: "Product added successfully" 
        });

    } catch (error) {
        console.error("Error adding product:", error);
        return res.status(500).json({ 
            status: false, 
            message: "Internal server error: " + error.message 
        });
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
            .sort({ createdAt: -1 })
            .exec();

        // Count total products
        const count = await Product.countDocuments({
            productName: { $regex: new RegExp(".*" + search + ".*", "i") },
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

// Block Product
const blockProduct = async (req, res) => {
    try {
        const id = req.query.id;
        if (!id) {
            return res.status(400).json({ error: "Product ID is required" });
        }

        const product = await Product.findById(id);
        if (!product) {
            return res.status(404).json({ error: "Product not found" });
        }

        await Product.findByIdAndUpdate(id, { isBlocked: true });
        res.redirect("/admin/products");
    } catch (error) {
        console.error("Error blocking product:", error);
        res.status(500).json({ error: "Failed to block product" });
    }
};

// Unblock Product
const unblockProduct = async (req, res) => {
    try {
        const id = req.query.id;
        if (!id) {
            return res.status(400).json({ error: "Product ID is required" });
        }

        const product = await Product.findById(id);
        if (!product) {
            return res.status(404).json({ error: "Product not found" });
        }

        await Product.findByIdAndUpdate(id, { isBlocked: false });
        res.redirect("/admin/products");
    } catch (error) {
        console.error("Error unblocking product:", error);
        res.status(500).json({ error: "Failed to unblock product" });
    }
};

// Get Edit Product
const getEditProduct = async (req, res) => {
    try {
        const id = req.params.id;
        const product = await Product.findOne({ _id: id });
        if (!product) {
            return res.status(404).send("Product not found.");
        }
        const category = await Category.find({});
        res.render("editproduct", {
            product: product,
            cat: category,
        });
    } catch (error) {
        console.error("Error fetching product:", error);
        res.redirect("/pageerror");
    }
};

// Update Product
const updateProduct = async (req, res) => {
    try {
        const productId = req.params.id;
        const { productName, description, regularPrice, salesPrice, quantity, color, category } = req.body;
        const deletedImages = req.body.deletedImages ? JSON.parse(req.body.deletedImages) : [];
        
        // Find the existing product
        const existingProduct = await Product.findById(productId);
        if (!existingProduct) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        // Handle deleted images
        let updatedImages = [...existingProduct.productImage];
        if (deletedImages.length > 0) {
            // Remove deleted images from the array
            updatedImages = updatedImages.filter(img => !deletedImages.includes(img));
            
            // Delete the files from the server
            for (const image of deletedImages) {
                const imagePath = path.join(__dirname, '../../public/uploads/product-images', image);
                if (fs.existsSync(imagePath)) {
                    fs.unlinkSync(imagePath);
                }
            }
        }

        // Handle new image uploads
        const newImages = [];
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                try {
                    console.log('Processing file:', {
                        originalname: file.originalname,
                        mimetype: file.mimetype,
                        size: file.size,
                        hasBuffer: !!file.buffer
                    });
                    
                    const fileName = `${Date.now()}-${file.originalname.replace(/\s+/g, '-')}`;
                    const filePath = path.join(__dirname, '../../public/uploads/product-images', fileName);

                    // Ensure the directory exists
                    const dir = path.dirname(filePath);
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir, { recursive: true });
                    }

                    if (!file.buffer) {
                        throw new Error('No buffer found in uploaded file');
                    }

                    // Process and save the image
                    const image = sharp(file.buffer);
                    const metadata = await image.metadata();
                    
                    // Only resize if the image is larger than 800x800
                    if (metadata.width > 800 || metadata.height > 800) {
                        await image
                            .resize(800, 800, {
                                fit: 'contain',
                                background: { r: 255, g: 255, b: 255, alpha: 1 }
                            })
                            .toFormat('jpeg')
                            .jpeg({ quality: 90 })
                            .toFile(filePath);
                    } else {
                        // If image is smaller, just convert to jpeg without resizing
                        await image
                            .toFormat('jpeg')
                            .jpeg({ quality: 90 })
                            .toFile(filePath);
                    }

                    newImages.push(fileName);
                } catch (error) {
                    console.error('Error processing image:', error);
                    return res.status(500).json({ 
                        success: false, 
                        message: 'Error processing image: ' + error.message 
                    });
                }
            }
            
            // Add new images to the array
            updatedImages = [...updatedImages, ...newImages].slice(0, 3); // Keep max 3 images
        }

        // Update the product
        const updatedProduct = await Product.findByIdAndUpdate(
            productId,
            {
                productName,
                description,
                regularPrice: Number(regularPrice),
                salesPrice: Number(salesPrice),
                quantity: Number(quantity),
                color,
                category,
                productImage: updatedImages
            },
            { new: true }
        );

        res.json({ 
            success: true, 
            message: 'Product updated successfully',
            product: updatedProduct 
        });
    } catch (error) {
        console.error('Error updating product:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error updating product: ' + error.message 
        });
    }
};

// Delete Product Image
const deleteProductImage = async (req, res) => {
    try {
        const { imageName, productId } = req.body;

        // Find the product
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        // Check if image exists in product
        const imageIndex = product.productImage.indexOf(imageName);
        if (imageIndex === -1) {
            return res.status(404).json({ success: false, message: 'Image not found' });
        }

        // Delete image file
        const imagePath = path.join('public', 'uploads', 'product-images', imageName);
        fs.unlink(imagePath, (err) => {
            if (err) {
                console.error('Error deleting image file:', err);
                // Continue even if file deletion fails
            }
        });

        // Remove image from product
        product.productImage.splice(imageIndex, 1);
        await product.save();

        res.json({ success: true, message: 'Image deleted successfully' });
    } catch (error) {
        console.error('Error deleting product image:', error);
        res.status(500).json({ success: false, message: 'Error deleting image' });
    }
};

module.exports = {
    getProductAddPage,
    addProducts,
    getAllProducts,
    blockProduct,
    unblockProduct,
    getEditProduct,
    updateProduct,
    deleteProductImage
};
