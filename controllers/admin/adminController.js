const User = require("../../models/userSchema");
const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const Order = require("../../models/orderSchema");
const bcrypt = require("bcrypt");
const path = require('path');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const fs = require('fs');

const loadLogin = (req,res)=>{
    if(req.session.admin){
        return res.redirect("/admin/")
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
        return res.redirect("/admin/pageerror")
        
    }
}

const loadDashbord = async (req, res) => {
    try {
        if (!req.session.admin) {
            return res.redirect("/admin/login");
        }

        // Get initial sales data for monthly period
        const salesData = await getSalesData('monthly');

        // Calculate summary using aggregation (for delivered orders minus returns)
        const orders = await Order.find({ status: { $ne: 'Cancelled' } });
        
        let totalOrders = 0;
        let deliveredAmount = 0;
        let returnedAmount = 0;
        let totalDiscount = 0;
        let couponCount = 0;  // Track number of orders using coupons
        let totalProductsSold = 0;  // Add this line only

        for (const order of orders) {
            if (order.status === 'Delivered') {
                totalOrders++;
                // Ensure finalAmount is a number
                const orderAmount = Number(order.finalAmount) || 0;
                deliveredAmount += orderAmount;

                // Track coupon usage and discounts
                if (order.coupon && order.coupon.discountedAmount) {
                    totalDiscount += Number(order.coupon.discountedAmount) || 0;
                    couponCount++; // Increment coupon usage count
                }

                // Add this block only
                for (const item of order.items) {
                    if (item.returnStatus !== 'Approved') {
                        totalProductsSold += Number(item.quantity) || 0;
                    }
                }

                // Calculate returned amount for approved returns
                for (const item of order.items) {
                    if (item.returnStatus === 'Approved') {
                        // Ensure all values are numbers
                        const itemPrice = Number(item.totalPrice) || 0;
                        const orderTotal = Number(order.totalAmount) || 1; // Prevent division by zero
                        
                        // Calculate proportional discount for the returned item
                        const itemPercentage = itemPrice / orderTotal;
                        const itemCouponDiscount = order.coupon ? 
                            (Number(order.coupon.discountedAmount) * itemPercentage) || 0 : 0;
                        
                        // Subtract the refund amount (item total - proportional discount)
                        returnedAmount += (itemPrice - itemCouponDiscount);
                    }
                }
            }
        }

        // Ensure all values are numbers in final summary
        const summary = {
            totalOrders: Number(totalOrders),
            totalAmount: Number(deliveredAmount - returnedAmount),
            totalDiscount: Number(totalDiscount),
            returnedAmount: Number(returnedAmount),
            totalProductsSold  // Add this line only
        };

        console.log('Revenue Calculation:', {
            deliveredAmount,
            returnedAmount,
            totalAmount: summary.totalAmount,
            totalDiscount,
            couponCount
        });

        // Get top products (already filtered for delivered orders)
        const topProducts = await getTopProducts();

        // Get top categories (already filtered for delivered orders)
        const topCategories = await getTopCategories();

        res.render("dashboard", {
            salesData,
            summary: {
                totalOrders: summary.totalOrders,
                totalAmount: summary.totalAmount,
                totalDiscount: summary.totalDiscount,
                discountBreakdown: {
                    couponDiscount: summary.totalDiscount,
                    count: couponCount  // Pass actual coupon usage count
                },
                returnedOrders: 0,
                returnedAmount: summary.returnedAmount,
                totalProductsSold: summary.totalProductsSold  // Add this line only
            },
            topProducts,
            topCategories
        });

    } catch (error) {
        console.error('Error loading dashboard:', error);
        res.redirect("/admin/pageerror");
    }
};

