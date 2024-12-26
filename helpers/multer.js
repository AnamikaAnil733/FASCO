const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Create necessary directories
const uploadDir = path.join(__dirname, "../public/uploads");
const tempDir = path.join(uploadDir, "temp");
const productImagesDir = path.join(uploadDir, "product-images");

// Ensure directories exist
[tempDir, productImagesDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, tempDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'temp-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    if (!file.originalname.match(/\.(jpg|JPG|jpeg|JPEG|png|PNG)$/)) {
        req.fileValidationError = 'Only JPG and PNG images are allowed!';
        return cb(new Error('Only JPG and PNG images are allowed!'), false);
    }
    cb(null, true);
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
        files: 4 // Maximum 4 files
    }
});

module.exports = upload;
