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
            return res.redirect("/admin/login");
        }

        // Get initial sales data for monthly period
        const salesData = await getSalesData('monthly');

        // Calculate summary using aggregation (for delivered orders minus returns)
        const summaryData = await Order.aggregate([
            {
                $match: {
                    $or: [
                        { status: 'Delivered' },
                        { status: 'Returned' }
                    ]
                }
            },
            {
                $group: {
                    _id: null,
                    totalOrders: {
                        $sum: {
                            $cond: [
                                { $eq: ['$status', 'Delivered'] },
                                1,
                                0
                            ]
                        }
                    },
                    deliveredAmount: {
                        $sum: {
                            $cond: [
                                { $eq: ['$status', 'Delivered'] },
                                { $subtract: ['$totalAmount', { $ifNull: ['$coupon.discountedAmount', 0] }] },
                                0
                            ]
                        }
                    },
                    returnedAmount: {
                        $sum: {
                            $cond: [
                                { $eq: ['$status', 'Returned'] },
                                { $subtract: ['$totalAmount', { $ifNull: ['$coupon.discountedAmount', 0] }] },
                                0
                            ]
                        }
                    },
                    totalDiscount: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ['$status', 'Delivered'] },
                                        { $ifNull: ['$coupon.discountedAmount', false] }
                                    ]
                                },
                                '$coupon.discountedAmount',
                                0
                            ]
                        }
                    },
                    returnedDiscount: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ['$status', 'Returned'] },
                                        { $ifNull: ['$coupon.discountedAmount', false] }
                                    ]
                                },
                                '$coupon.discountedAmount',
                                0
                            ]
                        }
                    },
                    couponCount: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ['$status', 'Delivered'] },
                                        { $ifNull: ['$coupon', false] }
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    },
                    returnedOrders: {
                        $sum: {
                            $cond: [
                                { $eq: ['$status', 'Returned'] },
                                1,
                                0
                            ]
                        }
                    }
                }
            },
            {
                $project: {
                    totalOrders: 1,
                    totalAmount: { $subtract: ['$deliveredAmount', '$returnedAmount'] },
                    totalDiscount: { $subtract: ['$totalDiscount', '$returnedDiscount'] },
                    couponCount: 1,
                    returnedOrders: 1,
                    returnedAmount: 1
                }
            }
        ]);

        const summary = summaryData[0] || {
            totalOrders: 0,
            totalAmount: 0,
            totalDiscount: 0,
            couponCount: 0,
            returnedOrders: 0,
            returnedAmount: 0
        };

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
                    count: summary.couponCount
                },
                returnedOrders: summary.returnedOrders,
                returnedAmount: summary.returnedAmount
            },
            topProducts,
            topCategories
        });

    } catch (error) {
        console.error('Error loading dashboard:', error);
        res.redirect("/admin/pageerror");
    }
};

