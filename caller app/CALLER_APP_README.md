# Caller App - Emergency Response System

React frontend for the emergency dispatch system. Users can call ambulance/police/firefighters with GPS location.

## Project Structure

```
caller-app/
├── public/
│   └── index.html
├── src/
│   ├── screens/
│   │   ├── LoginScreen.js
│   │   ├── EmergencyScreen.js
│   │   └── ConfirmationScreen.js
│   ├── styles/
│   │   ├── LoginScreen.css
│   │   ├── EmergencyScreen.css
│   │   └── ConfirmationScreen.css
│   ├── App.js
│   ├── App.css
│   ├── index.js
│   └── index.css
├── .env
└── package.json
```

## Setup Instructions

### 1. Create Project Folder

```bash
mkdir caller-app
cd caller-app
```

### 2. Copy All Files

Download all files from outputs:
- `package.json` → Copy to `caller-app/package.json`
- `LoginScreen.js` → Create `src/screens/LoginScreen.js`
- `EmergencyScreen.js` → Create `src/screens/EmergencyScreen.js`
- `ConfirmationScreen.js` → Create `src/screens/ConfirmationScreen.js`
- `LoginScreen.css` → Create `src/styles/LoginScreen.css`
- `EmergencyScreen.css` → Create `src/styles/EmergencyScreen.css`
- `ConfirmationScreen.css` → Create `src/styles/ConfirmationScreen.css`
- `App.js` → Copy to `src/App.js`
- `App.css` → Copy to `src/App.css`
- `index.js` → Copy to `src/index.js`
- `index.css` → Copy to `src/index.css`
- `index.html` → Copy to `public/index.html`
- `.env` → Copy to `caller-app/.env`

### 3. Install Dependencies

```bash
npm install
```

### 4. Start Development Server

```bash
npm start
```

App will open at `http://localhost:3000`

## Configuration

### .env File

```
REACT_APP_API_URL=http://localhost:3000
REACT_APP_SERVICE_TYPE=ambulance
```

Change `REACT_APP_API_URL` to your backend URL:
- **Local testing:** `http://localhost:3000`
- **Production:** `https://your-backend-domain.com`

## How It Works

### Flow

1. **Login Screen**
   - User enters phone number
   - App sends verification code to backend
   - Backend logs code to console (for testing)
   - User enters 6-digit code
   - Backend creates user and returns JWT token
   - Token stored in localStorage

2. **Emergency Screen**
   - App requests location permission
   - Shows Yandex map with user's location
   - User can drag marker to adjust location
   - User clicks "Tez Yordam" button
   - Emergency sent to backend with location
   - Backend saves to database

3. **Confirmation Screen**
   - Shows "Location Sent"
   - Simulates dispatcher calling
   - Shows countdown timer
   - Displays "Emergency Confirmed"
   - User can send another emergency

## API Endpoints Used

**Send verification code:**
```
POST /api/auth/send-code
Body: { "phone": "+998..." }
```

**Verify code & login:**
```
POST /api/auth/verify-code
Body: { "phone": "+998...", "code": "123456" }
Response: { "token": "...", "user": {...} }
```

**Send emergency:**
```
POST /api/emergencies
Header: Authorization: Bearer {token}
Body: {
  "latitude": 41.2995,
  "longitude": 69.2401,
  "service_type": "ambulance",
  "dispatch_center_id": 1,
  "description": "..."
}
```

## Deployment to Vercel

### Option 1: Using Vercel CLI

```bash
npm install -g vercel
vercel login
vercel
```

### Option 2: GitHub + Vercel

1. Push code to GitHub
2. Go to https://vercel.com
3. Import your GitHub repository
4. Add environment variables:
   - `REACT_APP_API_URL=https://your-backend-domain.com`
5. Deploy

Your app will be live at: `https://your-app.vercel.app`

## Testing Locally

1. **Start backend:**
   ```bash
   cd ../emergency-dispatch-backend
   npm start
   ```

2. **Start caller app (in another terminal):**
   ```bash
   npm start
   ```

3. **Test login:**
   - Phone: `+998991234567`
   - Code: (check backend console for the generated code)

4. **Test emergency:**
   - Allow location permission
   - Adjust location on map
   - Click "Tez Yordam"
   - Check backend to see emergency saved in database

## Features

✅ Phone-based authentication with OTP codes
✅ Yandex map integration
✅ GPS location capture
✅ Emergency reporting with description
✅ Real-time confirmation flow
✅ localStorage for session persistence
✅ Responsive design (mobile-first)
✅ Error handling & loading states

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Mobile)

## Troubleshooting

**App won't connect to backend:**
- Check `REACT_APP_API_URL` in `.env`
- Verify backend is running on `http://localhost:3000`
- Check browser console for errors

**Location not working:**
- Enable location permission in browser
- HTTPS required for production
- Some browsers require user interaction first

**Code not received:**
- Check backend terminal for logged code
- For production, implement real SMS via Twilio/AWS SNS

## Next Steps

- Connect to dispatcher dashboard
- Real-time call simulation
- Call integration with Twilio
- Analytics and logging

## Support

For issues or questions, check the backend API documentation in the backend README.
