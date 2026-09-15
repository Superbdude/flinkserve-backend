const express = require('express');
const { body, query, validationResult } = require('express-validator');
const Service = require('../models/Service');
const User = require('../models/User');
const { protect, authorize, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// @desc    Get all services with filtering and pagination
// @route   GET /api/services
// @access  Public
router.get('/', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('category').optional().trim(),
  query('search').optional().trim(),
  query('location').optional().trim(),
  query('minPrice').optional().isFloat({ min: 0 }).withMessage('Minimum price must be positive'),
  query('maxPrice').optional().isFloat({ min: 0 }).withMessage('Maximum price must be positive'),
  query('rating').optional().isFloat({ min: 0, max: 5 }).withMessage('Rating must be between 0 and 5'),
  query('sortBy').optional().isIn(['price', 'rating', 'created', 'popularity']).withMessage('Invalid sort option'),
  query('order').optional().isIn(['asc', 'desc']).withMessage('Order must be asc or desc'),
  query('lat').optional().isFloat({ min: -90, max: 90 }).withMessage('Valid latitude required'),
  query('lng').optional().isFloat({ min: -180, max: 180 }).withMessage('Valid longitude required'),
  query('radius').optional().isFloat({ min: 0 }).withMessage('Radius must be positive')
], async (req, res, next) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      page = 1,
      limit = 10,
      category,
      search,
      location,
      minPrice,
      maxPrice,
      rating,
      availability,
      features = [],
      sortBy = 'created',
      order = 'desc',
      lat,
      lng,
      radius = 25
    } = req.query;

    // Build query
    let query = { status: 'active' };

    // Category filter
    if (category && category !== 'All Categories') {
      query.category = category;
    }

    // Price range filter
    if (minPrice || maxPrice) {
      query['pricing.amount'] = {};
      if (minPrice) query['pricing.amount'].$gte = parseFloat(minPrice);
      if (maxPrice) query['pricing.amount'].$lte = parseFloat(maxPrice);
    }

    // Rating filter
    if (rating) {
      query['rating.average'] = { $gte: parseFloat(rating) };
    }

    // Location-based search
    if (lat && lng) {
      query['location.coordinates'] = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)]
          },
          $maxDistance: parseFloat(radius) * 1000 // Convert km to meters
        }
      };
    } else if (location) {
      query.$or = [
        { 'location.address': { $regex: location, $options: 'i' } },
        { 'location.city': { $regex: location, $options: 'i' } },
        { 'location.state': { $regex: location, $options: 'i' } }
      ];
    }

    // Text search
    if (search) {
      query.$text = { $search: search };
    }

    // Features filter
    if (features.length > 0) {
      const featuresArray = Array.isArray(features) ? features : [features];
      query.features = { $in: featuresArray };
    }

    // Availability filter (simplified)
    if (availability) {
      switch (availability) {
        case 'Available today':
          query.$or = [
            { 'availability.emergencyService': true },
            { features: { $regex: '24/7', $options: 'i' } }
          ];
          break;
        case 'Available weekends':
          query.$or = [
            { 'availability.schedule.saturday.available': true },
            { 'availability.schedule.sunday.available': true }
          ];
          break;
        case 'Emergency service':
          query.$or = [
            { 'availability.emergencyService': true },
            { features: { $regex: 'emergency', $options: 'i' } }
          ];
          break;
      }
    }

    // Build sort options
    let sortOptions = {};
    switch (sortBy) {
      case 'price':
        sortOptions['pricing.amount'] = order === 'asc' ? 1 : -1;
        break;
      case 'rating':
        sortOptions['rating.average'] = order === 'asc' ? 1 : -1;
        break;
      case 'popularity':
        sortOptions['stats.bookings'] = order === 'asc' ? 1 : -1;
        break;
      default:
        sortOptions.createdAt = order === 'asc' ? 1 : -1;
    }

    // Add text score for search queries
    if (search) {
      sortOptions.score = { $meta: 'textScore' };
    }

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Execute query
    const services = await Service.find(query)
      .populate('provider', 'name avatar location providerProfile.rating providerProfile.totalReviews providerProfile.isVerified')
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Get total count for pagination
    const total = await Service.countDocuments(query);

    // Calculate pagination info
    const totalPages = Math.ceil(total / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;

    res.status(200).json({
      success: true,
      data: {
        services,
        pagination: {
          current: pageNum,
          total: totalPages,
          count: services.length,
          totalServices: total,
          hasNext: hasNextPage,
          hasPrev: hasPrevPage
        },
        filters: {
          category,
          search,
          location,
          priceRange: [minPrice || 0, maxPrice || 999999],
          rating,
          availability,
          features
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

// @desc    Get single service
// @route   GET /api/services/:id
// @access  Public
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const service = await Service.findById(req.params.id)
      .populate('provider', 'name avatar location providerProfile phone email')
      .populate({
        path: 'reviews',
        options: { sort: { createdAt: -1 }, limit: 10 },
        populate: {
          path: 'customer',
          select: 'name avatar'
        }
      });

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    // Increment view count
    await service.incrementViews();

    res.status(200).json({
      success: true,
      data: {
        service
      }
    });

  } catch (error) {
    next(error);
  }
});

// @desc    Create new service
// @route   POST /api/services
// @access  Private (Service Providers only)
router.post('/', protect, authorize('service_provider'), [
  body('title')
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('Title must be between 3 and 100 characters'),
  body('description')
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Description must be between 10 and 1000 characters'),
  body('category')
    .notEmpty()
    .withMessage('Category is required'),
  body('pricing.type')
    .isIn(['fixed', 'hourly', 'per_visit', 'per_project'])
    .withMessage('Invalid pricing type'),
  body('pricing.amount')
    .isFloat({ min: 0 })
    .withMessage('Price must be a positive number'),
  body('location.address')
    .notEmpty()
    .withMessage('Service location is required'),
  body('location.coordinates.lat')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Valid latitude is required'),
  body('location.coordinates.lng')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Valid longitude is required')
], async (req, res, next) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    // Add provider to service data
    const serviceData = {
      ...req.body,
      provider: req.user.id
    };

    const service = await Service.create(serviceData);

    // Populate provider data
    await service.populate('provider', 'name avatar location providerProfile');

    res.status(201).json({
      success: true,
      message: 'Service created successfully',
      data: {
        service
      }
    });

  } catch (error) {
    next(error);
  }
});

