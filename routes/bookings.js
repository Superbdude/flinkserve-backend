const express = require('express');
const { body, query, validationResult } = require('express-validator');
const Booking = require('../models/Booking');
const Service = require('../models/Service');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// @desc    Create new booking
// @route   POST /api/bookings
// @access  Private (Service Seekers only)
router.post('/', protect, authorize('service_seeker'), [
  body('service')
    .isMongoId()
    .withMessage('Valid service ID is required'),
  body('scheduledDate')
    .isISO8601()
    .withMessage('Valid scheduled date is required')
    .custom((value) => {
      const date = new Date(value);
      const now = new Date();
      if (date <= now) {
        throw new Error('Scheduled date must be in the future');
      }
      return true;
    }),
  body('message')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Message cannot exceed 500 characters'),
  body('location.address')
    .notEmpty()
    .withMessage('Service location is required'),
  body('location.coordinates.lat')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Valid latitude required'),
  body('location.coordinates.lng')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Valid longitude required')
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

    // Check if service exists and is active
    const service = await Service.findById(req.body.service).populate('provider');
    
    if (!service || service.status !== 'active') {
      return res.status(404).json({
        success: false,
        message: 'Service not found or unavailable'
      });
    }

    // Check if user is trying to book their own service
    if (service.provider._id.toString() === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot book your own service'
      });
    }

    // Create booking
    const booking = await Booking.create({
      ...req.body,
      customer: req.user.id,
      provider: service.provider._id,
      totalAmount: service.pricing.amount
    });

    // Populate booking data
    await booking.populate([
      { path: 'customer', select: 'name avatar phone email' },
      { path: 'provider', select: 'name avatar phone email' },
      { path: 'service', select: 'title category pricing images' }
    ]);

    // Update service stats
    await Service.findByIdAndUpdate(req.body.service, {
      $inc: { 'stats.bookings': 1 }
    });

    res.status(201).json({
      success: true,
      message: 'Booking created successfully',
      data: {
        booking
      }
    });

  } catch (error) {
    next(error);
  }
});

// @desc    Get all bookings (for current user)
// @route   GET /api/bookings
// @access  Private
router.get('/', protect, [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isIn(['pending', 'confirmed', 'in_progress', 'completed', 'cancelled']),
  query('role').optional().isIn(['customer', 'provider'])
], async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status, role } = req.query;

    // Build query based on user role and requested role filter
    let query = {};

    if (role) {
      // User specified role filter
      if (role === 'customer') {
        query.customer = req.user.id;
      } else if (role === 'provider') {
        query.provider = req.user.id;
      }
    } else {
      // Show bookings where user is either customer or provider
      query.$or = [
        { customer: req.user.id },
        { provider: req.user.id }
      ];
    }

    // Status filter
    if (status) {
      query.status = status;
    }

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const bookings = await Booking.find(query)
      .populate('customer', 'name avatar phone email')
      .populate('provider', 'name avatar phone email')
      .populate('service', 'title category pricing images')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await Booking.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        bookings,
        pagination: {
          current: pageNum,
          total: Math.ceil(total / limitNum),
          count: bookings.length,
          totalBookings: total
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

// @desc    Get single booking
// @route   GET /api/bookings/:id
// @access  Private (Customer or Provider of the booking)
router.get('/:id', protect, async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('customer', 'name avatar phone email')
      .populate('provider', 'name avatar phone email')
      .populate('service', 'title category pricing images description');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if user is authorized to view this booking
    if (booking.customer._id.toString() !== req.user.id && 
        booking.provider._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this booking'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        booking
      }
    });

  } catch (error) {
    next(error);
  }
});