const getSalesData = async (period = 'monthly') => {
    try {
        const now = new Date();
        let startDate, endDate;
        let groupBy;
        let format;

        switch (period) {
            case 'daily':
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
                endDate = now;
                groupBy = { $dateToString: { format: "%Y-%m-%d", date: "$orderDate" } };
                format = "YYYY-MM-DD";
                break;
            case 'weekly':
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 28);
                endDate = now;
                groupBy = {
                    $week: { $dateFromString: { dateString: { $dateToString: { format: "%Y-%m-%d", date: "$orderDate" } } } }
                };
                format = "Week";
                break;
            case 'monthly':
                startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
                endDate = now;
                groupBy = { $dateToString: { format: "%Y-%m", date: "$orderDate" } };
                format = "YYYY-MM";
                break;
            case 'yearly':
                startDate = new Date(now.getFullYear() - 4, 0, 1);
                endDate = now;
                groupBy = { $dateToString: { format: "%Y", date: "$orderDate" } };
                format = "YYYY";
                break;
            default:
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                endDate = now;
                groupBy = { $dateToString: { format: "%Y-%m-%d", date: "$orderDate" } };
                format = "YYYY-MM-DD";
        }

        const salesData = await Order.aggregate([
            {
                $match: {
                    orderDate: { $gte: startDate, $lte: endDate },
                    $or: [
                        { status: 'Delivered' },
                        { status: 'Returned' }
                    ]
                }
            },
            {
                $group: {
                    _id: groupBy,
                    deliveredAmount: {
                        $sum: {
                            $cond: [
                                { $eq: ['$status', 'Delivered'] },
                                { $subtract: ['$totalAmount', { $ifNull: ['$coupon.discountedAmount', 0] }] },
                                0
                            ]
                        }
                    },
                    returnedAmount: {
                        $sum: {
                            $cond: [
                                { $eq: ['$status', 'Returned'] },
                                { $subtract: ['$totalAmount', { $ifNull: ['$coupon.discountedAmount', 0] }] },
                                0
                            ]
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 1,
                    totalSales: { $subtract: ['$deliveredAmount', '$returnedAmount'] }
                }
            },
            { $sort: { "_id": 1 } }
        ]);

        // Process the data for the chart
        const labels = [];
        const values = [];

        if (period === 'weekly') {
            // For weekly data, create week labels
            salesData.forEach(data => {
                labels.push(`Week ${data._id}`);
                values.push(data.totalSales);
            });
        } else {
            // For other periods, use the date format directly
            salesData.forEach(data => {
                labels.push(data._id);
                values.push(data.totalSales);
            });
        }

        return { labels, values };
    } catch (error) {
        console.error('Error getting sales data:', error);
        return { labels: [], values: [] };
    }
};

const getTopProducts = async () => {
    return await Order.aggregate([
        { $match: { status: 'Delivered' } },
        { $unwind: '$items' },
        {
            $group: {
                _id: '$items.productId',
                sales: { $sum: '$items.quantity' },
                revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
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
                sales: 1,
                revenue: 1
            }
        },
        { $sort: { sales: -1 } },
        { $limit: 10 }
    ]);
};

const getTopCategories = async () => {
    return await Order.aggregate([
        { $match: { status: 'Delivered' } },
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
                sales: { $sum: '$items.quantity' },
                revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
            }
        },
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
                                        { $eq: ['$status', 'Delivered'] },
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
                                                { $eq: ['$status', 'Delivered'] },
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
        const { period } = req.query;
        const data = await getSalesData(period);
        res.json(data);
    } catch (error) {
        console.error('Error in sales data API:', error);
        res.status(500).json({ error: 'Error fetching sales data' });
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

const downloadExcelReport = async (req, res) => {
    try {
        const { startDate, endDate, period } = req.query;
        let query = {};
        let dateQuery = {};

        // Reuse the same date filtering logic from loadDashbord
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
                select: 'productName brand regularPrice price',
                match: { _id: { $ne: null } }
            })
            .sort({ orderDate: -1 })
            .lean();

        // Create a new workbook
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Sales Report');

        // Add headers with improved widths
        worksheet.columns = [
            { header: 'Order ID', key: 'orderId', width: 20 },
            { header: 'Date', key: 'date', width: 15 },
            { header: 'Customer', key: 'customer', width: 25 },
            { header: 'Items', key: 'items', width: 50 },
            { header: 'Regular Price', key: 'regularPrice', width: 15 },
            { header: 'Sales Price', key: 'salesPrice', width: 15 },
            { header: 'Discount', key: 'discount', width: 15 },
            { header: 'Final Amount', key: 'finalAmount', width: 15 },
            { header: 'Status', key: 'status', width: 15 }
        ];

        // Style headers
        worksheet.getRow(1).font = { bold: true, size: 12 };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE9ECEF' }
        };
        worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

        // Add data with improved formatting
        orders.forEach(order => {
            let regularPrice = 0;
            order.items.forEach(item => {
                if (item.productId) {
                    regularPrice += (item.productId.regularPrice || item.productId.price || 0) * item.quantity;
                }
            });

            const row = worksheet.addRow({
                orderId: order.orderId,
                date: new Date(order.orderDate).toLocaleDateString(),
                customer: order.shippingAddress.name,
                items: order.items.map(item => 
                    `${item.productId ? item.productId.productName : 'Deleted Product'} (${item.quantity})`
                ).join('\n'),
                regularPrice: regularPrice.toFixed(2),
                salesPrice: order.totalAmount.toFixed(2),
                discount: order.coupon ? order.coupon.discountedAmount.toFixed(2) : '0.00',
                finalAmount: ((order.coupon && order.coupon.discountedAmount) ? 
                    (order.totalAmount - order.coupon.discountedAmount) : 
                    order.totalAmount).toFixed(2),
                status: order.status
            });

            // Set row height and alignment
            row.height = 25;
            row.alignment = { vertical: 'middle', wrapText: true };
            
            // Center numeric columns
            ['regularPrice', 'salesPrice', 'discount', 'finalAmount'].forEach(key => {
                const cell = row.getCell(key);
                cell.alignment = { horizontal: 'right' };
                cell.numFmt = '₹#,##0.00';
            });
        });

        // Add borders to all cells
        worksheet.eachRow((row, rowNumber) => {
            row.eachCell((cell) => {
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
            });
        });

        // Set content headers
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=sales-report.xlsx');
        
        // Write to response
        await workbook.xlsx.write(res);
        return res.end();

    } catch (error) {
        console.error('Error generating Excel report:', error);
        return res.status(500).json({
            success: false,
            message: 'Error generating Excel report'
        });
    }
};

