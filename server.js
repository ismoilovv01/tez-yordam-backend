require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');

const app = express();

// Required for Railway / reverse proxy
app.set('trust proxy', 1);

app.use(cors({
  origin: '*',
  credentials: false,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(bodyParser.json({ limit: '10kb' }));

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: 'Too many requests from this IP, please try again later.'
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: 'Too many login attempts, please try again later.',
  skipSuccessfulRequests: true
});

app.use(generalLimiter);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Database connected successfully');
  }
});

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

function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function hashCode(code) {
  return await bcrypt.hash(code, 10);
}

function generateToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return null;
  }
}

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
    const expiresAt = new Date(Date.now() + 10 * 60000);

    await pool.query(
      'INSERT INTO verification_codes (phone, code, code_hash, expires_at) VALUES ($1, $2, $3, $4)',
      [phone, code, codeHash, expiresAt]
    );

    console.log(`Verification code for ${phone}: ${code}`);

    res.json({ success: true, message: 'Code sent. Check console for testing.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send code' });
  }
});

app.post('/api/auth/verify-code', authLimiter, async (req, res) => {
  try {
    const { phone, code } = req.body;

    if (!phone || !code) {
      return res.status(400).json({ error: 'Phone and code required' });
    }

    if (!validatePhone(phone)) {
      return res.status(400).json({ error: 'Invalid phone number' });
    }

    const codeResult = await pool.query(
      'SELECT * FROM verification_codes WHERE phone = $1 AND verified = FALSE ORDER BY created_at DESC LIMIT 1',
      [phone]
    );

    if (codeResult.rows.length === 0) {
      return res.status(400).json({ error: 'No verification code found' });
    }

    const record = codeResult.rows[0];

    if (new Date() > new Date(record.expires_at)) {
      return res.status(400).json({ error: 'Code expired' });
    }

    const codeValid = await bcrypt.compare(code, record.code_hash);
    if (!codeValid) {
      return res.status(400).json({ error: 'Invalid code' });
    }

    await pool.query('UPDATE verification_codes SET verified = TRUE WHERE id = $1', [record.id]);

    let userResult = await pool.query(
      'SELECT * FROM users WHERE phone = $1',
      [phone]
    );

    let user;
    if (userResult.rows.length === 0) {
      const createUserResult = await pool.query(
        'INSERT INTO users (phone, user_type) VALUES ($1, $2) RETURNING id, phone, user_type, dispatch_center_id',
        [phone, 'caller']
      );
      user = createUserResult.rows[0];
    } else {
      user = userResult.rows[0];
    }

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

app.post('/api/emergencies', authenticateToken, async (req, res) => {
  try {
    const { latitude, longitude, service_type, description, dispatch_center_id } = req.body;

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

app.get('/api/emergencies', authenticateToken, checkRole, async (req, res) => {
  try {
    const { status } = req.query;

    if (req.userType !== 'dispatcher') {
      return res.status(403).json({ error: 'Only dispatchers can view emergencies' });
    }

    if (!req.dispatchCenterId) {
      return res.status(403).json({ error: 'Dispatcher not assigned to a center' });
    }

    let query = `SELECT e.*, a.unit_number, a.driver_name, a.driver_phone,
                   u.phone as user_phone
                   FROM emergencies e 
                   LEFT JOIN ambulances a ON e.assigned_ambulance_id = a.id
                   LEFT JOIN users u ON e.user_id = u.id
                   WHERE e.dispatch_center_id = $1`;
    const params = [req.dispatchCenterId];

    if (status) {
      query += ' AND e.status = $2';
      params.push(status);
    }

    query += ' ORDER BY e.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get emergencies' });
  }
});

app.get('/api/emergencies/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.*, a.unit_number, a.driver_name, a.driver_phone, a.latitude as amb_lat, a.longitude as amb_lng,
              u.phone as user_phone
       FROM emergencies e
       LEFT JOIN ambulances a ON e.assigned_ambulance_id = a.id
       LEFT JOIN users u ON e.user_id = u.id
       WHERE e.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Emergency not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get emergency' });
  }
});

app.patch('/api/emergencies/:id/confirm', authenticateToken, checkRole, async (req, res) => {
  try {
    if (req.userType !== 'dispatcher') {
      return res.status(403).json({ error: 'Only dispatchers can confirm emergencies' });
    }

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

app.patch('/api/emergencies/:id/dispatch', authenticateToken, checkRole, async (req, res) => {
  try {
    if (req.userType !== 'dispatcher') {
      return res.status(403).json({ error: 'Only dispatchers can dispatch emergencies' });
    }

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

app.patch('/api/emergencies/:id/arrive', authenticateToken, checkRole, async (req, res) => {
  try {
    if (req.userType !== 'dispatcher') {
      return res.status(403).json({ error: 'Only dispatchers can mark arrived' });
    }

    const emergencyResult = await pool.query('SELECT dispatch_center_id FROM emergencies WHERE id = $1', [req.params.id]);
    
    if (emergencyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Emergency not found' });
    }

    if (emergencyResult.rows[0].dispatch_center_id !== req.dispatchCenterId) {
      return res.status(403).json({ error: 'You do not have permission' });
    }

    const result = await pool.query(
      'UPDATE emergencies SET status = $1, arrived_at = NOW() WHERE id = $2 RETURNING *',
      ['arrived', req.params.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to mark arrived' });
  }
});

app.patch('/api/emergencies/:id/complete', authenticateToken, checkRole, async (req, res) => {
  try {
    if (req.userType !== 'dispatcher') {
      return res.status(403).json({ error: 'Only dispatchers can complete emergencies' });
    }

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

app.patch('/api/emergencies/:id/reject', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE emergencies SET status = 'cancelled', cancelled_by = 'dispatcher', rejected_at = NOW() WHERE id = $1 RETURNING *",
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Emergency not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[REJECT] Database error:', err.message);
    res.status(500).json({ error: 'Failed to reject emergency: ' + err.message });
  }
});

app.patch('/api/emergencies/:id/cancel', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE emergencies SET status = 'cancelled', cancelled_by = 'user', rejected_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *",
      [req.params.id, req.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found or not your emergency' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Cancel error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.patch('/api/driver/cancel/:callId', authenticateToken, async (req, res) => {
  try {
    const { callId } = req.params;
    const ambulanceResult = await pool.query('SELECT id FROM ambulances WHERE driver_user_id = $1', [req.userId]);
    if (ambulanceResult.rows.length === 0) return res.status(404).json({ error: 'No ambulance linked' });
    const ambulanceId = ambulanceResult.rows[0].id;
    const result = await pool.query(
      "UPDATE emergencies SET status = 'cancelled', cancelled_by = 'driver', assigned_ambulance_id = NULL, rejected_at = NOW() WHERE id = $1 AND assigned_ambulance_id = $2 RETURNING *",
      [callId, ambulanceId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Call not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Driver cancel error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/ambulances', authenticateToken, checkRole, async (req, res) => {
  try {
    if (req.userType !== 'dispatcher') {
      return res.status(403).json({ error: 'Only dispatchers can view ambulances' });
    }

    const result = await pool.query(
      'SELECT id, unit_number, driver_name, driver_phone, status, latitude, longitude FROM ambulances WHERE dispatch_center_id = $1 ORDER BY unit_number',
      [req.dispatchCenterId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get ambulances' });
  }
});

app.patch('/api/emergencies/:id/assign-ambulance', authenticateToken, checkRole, async (req, res) => {
  try {
    const { ambulance_id } = req.body;

    if (!ambulance_id) {
      return res.status(400).json({ error: 'Ambulance ID required' });
    }

    if (req.userType !== 'dispatcher') {
      return res.status(403).json({ error: 'Only dispatchers can assign ambulances' });
    }

    const emergencyResult = await pool.query('SELECT dispatch_center_id FROM emergencies WHERE id = $1', [req.params.id]);
    
    if (emergencyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Emergency not found' });
    }

    if (emergencyResult.rows[0].dispatch_center_id !== req.dispatchCenterId) {
      return res.status(403).json({ error: 'You do not have permission' });
    }

    const ambResult = await pool.query('SELECT dispatch_center_id FROM ambulances WHERE id = $1', [ambulance_id]);
    if (ambResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ambulance not found' });
    }

    if (ambResult.rows[0].dispatch_center_id !== req.dispatchCenterId) {
      return res.status(403).json({ error: 'Ambulance not from your center' });
    }

    const result = await pool.query(
      'UPDATE emergencies SET assigned_ambulance_id = $1 WHERE id = $2 RETURNING *',
      [ambulance_id, req.params.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to assign ambulance' });
  }
});

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

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// =====================================================
// DRIVER APP ENDPOINTS
// =====================================================

app.get('/api/driver/assigned-call', authenticateToken, async (req, res) => {
  try {
    const ambulanceResult = await pool.query(
      'SELECT id FROM ambulances WHERE driver_user_id = $1',
      [req.userId]
    );

    if (ambulanceResult.rows.length === 0) {
      return res.json({ call: null });
    }

    const ambulanceId = ambulanceResult.rows[0].id;

    const callResult = await pool.query(
      `SELECT e.id, e.latitude, e.longitude, e.status, e.created_at,
              u.phone AS caller_phone
       FROM emergencies e
       LEFT JOIN users u ON e.user_id = u.id
       WHERE e.assigned_ambulance_id = $1
         AND e.status NOT IN ('completed', 'rejected', 'cancelled')
       ORDER BY e.created_at DESC
       LIMIT 1`,
      [ambulanceId]
    );

    res.json({ call: callResult.rows[0] || null });
  } catch (err) {
    console.error('Driver assigned-call error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.patch('/api/driver/location', authenticateToken, async (req, res) => {
  try {
    const { latitude, longitude } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'latitude and longitude required' });
    }

    if (!validateCoordinates(latitude, longitude)) {
      return res.status(400).json({ error: 'Invalid coordinates' });
    }

    const result = await pool.query(
      'UPDATE ambulances SET latitude = $1, longitude = $2, last_location_update = NOW() WHERE driver_user_id = $3 RETURNING id',
      [latitude, longitude, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No ambulance linked to this driver' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Driver location update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.patch('/api/driver/arrived/:callId', authenticateToken, async (req, res) => {
  try {
    const { callId } = req.params;

    const ambulanceResult = await pool.query(
      'SELECT id FROM ambulances WHERE driver_user_id = $1',
      [req.userId]
    );

    if (ambulanceResult.rows.length === 0) {
      return res.status(404).json({ error: 'No ambulance linked to this driver' });
    }

    const ambulanceId = ambulanceResult.rows[0].id;

    const emergencyResult = await pool.query(
      'SELECT id FROM emergencies WHERE id = $1 AND assigned_ambulance_id = $2',
      [callId, ambulanceId]
    );

    if (emergencyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Call not found or not assigned to you' });
    }

    await pool.query(
      "UPDATE emergencies SET status = 'arrived', arrived_at = NOW() WHERE id = $1",
      [callId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Driver arrived error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.patch('/api/driver/start/:callId', authenticateToken, async (req, res) => {
  try {
    const { callId } = req.params;
    const ambulanceResult = await pool.query('SELECT id FROM ambulances WHERE driver_user_id = $1', [req.userId]);
    if (ambulanceResult.rows.length === 0) return res.status(404).json({ error: 'No ambulance linked to this driver' });
    const ambulanceId = ambulanceResult.rows[0].id;
    const result = await pool.query(
      "UPDATE emergencies SET status = 'on_the_way', dispatched_at = NOW() WHERE id = $1 AND assigned_ambulance_id = $2 RETURNING *",
      [callId, ambulanceId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Call not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Driver start error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.patch('/api/driver/complete/:callId', authenticateToken, async (req, res) => {
  try {
    const { callId } = req.params;

    const ambulanceResult = await pool.query(
      'SELECT id FROM ambulances WHERE driver_user_id = $1',
      [req.userId]
    );

    if (ambulanceResult.rows.length === 0) {
      return res.status(404).json({ error: 'No ambulance linked to this driver' });
    }

    const ambulanceId = ambulanceResult.rows[0].id;

    const emergencyResult = await pool.query(
      'SELECT id FROM emergencies WHERE id = $1 AND assigned_ambulance_id = $2',
      [callId, ambulanceId]
    );

    if (emergencyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Call not found or not assigned to you' });
    }

    await pool.query(
      "UPDATE emergencies SET status = 'completed', completed_at = NOW() WHERE id = $1",
      [callId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Driver complete error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/driver/call-history', authenticateToken, async (req, res) => {
  try {
    const ambulanceResult = await pool.query(
      'SELECT id FROM ambulances WHERE driver_user_id = $1',
      [req.userId]
    );

    if (ambulanceResult.rows.length === 0) {
      return res.json({ calls: [] });
    }

    const ambulanceId = ambulanceResult.rows[0].id;

    const callsResult = await pool.query(
      `SELECT e.id, e.latitude, e.longitude, e.status, e.created_at,
              u.phone AS caller_phone
       FROM emergencies e
       LEFT JOIN users u ON e.user_id = u.id
       WHERE e.assigned_ambulance_id = $1
       ORDER BY e.created_at DESC`,
      [ambulanceId]
    );

    res.json({ calls: callsResult.rows });
  } catch (err) {
    console.error('Driver call-history error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/driver/available-calls', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.id, e.latitude, e.longitude, e.status, e.created_at, e.description,
              u.phone AS caller_phone
       FROM emergencies e
       LEFT JOIN users u ON e.user_id = u.id
       WHERE e.status = 'confirmed'
       ORDER BY e.created_at DESC`
    );
    res.json({ calls: result.rows });
  } catch (err) {
    console.error('Available calls error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/driver/accept-call/:callId', authenticateToken, async (req, res) => {
  try {
    const { callId } = req.params;

    const ambulanceResult = await pool.query(
      'SELECT id FROM ambulances WHERE driver_user_id = $1',
      [req.userId]
    );

    if (ambulanceResult.rows.length === 0) {
      return res.status(404).json({ error: 'No ambulance linked to this driver' });
    }

    const ambulanceId = ambulanceResult.rows[0].id;

    const checkResult = await pool.query(
      "SELECT id FROM emergencies WHERE id = $1 AND status = 'confirmed'",
      [callId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(409).json({ error: 'Bu chaqiruv allaqachon qabul qilingan' });
    }

    const result = await pool.query(
      `UPDATE emergencies 
       SET assigned_ambulance_id = $1, status = 'assigned', dispatched_at = NOW()
       WHERE id = $2 AND status = 'confirmed'
       RETURNING *`,
      [ambulanceId, callId]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({ error: 'Bu chaqiruv allaqachon qabul qilingan' });
    }

    res.json({ success: true, call: result.rows[0] });
  } catch (err) {
    console.error('Accept call error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Emergency dispatch backend running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
});
