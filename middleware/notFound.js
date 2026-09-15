const notFound = (req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
    availableRoutes: [
      'GET /health - Health check',
      'POST /api/auth/register - User registration',
      'POST /api/auth/login - User login',
      'GET /api/services - Get services',
      'POST /api/services - Create service',
      'GET /api/bookings - Get bookings',
      'POST /api/bookings - Create booking',
      'GET /api/reviews - Get reviews',
      'POST /api/reviews - Create review',
      'POST /api/upload - Upload files'
    ]
  });
};

module.exports = notFound;