const downloadPdfReport = async (req, res) => {
    try {
        const { startDate, endDate, period } = req.query;
        let query = {};
        let dateQuery = {};

        // Reuse the same date filtering logic
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
                select: 'productName brand regularPrice price',
                match: { _id: { $ne: null } }
            })
            .sort({ orderDate: -1 })
            .lean();

        // Set content headers before creating the PDF
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=sales-report.pdf');

        // Create PDF document with improved formatting
        const doc = new PDFDocument({ 
            margin: 50,
            size: 'A4',
            bufferPages: true
        });
        doc.pipe(res);

        // Add title with proper styling
        doc.fontSize(24)
           .font('Helvetica-Bold')
           .text('Sales Report', { align: 'center' });
        doc.moveDown();

        // Add date range with improved formatting
        const dateRange = startDate && endDate ? 
            `${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}` :
            period ? `Last ${period}` : 'Current Month';
        doc.fontSize(12)
           .font('Helvetica')
           .text(`Period: ${dateRange}`, { align: 'center' });
        doc.moveDown(2);

        // Add summary with improved layout
        let summary = {
            totalOrders: orders.length,
            totalAmount: 0,
            totalDiscount: 0
        };

        orders.forEach(order => {
            if (order.status !== 'Cancelled' && order.status !== 'Returned') {
                summary.totalAmount += order.totalAmount || 0;
                if (order.coupon && order.coupon.discountedAmount) {
                    summary.totalDiscount += order.coupon.discountedAmount;
                }
            }
        });

        doc.fontSize(14)
           .font('Helvetica-Bold')
           .text('Summary', { underline: true });
        doc.moveDown(0.5);
        
        doc.fontSize(12)
           .font('Helvetica')
           .text(`Total Orders: ${summary.totalOrders}`)
           .text(`Total Amount: ₹${summary.totalAmount.toFixed(2)}`)
           .text(`Total Discounts: ₹${summary.totalDiscount.toFixed(2)}`);
        doc.moveDown(2);

        // Table settings
        const tableTop = doc.y;
        const colWidths = {
            orderId: 180,    // Increased for full order ID
            date: 100,
            customer: 70,   // Reduced customer width
            amount: 50,
            status: 90
        };
        const colPositions = {
            orderId: 80,
            date: 270,       // Adjusted based on new orderId width
            customer: 320,    // Adjusted position
            amount: 370,     // Reduced gap
            status: 470
        };
        let yPosition = tableTop;

        // Add table headers with background
        const addTableHeaders = () => {
            doc.fillColor('#E9ECEF')
               .rect(50, yPosition, 490, 20)
               .fill();
            
            doc.fillColor('#000')
               .fontSize(10)
               .font('Helvetica-Bold');

            doc.text('Order ID', colPositions.orderId, yPosition + 5, { width: colWidths.orderId })
               .text('Date', colPositions.date, yPosition + 5, { width: colWidths.date })
               .text('Customer', colPositions.customer, yPosition + 5, { width: colWidths.customer })
               .text('Amount', colPositions.amount, yPosition + 5, { width: colWidths.amount, align: 'right' })
               .text('Status', colPositions.status, yPosition + 5, { width: colWidths.status });

            yPosition += 25;
            doc.font('Helvetica');
        };

        addTableHeaders();

        // Add orders with alternating background
        orders.forEach((order, index) => {
            if (yPosition > 700) {
                doc.addPage();
                yPosition = 50;
                addTableHeaders();
            }

            if (index % 2 === 1) {
                doc.fillColor('#F8F9FA')
                   .rect(50, yPosition - 5, 490, 20)
                   .fill();
            }

            const finalAmount = ((order.coupon && order.coupon.discountedAmount) ? 
                (order.totalAmount - order.coupon.discountedAmount) : 
                order.totalAmount).toFixed(2);

            doc.fillColor('#000')
               .fontSize(9);

            // Order ID - no truncation
            doc.text(order.orderId, colPositions.orderId, yPosition, { 
                width: colWidths.orderId
            });

            // Date
            doc.text(new Date(order.orderDate).toLocaleDateString(), 
                colPositions.date, yPosition, { 
                    width: colWidths.date 
                });

            // Customer name (truncate if too long)
            const truncatedName = order.shippingAddress.name.length > 15 ? 
                order.shippingAddress.name.substring(0, 14) + '...' : 
                order.shippingAddress.name;
            doc.text(truncatedName, colPositions.customer, yPosition, { 
                width: colWidths.customer
            });

            // Amount (right-aligned)
            doc.text(`₹${finalAmount}`, colPositions.amount, yPosition, { 
                width: colWidths.amount,
                align: 'right'
            });

            // Status
            doc.text(order.status, colPositions.status, yPosition, { 
                width: colWidths.status 
            });

            yPosition += 20;
        });

        // Draw table borders
        doc.lineWidth(0.5)
           .moveTo(50, tableTop)
           .lineTo(540, tableTop)
           .stroke();

        // Vertical lines
        Object.values(colPositions).forEach(x => {
            doc.moveTo(x, tableTop)
               .lineTo(x, yPosition)
               .stroke();
        });
        
        // Close right border
        doc.moveTo(540, tableTop)
           .lineTo(540, yPosition)
           .stroke();

        // Bottom border
        doc.moveTo(50, yPosition)
           .lineTo(540, yPosition)
           .stroke();

        // End the document
        doc.end();

    } catch (error) {
        console.error('Error generating PDF report:', error);
        return res.status(500).json({
            success: false,
            message: 'Error generating PDF report'
        });
    }
};

