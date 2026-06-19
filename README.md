# Emergency Dispatch Backend

Complete backend for emergency dispatch system (ambulance, police, firefighter) built with Node.js, Express, and PostgreSQL.

## Setup Instructions

### 1. Prerequisites
- Node.js v18+ installed
- Supabase account with PostgreSQL database

### 2. Install Dependencies

```bash
npm install
```

### 3. Create Database Tables

Copy the SQL from `schema.sql` and run it in your Supabase SQL Editor:

1. Go to Supabase Dashboard
2. Click "SQL Editor"
3. Click "New Query"
4. Paste the content of `schema.sql`
5. Click "Run"

This creates all necessary tables.

### 4. Create `.env` File

Already created with your Supabase credentials. Make sure these are in `.env`:

```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.tgovytmkjdzktrtyenia.supabase.co:5432/postgres
SUPABASE_URL=https://tgovytmkjdzktrtyenia.supabase.co
SUPABASE_KEY=your_api_key
JWT_SECRET=your-secret-key
PORT=3000
NODE_ENV=development
SMS_PROVIDER=console
```

### 5. Start the Server

```bash
npm start
```

Or for development with auto-reload:

```bash
npm run dev
```

Server will run on `http://localhost:3000`

## API Endpoints

### Authentication

**Send verification code:**
```
POST /api/auth/send-code
Body: { "email": "user@example.com" } or { "phone": "+998..." }
```

**Verify code and login:**
```
POST /api/auth/verify-code
Body: { "email": "user@example.com", "code": "123456" }
Response: { "token": "jwt_token", "user": {...} }
```

**Get current user:**
```
GET /api/auth/me
Header: Authorization: Bearer {token}
```

### Emergencies

**Send emergency:**
```
POST /api/emergencies
Header: Authorization: Bearer {token}
Body: {
  "latitude": 41.2995,
  "longitude": 69.2401,
  "service_type": "ambulance",
  "dispatch_center_id": 1,
  "description": "Car accident"
}
```

**Get emergencies (dispatcher only):**
```
GET /api/emergencies?status=new
Header: Authorization: Bearer {token}
```

**Get single emergency:**
```
GET /api/emergencies/:id
Header: Authorization: Bearer {token}
```

**Confirm emergency:**
```
PATCH /api/emergencies/:id/confirm
Header: Authorization: Bearer {token}
```

**Dispatch emergency:**
```
PATCH /api/emergencies/:id/dispatch
Header: Authorization: Bearer {token}
```

**Complete emergency:**
```
PATCH /api/emergencies/:id/complete
Header: Authorization: Bearer {token}
```

### Dispatch Centers

**Get all dispatch centers:**
```
GET /api/dispatch-centers?service_type=ambulance
```

### Admin

**Get statistics:**
```
GET /api/admin/stats
Header: Authorization: Bearer {token}
```

## Database Schema

### users
- Stores caller, dispatcher, and admin users
- Fields: email, phone, user_type, dispatch_center_id

### dispatch_centers
- Stores ambulance, police, and firefighter dispatch centers
- Fields: name, city, service_type, latitude, longitude

### emergencies
- Stores emergency calls
- Fields: user_id, dispatch_center_id, latitude, longitude, status, description

### verification_codes
- Stores one-time codes for phone/email authentication
- Fields: email, phone, code_hash, expires_at

### sessions
- Tracks active JWT sessions
- Fields: user_id, token_hash, expires_at

## Security

- **Password/Code Hashing**: bcrypt with salt rounds 10
- **Token**: JWT with 7-day expiration
- **Database**: SSL/TLS connection to Supabase
- **CORS**: Enabled for all origins (configure in production)

## Testing with Console

For development, verification codes are logged to console instead of sent via SMS. When you call `/api/auth/send-code`, check the terminal for the 6-digit code.

## Next Steps

1. ✅ Backend running locally
2. Connect caller app to backend API
3. Build dispatcher dashboard
4. Build admin panel
5. Deploy to Railway or Heroku

## Troubleshooting

**Database connection error:**
- Check DATABASE_URL in .env
- Verify password is correct
- Ensure Supabase project is active

**Port already in use:**
- Kill the process: `lsof -i :3000` then `kill -9 <PID>`
- Or change PORT in .env

**JWT errors:**
- Make sure JWT_SECRET is set in .env
- Check token format in Authorization header: `Bearer {token}`
