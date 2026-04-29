'use strict';

require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const flash = require('connect-flash');
const passport = require('passport');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const methodOverride = require('method-override');
const mongoSanitize = require('express-mongo-sanitize');

const { connectDB } = require('./config/database');
const { initSocket } = require('./socket');
const logger = require('./config/logger');
const { globalErrorHandler, notFound } = require('./middleware/errorHandler');
const { setupCronJobs } = require('./services/cronService');

// Routes
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const expenseRoutes = require('./routes/expense');
const categoryRoutes = require('./routes/category');
const reportRoutes = require('./routes/report');
const budgetRoutes = require('./routes/budget');
const userRoutes = require('./routes/user');
const apiRoutes = require('./routes/api');

const app = express();
const server = http.createServer(app);

// ─── Database ───────────────────────────────────────────────────────────────
connectDB();

// ─── View Engine ────────────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// ─── Security Middleware ─────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'unpkg.com'],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'fonts.googleapis.com', 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'unpkg.com', 'https://cdnjs.cloudflare.com'],
      fontSrc: ["'self'", 'fonts.gstatic.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net'],
      imgSrc: ["'self'", 'data:', 'blob:', 'cdn.jsdelivr.net'],
      connectSrc: ["'self'", 'ws:', 'wss:', 'cdn.jsdelivr.net', 'unpkg.com'],
    },
  },
}));
app.use(mongoSanitize());
app.use(cors({ origin: process.env.APP_URL, credentials: true }));

// ─── General Middleware ──────────────────────────────────────────────────────
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, '../public'), { maxAge: '7d' }));

// ─── Logging ─────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', {
    stream: { write: (msg) => logger.http(msg.trim()) }
  }));
}

// ─── Session ─────────────────────────────────────────────────────────────────
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback_secret_change_me',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    touchAfter: 24 * 3600,
    ttl: 14 * 24 * 60 * 60,
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: parseInt(process.env.SESSION_MAX_AGE) || 7 * 24 * 60 * 60 * 1000,
    sameSite: 'lax',
  },
  name: 'et.sid',
}));

// ─── Passport ────────────────────────────────────────────────────────────────
require('./config/passport')(passport);
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

// ─── Global Template Variables ───────────────────────────────────────────────
app.use((req, res, next) => {
  // HTMX Redirect handling to maintain SPA feel
  const originalRedirect = res.redirect;
  res.redirect = function(url) {
    if (req.headers['hx-request']) {
      res.setHeader('HX-Location', url);
      return res.status(200).send();
    }
    return originalRedirect.apply(this, arguments);
  };

  const success = req.flash('success');
  const error = req.flash('error');
  const info = req.flash('info');

  res.locals.user = req.user || null;
  res.locals.success = success;
  res.locals.error = error;
  res.locals.messages = { success, error, info };
  res.locals.appName = process.env.APP_NAME || 'ExpenseTracker';
  res.locals.currentPath = req.path;
  next();
});

// ─── EJS Layout Helper ───────────────────────────────────────────────────────
app.use((req, res, next) => {
  const originalRender = res.render.bind(res);
  res.render = function(view, locals, callback) {
    locals = locals || {};
    
    // Set default title if not provided
    const pageTitle = locals.title || '';
    
    originalRender(view, locals, (err, html) => {
      if (err) return callback ? callback(err) : next(err);
      
      // If it's an HTMX request, send partial and set title header
      if (req.headers['hx-request'] && !view.startsWith('auth/')) {
        res.setHeader('X-Page-Title', encodeURIComponent(pageTitle));
        return (callback || ((e, h) => res.send(h)))(null, html);
      }

      if (view.startsWith('auth/') || view === 'error') {
        return (callback || ((e, h) => res.send(h)))(null, html);
      }
      
      const layoutLocals = { ...locals, body: html, ...res.locals };
      originalRender('layouts/main', layoutLocals, callback || ((e, h) => {
        if (e) next(e); else res.send(h);
      }));
    });
  };
  next();
});

// ─── Routes ──────────────────────────────────────────────────────────────────
// Silent routes for common browser/tooling noise
app.get('/favicon.ico', (req, res) => res.status(204).end());
app.get('/.well-known/appspecific/com.chrome.devtools.json', (req, res) => res.status(204).end());
app.get('/img/favicon.svg', (req, res) => res.status(204).end());
app.use('/auth', authRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/expenses', expenseRoutes);
app.use('/categories', categoryRoutes);
app.use('/reports', reportRoutes);
app.use('/budgets', budgetRoutes);
app.use('/user', userRoutes);
app.use('/api/v1', apiRoutes);

app.get('/', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/dashboard');
  res.redirect('/auth/login');
});

// ─── 404 & Error Handlers ────────────────────────────────────────────────────
app.use(notFound);
app.use(globalErrorHandler);

// ─── Socket.IO ───────────────────────────────────────────────────────────────
initSocket(server);

// ─── Cron Jobs ───────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') setupCronJobs();

// ─── Start Server ────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT} [${process.env.NODE_ENV}]`);
});

// ─── Graceful Shutdown ───────────────────────────────────────────────────────
const shutdown = (signal) => {
  logger.info(`${signal} received. Shutting down gracefully...`);
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Rejection:', err);
  shutdown('unhandledRejection');
});

module.exports = { app, server };