const loadSalesReport = async (req, res) => {
    try {
        if (!req.session.admin) {
            return res.redirect("/admin/login");
        }

        // Get query parameters for filtering
        const { startDate, endDate, period } = req.query;
        let query = {
            $or: [
                { status: 'Delivered' },
                { status: 'Returned' }
            ]
        };
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
        }

        query = { ...query, ...dateQuery };

        // Calculate summary using aggregation
        const summaryData = await Order.aggregate([
            {
                $match: query
            },
            {
                $group: {
                    _id: null,
                    totalOrders: {
                        $sum: {
                            $cond: [
                                { $eq: ['$status', 'Delivered'] },
                                1,
                                0
                            ]
                        }
                    },
                    deliveredAmount: {
                        $sum: {
                            $cond: [
                                { $eq: ['$status', 'Delivered'] },
                                { $subtract: ['$totalAmount', { $ifNull: ['$coupon.discountedAmount', 0] }] },
                                0
                            ]
                        }
                    },
                    returnedAmount: {
                        $sum: {
                            $cond: [
                                { $eq: ['$status', 'Returned'] },
                                { $subtract: ['$totalAmount', { $ifNull: ['$coupon.discountedAmount', 0] }] },
                                0
                            ]
                        }
                    },
                    totalDiscount: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ['$status', 'Delivered'] },
                                        { $ifNull: ['$coupon.discountedAmount', false] }
                                    ]
                                },
                                '$coupon.discountedAmount',
                                0
                            ]
                        }
                    },
                    returnedDiscount: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ['$status', 'Returned'] },
                                        { $ifNull: ['$coupon.discountedAmount', false] }
                                    ]
                                },
                                '$coupon.discountedAmount',
                                0
                            ]
                        }
                    },
                    couponCount: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ['$status', 'Delivered'] },
                                        { $ifNull: ['$coupon', false] }
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    },
                    returnedOrders: {
                        $sum: {
                            $cond: [
                                { $eq: ['$status', 'Returned'] },
                                1,
                                0
                            ]
                        }
                    }
                }
            },
            {
                $project: {
                    totalOrders: 1,
                    totalAmount: { $subtract: ['$deliveredAmount', '$returnedAmount'] },
                    totalDiscount: { $subtract: ['$totalDiscount', '$returnedDiscount'] },
                    couponCount: 1,
                    returnedOrders: 1,
                    returnedAmount: 1
                }
            }
        ]);

        const summary = summaryData[0] || {
            totalOrders: 0,
            totalAmount: 0,
            totalDiscount: 0,
            couponCount: 0,
            returnedOrders: 0,
            returnedAmount: 0
        };

        // Get paginated orders
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const orders = await Order.find(query)
            .populate({
                path: 'items.productId',
                select: 'productName brand regularPrice price',
                match: { _id: { $ne: null } }
            })
            .sort({ orderDate: -1 })
            .skip(skip)
            .limit(limit);

        // Calculate regular price for display purposes
        orders.forEach(order => {
            let regularPrice = 0;
            order.items.forEach(item => {
                if (item.productId) {
                    regularPrice += (item.productId.regularPrice || item.productId.price || 0) * item.quantity;
                }
            });
            order.regularPrice = regularPrice;
        });

        const totalPages = Math.ceil((summary.totalOrders + summary.returnedOrders) / limit);

        res.render('salesReport', {
            orders,
            summary: {
                totalOrders: summary.totalOrders,
                totalAmount: summary.totalAmount,
                totalDiscount: summary.totalDiscount,
                discountBreakdown: {
                    couponDiscount: summary.totalDiscount,
                    count: summary.couponCount
                },
                returnedOrders: summary.returnedOrders,
                returnedAmount: summary.returnedAmount
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
                totalOrders: summary.totalOrders + summary.returnedOrders
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