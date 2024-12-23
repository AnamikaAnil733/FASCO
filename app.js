const express = require("express");
const app =express();
const path = require("path");
const env = require("dotenv").config();
const session = require("express-session");
const passport = require("./config/passport")
const db = require("./config/db");
const userRouter = require("./routes/userRouter")
const adminRouter = require("./routes/adminRouter")
db();


app.use(express.urlencoded({extended:true}))
app.use(express.json());
app.use(session({
  secret:process.env.SESSION_SECRET,
  resave:false,
  saveUninitialized:true,
  cookie:{
    secure:false,
    httpOnly:true,
    maxAge:72*60*60*1000
  }
}))


app.use((req,res,next)=>{
  console.log(req.session)
  next()
})
app.use(passport.initialize());
app.use(passport.session())

app.set("view engine", "ejs");
app.set("views", [
  path.join(__dirname, "views/user"),
  path.join(__dirname, "views/admin")
]);
app.use(express.static(path.join(__dirname, "public")));


app.use("/",userRouter);
app.use('/admin',adminRouter)




const PORT=3004||process.env.PORT;
app.listen(PORT,()=>{
    console.log("server is running");
})



module.exports = app;