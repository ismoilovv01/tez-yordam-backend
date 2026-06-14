-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(20) UNIQUE,
  password_hash VARCHAR(255),
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  user_type VARCHAR(50) NOT NULL DEFAULT 'caller', -- caller, dispatcher, driver, admin
  dispatch_center_id INTEGER,
  blocked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Dispatch centers table
CREATE TABLE IF NOT EXISTS dispatch_centers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  city VARCHAR(100) NOT NULL,
  service_type VARCHAR(50) NOT NULL, -- ambulance, police, firefighter
  phone VARCHAR(20),
  email VARCHAR(255),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ambulances / units table (covers all service types via service_type column)
CREATE TABLE IF NOT EXISTS ambulances (
  id SERIAL PRIMARY KEY,
  unit_number VARCHAR(50) NOT NULL,
  driver_name VARCHAR(100),
  driver_phone VARCHAR(20),
  driver_user_id INTEGER REFERENCES users(id),
  dispatch_center_id INTEGER REFERENCES dispatch_centers(id),
  service_type VARCHAR(50) DEFAULT 'ambulance',
  login_code VARCHAR(20),
  status VARCHAR(50) DEFAULT 'available', -- available, on_the_way, arrived, busy
  plate_region VARCHAR(10),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  last_location_update TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Emergencies table
CREATE TABLE IF NOT EXISTS emergencies (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dispatch_center_id INTEGER NOT NULL REFERENCES dispatch_centers(id) ON DELETE CASCADE,
  service_type VARCHAR(50) NOT NULL, -- ambulance, police, firefighter
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'new', -- new, confirmed, assigned, on_the_way, arrived, completed, cancelled
  description TEXT,
  phone_number VARCHAR(20),
  dispatcher_id INTEGER REFERENCES users(id),
  assigned_ambulance_id INTEGER REFERENCES ambulances(id),
  cancelled_by VARCHAR(20), -- user, dispatcher, driver
  confirmed_at TIMESTAMP,
  dispatched_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Feedback table
CREATE TABLE IF NOT EXISTS feedback (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  emergency_id INTEGER REFERENCES emergencies(id) ON DELETE SET NULL,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  message TEXT,
  type VARCHAR(20) DEFAULT 'general',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Verification codes table
CREATE TABLE IF NOT EXISTS verification_codes (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255),
  phone VARCHAR(20),
  code VARCHAR(6) NOT NULL,
  code_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit log table
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action VARCHAR(255) NOT NULL,
  resource_type VARCHAR(100),
  resource_id INTEGER,
  details JSONB,
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Telegram bot users
CREATE TABLE IF NOT EXISTS telegram_users (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(20) UNIQUE NOT NULL,
  chat_id VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Allowed phones (whitelist)
CREATE TABLE IF NOT EXISTS allowed_phones (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(20) UNIQUE NOT NULL,
  note VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_dispatch_center ON users(dispatch_center_id);
CREATE INDEX IF NOT EXISTS idx_users_type ON users(user_type);
CREATE INDEX IF NOT EXISTS idx_emergencies_user ON emergencies(user_id);
CREATE INDEX IF NOT EXISTS idx_emergencies_dispatch_center ON emergencies(dispatch_center_id);
CREATE INDEX IF NOT EXISTS idx_emergencies_status ON emergencies(status);
CREATE INDEX IF NOT EXISTS idx_emergencies_created ON emergencies(created_at);
CREATE INDEX IF NOT EXISTS idx_ambulances_dispatch_center ON ambulances(dispatch_center_id);
CREATE INDEX IF NOT EXISTS idx_ambulances_status ON ambulances(status);
CREATE INDEX IF NOT EXISTS idx_verification_codes_email ON verification_codes(email);
CREATE INDEX IF NOT EXISTS idx_verification_codes_phone ON verification_codes(phone);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
