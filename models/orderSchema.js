const mongoose = require("mongoose");
const {Schema} = mongoose;
const {v4:uuidv4} = require('uuid');

const orderSchema = new Schema({
    orderId: {
        type: String,
        default: () => uuidv4(),
        unique: true
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    items: [{
        productId: {
            type: Schema.Types.ObjectId,
            ref: "Product",
            required: true
        },
        quantity: {
            type: Number,
            required: true
        },
        price: {
            type: Number,
            required: true
        },
        totalPrice: {
            type: Number,
            required: true
        },
        variantIndex: {
            type: Number,
            required: true
        },
        isReturned: {
            type: Boolean,
            default: false
        },
        returnReason: {
            type: String,
            default: null
        },
        returnStatus: {
            type: String,
            enum: [null, 'Pending', 'Approved', 'Rejected'],
            default: null
        }
    }],
    totalAmount: {
        type: Number,
        required: true
    },
    finalAmount: {
        type: Number,
        required: true
    },
    coupon: {
        code: {
            type: String
        },
        discountType: {
            type: String,
            enum: ['percentage', 'fixed']
        },
        discountAmount: {
            type: Number
        },
        discountedAmount: {
            type: Number
        }
    },
    shippingAddress: {
        addressType: {
            type: String,
            required: true
        },
        name: {
            type: String,
            required: true
        },
        landMark: {
            type: String,
            required: true
        },
      
        city: {
            type: String,
            required: true
        },
        state: {
            type: String,
            required: true
        },
        pincode: {
            type: String,
            required: true
        },
        phone: {
            type: String,
            required: true
        },
        altPhone: {
            type: String
        }
    },
    paymentMethod: {
        type: String,
        enum: ['COD', 'RAZORPAY', 'WALLET'],
        required: true
    },
    paymentStatus: {
        type: String,
        enum: ['PENDING', 'COMPLETED', 'FAILED'],
        default: 'PENDING'
    },
    razorpayOrderId: {
        type: String
    },
    razorpayPaymentId: {
        type: String
    },
    status: {
        type: String,
        enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'],
        default: 'Pending'
    },
    invoiceNumber: {
        type: String,
        unique: true,
        sparse: true
    },
    invoiceDate: {
        type: Date
    },
    deliveryDate: {
        type: Date
    },
    orderDate: {
        type: Date,
        default: Date.now
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    cancelledAt: {
        type: Date
    }
});

orderSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

const Order = mongoose.model("Order", orderSchema);
module.exports = Order;