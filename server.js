require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');

let admin;
try {
  admin = require('firebase-admin');
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        project_id: process.env.FIREBASE_PROJECT_ID,
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
    console.log('Firebase Admin initialized successfully');
  }
} catch (err) {
  console.error('Firebase Admin init error:', err.message);
  admin = null;
}

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

// Run migrations on startup
(async () => {
  try {
    await pool.query("ALTER TABLE ambulances ADD COLUMN IF NOT EXISTS service_type VARCHAR(50) DEFAULT 'ambulance'");
    await pool.query("ALTER TABLE ambulances ADD COLUMN IF NOT EXISTS login_code VARCHAR(20)");
    await pool.query("ALTER TABLE ambulances ADD COLUMN IF NOT EXISTS driver_user_id INTEGER");
    console.log('✅ Migrations complete');
  } catch(e) { console.log('Migration:', e.message); }
})();

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

    // skip_user_create: just verify OTP, don't create user (used for email registration flow)
    if (req.body.skip_user_create) {
      await pool.query('UPDATE verification_codes SET verified = TRUE WHERE id = $1', [record.id]);
      return res.json({ success: true, verified: true });
    }

    let userResult = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
    let user;
    const requestedRole = req.body.role; // 'driver' or 'caller'
    if (!userResult.rows.length) {
      // New user — if they claim to be a driver, reject (drivers must be pre-registered)
      if (requestedRole === 'driver') {
        return res.status(403).json({ error: "Siz haydovchi sifatida ro'yxatdan o'tilmagan. Iltimos administrator bilan bog'laning." });
      }
      // New caller — don't mark OTP verified yet, ask for profile first
      if (!first_name || !last_name) {
        return res.status(200).json({ success: true, requires_profile: true });
      }
      // Has name — mark verified and create user
      await pool.query('UPDATE verification_codes SET verified = TRUE WHERE id = $1', [record.id]);
      const created = await pool.query(
        'INSERT INTO users (phone, user_type, first_name, last_name) VALUES ($1, $2, $3, $4) RETURNING id, phone, user_type, dispatch_center_id, first_name, last_name',
        [phone, 'caller', first_name.trim(), last_name.trim()]
      );
      user = created.rows[0];
    } else {
      // Existing user — mark verified
      await pool.query('UPDATE verification_codes SET verified = TRUE WHERE id = $1', [record.id]);
      user = userResult.rows[0];
      if (first_name && last_name) {
        await pool.query('UPDATE users SET first_name = $1, last_name = $2 WHERE id = $3',
          [first_name.trim(), last_name.trim(), user.id]);
        user.first_name = first_name.trim();
        user.last_name = last_name.trim();
      }
    }
    const token = generateToken(user.id);
    res.json({
      success: true, token,
      user: { id: user.id, phone: user.phone, user_type: user.user_type, dispatch_center_id: user.dispatch_center_id, first_name: user.first_name, last_name: user.last_name }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

app.post('/api/auth/verify-firebase', authLimiter, async (req, res) => {
  try {
    const { phone, id_token, first_name, last_name } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone required' });
    if (id_token && admin) {
      try {
        await admin.auth().verifyIdToken(id_token);
      } catch (err) {
        return res.status(401).json({ error: 'Invalid Firebase token' });
      }
    }
    let userResult = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
    let user;
    if (!userResult.rows.length) {
      if (!first_name || !last_name) {
        return res.status(200).json({ success: true, requires_profile: true });
      }
      const created = await pool.query(
        'INSERT INTO users (phone, user_type, first_name, last_name) VALUES ($1, $2, $3, $4) RETURNING id, phone, user_type, dispatch_center_id, first_name, last_name',
        [phone, 'caller', first_name.trim(), last_name.trim()]
      );
      user = created.rows[0];
    } else {
      user = userResult.rows[0];
      if (first_name && last_name) {
        await pool.query('UPDATE users SET first_name = $1, last_name = $2 WHERE id = $3',
          [first_name.trim(), last_name.trim(), user.id]);
        user.first_name = first_name.trim();
        user.last_name = last_name.trim();
      }
    }
    const token = generateToken(user.id);
    res.json({
      success: true, token,
      user: { id: user.id, phone: user.phone, user_type: user.user_type, dispatch_center_id: user.dispatch_center_id, first_name: user.first_name, last_name: user.last_name }
    });
  } catch (err) {
    console.error('Firebase verify error:', err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Email register
app.post('/api/auth/email-register', authLimiter, async (req, res) => {
  try {
    const { email, password, first_name, last_name, phone } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email va parol kerak' });
    if (!first_name || !last_name) return res.status(400).json({ error: 'Ism va familiya kerak' });
    if (!phone) return res.status(400).json({ error: 'Telefon raqam kerak' });
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return res.status(400).json({ error: "Noto'g'ri email format" });
    if (password.length < 8) return res.status(400).json({ error: "Parol kamida 8 ta belgidan iborat bo'lishi kerak" });
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length) return res.status(400).json({ error: 'Bu email allaqachon ro\'yxatdan o\'tgan' });
    if (phone && !validatePhone(phone)) return res.status(400).json({ error: "Noto'g'ri telefon raqam" });
    if (phone) {
      const existingPhone = await pool.query('SELECT id FROM users WHERE phone = $1', [phone]);
      if (existingPhone.rows.length) return res.status(400).json({ error: "Bu telefon raqam allaqachon ro'yxatdan o'tgan" });
    }
    const password_hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, first_name, last_name, user_type, phone) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, phone, first_name, last_name, user_type',
      [email.toLowerCase(), password_hash, first_name.trim(), last_name.trim(), 'caller', phone || null]
    );
    const user = result.rows[0];
    const token = generateToken(user.id);
    res.status(201).json({ success: true, token, user });
  } catch (err) {
    console.error('Email register error:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// Email login
app.post('/api/auth/email-login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email va parol kerak' });
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    if (!result.rows.length) return res.status(400).json({ error: "Email yoki parol noto'g'ri" });
    const user = result.rows[0];
    if (!user.password_hash) return res.status(400).json({ error: 'Bu hisob telefon raqam orqali ro\'yxatdan o\'tgan' });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(400).json({ error: "Email yoki parol noto'g'ri" });
    const token = generateToken(user.id);
    res.json({
      success: true, token,
      user: { id: user.id, email: user.email, first_name: user.first_name, last_name: user.last_name, user_type: user.user_type, dispatch_center_id: user.dispatch_center_id }
    });
  } catch (err) {
    console.error('Email login error:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const r = await pool.query('SELECT id, phone, user_type, dispatch_center_id, first_name, last_name FROM users WHERE id = $1', [req.userId]);
    if (!r.rows.length) return res.status(404).json({ error: 'User not found' });
    const countR = await pool.query('SELECT COUNT(*) as count FROM emergencies WHERE user_id = $1', [req.userId]);
    const user = r.rows[0];
    user.call_count = parseInt(countR.rows[0].count);
    res.json(user);
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
    const newEmergency = result.rows[0];
    if (global.io) global.io.emit('emergency_created', newEmergency);
    res.status(201).json(newEmergency);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create emergency' });
  }
});

app.get('/api/emergencies', authenticateToken, checkRole, async (req, res) => {
  try {
    if (req.userType !== 'dispatcher') return res.status(403).json({ error: 'Only dispatchers' });
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

app.get('/api/emergencies/my/last', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, status, created_at, service_type FROM emergencies WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [req.userId]
    );
    res.json(result.rows[0] || null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/emergencies/my/history', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, status, created_at, service_type FROM emergencies WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
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
    if (req.userType !== 'dispatcher') return res.status(403).json({ error: 'Only dispatchers' });
    const e = await pool.query('SELECT dispatch_center_id FROM emergencies WHERE id = $1', [req.params.id]);
    if (!e.rows.length) return res.status(404).json({ error: 'Not found' });
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
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
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
    res.status(500).json({ error: 'Failed to assign' });
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
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
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

app.post('/api/admin/seed-dispatch-centers', authenticateToken, checkRole, async (req, res) => {
  try {
    if (req.userType !== 'dispatcher') return res.status(403).json({ error: 'Only dispatchers' });
    const centers = [
      { name: 'Toshkent Tez Yordam Markazi', city: 'Toshkent', service_type: 'ambulance', phone: '+998712345678' },
      { name: 'Toshkent Politsiya Boshqarmasi', city: 'Toshkent', service_type: 'police', phone: '+998712345679' },
      { name: "Toshkent Yong'in Xavfsizligi", city: 'Toshkent', service_type: 'fire', phone: '+998712345680' },
    ];
    for (const center of centers) {
      await pool.query(
        `INSERT INTO dispatch_centers (name, city, service_type, phone)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (service_type, city) DO NOTHING`,
        [center.name, center.city, center.service_type, center.phone]
      );
    }
    res.json({ success: true, message: 'Dispatch centers seeded' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to seed dispatch centers' });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ── ADMIN ─────────────────────────────────────────────────────────────────

app.get('/api/admin/drivers', authenticateToken, checkRole, async (req, res) => {
  try {
    if (req.userType !== 'dispatcher') return res.status(403).json({ error: 'Only dispatchers' });
    if (!req.dispatchCenterId) return res.status(403).json({ error: 'No dispatch center assigned' });
    const result = await pool.query(
      `SELECT u.id, u.phone, u.email, u.first_name, u.last_name, u.user_type, u.dispatch_center_id,
              a.id as ambulance_id, a.unit_number, a.driver_name, a.status as ambulance_status
       FROM users u
       LEFT JOIN ambulances a ON u.id = a.driver_user_id
       WHERE u.user_type = 'driver' AND u.dispatch_center_id = $1
       ORDER BY u.created_at DESC`,
      [req.dispatchCenterId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get drivers' });
  }
});

app.post('/api/admin/drivers', authenticateToken, checkRole, async (req, res) => {
  try {
    const { phone, email, password, first_name, last_name, unit_number, dispatch_center_id } = req.body;
    if (!phone || !first_name || !last_name || !unit_number) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (req.userType !== 'dispatcher') return res.status(403).json({ error: 'Only dispatchers' });
    const password_hash = await bcrypt.hash(password || '123456', 10);
    const userResult = await pool.query(
      'INSERT INTO users (phone, email, password_hash, first_name, last_name, user_type, dispatch_center_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [phone, email || null, password_hash, first_name, last_name, 'driver', dispatch_center_id || req.dispatchCenterId]
    );
    const userId = userResult.rows[0].id;
    const ambulanceResult = await pool.query(
      'INSERT INTO ambulances (unit_number, driver_name, driver_phone, driver_user_id, dispatch_center_id, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [unit_number, `${first_name} ${last_name}`, phone, userId, dispatch_center_id || req.dispatchCenterId, 'available']
    );
    res.status(201).json({ user: userResult.rows[0], ambulance: ambulanceResult.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add driver' });
  }
});

app.patch('/api/admin/drivers/:id/block', authenticateToken, checkRole, async (req, res) => {
  try {
    if (req.userType !== 'dispatcher') return res.status(403).json({ error: 'Only dispatchers' });
    const { blocked } = req.body;
    const result = await pool.query(
      'UPDATE users SET blocked = $1 WHERE id = $2 AND user_type = $3 RETURNING *',
      [blocked, req.params.id, 'driver']
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Driver not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update driver' });
  }
});

app.delete('/api/admin/drivers/:id', authenticateToken, checkRole, async (req, res) => {
  try {
    if (req.userType !== 'dispatcher') return res.status(403).json({ error: 'Only dispatchers' });
    await pool.query('DELETE FROM ambulances WHERE driver_user_id = $1', [req.params.id]);
    await pool.query('DELETE FROM users WHERE id = $1 AND user_type = $2', [req.params.id, 'driver']);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to remove driver' });
  }
});

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


// Update profile name
app.patch('/api/auth/update-profile', authenticateToken, async (req, res) => {
  try {
    const { first_name, last_name } = req.body;
    if (!first_name || !last_name) return res.status(400).json({ error: 'Ism va familiya kerak' });
    await pool.query('UPDATE users SET first_name = $1, last_name = $2 WHERE id = $3', [first_name.trim(), last_name.trim(), req.userId]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server xatosi' }); }
});

// Update email
app.patch('/api/auth/update-email', authenticateToken, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email kerak' });
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return res.status(400).json({ error: "Noto'g'ri email format" });
    const existing = await pool.query('SELECT id FROM users WHERE email = $1 AND id != $2', [email.toLowerCase(), req.userId]);
    if (existing.rows.length) return res.status(400).json({ error: 'Bu email allaqachon ishlatilmoqda' });
    await pool.query('UPDATE users SET email = $1 WHERE id = $2', [email.toLowerCase(), req.userId]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server xatosi' }); }
});

// Change password
app.patch('/api/auth/change-password', authenticateToken, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!new_password || new_password.length < 8) return res.status(400).json({ error: "Yangi parol kamida 8 ta belgi bo'lishi kerak" });
    const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [req.userId]);
    if (!userRes.rows.length) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
    const user = userRes.rows[0];
    if (user.password_hash) {
      if (!current_password) return res.status(400).json({ error: 'Hozirgi parolni kiriting' });
      const valid = await bcrypt.compare(current_password, user.password_hash);
      if (!valid) return res.status(400).json({ error: "Hozirgi parol noto'g'ri" });
    }
    const hash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.userId]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server xatosi' }); }
});

const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PATCH', 'DELETE'] }
});

// Make io accessible in routes
app.set('io', io);

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

// Export io for use in route handlers
global.io = io;


// Generate driver login code (dispatcher only)
app.post('/api/dispatcher/create-driver-code', authenticateToken, checkRole, async (req, res) => {
  try {
    const { unit_number, driver_name, driver_phone } = req.body;
    if (!unit_number || !driver_name) return res.status(400).json({ error: 'unit_number and driver_name required' });

    // Get dispatcher's dispatch center
    const dispR = await pool.query('SELECT dispatch_center_id FROM users WHERE id = $1', [req.userId]);
    const dispatch_center_id = dispR.rows[0]?.dispatch_center_id;
    if (!dispatch_center_id) return res.status(400).json({ error: 'Dispatcher has no dispatch center' });

    // Get service type from dispatch center
    const centerR = await pool.query('SELECT service_type FROM dispatch_centers WHERE id = $1', [dispatch_center_id]);
    const service_type = centerR.rows[0]?.service_type || 'ambulance';

    // Generate unique 8-char login code
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let login_code;
    let exists = true;
    while (exists) {
      login_code = Array.from({length: 8}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      const check = await pool.query('SELECT id FROM ambulances WHERE login_code = $1', [login_code]);
      exists = check.rows.length > 0;
    }

    // Create ambulance record with login code (no user yet)
    const result = await pool.query(
      'INSERT INTO ambulances (unit_number, driver_name, driver_phone, dispatch_center_id, service_type, login_code, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [unit_number, driver_name, driver_phone || '', dispatch_center_id, service_type, login_code, 'available']
    );

    res.json({ success: true, login_code, ambulance: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get all drivers for dispatcher
app.get('/api/dispatcher/drivers', authenticateToken, checkRole, async (req, res) => {
  try {
    const dispR = await pool.query('SELECT dispatch_center_id FROM users WHERE id = $1', [req.userId]);
    const dispatch_center_id = dispR.rows[0]?.dispatch_center_id;
    const result = await pool.query(
      'SELECT id, unit_number, driver_name, driver_phone, service_type, login_code, status, driver_user_id FROM ambulances WHERE dispatch_center_id = $1 ORDER BY created_at DESC',
      [dispatch_center_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete driver
app.delete('/api/dispatcher/drivers/:id', authenticateToken, checkRole, async (req, res) => {
  try {
    await pool.query('DELETE FROM ambulances WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Driver login with code (no OTP needed)
app.post('/api/auth/driver-login', async (req, res) => {
  try {
    const { login_code, phone } = req.body;
    if (!login_code || !phone) return res.status(400).json({ error: 'login_code and phone required' });

    // Find ambulance by login code
    const ambR = await pool.query(
      'SELECT a.*, dc.service_type as center_service_type FROM ambulances a LEFT JOIN dispatch_centers dc ON a.dispatch_center_id = dc.id WHERE a.login_code = $1',
      [login_code.toUpperCase()]
    );
    if (!ambR.rows.length) return res.status(404).json({ error: "Noto'g'ri login kod. Dispetcher bilan bog'laning." });
    const ambulance = ambR.rows[0];

    const service_type = ambulance.service_type || ambulance.center_service_type || 'ambulance';

    // Find or create user for this phone
    let userR = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
    let user;
    if (!userR.rows.length) {
      const created = await pool.query(
        'INSERT INTO users (phone, user_type, first_name, last_name) VALUES ($1, $2, $3, $4) RETURNING *',
        [phone, 'driver', ambulance.driver_name?.split(' ')[0] || 'Hodim', ambulance.driver_name?.split(' ')[1] || '']
      );
      user = created.rows[0];
    } else {
      user = userR.rows[0];
      // Update user_type to driver if not already
      if (user.user_type !== 'driver') {
        await pool.query('UPDATE users SET user_type = $1 WHERE id = $2', ['driver', user.id]);
        user.user_type = 'driver';
      }
    }

    // Link user to ambulance
    await pool.query('UPDATE ambulances SET driver_user_id = $1 WHERE id = $2', [user.id, ambulance.id]);

    // Generate JWT
    const token = jwt.sign({ userId: user.id, userType: 'driver' }, process.env.JWT_SECRET, { expiresIn: '30d' });

    res.json({
      success: true,
      token,
      user: { ...user, service_type },
      service_type,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Emergency dispatch backend running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
});
