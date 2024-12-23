const User = require("../../models/userSchema")
const mongoose = require("mongoose")
const bcrypt = require("bcrypt")




const loadLogin = (req,res)=>{
    if(req.session.admin){
        return res.redirect("/admin/dashbord")
    }
    res.render("admin-login",{message:null})
}


const login = async(req,res)=>{
    try {
        const {email,password} = req.body;
        const admin = await User.findOne({email,isAdmin:true});
       if(admin){
        const passwordMarch = bcrypt.compare(password,admin.password);
        if(passwordMarch){
            req.session.admin = true;
            return res.redirect("/admin")
        }else{
            return res.redirect("/login")
        }
       }else{
        return res.redirect("/login")
       }
        
    } catch (error) {
        console.log("login error",error)
        return res.redirect("/pageerror")
        
    }
}


const loadDashbord = async(req,res)=>{
    try{
        if(req.session.admin){
            res.render("dashboard")
        }else{
            res.redirect("/admin/pageerror")
        }
    }catch(error){
        console.error(error)
    }
};

const logout = async(req,res)=>{
    try {
        req.session.destroy(err=>{
            if(err){
                console.log("Error destroying session",err)
                return res.redirect("/pageerror")
            }
            res.redirect("/admin/login")
        })
        
    } catch (error) {

        console.log(("unexpected error during logout",error))
        res.redirect("/pageerror")
        
    }
}



const pageerror = async (req, res) => {
    try {
      res.render("page-404");
    } catch (error) {
      res.redirect("/pageerror")   
    }
  };





module.exports = {
    loadLogin,
    login,
    loadDashbord,
    pageerror,
    logout
}