const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
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
  bookingDetails: {
    scheduledDate: {
      type: Date,
      required: [true, 'Scheduled date is required']
    },
    scheduledTime: {
      type: String,
      required: [true, 'Scheduled time is required']
    },
    duration: {
      type: Number, // in hours
      required: true,
      min: 0.5
    },
    location: {
      address: {
        type: String,
        required: [true, 'Service location is required']
      },
      coordinates: {
        lat: Number,
        lng: Number
      },
      instructions: String
    },
    notes: {
      type: String,
      maxlength: [500, 'Notes cannot be more than 500 characters']
    }
  },
  pricing: {
    baseAmount: {
      type: Number,
      required: true,
      min: 0
    },
    additionalCharges: [{
      description: String,
      amount: Number
    }],
    discount: {
      type: Number,
      default: 0,
      min: 0
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0
    },
    currency: {
      type: String,
      default: 'NGN'
    }
  },
  status: {
    type: String,
    enum: [
      'pending',
      'confirmed',
      'in_progress',
      'completed',
      'cancelled',
      'disputed',
      'refunded'
    ],
    default: 'pending'
  },
  statusHistory: [{
    status: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    note: String,
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  payment: {
    method: {
      type: String,
      enum: ['cash', 'card', 'bank_transfer', 'wallet'],
      default: 'cash'
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded'],
      default: 'pending'
    },
    transactionId: String,
    paidAt: Date,
    refundedAt: Date
  },
  communication: [{
    from: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    message: {
      type: String,
      required: true,
      maxlength: [1000, 'Message cannot be more than 1000 characters']
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    type: {
      type: String,
      enum: ['message', 'system_notification'],
      default: 'message'
    }
  }],
  completionDetails: {
    completedAt: Date,
    workDescription: String,
    beforePhotos: [String],
    afterPhotos: [String],
    customerSignature: String,
    providerNotes: String
  },
  cancellation: {
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: String,
    cancelledAt: Date,
    refundAmount: Number
  },
  review: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Review'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
bookingSchema.index({ service: 1 });
bookingSchema.index({ provider: 1 });
bookingSchema.index({ customer: 1 });
bookingSchema.index({ status: 1 });
bookingSchema.index({ 'bookingDetails.scheduledDate': 1 });
bookingSchema.index({ createdAt: -1 });

// Virtual for days until scheduled date
bookingSchema.virtual('daysUntilScheduled').get(function() {
  const now = new Date();
  const scheduled = new Date(this.bookingDetails.scheduledDate);
  const diffTime = scheduled - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Add status to history before saving
bookingSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    this.statusHistory.push({
      status: this.status,
      timestamp: new Date(),
      updatedBy: this.modifiedBy || null
    });
  }
  next();
});

// Calculate total amount
bookingSchema.methods.calculateTotal = function() {
  let total = this.pricing.baseAmount;
  
  // Add additional charges
  this.pricing.additionalCharges.forEach(charge => {
    total += charge.amount;
  });
  
  // Apply discount
  total -= this.pricing.discount;
  
  this.pricing.totalAmount = Math.max(0, total);
  return this.pricing.totalAmount;
};

// Check if booking can be cancelled
bookingSchema.methods.canBeCancelled = function() {
  const now = new Date();
  const scheduled = new Date(this.bookingDetails.scheduledDate);
  const hoursUntilScheduled = (scheduled - now) / (1000 * 60 * 60);
  
  return this.status === 'pending' || this.status === 'confirmed' && hoursUntilScheduled > 24;
};

// Add message to communication
bookingSchema.methods.addMessage = function(fromUserId, message, type = 'message') {
  this.communication.push({
    from: fromUserId,
    message,
    type,
    timestamp: new Date()
  });
  return this.save();
};

module.exports = mongoose.model('Booking', bookingSchema);
