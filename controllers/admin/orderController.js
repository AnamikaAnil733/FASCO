const Order = require("../../models/orderSchema");
const Product = require("../../models/productSchema");
const User = require("../../models/userSchema");
const moment = require('moment');

const orderController = {
    // Get all orders with pagination
    getAllOrders: async (req, res) => {
        try {
            // Check admin session
            if (!req.session.admin) {
                return res.redirect('/admin/login');
            }

            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const skip = (page - 1) * limit;

            // Get total count for pagination
            const totalOrders = await Order.countDocuments();
            const totalPages = Math.ceil(totalOrders / limit);

            // Fetch orders with pagination and populate references
            const orders = await Order.find()
                .populate({
                    path: 'userId',
                    select: 'name email',
                })
                .populate({
                    path: 'items.productId',
                    select: 'productName images price'
                })
                .populate('shippingAddress')  // Populate shipping address
                .sort({ createdAt: -1 })  // Sort by creation date
                .skip(skip)
                .limit(limit)
                .lean();  // Convert to plain JavaScript objects

            // Format the orders for display
            const formattedOrders = orders ? orders.map(order => {
                if (!order) return null;
                
                // Calculate total amount from items
                const items = Array.isArray(order.items) ? order.items.map(item => {
                    if (!item) return null;
                    return {
                        ...item,
                        totalPrice: (item.quantity || 0) * (item.price || 0)
                    };
                }).filter(Boolean) : [];

                const totalAmount = items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);

                // Format shipping address if it exists
                const shippingAddress = order.shippingAddress ? {
                    name: order.shippingAddress.name || 'N/A',
                    landMark: order.shippingAddress.landMark || 'N/A',
                    addressType: order.shippingAddress.addressType || 'N/A',
                    city: order.shippingAddress.city || 'N/A',
                    state: order.shippingAddress.state || 'N/A',
                    pincode: order.shippingAddress.pincode || 'N/A',
                    phone: order.shippingAddress.phone || 'N/A',
                    altPhone: order.shippingAddress.altPhone || ''
                } : null;

                return {
                    ...order,
                    orderDate: order.createdAt || order.orderDate,
                    items: items,
                    totalAmount: totalAmount || 0,  // Ensure totalAmount is always a number
                    shippingAddress: shippingAddress
                };
            }).filter(Boolean) : []; // Remove null orders

            res.render('orderList', {
                orders: formattedOrders,
                currentPage: page,
                totalPages,
                totalOrders,
                admin: req.session.admin,
                moment  // Pass moment to the view
            });
        } catch (error) {
            console.error('Error fetching orders:', error);
            res.redirect('/admin/pageerror');
        }
    },

    // Update order status
    updateOrderStatus: async (req, res) => {
        try {
            const { orderId, status } = req.body;
            const order = await Order.findById(orderId);

            if (!order) {
                return res.status(404).json({
                    success: false,
                    message: 'Order not found'
                });
            }

            // If status is being changed to Delivered
            if (status === 'Delivered') {
                console.log('Generating invoice for delivered order:', orderId);
                
                // Set delivery date
                order.deliveryDate = new Date();
                
                // Generate invoice number (Format: INV-YYYYMMDD-XXXX)
                const date = new Date();
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                
                // Get the count of invoices for today to generate sequential number
                const todayStart = new Date(year, date.getMonth(), date.getDate());
                const todayEnd = new Date(year, date.getMonth(), date.getDate() + 1);
                
                console.log('Checking for invoices between:', todayStart, 'and', todayEnd);
                
                const todayInvoiceCount = await Order.countDocuments({
                    invoiceNumber: { $exists: true },
                    invoiceDate: { $gte: todayStart, $lt: todayEnd }
                });

                console.log('Today\'s invoice count:', todayInvoiceCount);

                const sequentialNumber = String(todayInvoiceCount + 1).padStart(4, '0');
                order.invoiceNumber = `INV-${year}${month}${day}-${sequentialNumber}`;
                order.invoiceDate = date;

                console.log('Generated invoice details:', {
                    invoiceNumber: order.invoiceNumber,
                    invoiceDate: order.invoiceDate,
                    deliveryDate: order.deliveryDate
                });
            }

            // If status is being changed to Cancelled
            if (status === 'Cancelled') {
                console.log('Processing cancellation for order:', orderId);

                // Restock the products
                for (const item of order.items) {
                    try {
                        const product = await Product.findById(item.productId);
                        if (product && product.variants) {
                            const variantIndex = item.variantIndex || 0;
                            
                            if (!product.variants[variantIndex]) {
                                product.variants[variantIndex] = {
                                    color: 'default',
                                    images: [],
                                    quantity: 0
                                };
                            }

                            const currentQuantity = product.variants[variantIndex].quantity || 0;
                            product.variants[variantIndex].quantity = currentQuantity + parseInt(item.quantity);
                            await product.save();
                            

                        }
                    } catch (err) {
                        console.error('Error restocking product:', err);
                    }
                }

                // Process refund if it's a Razorpay payment
                if (order.paymentMethod === 'RAZORPAY' && order.paymentStatus === 'COMPLETED') {
                    console.log('Processing refund for cancelled Razorpay order');
                    
                    const user = await User.findById(order.userId);
                    if (!user) {
                        return res.status(404).json({
                            success: false,
                            message: 'User not found'
                        });
                    }

                    let refundAmount = order.totalAmount;
                    if (order.coupon?.discountedAmount) {
                        refundAmount -= order.coupon.discountedAmount;
                    }

                    if (!user.wallet) {
                        user.wallet = { balance: 0, transactions: [] };
                    }

                    const previousBalance = user.wallet.balance || 0;
                    user.wallet.balance = previousBalance + refundAmount;

                    user.wallet.transactions.push({
                        amount: refundAmount,
                        type: 'credit',
                        description: `Refund for cancelled order #${order.orderId}`,
                        date: new Date(),
                        orderId: order.orderId,
                        status: 'success'
                    });

                    await user.save();
                }

                order.cancelledAt = new Date();
            }

            // Update order status
            order.status = status;
            await order.save();

            res.json({
                success: true,
                message: status === 'Cancelled' ? 
                    (order.paymentMethod === 'RAZORPAY' ? 
                        'Order cancelled, products restocked, and refund processed' : 
                        'Order cancelled and products restocked') : 
                    'Order status updated successfully'
            });

        } catch (error) {
            console.error('Error updating order status:', error);
            res.status(500).json({
                success: false,
                message: 'Error updating order status'
            });
        }
    },

    // Cancel order
    cancelOrder: async (req, res) => {
        try {
            const { orderId } = req.body;
            console.log('Cancelling order:', orderId);

            // Find and populate the order with product details
            const order = await Order.findById(orderId);
            if (!order) {
                return res.status(404).json({
                    success: false,
                    message: 'Order not found'
                });
            }

            // Only allow cancellation if not already cancelled or delivered
            if (order.status === 'Cancelled' || order.status === 'Delivered') {
                return res.status(400).json({
                    success: false,
                    message: `Cannot cancel order in ${order.status} status`
                });
            }

        
            
            // Restock the products
            for (const item of order.items) {
                try {
                    // Get the product
                    const product = await Product.findById(item.productId);
                    if (!product) {
                        console.log('Product not found:', item.productId);
                        continue;
                    }

                    // Get the variant index, default to 0 if not specified
                    const variantIndex = typeof item.variantIndex === 'number' ? item.variantIndex : 0;
                    
                    // Ensure variant exists
                    if (!product.variants || !product.variants[variantIndex]) {
                        console.log('Variant not found:', {
                            productId: item.productId,
                            variantIndex: variantIndex
                        });
                        continue;
                    }

                    // Log current state
                    console.log('Before restock:', {
                        productId: product._id,
                        variantIndex: variantIndex,
                        currentQuantity: product.variants[variantIndex].quantity,
                        toAdd: item.quantity
                    });

                    // Update the quantity
                    product.variants[variantIndex].quantity = (product.variants[variantIndex].quantity || 0) + Number(item.quantity);
                    
                    // Save the product
                    await product.save();

                    console.log('After restock:', {
                        productId: product._id,
                        variantIndex: variantIndex,
                        newQuantity: product.variants[variantIndex].quantity
                    });
                } catch (err) {
                    console.error('Error restocking product:', err);
                }
            }


            // Update order status
            order.status = 'Cancelled';
            order.cancelledAt = new Date();
            await order.save();

            return res.status(200).json({
                success: true,
                message: 'Order cancelled and products restocked successfully'
            });
        } catch (error) {
            console.error('Error cancelling order:', error);
            return res.status(500).json({
                success: false,
                message: 'Error cancelling order'
            });
        }
    },

    // Get order details
    getOrderDetails: async (req, res) => {
        try {
            const { orderId } = req.params;

            const order = await Order.findById(orderId)
                .populate('userId', 'name email')
                .populate('items.productId', 'productName images price')
                .populate('shippingAddress')
                .lean();

            if (!order) {
                return res.redirect('/admin/pageerror');
            }

            // Calculate total amount from items
            const items = Array.isArray(order.items) ? order.items.map(item => {
                if (!item) return null;
                return {
                    ...item,
                    totalPrice: (item.quantity || 0) * (item.price || 0)
                };
            }).filter(Boolean) : [];

            const totalAmount = items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);

            // Format shipping address if it exists
            const shippingAddress = order.shippingAddress ? {
                name: order.shippingAddress.name || 'N/A',
                landMark: order.shippingAddress.landMark || 'N/A',
                addressType: order.shippingAddress.addressType || 'N/A',
                city: order.shippingAddress.city || 'N/A',
                state: order.shippingAddress.state || 'N/A',
                pincode: order.shippingAddress.pincode || 'N/A',
                phone: order.shippingAddress.phone || 'N/A',
                altPhone: order.shippingAddress.altPhone || ''
            } : null;

            // Format the order for display
            const formattedOrder = {
                ...order,
                orderDate: order.createdAt || order.orderDate,
                items: items,
                totalAmount: totalAmount || 0,
                shippingAddress: shippingAddress
            };

            res.render('orderDetails', {
                order: formattedOrder,
                admin: req.session.admin,
                moment
            });
        } catch (error) {
            console.error('Error fetching order details:', error);
            res.redirect('/admin/pageerror');
        }
    },

    // Handle return request approval/rejection
    handleReturn: async (req, res) => {
        try {
            const { orderId, productId, action } = req.params;
            console.log('Return request received:', { orderId, productId, action });

            // Validate action
            if (!['approve', 'reject'].includes(action)) {
                return res.status(400).json({ message: 'Invalid action' });
            }

            // Find the order
            const order = await Order.findById(orderId);
            console.log('Order found:', { 
                paymentMethod: order.paymentMethod, 
                paymentStatus: order.paymentStatus,
                totalAmount: order.totalAmount
            });
            
            if (!order) {
                return res.status(404).json({ message: 'Order not found' });
            }

            // Find the specific product in the order
            const orderItem = order.items.find(item => item.productId.toString() === productId);
            console.log('Order item found:', { 
                totalPrice: orderItem.totalPrice,
                isReturned: orderItem.isReturned,
                returnStatus: orderItem.returnStatus
            });
            
            if (!orderItem) {
                return res.status(404).json({ message: 'Product not found in order' });
            }

            if (!orderItem.isReturned) {
                return res.status(400).json({ message: 'No return request found for this product' });
            }

            if (action === 'approve') {
                // Restock the product
                try {
                    const product = await Product.findById(orderItem.productId);
                    if (product && product.variants) {
                        // Use first variant if variantIndex is not specified
                        const variantIndex = orderItem.variantIndex || 0;
                        
                        // Ensure the variant exists
                        if (!product.variants[variantIndex]) {
                            product.variants[variantIndex] = {
                                color: 'default',
                                images: [],
                                quantity: 0
                            };
                        }

                        // Update the quantity
                        const currentQuantity = product.variants[variantIndex].quantity || 0;
                        product.variants[variantIndex].quantity = currentQuantity + parseInt(orderItem.quantity);
                        await product.save();
                        
                        console.log(`Restocked product ${product._id}, variant ${variantIndex}, new quantity: ${product.variants[variantIndex].quantity}`);
                    }
                } catch (err) {
                    console.error('Error restocking product:', err);
                }

                // Only process refund if order was delivered
                if (order.status === 'Delivered') {
                   
                    
                    const user = await User.findById(order.userId);
                    console.log('User found:', { 
                        userId: user._id,
                        currentWalletBalance: user.wallet?.balance 
                    });

                    if (!user) {
                        return res.status(404).json({ message: 'User not found' });
                    }

                    // Calculate refund amount
                    let refundAmount = orderItem.totalPrice;
                    console.log('Initial refund amount:', refundAmount);

                    // If coupon was applied, calculate proportional discount
                    if (order.coupon && order.coupon.discountedAmount) {
                        const itemPercentageOfOrder = orderItem.totalPrice / order.totalAmount;
                        const itemCouponDiscount = order.coupon.discountedAmount * itemPercentageOfOrder;
                        refundAmount -= itemCouponDiscount;
                        console.log('Refund amount after coupon adjustment:', { 
                            itemPercentageOfOrder,
                            itemCouponDiscount,
                            finalRefundAmount: refundAmount
                        });
                    }

                    // Initialize wallet if needed
                    if (!user.wallet) {
                        console.log('Initializing wallet');
                        user.wallet = {
                            balance: 0,
                            transactions: []
                        };
                    }

                    // Update wallet balance
                    const previousBalance = user.wallet.balance || 0;
                    user.wallet.balance = previousBalance + refundAmount;
                    console.log('Wallet balance update:', {
                        previousBalance,
                        refundAmount,
                        newBalance: user.wallet.balance
                    });

                    // Add transaction to wallet history
                    user.wallet.transactions.push({
                        amount: refundAmount,
                        type: 'credit',
                        description: `Refund for returned product from order #${order.orderId}`,
                        date: new Date(),
                        orderId: order.orderId,
                        status: 'success'
                    });

                    await user.save();
                    console.log('User saved with updated wallet');
                } else {
                    console.log('Skipping refund - Not a completed Razorpay payment:', {
                        paymentMethod: order.paymentMethod,
                        paymentStatus: order.paymentStatus
                    });
                }

                // Update order item status
                orderItem.returnStatus = 'Approved';
                orderItem.isReturned = false;
            } else {
                // Reject return request
                orderItem.returnStatus = 'Rejected';
                orderItem.isReturned = false;
            }

            await order.save();
            console.log('Order saved with updated status');

            res.status(200).json({ 
                message: `Return request ${action === 'approve' ? 'approved' : 'rejected'} successfully`,
                success: true
            });
        } catch (error) {
            console.error('Error handling return request:', error);
            res.status(500).json({ 
                message: 'Failed to process return request',
                success: false,
                error: error.message
            });
        }
    }
};

module.exports = {
    getAllOrders: orderController.getAllOrders,
    getOrderDetails: orderController.getOrderDetails,
    updateOrderStatus: orderController.updateOrderStatus,
    cancelOrder: orderController.cancelOrder,
    handleReturn: orderController.handleReturn
};
