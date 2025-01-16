const Coupon = require('../../models/couponSchema');

// Temporary function to fix index issue
const fixIndexIssue = async () => {
    try {
        await Coupon.collection.dropIndex('name_1');
        console.log('Successfully dropped the problematic index');
    } catch (error) {
        console.log('Index might not exist or other error:', error);
    }
};

// Call this once
fixIndexIssue();

// Get all coupons
const getAllCoupons = async (req, res) => {
    try {
        const coupons = await Coupon.find().sort({ createdAt: -1 });
        res.render('coupons', { 
            coupons,
            admin: true,
            title: 'Coupon Management'
        });
    } catch (error) {
        console.error('Error fetching coupons:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching coupons'
        });
    }
};

// Create new coupon
const createCoupon = async (req, res) => {
    try {
        console.log('Received coupon data:', req.body);  

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

        // Basic validation
        if (!code || !description || !discountType || !discountAmount || !minimumPurchase) {
            console.log('Missing required fields:', { 
                code, description, discountType, discountAmount, minimumPurchase 
            });
            return res.status(400).json({
                success: false,
                message: 'Please provide all required fields'
            });
        }

        // Check if coupon already exists
        const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
        if (existingCoupon) {
            console.log('Coupon already exists:', code.toUpperCase());
            return res.status(400).json({
                success: false,
                message: 'A coupon with this code already exists'
            });
        }

        // Validate dates if provided
        if (startDate && endDate && new Date(endDate) <= new Date(startDate)) {
            console.log('Invalid dates:', { startDate, endDate });
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
            startDate: startDate || new Date(),
            endDate: endDate || null,
            usageLimit: usageLimit ? Number(usageLimit) : null,
            usedCount: 0,
            isActive: true
        };
        
        console.log('Creating coupon with data:', couponData);  
        const newCoupon = new Coupon(couponData);
        await newCoupon.save();

        console.log('Coupon created successfully:', newCoupon);  
        res.status(201).json({
            success: true,
            message: 'Coupon created successfully',
            coupon: newCoupon
        });

    } catch (error) {
        console.error('Detailed error in coupon creation:', error);  
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
        const coupon = await Coupon.findByIdAndDelete(id);

        if (!coupon) {
            console.log('Coupon not found:', id);
            return res.status(404).json({
                success: false,
                message: 'Coupon not found'
            });
        }

        console.log('Coupon deleted successfully:', id);
        res.json({
            success: true,
            message: 'Coupon deleted successfully'
        });

    } catch (error) {
        console.error('Detailed error in coupon deletion:', error);  
        res.status(500).json({
            success: false,
            message: 'Error deleting coupon: ' + error.message
        });
    }
};

module.exports = {
    getAllCoupons,
    createCoupon,
    deleteCoupon
};