const getSalesData = async (period, customRange = {}) => {
    try {
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        let startDate = new Date();
        let dateFormat;
        let groupBy;

        // Set up date range and format based on period
        switch(period) {
            case 'weekly':
                startDate = new Date(today);
                startDate.setDate(today.getDate() - 7);
                startDate.setHours(0, 0, 0, 0);
                dateFormat = '%Y-%m-%d';
                groupBy = { $dateToString: { format: dateFormat, date: '$orderDate' } };
                break;
            case 'monthly':
                startDate = new Date(today);
                startDate.setDate(today.getDate() - 30);
                startDate.setHours(0, 0, 0, 0);
                dateFormat = '%Y-%m-%d';
                groupBy = { $dateToString: { format: dateFormat, date: '$orderDate' } };
                break;
            case 'yearly':
                startDate = new Date(today);
                startDate.setFullYear(today.getFullYear() - 1);
                startDate.setHours(0, 0, 0, 0);
                dateFormat = '%Y-%m';
                groupBy = { $dateToString: { format: dateFormat, date: '$orderDate' } };
                break;
            case 'custom':
                if (customRange && customRange.startDate && customRange.endDate) {
                    console.log('Custom range received:', customRange);
                    startDate = new Date(customRange.startDate);
                    startDate.setHours(0, 0, 0, 0);
                    today.setTime(customRange.endDate.getTime());
                    today.setHours(23, 59, 59, 999);
                    console.log('Processed dates:', {
                        startDate: startDate.toISOString(),
                        endDate: today.toISOString()
                    });
                } else {
                    throw new Error("Start and end date must be provided for custom period.");
                }
                dateFormat = '%Y-%m-%d';
                groupBy = { $dateToString: { format: dateFormat, date: '$orderDate' } };
                break;
            default:
                startDate = new Date(today);
                startDate.setDate(today.getDate() - 1);
                startDate.setHours(0, 0, 0, 0);
                dateFormat = '%Y-%m-%d';
                groupBy = { $dateToString: { format: dateFormat, date: '$orderDate' } };
        }

        console.log('Date Range:', { startDate, endDate: today }); // Add this for debugging

        // Aggregate sales data with proper handling of returns
        console.log('MongoDB Query Parameters:', {
            startDate: startDate.toISOString(),
            endDate: today.toISOString(),
            period,
            dateFormat
        });

        const salesData = await Order.aggregate([
            {
                $match: {
                    orderDate: { 
                        $gte: startDate,
                        $lte: today
                    },
                    status: 'Delivered'  // Only include delivered orders
                }
            },
            {
                $unwind: '$items'
            },
            {
                $match: {
                    'items.returnStatus': { $ne: 'Approved' }  // Exclude returned items
                }
            },
            {
                $group: {
                    _id: groupBy,
                    totalSales: { $sum: '$items.totalPrice' },
                    productCount: { $sum: '$items.quantity' }
                }
            },
            {
                $sort: { _id: 1 }
            }
        ]);

        console.log('MongoDB Results:', {
            count: salesData.length,
            data: salesData
        });

        // Process data for chart
        const labels = [];
        const values = [];
        const productCounts = [];

        // Fill in missing dates with zero values
        let currentDate = new Date(startDate);
        while (currentDate <= today) {
            let dateStr;
            if (period === 'yearly') {
                dateStr = currentDate.toISOString().slice(0, 7); // YYYY-MM
            } else {
                dateStr = currentDate.toISOString().slice(0, 10); // YYYY-MM-DD
            }

            const existingData = salesData.find(d => d._id === dateStr);
            
            labels.push(dateStr);
            values.push(existingData ? existingData.totalSales : 0);
            productCounts.push(existingData ? existingData.productCount : 0);

            // Increment date based on period
            if (period === 'yearly') {
                currentDate.setMonth(currentDate.getMonth() + 1);
            } else {
                currentDate.setDate(currentDate.getDate() + 1);
            }
        }

        console.log('Processed Chart Data:', {
            labels,
            valueCount: values.length,
            productCount: productCounts.length
        });

        return {
            labels,
            values,
            productCounts
        };

    } catch (error) {
        console.error('Error in getSalesData:', error);
        throw error;
    }
};

