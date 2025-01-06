const Category = require("../../models/categorySchema")
const Product = require("../../models/productSchema")






const  categoryInfo = async(req,res)=>{
    try {

        const page = parseInt(req.query.page)||1;
        const limit = 3;
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
    try {
        const existingCategory = await Category.findOne({name:{ $regex: new RegExp(`^${name}$`, 'i') }});
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
        const {categoryName, description} = req.body;

        // Basic validation
        if (!categoryName || categoryName.trim().length < 3) {
            return res.status(400).json({
                status: false, 
                message: "Category name must be at least 3 characters"
            });
        }

        // Check if the category being edited exists
        const categoryToEdit = await Category.findById(id);
        if (!categoryToEdit) {
            return res.status(404).json({
                status: false, 
                message: "Category not found"
            });
        }

        // Check for duplicate category name, excluding the current category
        const existingCategory = await Category.findOne({
            name: { $regex: new RegExp(`^${categoryName}$`, 'i') }, // Case-insensitive match
            
        });

        if (existingCategory) {
            return res.status(400).json({
                status: false, 
                message: "Category name already exists"
            });
        }

        // Update the category
        const updateCategory = await Category.findByIdAndUpdate(
            id,
            {
                name: categoryName,
                description: description
            },
            { new: true }
        );

        if (updateCategory) {
            res.status(200).json({
                status: true,
                message: "Category updated successfully",
                category: updateCategory
            });
        } else {
            res.status(400).json({
                status: false,
                message: "Failed to update category"
            });
        }
        
    } catch (error) {
        console.error('Error updating category:', error);
        res.status(500).json({
            status: false,
            message: "An error occurred while updating the category"
        });
    }
};


module.exports = {
    categoryInfo,
    addCategory,
    getListCategory,
    getUnListCategory,
    getEditCategory,
    editCategory,
    
    
}