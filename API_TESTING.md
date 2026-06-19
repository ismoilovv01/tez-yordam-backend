# API Testing Guide

Use these examples to test the backend with curl, Postman, or Thunder Client.

## 1. Send Verification Code

```bash
curl -X POST http://localhost:3000/api/auth/send-code \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com"
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Code sent. Check console for testing."
}
```

Check your terminal for the 6-digit code (e.g., `123456`).

## 2. Verify Code and Login

```bash
curl -X POST http://localhost:3000/api/auth/verify-code \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "code": "123456"
  }'
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "testuser@example.com",
    "phone": null,
    "user_type": "caller"
  }
}
```

Save the `token` for next requests.

## 3. Get Current User

```bash
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

## 4. Create Dispatch Center (Manual - via SQL)

Go to Supabase SQL Editor and run:

```sql
INSERT INTO dispatch_centers (name, city, service_type, phone, email, latitude, longitude)
VALUES ('Tashkent Ambulance 1', 'Tashkent', 'ambulance', '+998712345678', 'ambulance@tashkent.uz', 41.2995, 69.2401);
```

Note the `id` returned (usually 1 for first center).

## 5. Send Emergency

```bash
curl -X POST http://localhost:3000/api/emergencies \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -d '{
    "latitude": 41.2995,
    "longitude": 69.2401,
    "service_type": "ambulance",
    "dispatch_center_id": 1,
    "description": "Car accident near Amir Timur Street"
  }'
```

**Response:**
```json
{
  "id": 1,
  "user_id": 1,
  "dispatch_center_id": 1,
  "service_type": "ambulance",
  "latitude": "41.2995",
  "longitude": "69.2401",
  "status": "new",
  "description": "Car accident near Amir Timur Street",
  "dispatcher_id": null,
  "confirmed_at": null,
  "dispatched_at": null,
  "completed_at": null,
  "created_at": "2024-01-15T10:30:00Z"
}
```

## 6. Confirm Emergency (Dispatcher)

First, create a dispatcher user:

```bash
# Send code to dispatcher email
curl -X POST http://localhost:3000/api/auth/send-code \
  -H "Content-Type: application/json" \
  -d '{
    "email": "dispatcher@tashkent.uz"
  }'

# Get code from console, then verify
curl -X POST http://localhost:3000/api/auth/verify-code \
  -H "Content-Type: application/json" \
  -d '{
    "email": "dispatcher@tashkent.uz",
    "code": "123456"
  }'
```

Then update dispatcher in database to link to dispatch center:

```sql
UPDATE users SET user_type = 'dispatcher', dispatch_center_id = 1 
WHERE email = 'dispatcher@tashkent.uz';
```

Now confirm the emergency:

```bash
curl -X PATCH http://localhost:3000/api/emergencies/1/confirm \
  -H "Authorization: Bearer dispatcher_token_here"
```

## 7. Get Active Emergencies (Dispatcher View)

```bash
curl -X GET http://localhost:3000/api/emergencies?status=new \
  -H "Authorization: Bearer dispatcher_token_here"
```

## 8. Dispatch Emergency

```bash
curl -X PATCH http://localhost:3000/api/emergencies/1/dispatch \
  -H "Authorization: Bearer dispatcher_token_here"
```

## 9. Complete Emergency

```bash
curl -X PATCH http://localhost:3000/api/emergencies/1/complete \
  -H "Authorization: Bearer dispatcher_token_here"
```

## 10. Get Dispatch Centers

```bash
curl -X GET "http://localhost:3000/api/dispatch-centers?service_type=ambulance"
```

## Using Postman/Thunder Client

Instead of curl, you can use Postman or Thunder Client:

1. Create new request
2. Select method (GET, POST, PATCH)
3. Enter URL
4. Go to Headers tab, add: `Authorization: Bearer {your_token}`
5. Go to Body tab, select "JSON" and paste the JSON data
6. Click Send

## Common Issues

**401 Unauthorized:**
- Missing or invalid token
- Check Authorization header format: `Bearer {token}`

**400 Bad Request:**
- Missing required fields
- Invalid JSON format

**403 Forbidden:**
- User doesn't have permission
- Dispatcher trying to access non-dispatcher endpoints

**500 Server Error:**
- Check server logs
- Verify database connection
