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
        if (!req.session.admin) {
            return res.redirect("/admin/login");
        }

        const categories = await Category.find({ isListed: true });
        res.render("product-add", { categories });
    } catch (error) {
        console.error("Error loading product add page:", error);
        res.redirect("/admin/pageerror");
    }
};

// Add New Product
const addProducts = async (req, res) => {
    try {
        const products = req.body;
        console.log('Received product data:', products);

        // Check if product already exists
        const productExists = await Product.findOne({
            productName: products.name
        });

        if (productExists) {
            console.log('Product already exists');
            return res.status(400).json({ 
                success: false, 
                message: "Product already exists, try a different name." 
            });
        }

        // Process main product images
        const mainImages = [];
        if (req.files && req.files.mainImages) {
            for (const file of req.files.mainImages) {
                const filename = `main-${Date.now()}-${Math.round(Math.random() * 1E9)}.jpg`;
                const filepath = path.join(productImagesDir, filename);
                
                // Process and save image
                await sharp(file.buffer)
                    .resize(800, 800, { fit: 'inside' })
                    .jpeg({ quality: 80 })
                    .toFile(filepath);
                
                mainImages.push(filename);
            }
        }

        // Process variants and their images
        const variants = [];
        if (products.variants) {
            const variantData = Array.isArray(products.variants) ? products.variants : [products.variants];
            
            for (let i = 0; i < variantData.length; i++) {
                const variant = variantData[i];
                const variantImages = [];
                
                // Find variant images for this variant
                if (req.files && req.files.variantImages) {
                    const variantImageFiles = req.files.variantImages.filter(file => 
                        file.originalname.startsWith(`variant-${i}-image-`));
                    
                    for (const file of variantImageFiles) {
                        const filename = `variant-${Date.now()}-${Math.round(Math.random() * 1E9)}.jpg`;
                        const filepath = path.join(productImagesDir, filename);
                        
                        // Process and save image
                        await sharp(file.buffer)
                            .resize(800, 800, { fit: 'inside' })
                            .jpeg({ quality: 80 })
                            .toFile(filepath);
                        
                        variantImages.push(filename);
                    }
                }
                
                variants.push({
                    color: variant.color,
                    quantity: parseInt(variant.quantity) || 0,
                    images: variantImages.length > 0 ? variantImages : mainImages // Use main images if no variant images
                });
            }
        }

        // Create new product
        const newProduct = new Product({
            productName: products.name,
            description: products.description,
            category: products.category,
            regularPrice: parseFloat(products.regularPrice),
            salesPrice: parseFloat(products.salePrice), // Changed from salePrice to match schema
            brand: products.brand,
            images: mainImages,
            variants: variants
        });

        await newProduct.save();
        console.log('Product saved successfully');
        
        res.status(200).json({
            success: true,
            message: "Product added successfully"
        });

    } catch (error) {
        console.error('Error adding product:', error);
        res.status(500).json({
            success: false,
            message: error.message || "Error adding product. Please try again."
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
            .populate({
                path: "category",
                match: { isListed: true }
            })
            .lean()  // Convert to plain JavaScript objects
            .exec();

        // Calculate total quantity for each product
        productData.forEach(product => {
            product.totalQuantity = 0;
            if (product.variants && product.variants.length > 0) {
                product.totalQuantity = product.variants.reduce((total, variant) => {
                    return total + (parseInt(variant.quantity) || 0);
                }, 0);
            }
        });

        // Count total products
        const count = await Product.countDocuments({
            productName: { $regex: new RegExp(".*" + search + ".*", "i") },
        });

        // Fetch listed categories
        const category = await Category.find({ isListed: true });

        // Log product data for debugging
        console.log('Product Data:', JSON.stringify(productData, null, 2));

        // Render products page without admin prefix
        res.render("products", {
            products: productData,
            currentPage: page,
            totalPages: Math.ceil(count / limit),
            categories: category,
            search: search
        });
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
        res.redirect("/admin/pageerror");
    }
};

// Update Product
const updateProduct = async (req, res) => {
    try {
        const productId = req.params.id;
        const updates = req.body;
        console.log('Received update data:', updates);

        // Check if the updated name conflicts with another product
        const existingProduct = await Product.findOne({
            productName: updates.name,
            _id: { $ne: productId }
        });

        if (existingProduct) {
            return res.status(400).json({
                success: false,
                message: "Product name already exists"
            });
        }

        // Get existing product to preserve images that weren't changed
        const existingProductData = await Product.findById(productId);
        if (!existingProductData) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        // Delete removed images
        const deletedImages = req.body['deletedImages[]'];
        if (deletedImages) {
            const imagesToDelete = Array.isArray(deletedImages) ? deletedImages : [deletedImages];
            for (const image of imagesToDelete) {
                const imagePath = path.join(productImagesDir, image);
                if (fs.existsSync(imagePath)) {
                    fs.unlinkSync(imagePath);
                }
            }
        }

        // Process variants
        const processedVariants = [];
        const variants = JSON.parse(updates.variants);

        // Handle images for each variant
        if (req.files && req.files.variantImages) {
            let currentImageIndex = 0;
            
            // First, process variants that have pending images
            for (let i = 0; i < variants.length; i++) {
                const variant = variants[i];
                const variantImages = [...variant.images];

                // Process images for this variant
                for (let j = 0; j < 3; j++) {
                    if (variantImages[j] && variantImages[j].pending === true) {
                        // This slot needs a new image
                        if (currentImageIndex < req.files.variantImages.length) {
                            const file = req.files.variantImages[currentImageIndex];
                            const filename = `${Date.now()}-${i}-${j}-${file.originalname.replace(/\s+/g, '-')}`;
                            const filepath = path.join(productImagesDir, filename);

                            try {
                                // Process and save the new image
                                await sharp(file.buffer)
                                    .resize(800, 800, {
                                        fit: 'contain',
                                        background: { r: 255, g: 255, b: 255, alpha: 1 }
                                    })
                                    .toFormat('jpeg')
                                    .jpeg({ quality: 90 })
                                    .toFile(filepath);

                                // Replace the pending object with the filename
                                variantImages[j] = filename;
                                currentImageIndex++;
                            } catch (error) {
                                console.error('Error processing image:', error);
                                return res.status(400).json({
                                    success: false,
                                    message: "Error processing image. Please ensure all files are valid images."
                                });
                            }
                        }
                    } else if (typeof variantImages[j] === 'object') {
                        // If it's an object but not pending, remove it
                        variantImages[j] = null;
                    }
                    // If it's a string (existing image filename), keep it as is
                }

                processedVariants.push({
                    color: variant.color,
                    images: variantImages,
                    quantity: parseInt(variant.quantity) || 0
                });
            }
        } else {
            // No new images, use the existing ones from variants
            processedVariants.push(...variants.map(variant => ({
                color: variant.color,
                images: variant.images.map(img => typeof img === 'object' ? null : img),
                quantity: parseInt(variant.quantity) || 0
            })));
        }

        // Update product with new data
        const updatedProduct = await Product.findByIdAndUpdate(
            productId,
            {
                productName: updates.name,
                description: updates.description,
                category: updates.category,
                regularPrice: parseFloat(updates.regularPrice),
                salesPrice: updates.salesPrice ? parseFloat(updates.salesPrice) : undefined,
                variants: processedVariants,
                totalQuantity: processedVariants.reduce((total, variant) => total + variant.quantity, 0)
            },
            { new: true }
        );

        if (!updatedProduct) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        console.log('Product updated successfully');
        return res.status(200).json({
            success: true,
            message: "Product updated successfully"
        });

    } catch (error) {
        console.error('Error updating product:', error);
        return res.status(500).json({
            success: false,
            message: "Error updating product. Please try again."
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
