require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');

const app = express();

// ==================== SECURITY MIDDLEWARE ====================

// CORS - Restrict to your apps only
const allowedOrigins = [
  'http://localhost:3001', // Caller app
  'http://localhost:3002', // Dispatcher app
  'http://localhost:3003', // Admin app
  process.env.FRONTEND_URL // Production URL if set
];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parser with size limits
app.use(bodyParser.json({ limit: '10kb' }));

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 auth attempts per windowMs
  message: 'Too many login attempts, please try again later.',
  skipSuccessfulRequests: true
});

app.use(generalLimiter);

// Database connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Database connected successfully');
  }
});

// ==================== HELPER FUNCTIONS ====================

// Input validation
function validatePhone(phone) {
  const phoneRegex = /^\+?[0-9]{10,15}$/;
  return phoneRegex.test(phone);
}

function validateCoordinates(lat, lng) {
  const latitude = parseFloat(lat);
  const longitude = parseFloat(lng);
  return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

function validateServiceType(type) {
  return ['ambulance', 'police', 'fire'].includes(type);
}

// Generate random 6-digit code
function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Hash verification code
async function hashCode(code) {
  return await bcrypt.hash(code, 10);
}

// Generate JWT token
function generateToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

// Verify JWT token
function verifyToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return null;
  }
}

// Middleware to verify JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(403).json({ error: 'Invalid token' });
  }

  req.userId = decoded.userId;
  next();
}

// Middleware to check user role
async function checkRole(req, res, next) {
  try {
    const userResult = await pool.query('SELECT user_type, dispatch_center_id FROM users WHERE id = $1', [req.userId]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    req.userType = userResult.rows[0].user_type;
    req.dispatchCenterId = userResult.rows[0].dispatch_center_id;
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to verify user role' });
  }
}

// ==================== AUTH ENDPOINTS ====================

// Send verification code
app.post('/api/auth/send-code', authLimiter, async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ error: 'Phone number required' });
    }

    if (!validatePhone(phone)) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    const code = generateVerificationCode();
    const codeHash = await hashCode(code);
    const expiresAt = new Date(Date.now() + 10 * 60000); // 10 minutes

    await pool.query(
      'INSERT INTO verification_codes (phone, code, code_hash, expires_at) VALUES ($1, $2, $3, $4)',
      [phone, code, codeHash, expiresAt]
    );

    // For development: log code to console
    console.log(`Verification code for ${phone}: ${code}`);

    res.json({ success: true, message: 'Code sent. Check console for testing.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send code' });
  }
});

