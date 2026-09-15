const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  service: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    required: true
  },
  provider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true
  },
  rating: {
    type: Number,
    required: [true, 'Rating is required'],
    min: [1, 'Rating must be at least 1'],
    max: [5, 'Rating cannot be more than 5']
  },
  title: {
    type: String,
    trim: true,
    maxlength: [100, 'Review title cannot be more than 100 characters']
  },
  comment: {
    type: String,
    required: [true, 'Review comment is required'],
    trim: true,
    maxlength: [1000, 'Review comment cannot be more than 1000 characters']
  },
  pros: [String],
  cons: [String],
  categories: {
    quality: {
      type: Number,
      min: 1,
      max: 5
    },
    timeliness: {
      type: Number,
      min: 1,
      max: 5
    },
    communication: {
      type: Number,
      min: 1,
      max: 5
    },
    professionalism: {
      type: Number,
      min: 1,
      max: 5
    },
    value: {
      type: Number,
      min: 1,
      max: 5
    }
  },
  photos: [{
    url: String,
    caption: String
  }],
  isVerified: {
    type: Boolean,
    default: false
  },
  helpfulCount: {
    type: Number,
    default: 0
  },
  helpfulUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  providerResponse: {
    message: String,
    respondedAt: Date
  },
  status: {
    type: String,
    enum: ['active', 'hidden', 'reported', 'flagged'],
    default: 'active'
  },
  reports: [{
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: {
      type: String,
      enum: ['inappropriate', 'fake', 'spam', 'offensive', 'other']
    },
    description: String,
    reportedAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
reviewSchema.index({ service: 1 });
reviewSchema.index({ provider: 1 });
reviewSchema.index({ customer: 1 });
reviewSchema.index({ booking: 1 }, { unique: true });
reviewSchema.index({ rating: -1 });
reviewSchema.index({ createdAt: -1 });
reviewSchema.index({ status: 1 });

// Virtual for average category rating
reviewSchema.virtual('averageCategoryRating').get(function() {
  const categories = this.categories;
  if (!categories) return this.rating;
  
  const ratings = Object.values(categories).filter(rating => rating > 0);
  if (ratings.length === 0) return this.rating;
  
  const sum = ratings.reduce((acc, rating) => acc + rating, 0);
  return Math.round((sum / ratings.length) * 10) / 10;
});

// Prevent duplicate reviews for same booking
reviewSchema.pre('save', async function(next) {
  if (this.isNew) {
    const existingReview = await this.constructor.findOne({ 
      booking: this.booking 
    });
    
    if (existingReview) {
      const error = new Error('Review already exists for this booking');
      error.status = 400;
      return next(error);
    }
  }
  next();
});

// Update service and provider ratings after save
reviewSchema.post('save', async function() {
  try {
    const Service = mongoose.model('Service');
    const User = mongoose.model('User');
    
    // Update service rating
    const service = await Service.findById(this.service);
    if (service) {
      await service.updateRating();
    }
    
    // Update provider rating
    const provider = await User.findById(this.provider);
    if (provider && provider.role === 'service_provider') {
      await provider.updateRating();
    }
  } catch (error) {
    console.error('Error updating ratings:', error);
  }
});

// Update ratings after delete
reviewSchema.post('findOneAndDelete', async function(doc) {
  if (doc) {
    try {
      const Service = mongoose.model('Service');
      const User = mongoose.model('User');
      
      // Update service rating
      const service = await Service.findById(doc.service);
      if (service) {
        await service.updateRating();
      }
      
      // Update provider rating
      const provider = await User.findById(doc.provider);
      if (provider && provider.role === 'service_provider') {
        await provider.updateRating();
      }
    } catch (error) {
      console.error('Error updating ratings after delete:', error);
    }
  }
});

// Mark review as helpful
reviewSchema.methods.markHelpful = async function(userId) {
  if (!this.helpfulUsers.includes(userId)) {
    this.helpfulUsers.push(userId);
    this.helpfulCount += 1;
    await this.save();
  }
  return this;
};

// Unmark review as helpful
reviewSchema.methods.unmarkHelpful = async function(userId) {
  const index = this.helpfulUsers.indexOf(userId);
  if (index > -1) {
    this.helpfulUsers.splice(index, 1);
    this.helpfulCount = Math.max(0, this.helpfulCount - 1);
    await this.save();
  }
  return this;
};

// Add provider response
reviewSchema.methods.addProviderResponse = async function(message) {
  this.providerResponse = {
    message,
    respondedAt: new Date()
  };
  await this.save();
  return this;
};

module.exports = mongoose.model('Review', reviewSchema);
