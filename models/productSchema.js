const mongoose = require("mongoose");
const {Schema} = mongoose;

const variantSchema = new Schema({
    color: {
        type: String,
        required: true
    },
    images: {
        type: [String],
        required: true
    },
    quantity: {
        type: Number,
        default: 0
    }
});

const productSchema = new mongoose.Schema({
    productName:{
        type: String,
        required: true
    },
    description:{
        type: String,
        required: true
    },
    brand:{
        type: String,
        default: ''
    },
    category:{
        type: Schema.Types.ObjectId,
        ref: "Category",
        required: true
    },
    regularPrice:{
        type: Number,
        required: true
    },
    salesPrice:{
        type: Number,
        required: true    
    },
    productOffer: {
        type: Number,
        default: 0
    },
    variants: [variantSchema],
    defaultVariant: {
        type: Schema.Types.ObjectId,
        ref: 'Variant'
    },
    isBlocked:{
        type: Boolean,
        default: false
    },
    status: {
        type: String,
        enum: ['In Stock', 'Out of Stock'],
        default: 'In Stock'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
},{timestamps:true});

const Product = mongoose.model("Product",productSchema);

module.exports = Product;