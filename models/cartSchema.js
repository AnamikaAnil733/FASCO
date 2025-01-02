const mongoose = require("mongoose");
const {Schema} = mongoose;

const cartSchema = new Schema({

    userId :{
        type:Schema.Types.ObjectId,
        ref:"User",
        required:true
    },
    items:[{
        productId:{
            type:Schema.Types.ObjectId,
            ref:"Product",
            required:true
        },
        variantIndex: {
            type: Number,
            required: true,
            min: 0,
            default: 0
        },
        quantity:{
            type:Number,
            default:1,
            min: 1
        },
        price:{
            type:Number,
            required:true,
            min: 0
        },
        totalPrice:{
            type:Number,
            required:true,
            min: 0
        },
        status:{
            type: String,
            default:"none"
        },
        cancellationReason:{
            type:String,
            default:"none"
        }

    }]
})

const Cart = mongoose.model("Cart",cartSchema)
module.exports = Cart;