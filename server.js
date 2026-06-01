require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');

const app = express();
app.set('trust proxy', 1);

app.use(cors({
  origin: '*',
  credentials: false,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(bodyParser.json({ limit: '10kb' }));

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 1000,
  message: 'Too many requests from this IP, please try again later.'
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 50,
  message: 'Too many login attempts, please try again later.',
  skipSuccessfulRequests: true
});

app.use(generalLimiter);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

pool.query('SELECT NOW()', (err) => {
  if (err) console.error('Database connection error:', err);
  else console.log('Database connected successfully');
});

function validatePhone(phone) { return /^\+?[0-9]{10,15}$/.test(phone); }
function validateCoordinates(lat, lng) {
  const la = parseFloat(lat), lo = parseFloat(lng);
  return la >= -90 && la <= 90 && lo >= -180 && lo <= 180;
}
function validateServiceType(type) { return ['ambulance', 'police', 'fire'].includes(type); }
function generateVerificationCode() { return Math.floor(100000 + Math.random() * 900000).toString(); }
async function hashCode(code) { return await bcrypt.hash(code, 10); }
function generateToken(userId) { return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' }); }
function verifyToken(token) {
  try { return jwt.verify(token, process.env.JWT_SECRET); } catch { return null; }
}

function authenticateToken(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  const decoded = verifyToken(token);
  if (!decoded) return res.status(403).json({ error: 'Invalid token' });
  req.userId = decoded.userId;
  next();
}

async function checkRole(req, res, next) {
  try {
    const r = await pool.query('SELECT user_type, dispatch_center_id FROM users WHERE id = $1', [req.userId]);
    if (!r.rows.length) return res.status(404).json({ error: 'User not found' });
    req.userType = r.rows[0].user_type;
    req.dispatchCenterId = r.rows[0].dispatch_center_id;
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to verify user role' });
  }
}

// ── AUTH ──────────────────────────────────────────────────────────────────

app.post('/api/auth/send-code', authLimiter, async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number required' });
    if (!validatePhone(phone)) return res.status(400).json({ error: 'Invalid phone number format' });
    const code = generateVerificationCode();
    const codeHash = await hashCode(code);
    const expiresAt = new Date(Date.now() + 10 * 60000);
    await pool.query(
      'INSERT INTO verification_codes (phone, code, code_hash, expires_at) VALUES ($1, $2, $3, $4)',
      [phone, code, codeHash, expiresAt]
    );
    console.log(`Verification code for ${phone}: ${code}`);
    res.json({ success: true, message: 'Code sent.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send code' });
  }
});

