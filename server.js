require('dotenv').config({ path: __dirname + '/.env' });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

// Import routes
const authRoutes = require('./routes/auth');
const serviceRoutes = require('./routes/services');
const bookingRoutes = require('./routes/bookings');
const reviewRoutes = require('./routes/reviews');
const uploadRoutes = require('./routes/upload');

// Import middleware
const errorHandler = require('./middleware/errorHandler');
const notFound = require('./middleware/notFound');

const app = express();

// Trust the platform proxy (Render / Cloudflare / Heroku).
// Required so express-rate-limit reads the real client IP from X-Forwarded-For
// instead of throwing ERR_ERL_UNEXPECTED_X_FORWARDED_FOR (which would fail the
// request BEFORE the CORS middleware runs and therefore return a response with
// no Access-Control-Allow-Origin header).
app.set('trust proxy', 1);

// Security middleware
// crossOriginResourcePolicy is relaxed to "cross-origin" so the frontend hosted
// on Firebase can load images served from this backend's /uploads folder.
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false
}));

// ---------------------------------------------------------------------------
// CORS configuration
// IMPORTANT: CORS must be registered BEFORE the rate limiter so that even
// throttled (429) or failing responses still carry CORS headers.
// ---------------------------------------------------------------------------
const DEV_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://localhost:5177',
  'http://localhost:5178',
  'http://localhost:5179',
  'http://localhost:5180',
  'http://localhost:5181',
  'http://127.0.0.1:5173'
];

const PROD_ORIGINS = [
  'https://flinkserve.web.app',
  'https://flinkserve.firebaseapp.com'
];

// Combine hardcoded origins + anything supplied via the CORS_ORIGIN env var
// (comma separated). This lets you add new hosts without a code change.
const allowedOrigins = [
  ...DEV_ORIGINS,
  ...PROD_ORIGINS,
  ...(process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim()).filter(Boolean)
    : [])
].filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (curl, health checks, mobile apps, server-to-server)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }

    // In development, be permissive so any local port works.
    if (process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }

    // NEVER throw here. Throwing produces a 500 response that has no CORS
    // headers, which browsers surface as a confusing "blocked by CORS policy"
    // error. Returning `false` simply omits the ACAO header instead.
    console.warn(`⚠️  CORS blocked origin: ${origin}`);
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Length', 'X-Request-Id'],
  optionsSuccessStatus: 204,
  preflightContinue: false
};

app.use(cors(corsOptions));

// Guarantee that every response (including errors thrown further down the
// stack) carries the CORS headers for allowed origins. This is what makes a
// browser preflight succeed even when a route later fails.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }

  // Answer preflight requests immediately so they can never fall through to a
  // route that might error out and return a response without CORS headers.
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,Accept,Origin');
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.sendStatus(204);
  }

  return next();
});

// Rate limiting (registered AFTER CORS on purpose).
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000,
  standardHeaders: true,
  legacyHeaders: false,
  // Disable the noisy X-Forwarded-For validation: we already set trust proxy.
  validate: { xForwardedForHeader: false },
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  }
});
app.use('/api/', limiter);

// Compression middleware
app.use(compression());

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static file serving
app.use('/uploads', express.static('uploads'));

// Health check endpoint
// Always returns 200 so the platform keeps routing traffic, but the body
// reports the true database state — this is the fastest way to tell whether a
// 500 from an API route is caused by a bad MONGODB_URI / Atlas IP allow-list.
const DB_STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];

