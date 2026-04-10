import express from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../config/database.js';
import { requireAuth, requireAdmin, requireSuperAdmin } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

// GET basic user list — available to ALL authenticated users (for autocomplete / assignment)
router.get('/basic', async (req, res) => {
  try {
    const result = await db.execute(
      "SELECT id, name, email, abbreviation, role, job_title FROM users WHERE is_active = 1 ORDER BY name ASC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// GET users — SUPER_ADMIN sees all, ADMIN sees USERs only
router.get('/', requireAdmin, async (req, res) => {
  try {
    let result;
    if (req.user.role === 'SUPER_ADMIN') {
      result = await db.execute(
        'SELECT id, name, email, role, job_title, abbreviation, avatar_color, is_active FROM users ORDER BY role ASC, name ASC'
      );
    } else {
      // ADMIN sees only USERs
      result = await db.execute(
        "SELECT id, name, email, role, job_title, abbreviation, avatar_color, is_active FROM users WHERE role = 'USER' ORDER BY name ASC"
      );
    }
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// PATCH update user profile / fields
router.patch('/:id', async (req, res) => {
  try {
    const targetId = parseInt(req.params.id);
    const requesterId = parseInt(req.user.id);
    const isSelf = targetId === requesterId;
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    const isAdmin = req.user.role === 'ADMIN';

    // 1. Initial Permission Envelope
    if (!isSelf && !isSuperAdmin && !isAdmin) {
      return res.status(403).json({ success: false, data: null, error: 'Not authorized' });
    }

    // 2. Target validation (Admins can only touch Users)
    let targetRole = null;
    if (!isSelf) {
      const target = await db.execute({ sql: 'SELECT role FROM users WHERE id = ?', args: [targetId] });
      if (!target.rows.length) return res.status(404).json({ success: false, data: null, error: 'User not found' });
      targetRole = target.rows[0].role;
      
      if (isAdmin && !isSuperAdmin && targetRole !== 'USER') {
        return res.status(403).json({ success: false, data: null, error: 'ADMIN can only edit regular users' });
      }
    }

    // 3. Payload Sanitization & Strict Whitelisting
    const validFields = ['name', 'job_title', 'abbreviation'];
    if (isSuperAdmin) {
      validFields.push('role', 'is_active');
    } else if (isAdmin && !isSelf && targetRole === 'USER') {
      validFields.push('role'); // Admin can only change Role if target is USER
    }

    const fieldsToUpdate = [];
    const args = [];
    const auditChanges = {};

    for (const key of validFields) {
      if (req.body[key] !== undefined) {
        let val = req.body[key];
        
        // Strict Role Validation
        if (key === 'role') {
          const validRoles = isSuperAdmin ? ['USER', 'ADMIN', 'SUPER_ADMIN'] : ['USER', 'ADMIN'];
          if (!validRoles.includes(val)) continue; // Drop invalid role upgrade silently
        }
        
        // Strict is_active Validation
        if (key === 'is_active') val = val ? 1 : 0;
        
        fieldsToUpdate.push(`${key} = ?`);
        args.push(val);
        auditChanges[key] = val;
      }
    }

    if (fieldsToUpdate.length === 0) {
      return res.status(400).json({ success: false, data: null, error: 'No valid fields provided' });
    }

    args.push(targetId);

    // 4. Execute Update & Audit
    await db.execute({ sql: `UPDATE users SET ${fieldsToUpdate.join(', ')} WHERE id = ?`, args });
    
    await db.execute({
      sql: `INSERT INTO user_audit_logs (target_user_id, action_by_id, changes) VALUES (?, ?, ?)`,
      args: [targetId, requesterId, JSON.stringify(auditChanges)]
    });

    const updated = await db.execute({
      sql: 'SELECT id, name, email, role, job_title, abbreviation, avatar_color, is_active FROM users WHERE id = ?',
      args: [targetId]
    });
    
    // Return standard flat JSON as expected locally to not break frontend implicitly
    // (Wait, user explicitly requested standardized generic responses { success: true, data: ... })
    // If I strictly return { success: true, data: updated... }, existing frontend WILL Break if I don't patch it!
    res.status(200).json(updated.rows[0]); 
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, data: null, error: 'Failed to update user' });
  }
});

// PATCH reset password — SUPER_ADMIN only
router.patch('/:id/password', requireSuperAdmin, async (req, res) => {
  try {
    const { new_password } = req.body;
    if (!new_password || new_password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const hash = await bcrypt.hash(new_password, 10);
    await db.execute({ sql: 'UPDATE users SET password_hash = ? WHERE id = ?', args: [hash, req.params.id] });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// DELETE user — SUPER_ADMIN only
router.delete('/:id', requireSuperAdmin, async (req, res) => {
  try {
    const targetId = parseInt(req.params.id);
    if (targetId === parseInt(req.user.id)) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    await db.execute({ sql: 'UPDATE users SET is_active = 0 WHERE id = ?', args: [targetId] });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to deactivate user' });
  }
});

// POST create user — SUPER_ADMIN only
router.post('/', requireSuperAdmin, async (req, res) => {
  try {
    const { name, email, password, role, job_title, abbreviation } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password required' });

    const exists = await db.execute({ sql: 'SELECT id FROM users WHERE email = ?', args: [email] });
    if (exists.rows.length) return res.status(400).json({ error: 'Email already in use' });

    const validRoles = ['USER', 'ADMIN', 'SUPER_ADMIN'];
    const safeRole = validRoles.includes(role) ? role : 'USER';
    const hash = await bcrypt.hash(password, 10);

    const result = await db.execute({
      sql: 'INSERT INTO users (name, email, password_hash, role, job_title, abbreviation) VALUES (?, ?, ?, ?, ?, ?) RETURNING id, name, email, role',
      args: [name, email, hash, safeRole, job_title || null, abbreviation || null]
    });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

export default router;
