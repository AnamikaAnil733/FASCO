const User = require("../../models/userSchema")
const mongoose = require("mongoose")
const bcrypt = require("bcrypt")
const Category = require("../../models/categorySchema")
const Order = require("../../models/orderSchema") // Assuming Order model is defined in orderSchema.js


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


const loadDashbord = async (req, res) => {
    try {
        if (!req.session.admin) {
            return res.redirect("/admin/pageerror");
        }

        // Get query parameters for filtering
        const { startDate, endDate, period } = req.query;
        let query = {}; 
        let dateQuery = {};

        // Handle date filtering
        if (startDate && endDate) {
            dateQuery = {
                orderDate: {
                    $gte: new Date(startDate),
                    $lte: new Date(endDate)
                }
            };
        } else if (period) {
            const now = new Date();
            let periodStartDate;

            switch (period) {
                case 'day':
                    periodStartDate = new Date(now.setDate(now.getDate() - 1));
                    break;
                case 'week':
                    periodStartDate = new Date(now.setDate(now.getDate() - 7));
                    break;
                case 'month':
                    periodStartDate = new Date(now.setMonth(now.getMonth() - 1));
                    break;
                default:
                    periodStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
                    period = 'month';
            }

            dateQuery = {
                orderDate: {
                    $gte: periodStartDate,
                    $lte: new Date()
                }
            };
        } else {
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            dateQuery = {
                orderDate: {
                    $gte: startOfMonth,
                    $lte: now
                }
            };
        }

        query = { ...query, ...dateQuery };

        // Get all orders
        const orders = await Order.find(query)
            .populate({
                path: 'items.productId',
                select: 'productName brand regularPrice price',
                match: { _id: { $ne: null } }
            })
            .sort({ orderDate: -1 })
            .lean();

        // Calculate summary with status breakdown
        let summary = {
            totalOrders: orders.length,
            totalAmount: 0,
            totalDiscount: 0,
            discountBreakdown: {
                couponDiscount: 0,
                count: 0
            },
            statusBreakdown: {
                Delivered: 0,
                Pending: 0,
                Processing: 0,
                Shipped: 0,
                Cancelled: 0,
                Returned: 0
            }
        };

        // Process orders and calculate regular prices
        orders.forEach(order => {
            // Calculate regular price for each order
            let regularPrice = 0;
            order.items.forEach(item => {
                if (item.productId) {
                    regularPrice += (item.productId.regularPrice || item.productId.price || 0) * item.quantity;
                }
            });
            order.regularPrice = regularPrice;

            // Count by status
            if (summary.statusBreakdown.hasOwnProperty(order.status)) {
                summary.statusBreakdown[order.status]++;
            }

            // Only include non-cancelled orders in financial calculations
            if (order.status !== 'Cancelled' && order.status !== 'Returned') {
                summary.totalAmount += order.totalAmount || 0;
                
                if (order.coupon && order.coupon.discountedAmount) {
                    summary.totalDiscount += order.coupon.discountedAmount;
                    summary.discountBreakdown.couponDiscount += order.coupon.discountedAmount;
                    summary.discountBreakdown.count++;
                }
            }
        });

        const currentStartDate = new Date(query.orderDate.$gte).toISOString().split('T')[0];
        const currentEndDate = new Date(query.orderDate.$lte).toISOString().split('T')[0];

        res.render('dashboard', {
            title: 'Dashboard',
            orders,
            summary,
            filters: {
                startDate: startDate || currentStartDate,
                endDate: endDate || currentEndDate,
                period: period || ''
            }
        });

    } catch (error) {
        console.error('Error loading dashboard:', error);
        res.status(500).json({
            success: false,
            message: 'Error loading dashboard'
        });
    }
};


const logout = async(req,res)=>{
    try {
        req.session.destroy(err=>{
            if(err){
                console.log("Error destroying session",err)
                return res.redirect("/admin/pageerror")
            }
            res.redirect("/admin/login")
        })
        
    } catch (error) {
        console.log("Unexpected error during logout:", error)
        res.redirect("/admin/pageerror")
    }
}




const pageerror = async (req, res) => {
    try {
      res.render("page-404");
    } catch (error) {
      res.redirect("/admin/pageerror")   
    }
  };

const loadAddProduct = async (req, res) => {
    try {
        if (!req.session.admin) {
            return res.redirect("/admin/login");
        }
        
        const categories = await Category.find({}, 'name');
        res.render("product-add", { categories });
        
    } catch (error) {
        console.error("Error loading add product page:", error);
        res.redirect("/admin/pageerror");
    }
};




// Download sales report
const downloadSalesReport = async (req, res) => {
    try {
        const { startDate, endDate, period } = req.query;
        let query = { status: 'Delivered' };
        let dateQuery = {};

        // Handle date filtering (same as getSalesReport)
        if (startDate && endDate) {
            dateQuery = {
                orderDate: {
                    $gte: new Date(startDate),
                    $lte: new Date(endDate)
                }
            };
        } else if (period) {
            const now = new Date();
            let periodStartDate;

            switch (period) {
                case 'day':
                    periodStartDate = new Date(now.setDate(now.getDate() - 1));
                    break;
                case 'week':
                    periodStartDate = new Date(now.setDate(now.getDate() - 7));
                    break;
                case 'month':
                    periodStartDate = new Date(now.setMonth(now.getMonth() - 1));
                    break;
                default:
                    periodStartDate = new Date(0);
            }

            dateQuery = {
                orderDate: {
                    $gte: periodStartDate,
                    $lte: new Date()
                }
            };
        }

        query = { ...query, ...dateQuery };

        const orders = await Order.find(query)
            .populate({
                path: 'items.productId',
                select: 'productName brand',
                match: { _id: { $ne: null } }  // Only populate existing products
            })
            .lean();  // Convert to plain JavaScript objects for better performance

        // Create CSV content
        let csvContent = 'Order ID,Date,Customer,Items,Total Amount,Discount,Final Amount\n';

        orders.forEach(order => {
            const items = order.items.map(item => 
                `${item.productId.productName}(${item.quantity})`
            ).join('; ');

            const row = [
                order.orderId,
                new Date(order.orderDate).toLocaleDateString(),
                order.shippingAddress.name,
                items,
                order.totalAmount,
                order.coupon ? order.coupon.discountedAmount : 0,
                order.coupon ? (order.totalAmount - order.coupon.discountedAmount) : order.totalAmount
            ];

            csvContent += row.join(',') + '\n';
        });

        // Set headers for file download
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=sales-report.csv');

        // Send the CSV content
        res.send(csvContent);

    } catch (error) {
        console.error('Error downloading sales report:', error);
        res.status(500).json({
            success: false,
            message: 'Error downloading sales report'
        });
    }
};

module.exports = {
    loadLogin,
    login,
    loadDashbord,
    pageerror,
    logout,
    loadAddProduct,
    downloadSalesReport
}