// @desc    Update booking status
// @route   PUT /api/bookings/:id/status
// @access  Private (Provider only)
router.put('/:id/status', protect, authorize('service_provider'), [
  body('status')
    .isIn(['confirmed', 'in_progress', 'completed', 'cancelled'])
    .withMessage('Invalid status'),
  body('message')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Message cannot exceed 500 characters')
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

    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if user is the provider of this booking
    if (booking.provider.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this booking'
      });
    }

    // Update booking status
    booking.status = req.body.status;
    
    // Add status change to history
    booking.statusHistory.push({
      status: req.body.status,
      changedBy: req.user.id,
      message: req.body.message,
      changedAt: new Date()
    });

    // Set completion date if completed
    if (req.body.status === 'completed') {
      booking.completedAt = new Date();
    }

    await booking.save();

    // Populate booking data
    await booking.populate([
      { path: 'customer', select: 'name avatar phone email' },
      { path: 'provider', select: 'name avatar phone email' },
      { path: 'service', select: 'title category pricing images' }
    ]);

    res.status(200).json({
      success: true,
      message: 'Booking status updated successfully',
      data: {
        booking
      }
    });

  } catch (error) {
    next(error);
  }
});

// @desc    Cancel booking
// @route   PUT /api/bookings/:id/cancel
// @access  Private (Customer or Provider)
router.put('/:id/cancel', protect, [
  body('reason')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Cancellation reason cannot exceed 500 characters')
], async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if user is authorized to cancel this booking
    if (booking.customer.toString() !== req.user.id && 
        booking.provider.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to cancel this booking'
      });
    }

    // Check if booking can be cancelled
    if (['completed', 'cancelled'].includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel a completed or already cancelled booking'
      });
    }

    // Update booking status
    booking.status = 'cancelled';
    booking.cancelledAt = new Date();
    booking.cancelledBy = req.user.id;
    booking.cancellationReason = req.body.reason;

    // Add to status history
    booking.statusHistory.push({
      status: 'cancelled',
      changedBy: req.user.id,
      message: req.body.reason || 'Booking cancelled',
      changedAt: new Date()
    });

    await booking.save();

    // Populate booking data
    await booking.populate([
      { path: 'customer', select: 'name avatar phone email' },
      { path: 'provider', select: 'name avatar phone email' },
      { path: 'service', select: 'title category pricing images' }
    ]);

    res.status(200).json({
      success: true,
      message: 'Booking cancelled successfully',
      data: {
        booking
      }
    });

  } catch (error) {
    next(error);
  }
});

// @desc    Get booking statistics
// @route   GET /api/bookings/stats
// @access  Private
router.get('/stats/overview', protect, async (req, res, next) => {
  try {
    let stats = {};

    if (req.user.role === 'service_provider') {
      // Provider stats
      const [total, pending, confirmed, inProgress, completed, cancelled, revenue] = await Promise.all([
        Booking.countDocuments({ provider: req.user.id }),
        Booking.countDocuments({ provider: req.user.id, status: 'pending' }),
        Booking.countDocuments({ provider: req.user.id, status: 'confirmed' }),
        Booking.countDocuments({ provider: req.user.id, status: 'in_progress' }),
        Booking.countDocuments({ provider: req.user.id, status: 'completed' }),
        Booking.countDocuments({ provider: req.user.id, status: 'cancelled' }),
        Booking.aggregate([
          { $match: { provider: req.user._id, status: 'completed' } },
          { $group: { _id: null, total: { $sum: '$totalAmount' } } }
        ])
      ]);

      stats = {
        totalBookings: total,
        pendingBookings: pending,
        confirmedBookings: confirmed,
        inProgressBookings: inProgress,
        completedBookings: completed,
        cancelledBookings: cancelled,
        totalRevenue: revenue.length > 0 ? revenue[0].total : 0,
        completionRate: total > 0 ? ((completed / total) * 100).toFixed(2) : 0
      };
    } else {
      // Customer stats
      const [total, pending, confirmed, inProgress, completed, cancelled] = await Promise.all([
        Booking.countDocuments({ customer: req.user.id }),
        Booking.countDocuments({ customer: req.user.id, status: 'pending' }),
        Booking.countDocuments({ customer: req.user.id, status: 'confirmed' }),
        Booking.countDocuments({ customer: req.user.id, status: 'in_progress' }),
        Booking.countDocuments({ customer: req.user.id, status: 'completed' }),
        Booking.countDocuments({ customer: req.user.id, status: 'cancelled' })
      ]);

      stats = {
        totalBookings: total,
        pendingBookings: pending,
        confirmedBookings: confirmed,
        inProgressBookings: inProgress,
        completedBookings: completed,
        cancelledBookings: cancelled
      };
    }

    res.status(200).json({
      success: true,
      data: {
        stats
      }
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router;
