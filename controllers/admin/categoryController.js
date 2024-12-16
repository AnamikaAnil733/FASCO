
const Category = require("../../models/categorySchema")






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
    try {
        const existingCategory = await Category.findOne({name:{$regex:name,$options:"i"}});
        if(existingCategory){
            return res.status(400).json({error:"Category already exists"})
        }
        const newCategory = new Category({
            name,
            description
        })
        await newCategory.save();
        return res.json({message:"Category added successfully"})
        
    } catch (error) {
        return res.status(500).json({error:"Internal Server Error"})
        
    }

}

module.exports = {
    categoryInfo,
    addCategory
}