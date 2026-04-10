import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }

    const existing = await db.execute({
      sql: 'SELECT id FROM users WHERE email = ?',
      args: [email]
    });
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email already in use' });
    }

    const hash = await bcrypt.hash(password, 10);

    // STRICT: always USER — no role escalation from registration endpoint
    const result = await db.execute({
      sql: 'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?) RETURNING id, name, email, role',
      args: [name, email, hash, 'USER']
    });

    const newUser = result.rows[0];

    // Auto-add new user to the public General channel
    try {
      const publicCh = await db.execute("SELECT id FROM conversations WHERE type = 'public' LIMIT 1");
      if (publicCh.rows.length > 0) {
        await db.execute({
          sql: 'INSERT OR IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?, ?)',
          args: [publicCh.rows[0].id, newUser.id]
        });
      }
    } catch (_) {}

    res.status(201).json(newUser);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await db.execute({
      sql: 'SELECT * FROM users WHERE email = ?',
      args: [email]
    });

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is disabled' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const tokenPayload = {
      id: user.id,
      role: user.role,
      name: user.name,
      job_title: user.job_title,
      abbreviation: user.abbreviation
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        job_title: user.job_title,
        abbreviation: user.abbreviation
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// GET /auth/me — return fresh user data from DB (fixes stale JWT payloads)
router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await db.execute({
      sql: 'SELECT id, name, email, role, job_title, abbreviation, avatar_color, is_active FROM users WHERE id = ?',
      args: [req.user.id]
    });
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    if (!result.rows[0].is_active) return res.status(403).json({ error: 'Account is disabled' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch user data' });
  }
});

export default router;
