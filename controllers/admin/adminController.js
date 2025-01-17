const User = require("../../models/userSchema")
const mongoose = require("mongoose")
const bcrypt = require("bcrypt")
const Category = require("../../models/categorySchema")
const Order = require("../../models/orderSchema") // Assuming Order model is defined in orderSchema.js
const Excel = require('exceljs');
const PDFDocument = require('pdfkit');

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
        const workbook = new Excel.Workbook();
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

module.exports = {
    loadLogin,
    login,
    loadDashbord,
    logout,
    pageerror,
    loadAddProduct,
    downloadSalesReport,
    downloadExcelReport,
    downloadPdfReport
};