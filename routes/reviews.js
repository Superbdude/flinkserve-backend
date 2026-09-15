const express = require('express');
const { body, query, validationResult } = require('express-validator');
const Review = require('../models/Review');
const Booking = require('../models/Booking');
const Service = require('../models/Service');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// @desc    Create new review
// @route   POST /api/reviews
// @access  Private (Service Seekers only)
router.post('/', protect, authorize('service_seeker'), [
  body('booking')
    .isMongoId()
    .withMessage('Valid booking ID is required'),
  body('service')
    .isMongoId()
    .withMessage('Valid service ID is required'),
  body('provider')
    .isMongoId()
    .withMessage('Valid provider ID is required'),
  body('rating')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  body('comment')
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Comment must be between 10 and 1000 characters')
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

    // Check if booking exists and is completed
    const booking = await Booking.findById(req.body.booking);
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    if (booking.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Can only review completed bookings'
      });
    }

    // Check if user is the customer of this booking
    if (booking.customer.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to review this booking'
      });
    }

    // Check if review already exists for this booking
    const existingReview = await Review.findOne({ booking: req.body.booking });
    
    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: 'Review already exists for this booking'
      });
    }

    // Create review
    const review = await Review.create({
      ...req.body,
      customer: req.user.id
    });

    // Populate review data
    await review.populate([
      { path: 'customer', select: 'name avatar' },
      { path: 'provider', select: 'name avatar' },
      { path: 'service', select: 'title category' },
      { path: 'booking', select: 'scheduledDate completedAt' }
    ]);

    // Update service rating
    await updateServiceRating(req.body.service);

    // Update provider rating
    await updateProviderRating(req.body.provider);

    res.status(201).json({
      success: true,
      message: 'Review created successfully',
      data: {
        review
      }
    });

  } catch (error) {
    next(error);
  }
});

// @desc    Get reviews for a service
// @route   GET /api/reviews/service/:serviceId
// @access  Public
router.get('/service/:serviceId', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
  query('rating').optional().isInt({ min: 1, max: 5 }),
  query('sortBy').optional().isIn(['rating', 'date']),
  query('order').optional().isIn(['asc', 'desc'])
], async (req, res, next) => {
  try {
    const { page = 1, limit = 10, rating, sortBy = 'date', order = 'desc' } = req.query;

    // Build query
    let query = { service: req.params.serviceId };
    
    if (rating) {
      query.rating = parseInt(rating);
    }

    // Build sort options
    let sortOptions = {};
    if (sortBy === 'rating') {
      sortOptions.rating = order === 'asc' ? 1 : -1;
    } else {
      sortOptions.createdAt = order === 'asc' ? 1 : -1;
    }

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const reviews = await Review.find(query)
      .populate('customer', 'name avatar')
      .populate('service', 'title')
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum);

    const total = await Review.countDocuments(query);

    // Get rating distribution
    const ratingStats = await Review.aggregate([
      { $match: { service: req.params.serviceId } },
      { $group: { _id: '$rating', count: { $sum: 1 } } },
      { $sort: { _id: -1 } }
    ]);

    const ratingDistribution = {};
    for (let i = 1; i <= 5; i++) {
      ratingDistribution[i] = 0;
    }
    ratingStats.forEach(stat => {
      ratingDistribution[stat._id] = stat.count;
    });

    res.status(200).json({
      success: true,
      data: {
        reviews,
        pagination: {
          current: pageNum,
          total: Math.ceil(total / limitNum),
          count: reviews.length,
          totalReviews: total
        },
        ratingDistribution
      }
    });

  } catch (error) {
    next(error);
  }
});

// @desc    Get reviews for a provider
// @route   GET /api/reviews/provider/:providerId
// @access  Public
router.get('/provider/:providerId', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
  query('rating').optional().isInt({ min: 1, max: 5 })
], async (req, res, next) => {
  try {
    const { page = 1, limit = 10, rating } = req.query;

    // Build query
    let query = { provider: req.params.providerId };
    
    if (rating) {
      query.rating = parseInt(rating);
    }

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const reviews = await Review.find(query)
      .populate('customer', 'name avatar')
      .populate('service', 'title category')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await Review.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        reviews,
        pagination: {
          current: pageNum,
          total: Math.ceil(total / limitNum),
          count: reviews.length,
          totalReviews: total
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

// @desc    Get single review
// @route   GET /api/reviews/:id
// @access  Public
router.get('/:id', async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id)
      .populate('customer', 'name avatar')
      .populate('provider', 'name avatar')
      .populate('service', 'title category')
      .populate('booking', 'scheduledDate completedAt');

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        review
      }
    });

  } catch (error) {
    next(error);
  }
});

