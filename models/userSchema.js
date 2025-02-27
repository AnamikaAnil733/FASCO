const mongoose = require("mongoose");
const { Schema } = mongoose;

const userSchema = new Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    phone: {
        type: String,
        default: null,
        required:false,
        sparse:true,
        unique:true,
    },
    googleId: {
        type: String,
        unique: true,
        sparse: true // Prevents duplicate key error for null values
    },
    password: {
        type: String,
        required: false
    },
    isBlocked: {
        type: Boolean,
        default: false
    },
    isAdmin: {
        type: Boolean,
        default: false
    },
    cart: [{
        type: Schema.Types.ObjectId,
        ref: "Cart"
    }],
    wallet: {
        balance: {
            type: Number,
            default: 0
        },
        transactions: [{
            amount: {
                type: Number,
                required: true
            },
            type: {
                type: String,
                enum: ['credit', 'debit'],
                required: true
            },
            description: {
                type: String,
                required: true
            },
            date: {
                type: Date,
                default: Date.now
            }
        }]
    },
    resetPasswordToken: {
        type: String,
        default: undefined
    },
    resetPasswordExpires: {
        type: Date,
        default: undefined
    },
    orderHistory: [{
        type: Schema.Types.ObjectId,
        ref: "Order"
    }],
    createdOn: {
        type: Date,
        default: Date.now
    },
    referalCode: {
        type: String,
        default: null
    },
    redeemed: {
        type: Boolean,
        default: false
    },
    redeemedUsers: [{
        type: Schema.Types.ObjectId,
        ref: "User"
    }],
    searchHistory: [{
        category: {
            type: Schema.Types.ObjectId,
            ref: "Category"
        },
        brand: {
            type: String
        },
        searchOn: {
            type: Date,
            default: Date.now
        }
    }],
    addresses: [{
        fullName: String,
        mobile: String,
        streetAddress: String,
        city: String,
        state: String,
        pinCode: String,
        isDefault: {
            type: Boolean,
            default: false
        }
    }]
});

const User = mongoose.model("User", userSchema);

module.exports = User;
