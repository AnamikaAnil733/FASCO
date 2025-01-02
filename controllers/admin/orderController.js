const Order = require("../../models/orderSchema");
const moment = require('moment');  // Add moment.js

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
                    addressType: order.shippingAddress.addressType || 'N/A'
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

            // Validate status
            const validStatuses = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid status value'
                });
            }

            // Find and update order
            const order = await Order.findById(orderId);
            if (!order) {
                return res.status(404).json({
                    success: false,
                    message: 'Order not found'
                });
            }

            // If order is already cancelled or delivered, don't allow status change
            if (order.status === 'Cancelled' || order.status === 'Delivered') {
                return res.status(400).json({
                    success: false,
                    message: `Cannot change status of ${order.status.toLowerCase()} order`
                });
            }

            // Update the status
            order.status = status;
            await order.save();

            res.json({
                success: true,
                message: 'Order status updated successfully'
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

            const order = await Order.findById(orderId);
            if (!order) {
                return res.status(404).json({
                    success: false,
                    message: 'Order not found'
                });
            }

            // Check if order can be cancelled
            if (order.status === 'Delivered' || order.status === 'Cancelled') {
                return res.status(400).json({
                    success: false,
                    message: `Cannot cancel ${order.status.toLowerCase()} order`
                });
            }

            // Update order status to cancelled
            order.status = 'Cancelled';
            await order.save();

            res.json({
                success: true,
                message: 'Order cancelled successfully'
            });
        } catch (error) {
            console.error('Error cancelling order:', error);
            res.status(500).json({
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
                addressType: order.shippingAddress.addressType || 'N/A'
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
    }
};

module.exports = orderController;