const getTopProducts = async () => {
    return await Order.aggregate([
        {
            $match: { status: 'Delivered'}
        },
        { $unwind: '$items' },
        {
            $group: {
                _id: '$items.productId',
                deliveredQuantity: {
                    $sum: {
                        $cond: [
                            { $eq: ['$status', 'Delivered'] },
                            '$items.quantity',
                            0
                        ]
                    }
                },
                returnedQuantity: {
                    $sum: {
                        $cond: [
                            { $eq: ['$returnStatus', 'Approved']},
                            '$items.quantity',
                            0
                        ]
                    }
                },
                deliveredRevenue: {
                    $sum: {
                        $cond: [
                            { $eq: ['$status', 'Delivered'] },
                            { $multiply: ['$items.price', '$items.quantity'] },
                            0
                        ]
                    }
                },
                returnedRevenue: {
                    $sum: {
                        $cond: [
                            {$eq: ['$returnStatus', 'Approved'] },
                            { $multiply: ['$items.price', '$items.quantity'] },
                            0
                        ]
                    }
                }
            }
        },
        {
            $lookup: {
                from: 'products',
                localField: '_id',
                foreignField: '_id',
                as: 'product'
            }
        },
        { $unwind: '$product' },
        {
            $project: {
                name: '$product.productName',
                sales: { $subtract: ['$deliveredQuantity', '$returnedQuantity'] },
                revenue: { $subtract: ['$deliveredRevenue', '$returnedRevenue'] }
            }
        },
        { $match: { sales: { $gt: 0 } } }, // Only show products with positive sales
        { $sort: { sales: -1 } },
        { $limit: 10 }
    ]);
};

const getTopCategories = async () => {
    return await Order.aggregate([
        {
            $match: {status: 'Delivered' }        
        },
        { $unwind: '$items' },
        {
            $lookup: {
                from: 'products',
                localField: 'items.productId',
                foreignField: '_id',
                as: 'product'
            }
        },
        { $unwind: '$product' },
        {
            $lookup: {
                from: 'categories',
                localField: 'product.category',
                foreignField: '_id',
                as: 'category'
            }
        },
        { $unwind: '$category' },
        {
            $group: {
                _id: '$category._id',
                name: { $first: '$category.name' },
                deliveredQuantity: {
                    $sum: {
                        $cond: [
                            { $eq: ['$status', 'Delivered'] },
                            '$items.quantity',
                            0
                        ]
                    }
                },
                returnedQuantity: {
                    $sum: {
                        $cond: [
                            { $eq: ['$returnStatus', 'Approved']},
                            '$items.quantity',
                            0
                        ]
                    }
                },
                deliveredRevenue: {
                    $sum: {
                        $cond: [
                            { $eq: ['$status', 'Delivered'] },
                            { $multiply: ['$items.price', '$items.quantity'] },
                            0
                        ]
                    }
                },
                returnedRevenue: {
                    $sum: {
                        $cond: [
                            { $eq: ['$returnStatus', 'Approved']},
                            { $multiply: ['$items.price', '$items.quantity'] },
                            0
                        ]
                    }
                }
            }
        },
        {
            $project: {
                name: 1,
                sales: { $subtract: ['$deliveredQuantity', '$returnedQuantity'] },
                revenue: { $subtract: ['$deliveredRevenue', '$returnedRevenue'] }
            }
        },
        { $match: { sales: { $gt: 0 } } }, // Only show categories with positive sales
        { $sort: { sales: -1 } },
        { $limit: 5 }
    ]);
};

const getDashboardSummary = async () => {
    const [orderStats] = await Order.aggregate([
        {
            $facet: {
                'totals': [
                    {
                        $group: {
                            _id: null,
                            totalOrders: { $sum: 1 },
                            totalAmount: { 
                                $sum: {
                                    $cond: [
                                        { $eq: ['$returnStatus', 'Approved']},
                                        '$totalAmount',
                                        { $multiply: ['$totalAmount', -1] }  // Subtract returned order amounts
                                    ]
                                }
                            },
                            totalDiscount: {
                                $sum: {
                                    $cond: [
                                        {
                                            $and: [
                                                { $eq: ['$returnStatus', 'Approved']},
                                                { $ifNull: ['$coupon.discountedAmount', false] }
                                            ]
                                        },
                                        '$coupon.discountedAmount',
                                        0
                                    ]
                                }
                            }
                        }
                    }
                ]
            }
        },
        {
            $unwind: '$totals'
        },
        {
            $project: {
                totalOrders: '$totals.totalOrders',
                totalAmount: '$totals.totalAmount',
                totalDiscount: '$totals.totalDiscount'
            }
        }
    ]);

    return {
        totalOrders: orderStats?.totalOrders || 0,
        totalAmount: orderStats?.totalAmount || 0,
        totalDiscount: orderStats?.totalDiscount || 0
    };
};