app.get('/health', async (req, res) => {
  const dbState = DB_STATES[mongoose.connection.readyState] || 'unknown';

  let dbPing = 'skipped';
  if (mongoose.connection.readyState === 1) {
    try {
      await mongoose.connection.db.admin().ping();
      dbPing = 'ok';
    } catch (err) {
      dbPing = `failed: ${err.message}`;
    }
  }

  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    database: {
      state: dbState,
      ping: dbPing,
      // Never expose credentials — host only.
      host: mongoose.connection.host || null,
      name: mongoose.connection.name || null,
      // A missing host almost always means the Atlas IP allow-list is blocking
      // this server, or MONGODB_URI is not set correctly on the host.
      configured: Boolean(process.env.MONGODB_URI),
      // Surfaced here (instead of only in the Render log) so a 503 from any API
      // route can be diagnosed straight from the browser.
      lastError: mongoose.connection.readyState === 1
        ? null
        : (mongoose.__lastConnectError || null)
    }
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/upload', uploadRoutes);

// 404 handler
app.use(notFound);

// Error handling middleware
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Database connection
// The server keeps listening regardless, so a transient Atlas hiccup never
// leaves the platform returning 502 for every request.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Normalise the connection string.
//
// Hosting dashboards happily store a value that still has the quotes from a
// .env file, e.g.  MONGODB_URI="mongodb+srv://user:pass@host/db"
// The MongoDB driver then rejects it with:
//   "Invalid scheme, expected connection string to start with mongodb://"
// Stripping wrapping quotes (and stray whitespace / trailing semicolons) makes
// pasting straight from .env safe and removes a very common deploy failure.
// ---------------------------------------------------------------------------
const sanitizeMongoUri = (value) => {
  if (!value) return value;
  let uri = String(value).trim();

  // Remove matching leading/trailing single or double quotes (repeat in case of
  // nested quoting like ""mongodb://..."").
  let previous;
  do {
    previous = uri;
    if (
      (uri.startsWith('"') && uri.endsWith('"')) ||
      (uri.startsWith("'") && uri.endsWith("'"))
    ) {
      uri = uri.slice(1, -1).trim();
    }
  } while (uri !== previous && uri.length > 1);

  // A trailing semicolon copied from a shell command would also break parsing.
  uri = uri.replace(/;+$/, '').trim();

  return uri;
};

const RAW_MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_URI = sanitizeMongoUri(RAW_MONGODB_URI) || 'mongodb://localhost:27017/flinkserve';

if (RAW_MONGODB_URI && RAW_MONGODB_URI !== MONGODB_URI) {
  console.warn('⚠️  MONGODB_URI contained surrounding quotes/whitespace — cleaned automatically.');
}

// Redact credentials before ever printing a URI.
const maskUri = (uri) =>
  uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');

mongoose.set('strictQuery', true);

// Records the most recent connection failure so /health can explain a 503.
mongoose.__lastConnectError = null;

const connectOptions = {
  serverSelectionTimeoutMS: 15000,
  socketTimeoutMS: 45000,
  maxPoolSize: 10
};

// Retry with capped backoff. Render keeps the service running between attempts
// so the app self-heals once the database becomes reachable again (a corrected
// env var requires a redeploy, but a transient Atlas blip / IP warm-up does not).
let connectAttempt = 0;
const MAX_BACKOFF_MS = 30000;

const connectToDatabase = async () => {
  connectAttempt += 1;

  if (connectAttempt > 1) {
    console.log(`🔄 MongoDB reconnect attempt #${connectAttempt}`);
  }

  try {
    await mongoose.connect(MONGODB_URI, connectOptions);
    connectAttempt = 0;
    return true;
  } catch (err) {
    mongoose.__lastConnectError = err.message;
    console.error(`❌ MongoDB connection failed (attempt ${connectAttempt}): ${err.message}`);

    // Extremely common on first deploy: the URI is fine but Atlas' Network
    // Access list does not include the host. Make that unmistakable in logs.
    if (/whitelist|IP|ETIMEDOUT|querySrv|ENOTFOUND|selection timed out/i.test(err.message)) {
      console.error(
        '   ↳ Check MongoDB Atlas → Network Access. Render uses dynamic egress IPs,\n' +
        '     so the allow-list usually needs 0.0.0.0/0 (or a paid static-IP setup).'
      );
    }

    if (/Invalid scheme|Invalid connection string|must be a string/i.test(err.message)) {
      console.error(
        '   ↳ MONGODB_URI is malformed. On Render it must be the plain string\n' +
        '     mongodb+srv://user:pass@cluster/... with NO surrounding quotes.'
      );
    }

    const backoff = Math.min(MAX_BACKOFF_MS, 2000 * Math.pow(2, Math.min(connectAttempt - 1, 5)));
    setTimeout(connectToDatabase, backoff).unref();
    return false;
  }
};

console.log(`🔌 Connecting to MongoDB (${maskUri(MONGODB_URI)})`);

connectToDatabase();

// Mongoose emits 'disconnected' before our retry kicks in — only nag once per state
// so the logs stay readable.
mongoose.connection.on('connected', () => {
  mongoose.__lastConnectError = null;
  console.log('✅ MongoDB connection established');
});
mongoose.connection.on('disconnected', () => console.warn('⚠️  MongoDB disconnected'));
mongoose.connection.on('reconnected', () => console.log('✅ MongoDB reconnected'));
mongoose.connection.on('error', (err) => {
  mongoose.__lastConnectError = err.message;
  console.error('❌ MongoDB error:', err.message);
});

// ---------------------------------------------------------------------------
// Process-level safety nets
// Never kill the process in production: the platform would restart it and
// users would see 502s / "blocked by CORS policy" while it boots.
// ---------------------------------------------------------------------------
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Promise Rejection:', err && err.message ? err.message : err);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err && err.stack ? err.stack : err);
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`🚀 FlinkServe Backend Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV}`);
  console.log(`🌐 Allowed CORS origins: ${allowedOrigins.join(', ')}`);
});

server.on('error', (err) => {
  console.error('❌ Server error:', err.message);
  if (err.code === 'EADDRINUSE') {
    process.exit(1);
  }
});

// Render sends SIGTERM before replacing an instance — shut down cleanly.
const gracefulShutdown = (signal) => {
  console.log(`${signal} received — shutting down gracefully`);
  server.close(() => {
    mongoose.connection.close(false).finally(() => process.exit(0));
  });
  // Force-exit if connections refuse to drain.
  setTimeout(() => process.exit(0), 10000).unref();
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = app;