// Verify code and login
app.post('/api/auth/verify-code', authLimiter, async (req, res) => {
  try {
    const { phone, code } = req.body;

    if (!phone || !code) {
      return res.status(400).json({ error: 'Phone and code required' });
    }

    if (!validatePhone(phone)) {
      return res.status(400).json({ error: 'Invalid phone number' });
    }

    // Get verification code from DB
    const codeResult = await pool.query(
      'SELECT * FROM verification_codes WHERE phone = $1 AND verified = FALSE ORDER BY created_at DESC LIMIT 1',
      [phone]
    );

    if (codeResult.rows.length === 0) {
      return res.status(400).json({ error: 'No verification code found' });
    }

    const record = codeResult.rows[0];

    // Check if code expired
    if (new Date() > new Date(record.expires_at)) {
      return res.status(400).json({ error: 'Code expired' });
    }

    // Verify code
    const codeValid = await bcrypt.compare(code, record.code_hash);
    if (!codeValid) {
      return res.status(400).json({ error: 'Invalid code' });
    }

    // Mark as verified
    await pool.query('UPDATE verification_codes SET verified = TRUE WHERE id = $1', [record.id]);

    // Get or create user
    let userResult = await pool.query(
      'SELECT * FROM users WHERE phone = $1',
      [phone]
    );

    let user;
    if (userResult.rows.length === 0) {
      // Create new user as 'caller' by default
      const createUserResult = await pool.query(
        'INSERT INTO users (phone, user_type) VALUES ($1, $2) RETURNING id, phone, user_type, dispatch_center_id',
        [phone, 'caller']
      );
      user = createUserResult.rows[0];
    } else {
      user = userResult.rows[0];
    }

    // Generate token
    const token = generateToken(user.id);

    res.json({ 
      success: true, 
      token, 
      user: { 
        id: user.id, 
        phone: user.phone, 
        user_type: user.user_type,
        dispatch_center_id: user.dispatch_center_id
      } 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Get current user
app.get('/api/auth/me', authenticateToken, checkRole, async (req, res) => {
  try {
    const userResult = await pool.query(
      'SELECT id, phone, user_type, dispatch_center_id FROM users WHERE id = $1', 
      [req.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(userResult.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// ==================== EMERGENCY ENDPOINTS ====================

// Send emergency
app.post('/api/emergencies', authenticateToken, async (req, res) => {
  try {
    const { latitude, longitude, service_type, description, dispatch_center_id } = req.body;

    // Validation
    if (!latitude || !longitude || !service_type || !dispatch_center_id) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!validateCoordinates(latitude, longitude)) {
      return res.status(400).json({ error: 'Invalid coordinates' });
    }

    if (!validateServiceType(service_type)) {
      return res.status(400).json({ error: 'Invalid service type' });
    }

    const result = await pool.query(
      'INSERT INTO emergencies (user_id, dispatch_center_id, service_type, latitude, longitude, description, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [req.userId, dispatch_center_id, service_type, latitude, longitude, description || null, 'new']
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create emergency' });
  }
});

// Get emergencies for dispatcher
app.get('/api/emergencies', authenticateToken, checkRole, async (req, res) => {
  try {
    const { status } = req.query;

    // Check if user is dispatcher
    if (req.userType !== 'dispatcher') {
      return res.status(403).json({ error: 'Only dispatchers can view emergencies' });
    }

    if (!req.dispatchCenterId) {
      return res.status(403).json({ error: 'Dispatcher not assigned to a center' });
    }

    let query = 'SELECT * FROM emergencies WHERE dispatch_center_id = $1';
    const params = [req.dispatchCenterId];

    if (status) {
      query += ' AND status = $2';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get emergencies' });
  }
});

// Get single emergency
app.get('/api/emergencies/:id', authenticateToken, checkRole, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM emergencies WHERE id = $1', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Emergency not found' });
    }

    const emergency = result.rows[0];

    // Check permission: dispatcher can only see their center's emergencies
    if (req.userType === 'dispatcher' && emergency.dispatch_center_id !== req.dispatchCenterId) {
      return res.status(403).json({ error: 'You do not have permission to view this emergency' });
    }

    res.json(emergency);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get emergency' });
  }
});

// Confirm emergency
app.patch('/api/emergencies/:id/confirm', authenticateToken, checkRole, async (req, res) => {
  try {
    if (req.userType !== 'dispatcher') {
      return res.status(403).json({ error: 'Only dispatchers can confirm emergencies' });
    }

    // Verify dispatcher owns this emergency's dispatch center
    const emergencyResult = await pool.query('SELECT dispatch_center_id FROM emergencies WHERE id = $1', [req.params.id]);
    
    if (emergencyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Emergency not found' });
    }

    if (emergencyResult.rows[0].dispatch_center_id !== req.dispatchCenterId) {
      return res.status(403).json({ error: 'You do not have permission to confirm this emergency' });
    }

    const result = await pool.query(
      'UPDATE emergencies SET status = $1, dispatcher_id = $2, confirmed_at = NOW() WHERE id = $3 RETURNING *',
      ['confirmed', req.userId, req.params.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to confirm emergency' });
  }
});

// Dispatch emergency
app.patch('/api/emergencies/:id/dispatch', authenticateToken, checkRole, async (req, res) => {
  try {
    if (req.userType !== 'dispatcher') {
      return res.status(403).json({ error: 'Only dispatchers can dispatch emergencies' });
    }

    // Verify dispatcher owns this emergency's dispatch center
    const emergencyResult = await pool.query('SELECT dispatch_center_id FROM emergencies WHERE id = $1', [req.params.id]);
    
    if (emergencyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Emergency not found' });
    }

    if (emergencyResult.rows[0].dispatch_center_id !== req.dispatchCenterId) {
      return res.status(403).json({ error: 'You do not have permission to dispatch this emergency' });
    }

    const result = await pool.query(
      'UPDATE emergencies SET status = $1, dispatched_at = NOW() WHERE id = $2 RETURNING *',
      ['dispatched', req.params.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to dispatch emergency' });
  }
});

// Complete emergency
app.patch('/api/emergencies/:id/complete', authenticateToken, checkRole, async (req, res) => {
  try {
    if (req.userType !== 'dispatcher') {
      return res.status(403).json({ error: 'Only dispatchers can complete emergencies' });
    }

    // Verify dispatcher owns this emergency's dispatch center
    const emergencyResult = await pool.query('SELECT dispatch_center_id FROM emergencies WHERE id = $1', [req.params.id]);
    
    if (emergencyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Emergency not found' });
    }

    if (emergencyResult.rows[0].dispatch_center_id !== req.dispatchCenterId) {
      return res.status(403).json({ error: 'You do not have permission to complete this emergency' });
    }

    const result = await pool.query(
      'UPDATE emergencies SET status = $1, completed_at = NOW() WHERE id = $2 RETURNING *',
      ['completed', req.params.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to complete emergency' });
  }
});

// ==================== DISPATCH CENTER ENDPOINTS ====================

// Get all dispatch centers
app.get('/api/dispatch-centers', async (req, res) => {
  try {
    const { service_type } = req.query;

    let query = 'SELECT id, name, city, service_type, phone FROM dispatch_centers';
    const params = [];

    if (service_type && validateServiceType(service_type)) {
      query += ' WHERE service_type = $1';
      params.push(service_type);
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get dispatch centers' });
  }
});

// ==================== ADMIN ENDPOINTS ====================

// Get statistics (admin only)
app.get('/api/admin/stats', authenticateToken, checkRole, async (req, res) => {
  try {
    if (req.userType !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const stats = await Promise.all([
      pool.query('SELECT COUNT(*) as total FROM emergencies'),
      pool.query('SELECT COUNT(*) as total FROM emergencies WHERE status = $1', ['completed']),
      pool.query('SELECT AVG(EXTRACT(EPOCH FROM (confirmed_at - created_at))) as avg_response_time FROM emergencies WHERE confirmed_at IS NOT NULL'),
    ]);

    res.json({
      total_emergencies: parseInt(stats[0].rows[0].total),
      completed_emergencies: parseInt(stats[1].rows[0].total),
      avg_response_time_seconds: Math.round(parseFloat(stats[2].rows[0].avg_response_time || 0)),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Emergency dispatch backend running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
});
