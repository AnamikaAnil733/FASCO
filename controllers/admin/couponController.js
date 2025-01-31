const Coupon = require('../../models/couponSchema');

// Get all coupons
const getAllCoupons = async (req, res) => {
    try {
        // Pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Get total count for pagination
        const totalCoupons = await Coupon.countDocuments();
        const totalPages = Math.ceil(totalCoupons / limit);

        // Get paginated coupons
        const coupons = await Coupon.find()
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.render('coupons', { 
            coupons,
            admin: true,
            title: 'Coupon Management',
            pagination: {
                page,
                limit,
                totalPages,
                totalCoupons
            }
        });
    } catch (error) {
      
        res.status(500).json({
            success: false,
            message: 'Error fetching coupons'
        });
    }
};

// Create new coupon
const createCoupon = async (req, res) => {
    try {
      

        const {
            code,
            description,
            discountType,
            discountAmount,
            minimumPurchase,
            maximumDiscount,
            startDate,
            endDate,
            usageLimit
        } = req.body;

        // Validate required fields
        if (!code || !description || !discountType || !discountAmount || !minimumPurchase) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all required fields'
            });
        }

        // Validate coupon code format
        const codeRegex = /^[A-Z0-9]{3,15}$/;
        if (!codeRegex.test(code.toUpperCase())) {
            return res.status(400).json({
                success: false,
                message: 'Coupon code must be 3-15 characters long and contain only letters and numbers'
            });
        }

        // Check if coupon already exists
        const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
        if (existingCoupon) {
            return res.status(400).json({
                success: false,
                message: 'A coupon with this code already exists'
            });
        }

        // Validate discount type
        if (!['percentage', 'fixed'].includes(discountType)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid discount type. Must be either percentage or fixed'
            });
        }

        // Validate discount amount
        if (discountType === 'percentage' && (discountAmount <= 0 || discountAmount > 90)) {
            return res.status(400).json({
                success: false,
                message: 'Percentage discount must be between 1 and 90'
            });
        }

        if (discountType === 'fixed' && (discountAmount <= 0 || discountAmount > 10000)) {
            return res.status(400).json({
                success: false,
                message: 'Fixed discount must be between 1 and 10000'
            });
        }

        // Validate minimum purchase
        if (minimumPurchase <= 0 || minimumPurchase > 50000) {
            return res.status(400).json({
                success: false,
                message: 'Minimum purchase amount must be between 1 and 50000'
            });
        }

        // Validate maximum discount if provided
        if (maximumDiscount && (maximumDiscount <= 0 || maximumDiscount > 10000)) {
            return res.status(400).json({
                success: false,
                message: 'Maximum discount must be between 1 and 10000'
            });
        }

        // Validate usage limit if provided
        if (usageLimit && (usageLimit <= 0 || usageLimit > 1000)) {
            return res.status(400).json({
                success: false,
                message: 'Usage limit must be between 1 and 1000'
            });
        }

        // Validate dates
        const currentDate = new Date();
        const start = startDate ? new Date(startDate) : currentDate;
        const end = endDate ? new Date(endDate) : null;

        if (end && end <= start) {
            return res.status(400).json({
                success: false,
                message: 'End date must be after start date'
            });
        }

        // Create new coupon
        const couponData = {
            code: code.toUpperCase(),
            description,
            discountType,
            discountAmount: Number(discountAmount),
            minimumPurchase: Number(minimumPurchase),
            maximumDiscount: maximumDiscount ? Number(maximumDiscount) : undefined,
            startDate: start,
            endDate: end,
            usageLimit: usageLimit ? Number(usageLimit) : null,
            usedCount: 0,
            isActive: true
        };
        
   
        const newCoupon = new Coupon(couponData);
        await newCoupon.save();
  
        res.status(201).json({
            success: true,
            message: 'Coupon created successfully',
            coupon: newCoupon
        });

    } catch (error) {
     
        res.status(500).json({
            success: false,
            message: 'Error creating coupon: ' + error.message
        });
    }
};

// Delete coupon
const deleteCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!id) {
            return res.status(400).json({
                success: false,
                message: 'Coupon ID is required'
            });
        }

        const coupon = await Coupon.findById(id);
        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: 'Coupon not found'
            });
        }

        await Coupon.findByIdAndDelete(id);

      
        
        // Set content type header explicitly
        res.setHeader('Content-Type', 'application/json');
        return res.status(200).json({
            success: true,
            message: 'Coupon deleted successfully'
        });

    } catch (error) {
     
        // Set content type header explicitly
        res.setHeader('Content-Type', 'application/json');
        return res.status(500).json({
            success: false,
            message: 'Failed to delete coupon'
        });
    }
};

module.exports = {
    getAllCoupons,
    createCoupon,
    deleteCoupon
};