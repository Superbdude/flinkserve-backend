const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    let uploadPath = uploadsDir;
    
    // Create subdirectories based on file type
    if (file.fieldname === 'avatar') {
      uploadPath = path.join(uploadsDir, 'avatars');
    } else if (file.fieldname === 'serviceImages') {
      uploadPath = path.join(uploadsDir, 'services');
    } else {
      uploadPath = path.join(uploadsDir, 'misc');
    }
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    const filename = file.fieldname + '-' + uniqueSuffix + extension;
    cb(null, filename);
  }
});

// File filter for images
const fileFilter = (req, file, cb) => {
  // Accept images only
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 10 // Maximum 10 files
  }
});

// @desc    Upload avatar
// @route   POST /api/upload/avatar
// @access  Private
router.post('/avatar', protect, upload.single('avatar'), (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Generate file URL
    const fileUrl = `/uploads/avatars/${req.file.filename}`;

    res.status(200).json({
      success: true,
      message: 'Avatar uploaded successfully',
      data: {
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        url: fileUrl
      }
    });

  } catch (error) {
    next(error);
  }
});

// @desc    Upload service images
// @route   POST /api/upload/service-images
// @access  Private
router.post('/service-images', protect, upload.array('serviceImages', 5), (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No files uploaded'
      });
    }

    // Process uploaded files
    const uploadedFiles = req.files.map(file => ({
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
      url: `/uploads/services/${file.filename}`
    }));

    res.status(200).json({
      success: true,
      message: 'Service images uploaded successfully',
      data: {
        files: uploadedFiles,
        count: uploadedFiles.length
      }
    });

  } catch (error) {
    next(error);
  }
});

// @desc    Upload multiple files
// @route   POST /api/upload/multiple
// @access  Private
router.post('/multiple', protect, upload.array('files', 10), (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No files uploaded'
      });
    }

    // Process uploaded files
    const uploadedFiles = req.files.map(file => {
      let subfolder = 'misc';
      if (file.fieldname === 'avatar') subfolder = 'avatars';
      else if (file.fieldname === 'serviceImages') subfolder = 'services';

      return {
        filename: file.filename,
        originalName: file.originalname,
        size: file.size,
        url: `/uploads/${subfolder}/${file.filename}`,
        type: file.mimetype
      };
    });

    res.status(200).json({
      success: true,
      message: 'Files uploaded successfully',
      data: {
        files: uploadedFiles,
        count: uploadedFiles.length
      }
    });

  } catch (error) {
    next(error);
  }
});

// @desc    Delete uploaded file
// @route   DELETE /api/upload/:filename
// @access  Private
router.delete('/:filename', protect, (req, res, next) => {
  try {
    const { filename } = req.params;
    
    // Search for file in all upload directories
    const searchDirs = ['avatars', 'services', 'misc'];
    let filePath = null;
    
    for (const dir of searchDirs) {
      const testPath = path.join(uploadsDir, dir, filename);
      if (fs.existsSync(testPath)) {
        filePath = testPath;
        break;
      }
    }
    
    if (!filePath) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }

    // Delete the file
    fs.unlinkSync(filePath);

    res.status(200).json({
      success: true,
      message: 'File deleted successfully'
    });

  } catch (error) {
    next(error);
  }
});

// Error handling middleware for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 5MB.'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Maximum is 10 files.'
      });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected file field.'
      });
    }
  }
  
  if (error.message === 'Only image files are allowed!') {
    return res.status(400).json({
      success: false,
      message: 'Only image files are allowed.'
    });
  }

  next(error);
});

module.exports = router;