const getSalesDataAPI = async (req, res) => {
    try {
        const { period, startDate, endDate } = req.query;
      
        
        let data;
        if (period === 'custom' && startDate && endDate) {

            const parsedStart = new Date(startDate);
            const parsedEnd = new Date(endDate);
            console.log('After parsing dates:', { 
                parsedStart: parsedStart.toISOString(),
                parsedEnd: parsedEnd.toISOString()
            });
            
            data = await getSalesData(period, { 
                startDate: parsedStart,
                endDate: parsedEnd
            });
        } else {
            data = await getSalesData(period);
        }
        
        res.json(data);
    } catch (error) {

        res.status(500).json({ error: 'Error fetching sales data' });
    }
};

const logout = async(req,res)=>{
    try {
        req.session.destroy(err=>{
            if(err){

                return res.redirect("/admin/pageerror")
            }
            res.redirect("/admin/login")
        })
        
    } catch (error) {

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
 
        res.redirect("/admin/pageerror");
    }
};

const downloadSalesReport = async (req, res) => {
    try {
        const { startDate, endDate, period } = req.query;
        let query = { status: 'Delivered' };
        let dateQuery = {};

        // Handle date filtering (same as getSalesReport)
        if (startDate && endDate) {
            dateQuery = {
                orderDate: {
                    $gte: new Date(startDate.toISOString().split('T')[0]), 
                    $lte: new Date(endDate.toISOString().split('T')[0] + 'T23:59:59.999Z')
                }
            };
        } else if (period) {
            const now = new Date();
            now.setHours(23, 59, 59, 999);
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
            }

            periodStartDate.setHours(0, 0, 0, 0);
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
                order.shippingAddress ? order.shippingAddress.name : 'N/A',
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
      
        res.status(500).json({
            success: false,
            message: 'Error downloading sales report'
        });
    }
};

const downloadExcelReport = async (req, res) => {
    try {
        // Get query parameters for filtering
        let { startDate, endDate, period } = req.query;
        let query = {
            status: { $in: ['Delivered', 'Returned'] }
        };

        // Handle date filtering with proper timezone handling
        if (startDate && endDate) {
            const start = new Date(new Date(startDate).setHours(0, 0, 0, 0));
            const end = new Date(new Date(endDate).setHours(23, 59, 59, 999));
            query.orderDate = { $gte: start, $lte: end };
        } else if (period) {
            const endDate = new Date();
            endDate.setHours(23, 59, 59, 999);
            let startDate;

            switch (period) {
                case 'day':
                    startDate = new Date(endDate);
                    startDate.setDate(endDate.getDate() - 1);
                    break;
                case 'week':
                    startDate = new Date(endDate);
                    startDate.setDate(endDate.getDate() - 7);
                    break;
                case 'month':
                    startDate = new Date(endDate);
                    startDate.setMonth(endDate.getMonth() - 1);
                    break;
                default:
                    startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
                    break;
            }

            startDate.setHours(0, 0, 0, 0);
            query.orderDate = { $gte: startDate, $lte: endDate };
        }

        // Get filtered orders
        const filteredOrders = await Order.find(query)
            .populate({
                path: 'items.productId',
                select: 'productName brand regularPrice price'
            });

        // Calculate summary
        let totalOrders = 0;
        let deliveredAmount = 0;
        let returnedAmount = 0;
        let totalDiscount = 0;
        let totalProductsSold = 0;

        for (const order of filteredOrders) {
            if (order.status === 'Delivered') {
                totalOrders++;
                deliveredAmount += Number(order.finalAmount) || 0;

                for (const item of order.items) {
                    if (item.productId) {  // Check if product exists
                        if (item.returnStatus === 'Approved') {
                            const itemPrice = Number(item.totalPrice) || 0;
                            const orderTotal = Number(order.totalAmount) || 1;
                            const itemPercentage = itemPrice / orderTotal;
                            const itemDiscount = order.coupon ? 
                                (Number(order.coupon.discountedAmount) * itemPercentage) || 0 : 0;
                            returnedAmount += (itemPrice - itemDiscount);
                        } else {
                            totalProductsSold += Number(item.quantity) || 0;
                        }
                    }
                }

                if (order.coupon && order.coupon.discountedAmount) {
                    totalDiscount += Number(order.coupon.discountedAmount) || 0;
                }
            }
        }

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Sales Report');

        // Add title
        worksheet.mergeCells('A1:G1');
        worksheet.getCell('A1').value = 'Sales Report';
        worksheet.getCell('A1').alignment = { horizontal: 'center' };
        worksheet.getCell('A1').font = { bold: true, size: 16 };

        // Add summary section
        worksheet.addRow(['']);
        worksheet.addRow(['Summary']);
        worksheet.addRow(['Total Orders:', totalOrders]);
        worksheet.addRow(['Total Revenue:', `₹${(deliveredAmount - returnedAmount).toFixed(2)}`]);
        worksheet.addRow(['Total Discount:', `₹${totalDiscount.toFixed(2)}`]);
        worksheet.addRow(['Returned Amount:', `₹${returnedAmount.toFixed(2)}`]);
        worksheet.addRow(['Total Products Sold:', totalProductsSold]);
        worksheet.addRow(['']);

        // Add headers
        const headers = ['Order ID', 'Date', 'Customer', 'Products', 'Amount', 'Status'];
        worksheet.addRow(headers);

        // Add order data
        for (const order of filteredOrders) {
            const products = order.items
                .filter(item => item.productId) // Filter out items with deleted products
                .map(item => `${item.productId.productName} (${item.quantity})`)
                .join(', ');

            worksheet.addRow([
                order._id.toString(),
                new Date(order.orderDate).toLocaleDateString(),
                order.shippingAddress ? order.shippingAddress.name : 'N/A',
                products,
                order.finalAmount ? `₹${Number(order.finalAmount).toFixed(2)}` : '₹0.00',
                order.status
            ]);
        }

        // Set column widths
        worksheet.columns.forEach((column, i) => {
            let maxLength = 0;
            column.eachCell({ includeEmpty: true }, cell => {
                const length = cell.value ? cell.value.toString().length : 10;
                if (length > maxLength) {
                    maxLength = length;
                }
            });
            column.width = Math.min(maxLength + 2, 50); // Cap width at 50 characters
        });

        // Set response headers
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            'attachment; filename=sales-report.xlsx'
        );

        // Send the workbook
        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
     
        res.status(500).json({
            success: false,
            message: 'Error generating Excel report',
            error: error.message
        });
    }
};

