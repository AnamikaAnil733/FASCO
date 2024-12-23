
const Category = require("../../models/categorySchema")
const Product = require("../../models/productSchema")






const  categoryInfo = async(req,res)=>{
    try {

        const page = parseInt(req.query.page)||1;
        const limit = 4;
        const skip = (page-1)*limit;

        const categoryData = await Category.find({})
        .sort({createAt:-1})
        .skip(skip)
        .limit(limit)

        const totalCategories = await Category.countDocuments();
        const totalpages = Math.ceil(totalCategories/limit);
        res.render("category",{
            cat:categoryData,
            currentPage:page,
            totalpages:totalpages,
            totalCategories:totalCategories

        });
        
    } catch (error) {
        console.error(error)
        res.redirect("/pageerror")
        
    }

}


const addCategory = async (req,res)=>{
    const {name,description} = req.body
    // console.log(req.body)
    // console.log(name)
    // console.log(description)
    try {
        const existingCategory = await Category.findOne({name:{$regex:"name",$options:"i"}});
        if(existingCategory){
            return res.status(400).json({error:"Category already exists"})
        }
        const newCategory = new Category({
            name,
            description
        })
        await newCategory.save();
        return res.json({success:true,message:"Category added successfully"})
        
    } catch (error) {
      console.log(error.message)  
        return res.status(500).json({error:"Internal Server Error"})
        
    }

}
const addCategoryOffer = async (req, res) => {
    try {
      const percentage = parseInt(req.body.percentage);
      const categoryId = req.body.categoryId;
  
      // Validate input
      if (isNaN(percentage) || percentage < 0 || percentage > 100) {
        return res.status(400).json({
          status: false,
          message: "Offer percentage must be a number between 0 and 100",
        });
      }
  
      // Find the category
      const category = await Category.findById(categoryId);
      if (!category) {
        return res.status(404).json({ status: false, message: "Category not found" });
      }
  
      // Check if any product already has a better offer
      const products = await Product.find({ category: category._id });
      const hasProductOffer = products.some(
        (product) => product.productOffer > percentage
      );
  
      if (hasProductOffer) {
        return res.json({
          status: false,
          message: "Some products in this category have a better offer",
        });
      }
  
      // Update the category offer
      await Category.updateOne({ _id: categoryId }, { $set: { categoryOffer: percentage } });
  
      // Apply the category offer to all products
      for (const product of products) {
        if (percentage > 0) {
          product.productOffer = percentage;
          product.salesPrice = Math.floor(
            product.regularPrice * (1 - percentage / 100)
          );
        } else {
          product.productOffer = 0;
          product.salesPrice = product.regularPrice;
        }
        await product.save();
      }
  
      res.json({ status: true, message: "Category offer added successfully" });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        status: false,
        message: "Internal Server Error",
      });
    }
  };
  
  const removeCategoryOffer = async (req, res) => {
    try {
      const categoryId = req.body.categoryId;
  
      // Find the category
      const category = await Category.findById(categoryId);
      if (!category) {
        return res.status(404).json({ status: false, message: "Category not found" });
      }
  
      const percentage = category.categoryOffer;
  
      // Find and update all products in the category
      const products = await Product.find({ category: category._id });
      for (const product of products) {
        product.salesPrice = product.regularPrice; // Reset price to regular
        product.productOffer = 0; // Remove product offer
        await product.save();
      }
  
      // Remove category offer
      category.categoryOffer = 0;
      await category.save();
  
      res.json({ status: true, message: "Category offer removed successfully" });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        status: false,
        message: "Internal Server Error",
      });
    }
  };
  

// const addCategoryOffer = async (req,res)=>{
//     try {

//         const percentage = parseInt(req.body.percentage)
//         const categoryId = req.body.categoryId;
//         const category = await Category.findById(categoryId)

//         if(!category){
//             return res.status(404).json({status:false,message:"Category not found"})
//         }
//         const products = await Product.find({category:category._id})
//         const hasProductOffer = products.some((product)=>product.productOffer>percentage)
//         if(hasProductOffer){
//             return res.json({status:false , message:"Products within this category already have product offer"})
//         }
//         await Category.updateOne({_id:categoryId},{$set:{categoryOffer:percentage}});


//         for(const product of products){
//             product.productOffer = 0;
//             product.salesPrice = product.regularPrice;
//             await product.save();
//         }

//         res.json({status:true});
        
//     } catch (error) {
//         res.status(500).json({status:false,message:"Internal Server Error"})
        
//     }
// }


// const removeCategoryOffer = async(req,res)=>{
//     try {

//         const categoryId = req.body.categoryId;
//         const category = await Category.findById(categoryId);

//         if(!category){
//             return res.status(404).json({status:false,message:"Category not found"})
//         }

//         const percentage = category.categoryOffer
//         const products = await Product.find({category:category.id})

//         if(products.length >0){
//             for(const product of products){
//                 product.salesPrice +=Math.floor(product.regularPrice *(percentage/100))
//                 product.productOffer =0;
//                 await product.save()
//             }
//         }
//         category.categoryOffer =0
//         await category.save();
//         res.json({status:true})
        
//     } catch (error) {
//         res.status(500).json({status:false,message:"Internal Server Error"})
        
//     }
// }

const getListCategory = async (req,res)=>{
    try {
        let id = req.query.id;
        await Category.updateOne({_id:id},{$set:{isListed:false}})
        res.redirect("/admin/category")
        
    } catch (error) {
        res.redirect("/pageerror")
        
    }
}


const getUnListCategory = async (req,res)=>{
    try {
        

        let id = req.query.id;
        await Category.updateOne({_id:id},{$set:{isListed:true}})
        res.redirect("/admin/category")
        
    } catch (error) {
        res.redirect("/pageerror")
        
    }
}



const getEditCategory = async (req,res)=>{
    try {

        const id = req.query.id;
        const category = await Category.findOne({_id:id})
         res.render("edit-category",{category:category})        
    } catch (error) {

        res.redirect("/pageerror")
        
    }
}



const editCategory = async(req,res)=>{
    try {

        const id = req.params.id;
        const {categoryName,description} = req.body
        const existingCategory = await Category.findOne({name:categoryName})

        if(existingCategory){
            return res.status(400).json({error:"Category exists, please choose another name"})
        }


        const updateCategory = await Category.findOneAndUpdate({_id:id},{
            name:categoryName,
            description:description,

        },{new:true});

        if(updateCategory){
            res.redirect("/admin/category")
        }else{
            res.status(404).json({error:"Category not found"})
        }
        
    } catch (error) {

        res.status(500).json({error:"Internal server error"})
        
    }
}


module.exports = {
    categoryInfo,
    addCategory,
    addCategoryOffer,
    removeCategoryOffer,
    getListCategory,
    getUnListCategory,
    getEditCategory,
    editCategory,
    
    
}