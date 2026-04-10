import express from 'express';
import { db } from '../config/database.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

// GET all active announcements (all roles)
router.get('/', async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT a.*, u.name as creator_name,
        (SELECT COUNT(*) FROM announcement_reads r WHERE r.announcement_id = a.id AND r.user_id = ?) as is_read
      FROM announcements a
      JOIN users u ON a.created_by = u.id
      WHERE a.is_active = 1
      ORDER BY CASE a.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END, a.created_at DESC
    `, [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch announcements' });
  }
});

// GET unread count for sidebar badge
router.get('/unread-count', async (req, res) => {
  try {
    const result = await db.execute({
      sql: `SELECT COUNT(*) as count FROM announcements a
            WHERE a.is_active = 1
            AND a.id NOT IN (SELECT announcement_id FROM announcement_reads WHERE user_id = ?)`,
      args: [req.user.id]
    });
    res.json({ count: result.rows[0].count });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

// POST create announcement (ADMIN or SUPER_ADMIN)
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { title, body, priority } = req.body;
    if (!title || !body) return res.status(400).json({ error: 'Title and body required' });

    const validPriorities = ['low', 'normal', 'high', 'urgent'];
    const safePriority = validPriorities.includes(priority) ? priority : 'normal';

    const result = await db.execute({
      sql: 'INSERT INTO announcements (title, body, priority, created_by) VALUES (?, ?, ?, ?) RETURNING *',
      args: [title, body, safePriority, req.user.id]
    });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create announcement' });
  }
});

// PATCH mark as read (any user)
router.post('/:id/read', async (req, res) => {
  try {
    await db.execute({
      sql: 'INSERT OR IGNORE INTO announcement_reads (announcement_id, user_id) VALUES (?, ?)',
      args: [req.params.id, req.user.id]
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// PATCH update announcement (SUPER_ADMIN or creator ADMIN)
router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const existing = await db.execute({ sql: 'SELECT * FROM announcements WHERE id = ?', args: [req.params.id] });
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });

    const a = existing.rows[0];
    const isOwner = parseInt(a.created_by) === parseInt(req.user.id);
    if (!isOwner && req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Not authorized' });

    const { title, body, priority, is_active } = req.body;
    await db.execute({
      sql: `UPDATE announcements SET title = COALESCE(?, title), body = COALESCE(?, body),
            priority = COALESCE(?, priority), is_active = COALESCE(?, is_active),
            updated_at = datetime('now') WHERE id = ?`,
      args: [title, body, priority, is_active !== undefined ? (is_active ? 1 : 0) : null, req.params.id]
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update announcement' });
  }
});

// DELETE announcement
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const existing = await db.execute({ sql: 'SELECT * FROM announcements WHERE id = ?', args: [req.params.id] });
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });

    const a = existing.rows[0];
    if (parseInt(a.created_by) !== parseInt(req.user.id) && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await db.execute({ sql: 'DELETE FROM announcement_reads WHERE announcement_id = ?', args: [req.params.id] });
    await db.execute({ sql: 'DELETE FROM announcements WHERE id = ?', args: [req.params.id] });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete announcement' });
  }
});

export default router;
