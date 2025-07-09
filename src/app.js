import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import DuckDB from 'duckdb';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH = path.join(__dirname, '../data.csv');

// Load CSV into DuckDB
const db = new DuckDB.Database(':memory:');
db.run(`
  CREATE TABLE mydata AS
  SELECT * FROM read_csv_auto('${CSV_PATH}')
`, (err) => {
  if (err) {
    console.error('Failed to load CSV into DuckDB:', err);
    process.exit(1);
  }
  console.log('CSV loaded into DuckDB table `mydata`');
});

const app = express();
app.use(express.json());

// In-memory user store
const users = [];
const refreshTokens = new Map(); // Map<refreshToken, email>

// Utility to sign a short‐lived access token
function signAccessToken(email) {
  return jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '15m' });
}

// Utility to create a secure random refresh token
function createRefreshToken() {
  return crypto.randomBytes(32).toString('hex');
}


// Middleware & routes need to read SECRET at **call time**
export function authenticateJWT(req, res, next) {
  const secret = process.env.JWT_SECRET;
  if (!secret) return res.sendStatus(500);

  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.sendStatus(401);

  const token = auth.split(' ')[1];
  jwt.verify(token, secret, (err, payload) => {
    if (err) return res.sendStatus(403);
    req.user = payload;
    next();
  });
}

// Register
app.post('/register', async (req, res) => {
  const { email, password } = req.body;
  if (users.find(u => u.email === email)) {
    return res.status(409).json({ error: 'User exists' });
  }
  const hash = await bcrypt.hash(password, 10);
  users.push({ email, hash });
  res.sendStatus(201);
});

// Login
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = users.find(u => u.email === email);
  if (!user || !(await bcrypt.compare(password, user.hash))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const accessToken  = signAccessToken(email);
  const refreshToken = createRefreshToken();

  // Store refresh token server-side
  refreshTokens.set(refreshToken, email);

  res.json({ accessToken, refreshToken });
});

app.post('/refresh', (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken || !refreshTokens.has(refreshToken)) {
    return res.sendStatus(401);
  }

  const email = refreshTokens.get(refreshToken);

  // Optionally: rotate refresh token
  refreshTokens.delete(refreshToken);
  const newRefreshToken = createRefreshToken();
  refreshTokens.set(newRefreshToken, email);

  const accessToken = signAccessToken(email);
  res.json({ accessToken, refreshToken: newRefreshToken });
});

// --- /logout (optional)
app.post('/logout', (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) refreshTokens.delete(refreshToken);
  res.sendStatus(204);
});

// Profile
app.get('/profile', authenticateJWT, (req, res) => {
  res.json({ email: req.user.email });
});

// Query
app.get('/query', authenticateJWT, (req, res) => {
  db.all('SELECT * FROM mydata', (err, rows) => {
    if (err) return res.sendStatus(500);
    const body = JSON.stringify(rows, (_, v) =>
      typeof v === 'bigint' ? v.toString() : v
    );
    res.setHeader('Content-Type', 'application/json');
    res.send(body);
  });
});

export default app;