app.post('/api/auth/verify-code', authLimiter, async (req, res) => {
  try {
    const { phone, code, first_name, last_name } = req.body;
    if (!phone || !code) return res.status(400).json({ error: 'Phone and code required' });
    if (!validatePhone(phone)) return res.status(400).json({ error: 'Invalid phone number' });

    const codeResult = await pool.query(
      'SELECT * FROM verification_codes WHERE phone = $1 AND verified = FALSE ORDER BY created_at DESC LIMIT 1',
      [phone]
    );
    if (!codeResult.rows.length) return res.status(400).json({ error: 'No verification code found' });
    const record = codeResult.rows[0];
    if (new Date() > new Date(record.expires_at)) return res.status(400).json({ error: 'Code expired' });
    const codeValid = await bcrypt.compare(code, record.code_hash);
    if (!codeValid) return res.status(400).json({ error: 'Invalid code' });
    await pool.query('UPDATE verification_codes SET verified = TRUE WHERE id = $1', [record.id]);

    let userResult = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
    let user;
    let isNewUser = false;

    if (!userResult.rows.length) {
      // New user — require name
      if (!first_name || !last_name) {
        return res.status(200).json({ success: true, requires_profile: true, message: 'Please provide name to complete signup' });
      }
      const created = await pool.query(
        'INSERT INTO users (phone, user_type, first_name, last_name) VALUES ($1, $2, $3, $4) RETURNING id, phone, user_type, dispatch_center_id, first_name, last_name',
        [phone, 'caller', first_name.trim(), last_name.trim()]
      );
      user = created.rows[0];
      isNewUser = true;
    } else {
      user = userResult.rows[0];
      // Update name if provided
      if (first_name && last_name) {
        await pool.query(
          'UPDATE users SET first_name = $1, last_name = $2 WHERE id = $3',
          [first_name.trim(), last_name.trim(), user.id]
        );
        user.first_name = first_name.trim();
        user.last_name = last_name.trim();
      }
    }

    const token = generateToken(user.id);
    res.json({
      success: true, token, is_new_user: isNewUser,
      user: { id: user.id, phone: user.phone, user_type: user.user_type, dispatch_center_id: user.dispatch_center_id, first_name: user.first_name, last_name: user.last_name }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT id, phone, user_type, dispatch_center_id, first_name, last_name FROM users WHERE id = $1',
      [req.userId]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// ── EMERGENCIES ───────────────────────────────────────────────────────────

app.post('/api/emergencies', authenticateToken, async (req, res) => {
  try {
    const { latitude, longitude, service_type, description, dispatch_center_id } = req.body;
    if (!latitude || !longitude || !service_type || !dispatch_center_id)
      return res.status(400).json({ error: 'Missing required fields' });
    if (!validateCoordinates(latitude, longitude)) return res.status(400).json({ error: 'Invalid coordinates' });
    if (!validateServiceType(service_type)) return res.status(400).json({ error: 'Invalid service type' });
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
    if (req.userType !== 'dispatcher') return res.status(403).json({ error: 'Only dispatchers can view emergencies' });
    if (!req.dispatchCenterId) return res.status(403).json({ error: 'Dispatcher not assigned to a center' });
    const { status } = req.query;
    let query = `SELECT e.*, a.unit_number, a.driver_name, a.driver_phone,
                   u.phone as user_phone, u.first_name, u.last_name
                   FROM emergencies e 
                   LEFT JOIN ambulances a ON e.assigned_ambulance_id = a.id
                   LEFT JOIN users u ON e.user_id = u.id
                   WHERE e.dispatch_center_id = $1`;
    const params = [req.dispatchCenterId];
    if (status) { query += ' AND e.status = $2'; params.push(status); }
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
              u.phone as user_phone, u.first_name, u.last_name
       FROM emergencies e
       LEFT JOIN ambulances a ON e.assigned_ambulance_id = a.id
       LEFT JOIN users u ON e.user_id = u.id
       WHERE e.id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Emergency not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get emergency' });
  }
});

app.patch('/api/emergencies/:id/confirm', authenticateToken, checkRole, async (req, res) => {
  try {
    if (req.userType !== 'dispatcher') return res.status(403).json({ error: 'Only dispatchers can confirm' });
    const e = await pool.query('SELECT dispatch_center_id FROM emergencies WHERE id = $1', [req.params.id]);
    if (!e.rows.length) return res.status(404).json({ error: 'Emergency not found' });
    if (e.rows[0].dispatch_center_id !== req.dispatchCenterId) return res.status(403).json({ error: 'No permission' });
    const result = await pool.query(
      'UPDATE emergencies SET status = $1, dispatcher_id = $2, confirmed_at = NOW() WHERE id = $3 RETURNING *',
      ['confirmed', req.userId, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to confirm' });
  }
});

app.patch('/api/emergencies/:id/reject', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE emergencies SET status = 'cancelled', cancelled_by = 'dispatcher', rejected_at = NOW() WHERE id = $1 RETURNING *",
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Emergency not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reject' });
  }
});

app.patch('/api/emergencies/:id/cancel', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE emergencies SET status = 'cancelled', cancelled_by = 'user', rejected_at = NOW()
       WHERE id = $1 AND user_id = $2 AND status NOT IN ('completed','cancelled','rejected') RETURNING *`,
      [req.params.id, req.userId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found or cannot cancel' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.patch('/api/emergencies/:id/assign-ambulance', authenticateToken, checkRole, async (req, res) => {
  try {
    const { ambulance_id } = req.body;
    if (!ambulance_id) return res.status(400).json({ error: 'Ambulance ID required' });
    if (req.userType !== 'dispatcher') return res.status(403).json({ error: 'Only dispatchers' });
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

// ── AMBULANCES ────────────────────────────────────────────────────────────

app.get('/api/ambulances', authenticateToken, checkRole, async (req, res) => {
  try {
    if (req.userType !== 'dispatcher') return res.status(403).json({ error: 'Only dispatchers' });
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

app.get('/api/ambulances/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, unit_number, driver_name, latitude, longitude, last_location_update FROM ambulances WHERE id = $1',
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Ambulance not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── DISPATCH CENTERS ──────────────────────────────────────────────────────

app.get('/api/dispatch-centers', async (req, res) => {
  try {
    const { service_type } = req.query;
    let query = 'SELECT id, name, city, service_type, phone FROM dispatch_centers';
    const params = [];
    if (service_type && validateServiceType(service_type)) { query += ' WHERE service_type = $1'; params.push(service_type); }
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get dispatch centers' });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ── DRIVER ────────────────────────────────────────────────────────────────

app.get('/api/driver/assigned-call', authenticateToken, async (req, res) => {
  try {
    const ambR = await pool.query('SELECT id FROM ambulances WHERE driver_user_id = $1', [req.userId]);
    if (!ambR.rows.length) return res.json({ call: null });
    const callR = await pool.query(
      `SELECT e.id, e.latitude, e.longitude, e.status, e.created_at,
              u.phone AS caller_phone, u.first_name, u.last_name
       FROM emergencies e LEFT JOIN users u ON e.user_id = u.id
       WHERE e.assigned_ambulance_id = $1 AND e.status NOT IN ('completed','rejected','cancelled')
       ORDER BY e.created_at DESC LIMIT 1`,
      [ambR.rows[0].id]
    );
    res.json({ call: callR.rows[0] || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.patch('/api/driver/location', authenticateToken, async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    if (!latitude || !longitude) return res.status(400).json({ error: 'Coordinates required' });
    if (!validateCoordinates(latitude, longitude)) return res.status(400).json({ error: 'Invalid coordinates' });
    const result = await pool.query(
      'UPDATE ambulances SET latitude = $1, longitude = $2, last_location_update = NOW() WHERE driver_user_id = $3 RETURNING id',
      [latitude, longitude, req.userId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'No ambulance linked' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.patch('/api/driver/start/:callId', authenticateToken, async (req, res) => {
  try {
    const ambR = await pool.query('SELECT id FROM ambulances WHERE driver_user_id = $1', [req.userId]);
    if (!ambR.rows.length) return res.status(404).json({ error: 'No ambulance linked' });
    const result = await pool.query(
      "UPDATE emergencies SET status = 'on_the_way', dispatched_at = NOW() WHERE id = $1 AND assigned_ambulance_id = $2 RETURNING *",
      [req.params.callId, ambR.rows[0].id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Call not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.patch('/api/driver/arrived/:callId', authenticateToken, async (req, res) => {
  try {
    const ambR = await pool.query('SELECT id FROM ambulances WHERE driver_user_id = $1', [req.userId]);
    if (!ambR.rows.length) return res.status(404).json({ error: 'No ambulance linked' });
    const eR = await pool.query('SELECT id FROM emergencies WHERE id = $1 AND assigned_ambulance_id = $2', [req.params.callId, ambR.rows[0].id]);
    if (!eR.rows.length) return res.status(404).json({ error: 'Call not found' });
    await pool.query("UPDATE emergencies SET status = 'arrived', arrived_at = NOW() WHERE id = $1", [req.params.callId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.patch('/api/driver/complete/:callId', authenticateToken, async (req, res) => {
  try {
    const ambR = await pool.query('SELECT id FROM ambulances WHERE driver_user_id = $1', [req.userId]);
    if (!ambR.rows.length) return res.status(404).json({ error: 'No ambulance linked' });
    const eR = await pool.query('SELECT id FROM emergencies WHERE id = $1 AND assigned_ambulance_id = $2', [req.params.callId, ambR.rows[0].id]);
    if (!eR.rows.length) return res.status(404).json({ error: 'Call not found' });
    await pool.query("UPDATE emergencies SET status = 'completed', completed_at = NOW() WHERE id = $1", [req.params.callId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.patch('/api/driver/cancel/:callId', authenticateToken, async (req, res) => {
  try {
    const ambR = await pool.query('SELECT id FROM ambulances WHERE driver_user_id = $1', [req.userId]);
    if (!ambR.rows.length) return res.status(404).json({ error: 'No ambulance linked' });
    const result = await pool.query(
      "UPDATE emergencies SET status = 'cancelled', cancelled_by = 'driver', assigned_ambulance_id = NULL, rejected_at = NOW() WHERE id = $1 AND assigned_ambulance_id = $2 RETURNING *",
      [req.params.callId, ambR.rows[0].id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Call not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/driver/available-calls', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.id, e.latitude, e.longitude, e.status, e.created_at, e.description,
              u.phone AS caller_phone, u.first_name, u.last_name
       FROM emergencies e LEFT JOIN users u ON e.user_id = u.id
       WHERE e.status = 'confirmed' ORDER BY e.created_at DESC`
    );
    res.json({ calls: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/driver/call-history', authenticateToken, async (req, res) => {
  try {
    const ambR = await pool.query('SELECT id FROM ambulances WHERE driver_user_id = $1', [req.userId]);
    if (!ambR.rows.length) return res.json({ calls: [] });
    const result = await pool.query(
      `SELECT e.id, e.latitude, e.longitude, e.status, e.created_at,
              u.phone AS caller_phone, u.first_name, u.last_name
       FROM emergencies e LEFT JOIN users u ON e.user_id = u.id
       WHERE e.assigned_ambulance_id = $1 ORDER BY e.created_at DESC`,
      [ambR.rows[0].id]
    );
    res.json({ calls: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/driver/accept-call/:callId', authenticateToken, async (req, res) => {
  try {
    const ambR = await pool.query('SELECT id FROM ambulances WHERE driver_user_id = $1', [req.userId]);
    if (!ambR.rows.length) return res.status(404).json({ error: 'No ambulance linked' });
    const check = await pool.query("SELECT id FROM emergencies WHERE id = $1 AND status = 'confirmed'", [req.params.callId]);
    if (!check.rows.length) return res.status(409).json({ error: 'Bu chaqiruv allaqachon qabul qilingan' });
    const result = await pool.query(
      "UPDATE emergencies SET assigned_ambulance_id = $1, status = 'assigned', dispatched_at = NOW() WHERE id = $2 AND status = 'confirmed' RETURNING *",
      [ambR.rows[0].id, req.params.callId]
    );
    if (!result.rows.length) return res.status(409).json({ error: 'Bu chaqiruv allaqachon qabul qilingan' });
    res.json({ success: true, call: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Emergency dispatch backend running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
});
