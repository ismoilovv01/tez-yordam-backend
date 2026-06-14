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
  windowMs: 15 * 60 * 1000, max: 2000,
  message: 'Too many requests from this IP, please try again later.'
});

// Per-phone rate limit: max 10 OTP requests per phone per 10 minutes
const phoneOtpCounts = new Map();
function phoneRateLimit(req, res, next) {
  const phone = req.body?.phone;
  if (!phone) return next();
  const now = Date.now();
  const windowMs = 10 * 60 * 1000; // 10 minutes
  const max = 10;
  const entry = phoneOtpCounts.get(phone) || { count: 0, resetAt: now + windowMs };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + windowMs;
  }
  entry.count++;
  phoneOtpCounts.set(phone, entry);
  if (entry.count > max) {
    return res.status(429).json({ error: '10 daqiqa ichida juda ko\'p urinish. Iltimos kuting.' });
  }
  next();
}

// Keep authLimiter as a very loose fallback (per-IP, very high limit)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 9999,
  message: 'Too many requests',
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
    await pool.query("ALTER TABLE ambulances ADD COLUMN IF NOT EXISTS plate_region VARCHAR(10)");
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked BOOLEAN DEFAULT FALSE");
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(100)");
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(100)");
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS login_code VARCHAR(20) UNIQUE");
    await pool.query("CREATE TABLE IF NOT EXISTS telegram_users (id SERIAL PRIMARY KEY, phone VARCHAR(20) UNIQUE NOT NULL, chat_id VARCHAR(50) NOT NULL, created_at TIMESTAMP DEFAULT NOW())");
    await pool.query("CREATE TABLE IF NOT EXISTS allowed_phones (id SERIAL PRIMARY KEY, phone VARCHAR(20) UNIQUE NOT NULL, note VARCHAR(100), created_at TIMESTAMP DEFAULT NOW())");
    console.log('Р В Р вЂ Р РЋРЎв„ўР Р†Р вЂљР’В¦ DB migrations done');
    console.log('Р В Р вЂ Р РЋРЎв„ўР Р†Р вЂљР’В¦ Migrations complete');
  } catch(e) { console.log('Migration:', e.message); }
})();

pool.query('SELECT NOW()', (err) => {
  if (err) console.error('Database connection error:', err);
  else console.log('Database connected successfully');
});

function validatePhone(phone) { return /^\+?[0-9]{10,15}$/.test(phone); }

function generateLoginCode(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < length; i++) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}
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

// Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™ TELEGRAM BOT Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8822164884:AAHl1iSW_PeBX2LxQM2cQQ-bhu3CZcnIVgQ';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

async function sendTelegramMessage(chatId, text) {
  try {
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
    });
  } catch (err) {
    console.error('Telegram send error:', err);
  }
}

// Telegram webhook Р В Р вЂ Р В РІР‚С™Р Р†Р вЂљРЎСљ handles /start and phone number messages
app.post('/api/telegram/webhook', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.json({ ok: true });
    const chatId = message.chat.id;
    const text = message.text || '';
    const contact = message.contact;

    if (text === '/start') {
      await sendTelegramMessage(chatId,
        'Р РЋР вЂљР РЋРЎСџР Р†Р вЂљР’ВР Р†Р вЂљРІвЂћвЂ“ Salom! <b>Help Me</b> ilovasiga xush kelibsiz!\n\n' +
        'Telefon raqamingizni yuboring (misol: +998901234567) va biz sizni tizimga boglaymiz.\n\n' +
        'Keyin ilova orqali kirganingizda OTP kodni Telegram orqali olasiz! Р РЋР вЂљР РЋРЎСџР Р†Р вЂљРЎСљР РЋРІР‚в„ў'
      );
    } else if (text.match(/^\+?998[0-9]{9}$/)) {
      const phone = text.startsWith('+') ? text : '+' + text;
      await pool.query(
        'INSERT INTO telegram_users (phone, chat_id) VALUES ($1, $2) ON CONFLICT (phone) DO UPDATE SET chat_id = $2',
        [phone, chatId.toString()]
      );
      await sendTelegramMessage(chatId,
        `Р В Р вЂ Р РЋРЎв„ўР Р†Р вЂљР’В¦ Telefon raqamingiz <b>${phone}</b> muvaffaqiyatli bog'landi!\n\n` +
        'Endi ilova orqali kirishda OTP kodni shu yerda olasiz. Р РЋР вЂљР РЋРЎСџР В РІР‚в„–Р Р†Р вЂљР’В°'
      );
    } else {
      await sendTelegramMessage(chatId,
        'Р РЋР вЂљР РЋРЎСџР Р†Р вЂљРЎС™Р вЂ™Р’В± Telefon raqamingizni yuboring (misol: <code>+998901234567</code>)'
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Telegram webhook error:', err);
    res.json({ ok: true });
  }
});

// Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™ AUTH Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™

app.post('/api/auth/send-code', phoneRateLimit, async (req, res) => {
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
    // Try to send via Eskiz SMS
    let sentViaSMS = false;
    try {
      const eskizEmail = process.env.ESKIZ_EMAIL || 'diyorbekismoil01@gmail.com';
      const eskizPassword = process.env.ESKIZ_PASSWORD || 'Qwerty2005120';
      // Get token
      const tokenRes = await fetch('https://notify.eskiz.uz/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: eskizEmail, password: eskizPassword })
      });
      const tokenData = await tokenRes.json();
      const eskizToken = tokenData?.data?.token;
      if (eskizToken) {
        const smsRes = await fetch('https://notify.eskiz.uz/api/message/sms/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${eskizToken}` },
          body: JSON.stringify({
            mobile_phone: phone.replace('+', ''),
            message: `Help Me: Tasdiqlash kodingiz: ${code}. Kod 10 daqiqa amal qiladi.`,
            from: '4546',
            callback_url: ''
          })
        });
        const smsData = await smsRes.json();
        if (smsData?.status === 'waiting') {
          sentViaSMS = true;
          console.log(`OTP sent via Eskiz SMS to ${phone}`);
        } else {
          console.log('Eskiz SMS response:', JSON.stringify(smsData));
        }
      }
    } catch (e) { console.error('Eskiz SMS error:', e); }
    // Try to send via Telegram
    let sentViaTelegram = false;
    try {
      const tgUser = await pool.query('SELECT chat_id FROM telegram_users WHERE phone = $1', [phone]);
      if (tgUser.rows.length) {
        await sendTelegramMessage(tgUser.rows[0].chat_id,
          `<b>Help Me</b> - Tasdiqlash kodi:\n\n<code>${code}</code>\n\nKod 10 daqiqa davomida amal qiladi.`
        );
        sentViaTelegram = true;
        console.log(`OTP sent via Telegram to ${phone}`);
      }
    } catch (e) { console.error('Telegram OTP error:', e); }
    res.json({ success: true, message: 'Code sent.', via_sms: sentViaSMS, via_telegram: sentViaTelegram });
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
    const requestedRole = req.body.role;
    if (!userResult.rows.length) {
      if (requestedRole === 'driver') {
        return res.status(403).json({ error: "Siz haydovchi sifatida ro'yxatdan o'tilmagan. Iltimos administrator bilan bog'laning." });
      }
      if (!first_name || !last_name) {
        return res.status(200).json({ success: true, requires_profile: true });
      }
      await pool.query('UPDATE verification_codes SET verified = TRUE WHERE id = $1', [record.id]);
      const created = await pool.query(
        'INSERT INTO users (phone, user_type, first_name, last_name) VALUES ($1, $2, $3, $4) RETURNING id, phone, user_type, dispatch_center_id, first_name, last_name',
        [phone, 'caller', first_name.trim(), last_name.trim()]
      );
      user = created.rows[0];
    } else {
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
    if (existing.rows.length) return res.status(400).json({ error: "Bu email allaqachon ro'yxatdan o'tgan" });
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
    if (!user.password_hash) return res.status(400).json({ error: "Bu hisob telefon raqam orqali ro'yxatdan o'tgan" });
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
    const countR = await pool.query('SELECT COUNT(*) as count FROM emergencies WHERE user_id = $1 AND created_at >= (SELECT created_at FROM users WHERE id = $1)', [req.userId]);
    const user = r.rows[0];
    user.call_count = parseInt(countR.rows[0].count);
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™ EMERGENCIES Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™

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
    if (!['dispatcher','center_admin'].includes(req.userType)) return res.status(403).json({ error: 'Only dispatchers' });
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
      `SELECT e.*, a.unit_number, a.plate_region, a.driver_name, a.driver_phone, a.latitude as amb_lat, a.longitude as amb_lng,
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
    if (!['dispatcher','center_admin'].includes(req.userType)) return res.status(403).json({ error: 'Only dispatchers' });
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
    if (!['dispatcher','center_admin'].includes(req.userType)) return res.status(403).json({ error: 'Only dispatchers' });
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

// Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™ AMBULANCES Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™

app.get('/api/ambulances', authenticateToken, checkRole, async (req, res) => {
  try {
    if (!['dispatcher','center_admin'].includes(req.userType)) return res.status(403).json({ error: 'Only dispatchers' });
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

// Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™ DISPATCH CENTERS Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™

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
    if (!['dispatcher','center_admin'].includes(req.userType)) return res.status(403).json({ error: 'Only dispatchers' });
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

// Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™ ADMIN Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™

app.get('/api/admin/drivers', authenticateToken, checkRole, async (req, res) => {
  try {
    if (!['dispatcher','center_admin'].includes(req.userType)) return res.status(403).json({ error: 'Only dispatchers' });
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
    if (!['dispatcher','center_admin'].includes(req.userType)) return res.status(403).json({ error: 'Only dispatchers' });
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
    if (!['dispatcher','center_admin'].includes(req.userType)) return res.status(403).json({ error: 'Only dispatchers' });
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
    if (!['dispatcher','center_admin'].includes(req.userType)) return res.status(403).json({ error: 'Only dispatchers' });
    await pool.query('DELETE FROM ambulances WHERE driver_user_id = $1', [req.params.id]);
    await pool.query('DELETE FROM users WHERE id = $1 AND user_type = $2', [req.params.id, 'driver']);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to remove driver' });
  }
});

// Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™ DRIVER Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™

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

app.set('io', io);

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

global.io = io;

// Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™ DISPATCHER HODIM MANAGEMENT Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™

app.post('/api/dispatcher/create-driver-code', authenticateToken, checkRole, async (req, res) => {
  try {
    const { unit_number, driver_name, driver_phone, plate_region } = req.body;
    if (!unit_number || !driver_name) return res.status(400).json({ error: 'unit_number and driver_name required' });

    const dispR = await pool.query('SELECT dispatch_center_id FROM users WHERE id = $1', [req.userId]);
    const dispatch_center_id = dispR.rows[0]?.dispatch_center_id;
    if (!dispatch_center_id) return res.status(400).json({ error: 'Dispatcher has no dispatch center' });

    const centerR = await pool.query('SELECT service_type FROM dispatch_centers WHERE id = $1', [dispatch_center_id]);
    const service_type = centerR.rows[0]?.service_type || 'ambulance';

    if (driver_phone) {
      const fullPhone = '+998' + driver_phone.replace('+998','').replace(/[^0-9]/g,'');
      const dupPhone = await pool.query(
        "SELECT id FROM ambulances WHERE driver_phone = $1 AND dispatch_center_id = $2 AND login_code NOT LIKE 'OLD-%'",
        [fullPhone, dispatch_center_id]
      );
      if (dupPhone.rows.length > 0) return res.status(400).json({ error: "Bu telefon raqam allaqachon ro'yxatdan o'tgan" });
    }
    if (unit_number && plate_region) {
      const dupPlate = await pool.query(
        "SELECT id FROM ambulances WHERE unit_number = $1 AND plate_region = $2 AND dispatch_center_id = $3 AND login_code NOT LIKE 'OLD-%'",
        [unit_number, plate_region, dispatch_center_id]
      );
      if (dupPlate.rows.length > 0) return res.status(400).json({ error: "Bu mashina raqami va viloyat kodi allaqachon ro'yxatdan o'tgan" });
    }

    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let login_code;
    let exists = true;
    while (exists) {
      login_code = Array.from({length: 8}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      const check = await pool.query('SELECT id FROM ambulances WHERE login_code = $1', [login_code]);
      exists = check.rows.length > 0;
    }

    const result = await pool.query(
      'INSERT INTO ambulances (unit_number, driver_name, driver_phone, dispatch_center_id, service_type, login_code, status, plate_region) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [unit_number, driver_name, driver_phone ? '+998' + driver_phone.replace('+998','').replace(/[^0-9]/g,'') : '', dispatch_center_id, service_type, login_code, 'available', plate_region || '']
    );

    res.json({ success: true, login_code, ambulance: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

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

app.patch('/api/dispatcher/drivers/:id', authenticateToken, checkRole, async (req, res) => {
  try {
    const { driver_name, driver_phone, unit_number, plate_region } = req.body;
    await pool.query(
      'UPDATE ambulances SET driver_name=$1, driver_phone=$2, unit_number=$3, plate_region=$4 WHERE id=$5',
      [driver_name, driver_phone ? '+998' + driver_phone.replace('+998','') : '', unit_number, plate_region, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/dispatcher/drivers/:id', authenticateToken, checkRole, async (req, res) => {
  try {
    await pool.query('DELETE FROM ambulances WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™ DRIVER LOGIN WITH CODE Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™Р В Р вЂ Р Р†Р вЂљРЎСљР В РІР‚С™

app.post('/api/auth/driver-login', async (req, res) => {
  try {
    const { login_code, phone } = req.body;
    if (!login_code || !phone) return res.status(400).json({ error: 'login_code and phone required' });

    const ambR = await pool.query(
      'SELECT a.*, dc.service_type as center_service_type FROM ambulances a LEFT JOIN dispatch_centers dc ON a.dispatch_center_id = dc.id WHERE a.login_code = $1',
      [login_code.toUpperCase()]
    );
    if (!ambR.rows.length) return res.status(404).json({ error: "Noto'g'ri login kod. Dispetcher bilan bog'laning." });
    const ambulance = ambR.rows[0];

    const service_type = ambulance.service_type || ambulance.center_service_type || 'ambulance';

    // Parse name from ambulance record (dispatcher-entered name)
    const nameParts = (ambulance.driver_name || 'Hodim').trim().split(' ');
    const firstName = nameParts[0] || 'Hodim';
    const lastName = nameParts.slice(1).join(' ') || '';

    let userR = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
    let user;
    if (!userR.rows.length) {
      // New user Р В Р вЂ Р В РІР‚С™Р Р†Р вЂљРЎСљ create as caller so they can still use app as caller too
      const created = await pool.query(
        'INSERT INTO users (phone, user_type, first_name, last_name) VALUES ($1, $2, $3, $4) RETURNING *',
        [phone, 'caller', firstName, lastName]
      );
      user = created.rows[0];
    } else {
      user = userR.rows[0];
      // NEVER change user_type Р В Р вЂ Р В РІР‚С™Р Р†Р вЂљРЎСљ caller can also be a hodim
      // Only update name if user has no name yet
      if (!user.first_name && !user.last_name) {
        await pool.query(
          'UPDATE users SET first_name = $1, last_name = $2 WHERE id = $3',
          [firstName, lastName, user.id]
        );
        user.first_name = firstName;
        user.last_name = lastName;
      }
    }

    // Link user to ambulance
    await pool.query('UPDATE ambulances SET driver_user_id = $1 WHERE id = $2', [user.id, ambulance.id]);

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


// ── DISPATCHER LOGIN WITH CODE ────────────────────────────────────────────────
// Phone+code login for both center_admin and dispatcher
app.post('/api/auth/dispatcher-login', async (req, res) => {
  try {
    const { phone, code, role } = req.body;
    if (!phone || !code) return res.status(400).json({ error: 'Telefon va kod kerak' });
    const allowedRoles = role === 'center_admin' ? ['center_admin'] : ['dispatcher'];
    const result = await pool.query(
      `SELECT u.*, dc.name as center_name, dc.service_type as center_service_type
       FROM users u LEFT JOIN dispatch_centers dc ON u.dispatch_center_id = dc.id
       WHERE u.phone = $1 AND u.login_code = $2 AND u.user_type = ANY($3)`,
      [phone.trim(), code.toUpperCase().trim(), allowedRoles]
    );
    if (!result.rows.length) return res.status(400).json({ error: "Telefon raqam yoki kod noto'g'ri" });
    const user = result.rows[0];
    if (user.blocked) return res.status(403).json({ error: 'Sizning hisobingiz bloklangan' });
    const token = generateToken(user.id);
    res.json({
      success: true, token,
      user: { id: user.id, first_name: user.first_name, last_name: user.last_name, user_type: user.user_type, dispatch_center_id: user.dispatch_center_id, center_name: user.center_name, center_service_type: user.center_service_type }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── CENTER ADMIN ENDPOINTS ────────────────────────────────────────────────────
function requireCenterAdmin(req, res, next) {
  if (!['center_admin', 'admin'].includes(req.userType)) return res.status(403).json({ error: 'Faqat markaz administratori uchun' });
  next();
}

// GET /api/center-admin/dispatchers
app.get('/api/center-admin/dispatchers', authenticateToken, checkRole, requireCenterAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, first_name, last_name, phone, email, login_code, blocked, created_at
       FROM users WHERE user_type = 'dispatcher' AND dispatch_center_id = $1 ORDER BY created_at DESC`,
      [req.dispatchCenterId]
    );
    res.json({ dispatchers: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/center-admin/dispatchers - create dispatcher with login code
app.post('/api/center-admin/dispatchers', authenticateToken, checkRole, requireCenterAdmin, async (req, res) => {
  try {
    const { first_name, last_name, phone } = req.body;
    if (!first_name || !last_name) return res.status(400).json({ error: 'Ism va familiya kerak' });
    // Generate unique code
    let code, attempts = 0;
    do {
      code = generateLoginCode(6);
      const exists = await pool.query('SELECT id FROM users WHERE login_code = $1', [code]);
      if (!exists.rows.length) break;
      attempts++;
    } while (attempts < 10);
    const phoneVal = phone && phone.trim() ? phone.trim() : null;
    if (phoneVal) {
      const dup = await pool.query('SELECT id FROM users WHERE phone = $1', [phoneVal]);
      if (dup.rows.length) return res.status(400).json({ error: 'Bu telefon raqam allaqachon mavjud' });
    }
    const result = await pool.query(
      `INSERT INTO users (first_name, last_name, phone, user_type, dispatch_center_id, login_code)
       VALUES ($1,$2,$3,'dispatcher',$4,$5) RETURNING id, first_name, last_name, phone, login_code, dispatch_center_id`,
      [first_name.trim(), last_name.trim(), phoneVal, req.dispatchCenterId, code]
    );
    res.status(201).json({ dispatcher: result.rows[0], login_code: code });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Bu telefon raqam allaqachon mavjud' });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/center-admin/dispatchers/:id/reset-code - generate new login code
app.post('/api/center-admin/dispatchers/:id/reset-code', authenticateToken, checkRole, requireCenterAdmin, async (req, res) => {
  try {
    let code, attempts = 0;
    do {
      code = generateLoginCode(6);
      const exists = await pool.query('SELECT id FROM users WHERE login_code = $1', [code]);
      if (!exists.rows.length) break;
      attempts++;
    } while (attempts < 10);
    const result = await pool.query(
      `UPDATE users SET login_code=$1 WHERE id=$2 AND dispatch_center_id=$3 AND user_type='dispatcher' RETURNING id`,
      [code, req.params.id, req.dispatchCenterId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Dispetcher topilmadi' });
    res.json({ login_code: code });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/center-admin/dispatchers/:id/block
app.patch('/api/center-admin/dispatchers/:id/block', authenticateToken, checkRole, requireCenterAdmin, async (req, res) => {
  try {
    const { blocked } = req.body;
    const result = await pool.query(
      `UPDATE users SET blocked = $1 WHERE id = $2 AND dispatch_center_id = $3 AND user_type = 'dispatcher' RETURNING id, blocked`,
      [blocked, req.params.id, req.dispatchCenterId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Dispetcher topilmadi' });
    res.json({ success: true, user: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/center-admin/dispatchers/:id
app.delete('/api/center-admin/dispatchers/:id', authenticateToken, checkRole, requireCenterAdmin, async (req, res) => {
  try {
    await pool.query(`DELETE FROM users WHERE id = $1 AND dispatch_center_id = $2 AND user_type = 'dispatcher'`, [req.params.id, req.dispatchCenterId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/center-admin/overview - stats for their center
app.get('/api/center-admin/overview', authenticateToken, checkRole, requireCenterAdmin, async (req, res) => {
  try {
    const [dispatchersR, driversR, emergenciesR] = await Promise.all([
      pool.query(`SELECT COUNT(*) as count FROM users WHERE user_type = 'dispatcher' AND dispatch_center_id = $1`, [req.dispatchCenterId]),
      pool.query(`SELECT COUNT(*) as count FROM ambulances WHERE dispatch_center_id = $1`, [req.dispatchCenterId]),
      pool.query(`SELECT status, COUNT(*) as count FROM emergencies WHERE dispatch_center_id = $1 GROUP BY status`, [req.dispatchCenterId]),
    ]);
    const dcR = await pool.query('SELECT * FROM dispatch_centers WHERE id = $1', [req.dispatchCenterId]);
    res.json({
      dispatch_center: dcR.rows[0] || null,
      dispatcher_count: dispatchersR.rows[0].count,
      driver_count: driversR.rows[0].count,
      emergencies_by_status: emergenciesR.rows,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/center-admin/info - update their dispatch center info
app.patch('/api/center-admin/info', authenticateToken, checkRole, requireCenterAdmin, async (req, res) => {
  try {
    if (!req.dispatchCenterId) return res.status(400).json({ error: 'Siz hech qanday markazga biriktirilmagansiz' });
    const { name, phone, city } = req.body;
    const result = await pool.query(
      `UPDATE dispatch_centers SET name=COALESCE($1,name), phone=COALESCE($2,phone), city=COALESCE($3,city), updated_at=NOW()
       WHERE id=$4 RETURNING *`,
      [name || null, phone || null, city || null, req.dispatchCenterId]
    );
    res.json({ dispatch_center: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/center-admin/stats - weekly/monthly breakdown
app.get('/api/center-admin/stats', authenticateToken, checkRole, requireCenterAdmin, async (req, res) => {
  try {
    const cid = req.dispatchCenterId;
    const [weekly, monthly, byStatus, drivers] = await Promise.all([
      pool.query(`SELECT DATE(created_at) as day, COUNT(*) as count FROM emergencies WHERE dispatch_center_id=$1 AND created_at > NOW()-INTERVAL '7 days' GROUP BY day ORDER BY day`, [cid]),
      pool.query(`SELECT TO_CHAR(created_at,'YYYY-MM') as month, COUNT(*) as count FROM emergencies WHERE dispatch_center_id=$1 AND created_at > NOW()-INTERVAL '6 months' GROUP BY month ORDER BY month`, [cid]),
      pool.query(`SELECT status, COUNT(*) as count FROM emergencies WHERE dispatch_center_id=$1 GROUP BY status`, [cid]),
      pool.query(`SELECT status, COUNT(*) as count FROM ambulances WHERE dispatch_center_id=$1 GROUP BY status`, [cid]),
    ]);
    res.json({ weekly: weekly.rows, monthly: monthly.rows, by_status: byStatus.rows, drivers_by_status: drivers.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── FEEDBACK ─────────────────────────────────────────────────────────────────

// Auto-create feedback table if it doesn't exist
pool.query(`
  CREATE TABLE IF NOT EXISTS feedback (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    emergency_id INTEGER REFERENCES emergencies(id) ON DELETE SET NULL,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    message TEXT,
    type VARCHAR(20) DEFAULT 'general',
    created_at TIMESTAMP DEFAULT NOW()
  )
`).catch(err => console.error('feedback table creation error:', err));

// Submit feedback (caller or driver)
app.post('/api/feedback', authenticateToken, async (req, res) => {
  try {
    const { rating, message, emergency_id, type = 'general' } = req.body;
    if (!message && !rating) return res.status(400).json({ error: 'Rating yoki xabar kerak' });
    if (rating && (rating < 1 || rating > 5)) return res.status(400).json({ error: 'Baho 1-5 orasida bo\'lishi kerak' });
    const result = await pool.query(
      `INSERT INTO feedback (user_id, emergency_id, rating, message, type)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [req.userId, emergency_id || null, rating || null, message || null, type]
    );
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get all feedback (admin only)
app.get('/api/admin/feedback', authenticateToken, checkRole, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT f.*, u.first_name, u.last_name, u.phone,
             e.service_type, e.status as emergency_status
      FROM feedback f
      LEFT JOIN users u ON f.user_id = u.id
      LEFT JOIN emergencies e ON f.emergency_id = e.id
      ORDER BY f.created_at DESC
      LIMIT 200
    `);
    res.json({ feedback: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


// ==================== ADMIN PANEL ====================

// Middleware: require admin user_type (must run after checkRole)
function requireAdmin(req, res, next) {
  if (req.userType !== 'admin') return res.status(403).json({ error: `Faqat administrator uchun (sizning rolingiz: ${req.userType})` });
  next();
}

// GET /api/admin-panel/overview - global dashboard stats (all centers, all services)
app.get('/api/admin-panel/overview', authenticateToken, checkRole, requireAdmin, async (req, res) => {
  try {
    const usersByType = await pool.query('SELECT user_type, COUNT(*) as count FROM users GROUP BY user_type');
    const emergenciesByStatus = await pool.query('SELECT status, COUNT(*) as count FROM emergencies GROUP BY status');
    const emergenciesByService = await pool.query('SELECT service_type, COUNT(*) as count FROM emergencies GROUP BY service_type');
    const unitsByStatus = await pool.query('SELECT status, COUNT(*) as count FROM ambulances GROUP BY status');
    const dispatchCentersCount = await pool.query('SELECT COUNT(*) as count FROM dispatch_centers');
    const recentEmergencies = await pool.query('SELECT id, service_type, status, latitude, longitude, created_at FROM emergencies ORDER BY created_at DESC LIMIT 10');

    res.json({
      users_by_type: usersByType.rows,
      emergencies_by_status: emergenciesByStatus.rows,
      emergencies_by_service: emergenciesByService.rows,
      units_by_status: unitsByStatus.rows,
      dispatch_centers_count: dispatchCentersCount.rows[0].count,
      recent_emergencies: recentEmergencies.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin-panel/users - all users, optional filters: ?user_type=&dispatch_center_id=
app.get('/api/admin-panel/users', authenticateToken, checkRole, requireAdmin, async (req, res) => {
  try {
    const { user_type, dispatch_center_id } = req.query;
    let query = `SELECT u.id, u.email, u.phone, u.first_name, u.last_name, u.user_type,
                         u.dispatch_center_id, COALESCE(u.blocked, false) as blocked, u.created_at,
                         u.login_code, dc.name as dispatch_center_name
                  FROM users u
                  LEFT JOIN dispatch_centers dc ON u.dispatch_center_id = dc.id
                  WHERE 1=1`;
    const params = [];
    if (user_type) {
      params.push(user_type);
      query += ` AND u.user_type = $${params.length}`;
    }
    if (dispatch_center_id) {
      params.push(dispatch_center_id);
      query += ` AND u.dispatch_center_id = $${params.length}`;
    }
    query += ' ORDER BY u.created_at DESC';
    const result = await pool.query(query, params);
    res.json({ users: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin-panel/users - create any user type (dispatcher, caller, admin)
app.post('/api/admin-panel/users', authenticateToken, checkRole, requireAdmin, async (req, res) => {
  try {
    const { password, first_name, last_name, phone, user_type = 'caller', dispatch_center_id, service_type, city } = req.body;
    if (!first_name || !last_name) return res.status(400).json({ error: 'Ism va familiya kerak' });
    let password_hash = null;
    if (password) {
      if (password.length < 6) return res.status(400).json({ error: 'Parol kamida 6 ta belgidan iborat bo\'lishi kerak' });
      password_hash = await bcrypt.hash(password, 10);
    }
    // Auto-generate login_code for center_admin users (they log in with phone+code)
    let login_code = null;
    if (user_type === 'center_admin') {
      for (let i = 0; i < 10; i++) {
        const candidate = generateLoginCode(6);
        const exists = await pool.query('SELECT id FROM users WHERE login_code = $1', [candidate]);
        if (!exists.rows.length) { login_code = candidate; break; }
      }
    }
    // Auto-create or find dispatch center by city+service_type (center_admin creates it; dispatcher/driver joins it)
    let resolved_center_id = dispatch_center_id || null;
    if (city && service_type && ['center_admin', 'dispatcher', 'driver'].includes(user_type)) {
      const SERVICE_LABELS = { ambulance: 'Tez Yordam', police: 'Politsiya', fire: "O't o'chirish" };
      const existing = await pool.query(
        'SELECT id FROM dispatch_centers WHERE city = $1 AND service_type = $2 LIMIT 1',
        [city, service_type]
      );
      if (existing.rows.length) {
        resolved_center_id = existing.rows[0].id;
      } else if (user_type === 'center_admin') {
        // Only center_admin creates a new center; dispatcher/driver must join an existing one
        const centerName = `${city} ${SERVICE_LABELS[service_type] || service_type}`;
        const newCenter = await pool.query(
          'INSERT INTO dispatch_centers (name, city, service_type) VALUES ($1,$2,$3) RETURNING id',
          [centerName, city, service_type]
        );
        resolved_center_id = newCenter.rows[0].id;
      } else {
        return res.status(400).json({ error: `${city} shahrida ${SERVICE_LABELS[service_type]} markazi topilmadi. Avval markaz admin yarating.` });
      }
    }
    const result = await pool.query(
      'INSERT INTO users (phone, password_hash, first_name, last_name, user_type, dispatch_center_id, login_code) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, phone, first_name, last_name, user_type, dispatch_center_id, login_code',
      [phone || null, password_hash, first_name.trim(), last_name.trim(), user_type, resolved_center_id, login_code]
    );
    res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      const detail = err.detail || '';
      if (detail.includes('phone')) return res.status(400).json({ error: 'Bu telefon raqam allaqachon mavjud' });
      if (detail.includes('login_code')) return res.status(400).json({ error: 'Kod yaratishda xato, qayta urinib ko\'ring' });
      return res.status(400).json({ error: 'Bu ma\'lumotlar allaqachon mavjud' });
    }
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin-panel/users/:id - update any user fields
app.patch('/api/admin-panel/users/:id', authenticateToken, checkRole, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { blocked, user_type, dispatch_center_id, first_name, last_name, phone } = req.body;
    const fields = [];
    const params = [];
    if (blocked !== undefined) { params.push(blocked); fields.push(`blocked = $${params.length}`); }
    if (user_type !== undefined) { params.push(user_type); fields.push(`user_type = $${params.length}`); }
    if (dispatch_center_id !== undefined) { params.push(dispatch_center_id || null); fields.push(`dispatch_center_id = $${params.length}`); }
    if (first_name !== undefined) { params.push(first_name.trim()); fields.push(`first_name = $${params.length}`); }
    if (last_name !== undefined) { params.push(last_name.trim()); fields.push(`last_name = $${params.length}`); }
    if (phone !== undefined) { params.push(phone || null); fields.push(`phone = $${params.length}`); }
    if (!fields.length) return res.status(400).json({ error: 'No fields to update' });
    params.push(id);
    const result = await pool.query(
      `UPDATE users SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING id, phone, first_name, last_name, user_type, dispatch_center_id, COALESCE(blocked, false) as blocked, login_code`,
      params
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json({ user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Bu telefon raqam allaqachon mavjud' });
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin-panel/users/:id
app.delete('/api/admin-panel/users/:id', authenticateToken, checkRole, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin-panel/users/:id/reset-password
app.post('/api/admin-panel/users/:id/reset-password', authenticateToken, checkRole, requireAdmin, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6) return res.status(400).json({ error: 'Parol kamida 6 ta belgi' });
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING id, first_name, last_name',
      [hash, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin-panel/dispatch-centers
app.get('/api/admin-panel/dispatch-centers', authenticateToken, checkRole, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT dc.*, COUNT(DISTINCT u.id) as dispatcher_count, COUNT(DISTINCT a.id) as unit_count
      FROM dispatch_centers dc
      LEFT JOIN users u ON u.dispatch_center_id = dc.id AND u.user_type = 'dispatcher'
      LEFT JOIN ambulances a ON a.dispatch_center_id = dc.id
      GROUP BY dc.id ORDER BY dc.created_at DESC
    `);
    res.json({ dispatch_centers: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin-panel/dispatch-centers
app.post('/api/admin-panel/dispatch-centers', authenticateToken, checkRole, requireAdmin, async (req, res) => {
  try {
    const { name, city, service_type, phone, email, latitude, longitude } = req.body;
    if (!name || !city || !service_type) return res.status(400).json({ error: 'name, city, service_type kerak' });
    const result = await pool.query(
      'INSERT INTO dispatch_centers (name, city, service_type, phone, email, latitude, longitude) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [name, city, service_type, phone || null, email || null, latitude || null, longitude || null]
    );
    res.status(201).json({ dispatch_center: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin-panel/dispatch-centers/:id
app.patch('/api/admin-panel/dispatch-centers/:id', authenticateToken, checkRole, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, city, service_type, phone, email, latitude, longitude } = req.body;
    const result = await pool.query(
      `UPDATE dispatch_centers SET name=COALESCE($1,name), city=COALESCE($2,city), service_type=COALESCE($3,service_type),
       phone=COALESCE($4,phone), email=COALESCE($5,email), latitude=COALESCE($6,latitude), longitude=COALESCE($7,longitude),
       updated_at=NOW() WHERE id=$8 RETURNING *`,
      [name, city, service_type, phone, email, latitude, longitude, id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ dispatch_center: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin-panel/dispatch-centers/:id
app.delete('/api/admin-panel/dispatch-centers/:id', authenticateToken, checkRole, requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM dispatch_centers WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin-panel/emergencies - all emergencies with filters
app.get('/api/admin-panel/emergencies', authenticateToken, checkRole, requireAdmin, async (req, res) => {
  try {
    const { status, service_type, date_from, date_to, limit = 200 } = req.query;
    let query = `SELECT e.*, u.first_name, u.last_name, u.phone as caller_phone,
                         dc.name as dispatch_center_name
                  FROM emergencies e
                  LEFT JOIN users u ON e.user_id = u.id
                  LEFT JOIN dispatch_centers dc ON e.dispatch_center_id = dc.id
                  WHERE 1=1`;
    const params = [];
    if (status) { params.push(status); query += ` AND e.status = $${params.length}`; }
    if (service_type) { params.push(service_type); query += ` AND e.service_type = $${params.length}`; }
    if (date_from) { params.push(date_from); query += ` AND e.created_at >= $${params.length}::date`; }
    if (date_to) { params.push(date_to); query += ` AND e.created_at < ($${params.length}::date + interval '1 day')`; }
    params.push(parseInt(limit));
    query += ` ORDER BY e.created_at DESC LIMIT $${params.length}`;
    const result = await pool.query(query, params);
    res.json({ emergencies: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin-panel/feedback
app.get('/api/admin-panel/feedback', authenticateToken, checkRole, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT f.*, u.first_name, u.last_name, u.phone, e.service_type, e.status as emergency_status
      FROM feedback f
      LEFT JOIN users u ON f.user_id = u.id
      LEFT JOIN emergencies e ON f.emergency_id = e.id
      ORDER BY f.created_at DESC LIMIT 200
    `);
    res.json({ feedback: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== END ADMIN PANEL ====================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Emergency dispatch backend running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
});