// @desc    Update review
// @route   PUT /api/reviews/:id
// @access  Private (Review author only)
router.put('/:id', protect, [
  body('rating')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  body('comment')
    .optional()
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Comment must be between 10 and 1000 characters')
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

    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    // Check if user owns the review
    if (review.customer.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this review'
      });
    }

    // Check if review is within edit window (e.g., 30 days)
    const editDeadline = new Date(review.createdAt);
    editDeadline.setDate(editDeadline.getDate() + 30);
    
    if (new Date() > editDeadline) {
      return res.status(400).json({
        success: false,
        message: 'Review edit period has expired'
      });
    }

    // Update review
    const updatedReview = await Review.findByIdAndUpdate(
      req.params.id,
      { 
        ...req.body,
        updatedAt: new Date()
      },
      { new: true, runValidators: true }
    ).populate([
      { path: 'customer', select: 'name avatar' },
      { path: 'provider', select: 'name avatar' },
      { path: 'service', select: 'title category' }
    ]);

    // Update service and provider ratings if rating changed
    if (req.body.rating) {
      await updateServiceRating(review.service);
      await updateProviderRating(review.provider);
    }

    res.status(200).json({
      success: true,
      message: 'Review updated successfully',
      data: {
        review: updatedReview
      }
    });

  } catch (error) {
    next(error);
  }
});

// @desc    Delete review
// @route   DELETE /api/reviews/:id
// @access  Private (Review author only)
router.delete('/:id', protect, async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    // Check if user owns the review
    if (review.customer.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this review'
      });
    }

    await review.deleteOne();

    // Update service and provider ratings
    await updateServiceRating(review.service);
    await updateProviderRating(review.provider);

    res.status(200).json({
      success: true,
      message: 'Review deleted successfully'
    });

  } catch (error) {
    next(error);
  }
});

// @desc    Get my reviews (as customer)
// @route   GET /api/reviews/my/given
// @access  Private (Service Seekers only)
router.get('/my/given', protect, authorize('service_seeker'), async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const reviews = await Review.find({ customer: req.user.id })
      .populate('provider', 'name avatar')
      .populate('service', 'title category images')
      .populate('booking', 'scheduledDate completedAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await Review.countDocuments({ customer: req.user.id });

    res.status(200).json({
      success: true,
      data: {
        reviews,
        pagination: {
          current: pageNum,
          total: Math.ceil(total / limitNum),
          count: reviews.length,
          totalReviews: total
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

// @desc    Get reviews received (as provider)
// @route   GET /api/reviews/my/received
// @access  Private (Service Providers only)
router.get('/my/received', protect, authorize('service_provider'), async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const reviews = await Review.find({ provider: req.user.id })
      .populate('customer', 'name avatar')
      .populate('service', 'title category')
      .populate('booking', 'scheduledDate completedAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await Review.countDocuments({ provider: req.user.id });

    res.status(200).json({
      success: true,
      data: {
        reviews,
        pagination: {
          current: pageNum,
          total: Math.ceil(total / limitNum),
          count: reviews.length,
          totalReviews: total
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

// Helper function to update service rating
async function updateServiceRating(serviceId) {
  try {
    const stats = await Review.aggregate([
      { $match: { service: serviceId } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: '$rating' },
          totalReviews: { $sum: 1 }
        }
      }
    ]);

    if (stats.length > 0) {
      await Service.findByIdAndUpdate(serviceId, {
        'rating.average': Math.round(stats[0].averageRating * 10) / 10,
        'rating.count': stats[0].totalReviews
      });
    } else {
      await Service.findByIdAndUpdate(serviceId, {
        'rating.average': 0,
        'rating.count': 0
      });
    }
  } catch (error) {
    console.error('Error updating service rating:', error);
  }
}

// Helper function to update provider rating
async function updateProviderRating(providerId) {
  try {
    const stats = await Review.aggregate([
      { $match: { provider: providerId } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: '$rating' },
          totalReviews: { $sum: 1 }
        }
      }
    ]);

    if (stats.length > 0) {
      await User.findByIdAndUpdate(providerId, {
        'providerProfile.rating': Math.round(stats[0].averageRating * 10) / 10,
        'providerProfile.totalReviews': stats[0].totalReviews
      });
    } else {
      await User.findByIdAndUpdate(providerId, {
        'providerProfile.rating': 0,
        'providerProfile.totalReviews': 0
      });
    }
  } catch (error) {
    console.error('Error updating provider rating:', error);
  }
}

module.exports = router;
