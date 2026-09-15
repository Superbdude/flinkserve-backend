const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const validator = require('validator');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [100, 'Name cannot be more than 100 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    validate: [validator.isEmail, 'Please provide a valid email']
  },
  phone: {
    type: String,
    // Only required for email/password accounts. Google/Facebook users may not
    // expose a phone number, so requiring it would block their signup.
    required: function() {
      return this.authProvider === 'local';
    },
    validate: {
      validator: function(v) {
        if (v === undefined || v === null || v === '') return true;
        // More flexible phone validation - supports international formats
        // Allows numbers with or without + prefix, 7-15 digits total
        return /^\+?[0-9]{7,15}$/.test(String(v).replace(/[\s-()]/g, ''));
      },
      message: 'Please provide a valid phone number (7-15 digits, optionally starting with +)'
    }
  },
  password: {
    type: String,
    // Social accounts authenticate through their provider, not a password.
    required: function() {
      return this.authProvider === 'local';
    },
    minlength: [6, 'Password must be at least 6 characters'],
    select: false // Don't include password in queries by default
  },
  // How this account authenticates: local = email + password
  authProvider: {
    type: String,
    enum: ['local', 'google', 'facebook'],
    default: 'local'
  },
  // The provider's unique user id (Google "sub", Facebook "id")
  providerId: {
    type: String,
    default: null
  },
  role: {
    type: String,
    enum: ['service_seeker', 'service_provider', 'admin'],
    default: 'service_seeker'
  },
  avatar: {
    type: String,
    default: null
  },
  location: {
    address: {
      type: String,
      // Required for local signups only; social signups may fill this in later.
      required: function() {
        return this.authProvider === 'local';
      }
    },
    coordinates: {
      lat: {
        type: Number,
        required: function() {
          return this.authProvider === 'local';
        }
      },
      lng: {
        type: Number,
        required: function() {
          return this.authProvider === 'local';
        }
      }
    },
    city: String,
    state: String,
    country: {
      type: String,
      default: 'Nigeria'
    }
  },
  // Provider-specific fields
  providerProfile: {
    bio: String,
    skills: [String],
    experience: Number, // years
    hourlyRate: Number,
    availability: {
      type: String,
      enum: ['full-time', 'part-time', 'weekends', 'evenings', 'flexible'],
      default: 'flexible'
    },
    serviceRadius: {
      type: Number, // kilometers
      default: 10
    },
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    totalReviews: {
      type: Number,
      default: 0
    },
    completedJobs: {
      type: Number,
      default: 0
    },
    isVerified: {
      type: Boolean,
      default: false
    },
    verificationDocuments: [{
      type: String,
      url: String,
      status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
      }
    }]
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: Date,
  emailVerified: {
    type: Boolean,
    default: false
  },
  phoneVerified: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
userSchema.index({ 'location.coordinates': '2dsphere' });
userSchema.index({ role: 1 });
// Fast lookup for social sign-ins
userSchema.index({ authProvider: 1, providerId: 1 });

// Virtual for services count (for providers)
userSchema.virtual('servicesCount', {
  ref: 'Service',
  localField: '_id',
  foreignField: 'provider',
  count: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  // Social accounts have no password to hash.
  if (!this.password || !this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  // Social accounts cannot log in with a password.
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

// Update provider rating
userSchema.methods.updateRating = async function() {
  const Review = mongoose.model('Review');
  const stats = await Review.aggregate([
    { $match: { provider: this._id } },
    {
      $group: {
        _id: null,
        avgRating: { $avg: '$rating' },
        totalReviews: { $sum: 1 }
      }
    }
  ]);

  if (stats.length > 0) {
    this.providerProfile.rating = Math.round(stats[0].avgRating * 10) / 10;
    this.providerProfile.totalReviews = stats[0].totalReviews;
  } else {
    this.providerProfile.rating = 0;
    this.providerProfile.totalReviews = 0;
  }

  await this.save();
};

// Transform _id to id and remove __v when converting to JSON
userSchema.set('toJSON', {
  transform: function(doc, ret) {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('User', userSchema);
