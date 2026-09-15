# FlinkServe Backend API

A comprehensive REST API backend for the FlinkServe service marketplace platform built with Node.js, Express.js, and MongoDB.

## Features

- **User Authentication & Authorization**
  - JWT-based authentication
  - Role-based access control (Service Providers & Service Seekers)
  - Password hashing with bcrypt
  - Account verification and password reset

- **Service Management**
  - CRUD operations for services
  - Advanced filtering and search
  - Location-based service discovery
  - Image upload for service photos
  - Rating and review system

- **Booking System**
  - Service booking with scheduling
  - Status tracking (pending, confirmed, in-progress, completed, cancelled)
  - Booking history and management

- **Review & Rating System**
  - Customer reviews and ratings
  - Provider rating aggregation
  - Review management with edit/delete capabilities

- **File Upload**
  - Image upload for avatars and service photos
  - File validation and size limits
  - Organized file storage structure

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (JSON Web Tokens)
- **File Upload**: Multer
- **Security**: Helmet, CORS, Rate Limiting
- **Validation**: Express Validator

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user profile
- `PUT /api/auth/profile` - Update user profile
- `PUT /api/auth/change-password` - Change password

### Services
- `GET /api/services` - Get all services (with filtering)
- `GET /api/services/:id` - Get single service
- `POST /api/services` - Create new service (Providers only)
- `PUT /api/services/:id` - Update service (Providers only)
- `DELETE /api/services/:id` - Delete service (Providers only)
- `GET /api/services/my/services` - Get provider's services

### Bookings
- `GET /api/bookings` - Get user's bookings
- `GET /api/bookings/:id` - Get single booking
- `POST /api/bookings` - Create new booking (Service Seekers only)
- `PUT /api/bookings/:id/status` - Update booking status (Providers only)
- `PUT /api/bookings/:id/cancel` - Cancel booking
- `GET /api/bookings/stats/overview` - Get booking statistics

### Reviews
- `GET /api/reviews/service/:serviceId` - Get service reviews
- `GET /api/reviews/provider/:providerId` - Get provider reviews
- `POST /api/reviews` - Create review (Service Seekers only)
- `PUT /api/reviews/:id` - Update review
- `DELETE /api/reviews/:id` - Delete review
- `GET /api/reviews/my/given` - Get reviews given by user
- `GET /api/reviews/my/received` - Get reviews received by provider

### File Upload
- `POST /api/upload/avatar` - Upload user avatar
- `POST /api/upload/service-images` - Upload service images
- `POST /api/upload/multiple` - Upload multiple files
- `DELETE /api/upload/:filename` - Delete uploaded file

## Environment Variables

Create a `.env` file in the root directory:

```env
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://localhost:27017/flinkserve
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRE=30d
CORS_ORIGIN=http://localhost:5179
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## Installation & Setup

1. **Clone and Navigate**
   ```bash
   cd Flinkserve-Backend
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Set Up Environment**
   - Copy `.env.example` to `.env`
   - Update environment variables

4. **Start MongoDB**
   Make sure MongoDB is running on your system

5. **Run the Server**
   ```bash
   # Development
   npm run dev
   
   # Production
   npm start
   ```

## API Response Format

All API responses follow a consistent format:

```json
{
  "success": true,
  "message": "Operation successful",
  "data": {
    // Response data here
  }
}
```

Error responses:
```json
{
  "success": false,
  "message": "Error description",
  "errors": [
    // Validation errors (if any)
  ]
}
```

## Authentication

Include JWT token in request headers:
```
Authorization: Bearer <your_jwt_token>
```

## Database Models

- **User**: User accounts with role-based profiles
- **Service**: Service listings with location and pricing
- **Booking**: Service bookings with status tracking
- **Review**: Customer reviews and ratings

## Security Features

- Helmet for security headers
- CORS configuration
- Rate limiting
- Input validation and sanitization
- JWT token-based authentication
- Password hashing
- File upload validation

## Development

The API includes comprehensive error handling, request validation, and logging for development and debugging.

## Frontend Integration

This backend is designed to work with the FlinkServe React frontend. All endpoints return data in the format expected by the frontend components.