// @desc    Update service
// @route   PUT /api/services/:id
// @access  Private (Service Providers only - own services)
router.put('/:id', protect, authorize('service_provider'), [
  body('title')
    .optional()
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('Title must be between 3 and 100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Description must be between 10 and 1000 characters'),
  body('pricing.amount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Price must be a positive number')
], async (req, res, next) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    let service = await Service.findById(req.params.id);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    // Check if user owns the service
    if (service.provider.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this service'
      });
    }

    service = await Service.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true
      }
    ).populate('provider', 'name avatar location providerProfile');

    res.status(200).json({
      success: true,
      message: 'Service updated successfully',
      data: {
        service
      }
    });

  } catch (error) {
    next(error);
  }
});

// @desc    Delete service
// @route   DELETE /api/services/:id
// @access  Private (Service Providers only - own services)
router.delete('/:id', protect, authorize('service_provider'), async (req, res, next) => {
  try {
    const service = await Service.findById(req.params.id);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    // Check if user owns the service
    if (service.provider.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this service'
      });
    }

    await service.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Service deleted successfully'
    });

  } catch (error) {
    next(error);
  }
});

// @desc    Get services by provider
// @route   GET /api/services/provider/:providerId
// @access  Public
router.get('/provider/:providerId', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isIn(['active', 'inactive', 'all'])
], async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status = 'active' } = req.query;

    // Build query
    let query = { provider: req.params.providerId };
    
    if (status !== 'all') {
      query.status = status;
    }

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const services = await Service.find(query)
      .populate('provider', 'name avatar providerProfile')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await Service.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        services,
        pagination: {
          current: pageNum,
          total: Math.ceil(total / limitNum),
          count: services.length,
          totalServices: total
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

// @desc    Get my services (for logged-in providers)
// @route   GET /api/services/my-services
// @access  Private (Service Providers only)
router.get('/my/services', protect, authorize('service_provider'), async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status = 'all' } = req.query;

    // Build query
    let query = { provider: req.user.id };
    
    if (status !== 'all') {
      query.status = status;
    }

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const services = await Service.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await Service.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        services,
        pagination: {
          current: pageNum,
          total: Math.ceil(total / limitNum),
          count: services.length,
          totalServices: total
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router;
