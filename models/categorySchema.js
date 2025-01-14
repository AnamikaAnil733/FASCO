const mongoose = require("mongoose");
const {Schema} = mongoose;

const categorySchema = new mongoose.Schema({
    name: {
        type:String,
        required:true,
    },
    description :{
        type:String,
        required:true,
    },
    isListed:{
        type:Boolean,
        default:true
    },
    categoryOffer:{
        type:Number,
        default:0
    },
    offerStartDate: {
        type: Date,
        default: null
    },
    offerEndDate: {
        type: Date,
        default: null
    },
    createdAt: {
        type : Date,
        default: Date.now
    }
})

const Category = mongoose.model("Category",categorySchema);
module.exports = Category;