const downloadPdfReport = async (req, res) => {
    try {
        // Get query parameters for filtering
        let { startDate, endDate, period } = req.query;
        let query = {
            status: { $in: ['Delivered', 'Returned'] }
        };

        // Handle date filtering with proper timezone handling
        if (startDate && endDate) {
            const start = new Date(new Date(startDate).setHours(0, 0, 0, 0));
            const end = new Date(new Date(endDate).setHours(23, 59, 59, 999));
            query.orderDate = { $gte: start, $lte: end };
        } else if (period) {
            const endDate = new Date();
            endDate.setHours(23, 59, 59, 999);
            let startDate;

            switch (period) {
                case 'day': {
                    startDate = new Date(endDate);
                    startDate.setDate(endDate.getDate() - 1);
                    break;
                }
                case 'week': {
                    startDate = new Date(endDate);
                    startDate.setDate(endDate.getDate() - 7);
                    break;
                }
                case 'month': {
                    startDate = new Date(endDate);
                    startDate.setMonth(endDate.getMonth() - 1);
                    break;
                }
                default: {
                    startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
                    break;
                }
            }

            startDate.setHours(0, 0, 0, 0);
            query.orderDate = { $gte: startDate, $lte: endDate };
        }

        // Get filtered orders with proper population
        const filteredOrders = await Order.find(query)
            .populate({
                path: 'items.productId',
                select: 'productName brand regularPrice price'
            })
            .lean(); // Use lean() for better performance

        // Calculate summary
        let totalOrders = 0;
        let deliveredAmount = 0;
        let returnedAmount = 0;
        let totalDiscount = 0;
        let totalProductsSold = 0;

        for (const order of filteredOrders) {
            if (order.status === 'Delivered') {
                // Count all delivered orders
                totalOrders++;
                
                // Add the final amount of the order (after discounts)
                deliveredAmount += Number(order.finalAmount) || 0;

                // Calculate returned items amount
                for (const item of order.items) {
                    if (item.returnStatus === 'Approved') {
                        // For returned items, calculate the actual refund amount
                        const itemPrice = Number(item.totalPrice) || 0;
                        const orderTotal = Number(order.totalAmount) || 1; // Prevent division by zero
                        
                        // Calculate proportional discount for the returned item
                        const itemPercentage = itemPrice / orderTotal;
                        const itemDiscount = order.coupon ? 
                            (Number(order.coupon.discountedAmount) * itemPercentage) || 0 : 0;
                        
                        // Add to returned amount (price minus proportional discount)
                        returnedAmount += (itemPrice - itemDiscount);
                    } else {
                        // Count non-returned products
                        totalProductsSold += Number(item.quantity) || 0;
                    }
                }

                // Track coupon usage
                if (order.coupon && order.coupon.discountedAmount) {
                    totalDiscount += Number(order.coupon.discountedAmount) || 0;
                }
            }
        }

        // Create PDF document with proper configuration
        const doc = new PDFDocument({
            autoFirstPage: true,
            size: 'A4',
            margin: 50,
            bufferPages: true
        });

        // Create a buffer to store the PDF
        let chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => {
            const result = Buffer.concat(chunks);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename=sales-report.pdf');
            res.setHeader('Content-Length', Buffer.byteLength(result));
            res.end(result);
        });

        // Add title
        doc.font('Helvetica-Bold')
           .fontSize(20)
           .text('Sales Report', { align: 'center' });
        doc.moveDown();

        // Add date range if applicable
        if (startDate && endDate) {
            doc.font('Helvetica')
               .fontSize(12)
               .text(`Period: ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}`,
                     { align: 'center' });
            doc.moveDown();
        }

        // Add summary
        doc.font('Helvetica-Bold')
           .fontSize(14)
           .text('Summary', { underline: true });
        doc.moveDown(0.5);

        doc.font('Helvetica')
           .fontSize(12)
           .text(`Total Orders: ${totalOrders}`)
           .text(`Total Revenue: ₹${(deliveredAmount - returnedAmount).toFixed(2)}`)
           .text(`Total Discount: ₹${totalDiscount.toFixed(2)}`)
           .text(`Returned Amount: ₹${returnedAmount.toFixed(2)}`)
           .text(`Total Products Sold: ${totalProductsSold}`);
        doc.moveDown();

        // Add orders table
        doc.font('Helvetica-Bold')
           .fontSize(14)
           .text('Order Details', { underline: true });
        doc.moveDown(0.5);

        // Table configuration
        const pageWidth = doc.page.width - 2 * doc.page.margins.left;
        const columns = {
            orderId: { x: 50, width: 150, header: 'Order ID' },
            date: { x: 200, width: 80, header: 'Date' },
            customer: { x: 280, width: 100, header: 'Customer' },
            amount: { x: 380, width: 90, header: 'Amount' },
            status: { x: 490, width: 70, header: 'Status' }  // Moved status column to the right
        };

        // Draw table header
        const drawTableHeader = () => {
            const headerHeight = 20;
            const currentY = doc.y;

            // Draw header background
            doc.fillColor('#f4f4f4')
               .rect(doc.page.margins.left, currentY, pageWidth, headerHeight)
               .fill();

            // Draw all headers on the same line
            doc.fillColor('#000')
               .font('Helvetica-Bold')
               .fontSize(10);

            // Draw each header text
            Object.values(columns).forEach(column => {
                doc.text(
                    column.header,
                    column.x,
                    currentY + 5,
                    {
                        width: column.width,
                        align: column.header === 'Amount' ? 'right' : 'left'
                    }
                );
            });

            // Draw vertical lines for column separation
            doc.strokeColor('#cccccc')
               .lineWidth(0.5);
            Object.values(columns).forEach(column => {
                doc.moveTo(column.x, currentY)
                   .lineTo(column.x, currentY + headerHeight)
                   .stroke();
            });
            // Close the last column
            doc.moveTo(columns.status.x + columns.status.width, currentY)
               .lineTo(columns.status.x + columns.status.width, currentY + headerHeight)
               .stroke();

            // Move position below header
            doc.y = currentY + headerHeight;
            return doc.y;
        };

        // Draw horizontal line
        const drawLine = (y) => {
            doc.strokeColor('#cccccc')
               .lineWidth(0.5)
               .moveTo(doc.page.margins.left, y)
               .lineTo(doc.page.margins.left + pageWidth, y)
               .stroke();
        };

        // Draw vertical lines for a row
        const drawVerticalLines = (y, height) => {
            doc.strokeColor('#cccccc')
               .lineWidth(0.5);
            Object.values(columns).forEach(column => {
                doc.moveTo(column.x, y)
                   .lineTo(column.x, y + height)
                   .stroke();
            });
            // Close the last column
            doc.moveTo(columns.status.x + columns.status.width, y)
               .lineTo(columns.status.x + columns.status.width, y + height)
               .stroke();
        };

        let yPosition = drawTableHeader();
        let rowHeight = 25;
        let alternateRow = false;

        for (const order of filteredOrders) {
            // Check if we need a new page
            if (yPosition > doc.page.height - rowHeight - 50) {
                doc.addPage();
                yPosition = drawTableHeader();
            }

            try {
                // Draw row background for alternate rows
                if (alternateRow) {
                    doc.fillColor('#f9f9f9')
                       .rect(doc.page.margins.left, yPosition, pageWidth, rowHeight)
                       .fill();
                }
                doc.fillColor('#000');

                // Draw row content
                doc.font('Helvetica')
                   .fontSize(9);

                // Order ID (full display)
                doc.text(order._id.toString(), 
                    columns.orderId.x + 2, yPosition + 5, 
                    { width: columns.orderId.width - 4 });

                // Date
                doc.text(new Date(order.orderDate).toLocaleDateString(),
                    columns.date.x + 2, yPosition + 5,
                    { width: columns.date.width - 4 });

                // Customer
                doc.text(order.shippingAddress ? order.shippingAddress.name : 'N/A',
                    columns.customer.x + 2, yPosition + 5,
                    { width: columns.customer.width - 4 });

                // Amount (right-aligned)
                doc.text(`₹${Number(order.finalAmount).toFixed(2)}`,
                    columns.amount.x + 2, yPosition + 5,
                    { width: columns.amount.width - 4, align: 'right' });

                // Status
                doc.text(order.status,
                    columns.status.x + 2, yPosition + 5,
                    { width: columns.status.width - 4 });

                // Draw vertical lines for the row
                drawVerticalLines(yPosition, rowHeight);
                
                // Draw horizontal line after each row
                drawLine(yPosition + rowHeight);

                yPosition += rowHeight;
                alternateRow = !alternateRow;

                // Add product details in smaller font
                if (order.items && order.items.length > 0) {
                    const products = order.items
                        .filter(item => item.productId)
                        .map(item => `${item.productId.productName} (${item.quantity})`)
                        .join(', ');

                    if (products) {
                        const productRowHeight = 20;
                        
                        if (alternateRow) {
                            doc.fillColor('#f9f9f9')
                               .rect(doc.page.margins.left, yPosition, pageWidth, productRowHeight)
                               .fill();
                        }
                        
                        doc.fillColor('#000')
                           .fontSize(8)
                           .text('Products: ' + products,
                                columns.orderId.x + 2, yPosition + 2,
                                { width: pageWidth - 4 });
                        
                        // Draw vertical lines for product row
                        drawVerticalLines(yPosition, productRowHeight);
                        yPosition += productRowHeight;
                        drawLine(yPosition);
                    }
                }

            } catch (err) {
                console.error(`Error processing order ${order._id}:`, err);
                continue;
            }
        }

        // End the document
        doc.end();

    } catch (error) {
        console.error('Error generating PDF report:', error);
        res.status(500).json({
            success: false,
            message: 'Error generating PDF report',
            error: error.message
        });
    }
};

