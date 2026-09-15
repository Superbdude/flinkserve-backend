const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Service title is required'],
    trim: true,
    maxlength: [100, 'Title cannot be more than 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Service description is required'],
    maxlength: [1000, 'Description cannot be more than 1000 characters']
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: [
      'Home Cleaning',
      'Plumbing',
      'Electrical',
      'Landscaping',
      'Fitness',
      'Tutoring',
      'Pet Care',
      'Beauty & Wellness',
      'Photography',
      'Catering',
      'Technology',
      'Auto Services',
      'Home Repair',
      'Moving',
      'Security',
      'Other'
    ]
  },
  subcategory: {
    type: String,
    trim: true
  },
  provider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  pricing: {
    type: {
      type: String,
      enum: ['fixed', 'hourly', 'per_visit', 'per_project'],
      required: true
    },
    amount: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price cannot be negative']
    },
    currency: {
      type: String,
      default: 'NGN'
    }
  },
  location: {
    address: {
      type: String,
      required: [true, 'Service location is required']
    },
    coordinates: {
      lat: {
        type: Number,
        required: true
      },
      lng: {
        type: Number,
        required: true
      }
    },
    serviceRadius: {
      type: Number, // kilometers
      default: 10
    },
    city: String,
    state: String
  },
  images: [{
    url: String,
    alt: String,
    isPrimary: {
      type: Boolean,
      default: false
    }
  }],
  features: [String],
  tags: [String],
  availability: {
    schedule: {
      monday: { start: String, end: String, available: Boolean },
      tuesday: { start: String, end: String, available: Boolean },
      wednesday: { start: String, end: String, available: Boolean },
      thursday: { start: String, end: String, available: Boolean },
      friday: { start: String, end: String, available: Boolean },
      saturday: { start: String, end: String, available: Boolean },
      sunday: { start: String, end: String, available: Boolean }
    },
    timeSlots: [String], // e.g., ['9:00-12:00', '14:00-17:00']
    advanceBooking: {
      type: Number, // hours
      default: 24
    },
    emergencyService: {
      type: Boolean,
      default: false
    }
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended', 'pending_approval'],
    default: 'active'
  },
  rating: {
    average: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    count: {
      type: Number,
      default: 0
    }
  },
  stats: {
    views: {
      type: Number,
      default: 0
    },
    bookings: {
      type: Number,
      default: 0
    },
    completedBookings: {
      type: Number,
      default: 0
    }
  },
  requirements: {
    minimumAge: Number,
    experienceLevel: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced', 'any']
    },
    specialRequirements: [String]
  },
  seoData: {
    metaTitle: String,
    metaDescription: String,
    slug: {
      type: String,
      unique: true,
      sparse: true
    }
  },
  isPromoted: {
    type: Boolean,
    default: false
  },
  promotionExpiry: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
serviceSchema.index({ provider: 1 });
serviceSchema.index({ category: 1 });
serviceSchema.index({ status: 1 });
serviceSchema.index({ 'location.coordinates': '2dsphere' });
serviceSchema.index({ 'pricing.amount': 1 });
serviceSchema.index({ 'rating.average': -1 });
serviceSchema.index({ createdAt: -1 });
serviceSchema.index({ tags: 1 });

// Text index for search
serviceSchema.index({
  title: 'text',
  description: 'text',
  tags: 'text',
  features: 'text'
});

// Virtual for reviews
serviceSchema.virtual('reviews', {
  ref: 'Review',
  localField: '_id',
  foreignField: 'service'
});

// Virtual for bookings
serviceSchema.virtual('bookings', {
  ref: 'Booking',
  localField: '_id',
  foreignField: 'service'
});

// Generate slug before saving
serviceSchema.pre('save', function(next) {
  if (this.isModified('title') && !this.seoData.slug) {
    this.seoData.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') + '-' + this._id.toString().slice(-6);
  }
  next();
});

// Update rating method
serviceSchema.methods.updateRating = async function() {
  const Review = mongoose.model('Review');
  const stats = await Review.aggregate([
    { $match: { service: this._id } },
    {
      $group: {
        _id: null,
        avgRating: { $avg: '$rating' },
        totalReviews: { $sum: 1 }
      }
    }
  ]);

  if (stats.length > 0) {
    this.rating.average = Math.round(stats[0].avgRating * 10) / 10;
    this.rating.count = stats[0].totalReviews;
  } else {
    this.rating.average = 0;
    this.rating.count = 0;
  }

  await this.save();
};

// Increment view count
serviceSchema.methods.incrementViews = async function() {
  this.stats.views += 1;
  await this.save();
};

module.exports = mongoose.model('Service', serviceSchema);
