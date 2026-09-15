const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { verifySocialToken } = require('../utils/socialAuth');

const router = express.Router();

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '30d'
  });
};

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
router.post('/register', [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
  body('phone')
    .matches(/^\+?[0-9]{7,15}$/)
    .withMessage('Please provide a valid phone number (7-15 digits, optionally starting with +)'),
  body('role')
    .isIn(['service_seeker', 'service_provider'])
    .withMessage('Role must be either service_seeker or service_provider'),
  body('location.address')
    .notEmpty()
    .withMessage('Address is required'),
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

    const { 
      name, 
      email, 
      password, 
      phone, 
      role, 
      location,
      providerProfile 
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [{ email }, { phone }] 
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email or phone already exists'
      });
    }

    // Create user data
    const userData = {
      name,
      email,
      password,
      phone,
      role,
      location
    };

    // Add provider profile if role is service_provider
    if (role === 'service_provider' && providerProfile) {
      userData.providerProfile = {
        bio: providerProfile.bio || '',
        skills: providerProfile.skills || [],
        experience: providerProfile.experience || 0,
        hourlyRate: providerProfile.hourlyRate || 0,
        availability: providerProfile.availability || 'flexible',
        serviceRadius: providerProfile.serviceRadius || 10
      };
    }

    // Create user
    const user = await User.create(userData);

    // Generate token
    const token = generateToken(user._id);

    // Remove password from response
    user.password = undefined;

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user,
        token
      }
    });

  } catch (error) {
    next(error);
  }
});

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
router.post('/login', [
  body('email')
    .notEmpty()
    .withMessage('Email or phone number is required')
    .custom((value) => {
      // Check if it's a valid email OR phone number
      const isEmail = value.includes('@') && /\S+@\S+\.\S+/.test(value);
      const isPhone = /^\+?[0-9]{7,15}$/.test(value.replace(/[\s-()]/g, ''));
      
      if (!isEmail && !isPhone) {
        throw new Error('Please provide a valid email address or phone number');
      }
      return true;
    }),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  body('role')
    .isIn(['service_seeker', 'service_provider'])
    .withMessage('Role must be either service_seeker or service_provider')
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

    const { email, password, role } = req.body;

    // Check if user exists by email OR phone
    let user;
    if (email.includes('@')) {
      // If input contains @, treat as email
      user = await User.findOne({ email }).select('+password');
    } else {
      // Otherwise, treat as phone number
      const cleanPhone = email.replace(/[\s-()]/g, ''); // Clean the phone input
      user = await User.findOne({ phone: cleanPhone }).select('+password');
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if role matches
    if (user.role !== role) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials or role mismatch'
      });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account has been deactivated. Please contact support.'
      });
    }

    // Check password
    const isPasswordCorrect = await user.comparePassword(password);

    if (!isPasswordCorrect) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    // Remove password from response
    user.password = undefined;

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user,
        token
      }
    });

  } catch (error) {
    next(error);
  }
});

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
router.get('/me', protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('servicesCount');

    res.status(200).json({
      success: true,
      data: {
        user
      }
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
router.put('/profile', protect, [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('phone')
    .optional()
    .matches(/^\+?[0-9]{7,15}$/)
    .withMessage('Please provide a valid phone number (7-15 digits, optionally starting with +)'),
  body('location.address')
    .optional()
    .notEmpty()
    .withMessage('Address cannot be empty'),
  body('location.coordinates.lat')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Valid latitude is required'),
  body('location.coordinates.lng')
    .optional()
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

    const allowedFields = [
      'name', 
      'phone', 
      'avatar', 
      'location', 
      'providerProfile'
    ];

    const updateData = {};
    
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    // Check if phone number is already taken by another user
    if (updateData.phone) {
      const existingUser = await User.findOne({ 
        phone: updateData.phone,
        _id: { $ne: req.user.id }
      });

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Phone number already in use'
        });
      }
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      updateData,
      {
        new: true,
        runValidators: true
      }
    );

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user
      }
    });

  } catch (error) {
    next(error);
  }
});

// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
router.put('/change-password', protect, [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters')
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

    const { currentPassword, newPassword } = req.body;

    // Get user with password
    const user = await User.findById(req.user.id).select('+password');

    // Check current password
    const isCurrentPasswordCorrect = await user.comparePassword(currentPassword);

    if (!isCurrentPasswordCorrect) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    next(error);
  }
});

// @desc    Logout user (client-side token removal)
// @route   POST /api/auth/logout
// @access  Private
router.post('/logout', protect, (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
});

// @desc    Authenticate (or sign up) with Google / Facebook
// @route   POST /api/auth/social
// @access  Public
router.post('/social', [
  body('provider')
    .isIn(['google', 'facebook'])
    .withMessage('Provider must be either google or facebook'),
  body('role')
    .optional()
    .isIn(['service_seeker', 'service_provider'])
    .withMessage('Role must be either service_seeker or service_provider')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { provider, idToken, accessToken, role } = req.body;

    // 1. Verify the credential with the provider itself.
    let profile;
    try {
      profile = await verifySocialToken(provider, { idToken, accessToken });
    } catch (verificationError) {
      return res.status(verificationError.statusCode || 401).json({
        success: false,
        message: verificationError.message || 'Social sign-in failed'
      });
    }

    // Facebook users may not share an email address. Fall back to a stable
    // placeholder so the unique email requirement is still satisfied.
    const email = profile.email || `${provider}_${profile.providerId}@social.flinkserve.local`;

    // 2. Look the account up by provider id, then by email (account linking).
    let user = await User.findOne({ authProvider: provider, providerId: profile.providerId });
    let isNewUser = false;

    if (!user && profile.email) {
      user = await User.findOne({ email });
      if (user) {
        // Existing local account with the same verified email — link it so the
        // user can sign in with either method from now on.
        user.authProvider = provider;
        user.providerId = profile.providerId;
        if (!user.avatar && profile.avatar) user.avatar = profile.avatar;
        await user.save();
      }
    }

    // 3. Create the account when this is a first-time social sign-in.
    if (!user) {
      isNewUser = true;
      user = await User.create({
        name: profile.name,
        email,
        avatar: profile.avatar || null,
        role: role || 'service_seeker',
        authProvider: provider,
        providerId: profile.providerId,
        emailVerified: Boolean(profile.emailVerified),
        lastLogin: new Date()
      });
    } else {
      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Account has been deactivated. Please contact support.'
        });
      }
      user.lastLogin = new Date();
      await user.save();
    }

    const token = generateToken(user._id);

    return res.status(isNewUser ? 201 : 200).json({
      success: true,
      message: isNewUser ? 'Account created successfully' : 'Login successful',
      isNewUser,
      data: { user, token }
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
