const User = require("../models/userSchema");



const userAuth = async (req, res, next) => {
    try {
        if (!req.session.user) {
            return res.redirect("/login");
        }

        const user = await User.findById(req.session.user);
        if (!user || user.isBlocked) {
            return res.redirect("/login");
        }

        next();
    } catch (error) {
        console.error("Error in user auth middleware:", error);
        res.status(500).json({ success: false, message: "Internal Server error" });
    }
};

// const adminAuth = async (req, res, next) => {
    // try {
    //     const admin = await User.findOne({ isAdmin: true });
    //     if (!admin) {
    //         return res.redirect("admin/login");
    //     }
    //     next();
    // } catch (error) {
    //     console.error("Error in admin auth middleware:", error);
    //     res.status(500).json({ success: false, message: "Internal Server Error" });
    // }


    const adminAuth = (req,res,next)=>{
        if(req.session?.admin){
            next()
        }else{
            res.redirect('admin/login')
        }
    }
// };







module.exports = {
    userAuth,
    adminAuth
}