const loadSalesReport = async (req, res) => {
    try {
        if (!req.session.admin) {
            return res.redirect("/admin/login");
        }

        // Get query parameters for filtering
        let { startDate, endDate, period } = req.query;
        let query = {
            status: { $in: ['Delivered', 'Returned'] }
        };

        // Handle date filtering with proper timezone handling
        if (startDate && endDate) {
            const start = new Date(new Date(startDate).setHours(0, 0, 0, 0));
            const end = new Date(new Date(endDate).setHours(23, 59, 59, 999));
            query.orderDate = { $gte: start, $lte: end };
        } else if (period) {
            const endDate = new Date();
            endDate.setHours(23, 59, 59, 999);
            let startDate;

            switch (period) {
                case 'day': {
                    startDate = new Date(endDate);
                    startDate.setDate(endDate.getDate() - 1);
                    break;
                }
                case 'week': {
                    startDate = new Date(endDate);
                    startDate.setDate(endDate.getDate() - 7);
                    break;
                }
                case 'month': {
                    startDate = new Date(endDate);
                    startDate.setMonth(endDate.getMonth() - 1);
                    break;
                }
                default: {
                    startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
                    break;
                }
            }

            startDate.setHours(0, 0, 0, 0);
            query.orderDate = { $gte: startDate, $lte: endDate };
        }

        console.log('Date Query:', {
            period,
            query: query.orderDate,
            currentTime: new Date()
        });

        // Get filtered orders for summary calculation
        const filteredOrders = await Order.find(query);
        
        let totalOrders = 0;
        let deliveredAmount = 0;
        let returnedAmount = 0;
        let totalDiscount = 0;
        let couponCount = 0;
        let totalProductsSold = 0;

        for (const order of filteredOrders) {
            if (order.status === 'Delivered') {
                // Count all delivered orders
                totalOrders++;
                
                // Add the final amount of the order (after discounts)
                deliveredAmount += Number(order.finalAmount) || 0;

                // Calculate returned items amount
                for (const item of order.items) {
                    if (item.returnStatus === 'Approved') {
                        // For returned items, calculate the actual refund amount
                        const itemPrice = Number(item.totalPrice) || 0;
                        const orderTotal = Number(order.totalAmount) || 1; // Prevent division by zero
                        
                        // Calculate proportional discount for the returned item
                        const itemPercentage = itemPrice / orderTotal;
                        const itemDiscount = order.coupon ? 
                            (Number(order.coupon.discountedAmount) * itemPercentage) || 0 : 0;
                        
                        // Add to returned amount (price minus proportional discount)
                        returnedAmount += (itemPrice - itemDiscount);
                    } else {
                        // Count non-returned products
                        totalProductsSold += Number(item.quantity) || 0;
                    }
                }

                // Track coupon usage
                if (order.coupon && order.coupon.discountedAmount) {
                    totalDiscount += Number(order.coupon.discountedAmount) || 0;
                    couponCount++;
                }
            }
        }

        console.log('Revenue Calculation:', {
            deliveredAmount,
            returnedAmount,
            finalAmount: deliveredAmount - returnedAmount,
            totalDiscount,
            totalOrders
        });

        // Get paginated orders
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        const paginatedOrders = await Order.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate({
                path: 'items.productId',
                select: 'productName brand regularPrice price',
                model: 'Product'
            });

        // Calculate regular price total for each order
        for (const order of paginatedOrders) {
            let regularPrice = 0;
            for (const item of order.items) {
                if (item.productId && item.returnStatus !== 'Approved') {
                    regularPrice += (item.productId.regularPrice || item.productId.price || 0) * item.quantity;
                }
            }
            order.regularPrice = regularPrice;
        }

        const totalOrderCount = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalOrderCount / limit);

        res.render('salesReport', {
            orders: paginatedOrders,
            summary: {
                totalOrders,
                totalAmount: deliveredAmount - returnedAmount, // Subtract returned amount from total
                totalDiscount,
                discountBreakdown: {
                    couponDiscount: totalDiscount,
                    count: couponCount
                },
                returnedAmount,
                totalProductsSold
            },
            filters: {
                startDate: startDate || '',
                endDate: endDate || '',
                period: period || ''
            },
            pagination: {
                page,
                limit,
                totalPages,
                totalOrders: totalOrderCount
            }
        });

    } catch (error) {
        console.error('Error loading sales report:', error);
        res.redirect("/admin/pageerror");
    }
};

module.exports = {
    loadLogin,
    login,
    loadDashbord,
    logout,
    pageerror,
    loadAddProduct,
    downloadExcelReport,
    downloadPdfReport,
    getSalesDataAPI,
    getSalesData,
    loadSalesReport,
    downloadSalesReport,
    getTopProducts,
    getTopCategories,
    getDashboardSummary
};