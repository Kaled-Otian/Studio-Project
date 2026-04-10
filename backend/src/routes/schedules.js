import express from 'express';
import { db } from '../config/database.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

// GET all schedules visible to current user
router.get('/', async (req, res) => {
  try {
    let rows;
    if (req.user.role === 'USER') {
      // Users see: events they created OR are attendees of
      const result = await db.execute({
        sql: `SELECT DISTINCT s.*, u.name as creator_name, sh.title as shoot_title
              FROM schedules s
              JOIN users u ON s.created_by = u.id
              LEFT JOIN schedule_attendees a ON a.schedule_id = s.id
              LEFT JOIN shoots sh ON s.shoot_id = sh.id
              WHERE s.created_by = ? OR a.user_id = ?
              ORDER BY s.start_datetime ASC`,
        args: [req.user.id, req.user.id]
      });
      rows = result.rows;
    } else {
      const result = await db.execute(`
        SELECT s.*, u.name as creator_name, sh.title as shoot_title
        FROM schedules s
        JOIN users u ON s.created_by = u.id
        LEFT JOIN shoots sh ON s.shoot_id = sh.id
        ORDER BY s.start_datetime ASC
      `);
      rows = result.rows;
    }

    // Attach attendees
    const enriched = await Promise.all(rows.map(async (s) => {
      const att = await db.execute({
        sql: `SELECT a.*, u.name as user_name, u.abbreviation FROM schedule_attendees a
              JOIN users u ON a.user_id = u.id WHERE a.schedule_id = ?`,
        args: [s.id]
      });
      return { ...s, attendees: att.rows };
    }));

    res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch schedules' });
  }
});

// GET single schedule
router.get('/:id', async (req, res) => {
  try {
    const result = await db.execute({
      sql: `SELECT s.*, u.name as creator_name, sh.title as shoot_title
            FROM schedules s JOIN users u ON s.created_by = u.id
            LEFT JOIN shoots sh ON s.shoot_id = sh.id WHERE s.id = ?`,
      args: [req.params.id]
    });
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });

    const att = await db.execute({
      sql: `SELECT a.*, u.name as user_name, u.abbreviation, u.job_title
            FROM schedule_attendees a JOIN users u ON a.user_id = u.id WHERE a.schedule_id = ?`,
      args: [req.params.id]
    });

    res.json({ ...result.rows[0], attendees: att.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch schedule' });
  }
});

// POST create schedule
router.post('/', async (req, res) => {
  try {
    const { title, description, type, start_datetime, end_datetime, all_day, location, color, shoot_id, attendee_ids } = req.body;
    if (!title || !start_datetime) return res.status(400).json({ error: 'Title and start time are required' });

    const result = await db.execute({
      sql: `INSERT INTO schedules (title, description, type, start_datetime, end_datetime, all_day, location, color, shoot_id, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      args: [title, description || null, type || 'meeting', start_datetime, end_datetime || null,
             all_day ? 1 : 0, location || null, color || '#c87212', shoot_id || null, req.user.id]
    });

    const scheduleId = result.rows[0].id;

    // Add creator as attendee automatically
    const attendees = new Set([String(req.user.id)]);
    if (attendee_ids) attendee_ids.forEach(id => attendees.add(String(id)));

    for (const uid of attendees) {
      try {
        await db.execute({
          sql: 'INSERT OR IGNORE INTO schedule_attendees (schedule_id, user_id) VALUES (?, ?)',
          args: [scheduleId, uid]
        });
      } catch (_) {}
    }

    const io = req.app.get('io');
    if (io) io.emit('schedule_updated');

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create schedule' });
  }
});

// PATCH update schedule (creator, ADMIN, SUPER_ADMIN)
router.patch('/:id', async (req, res) => {
  try {
    const existing = await db.execute({ sql: 'SELECT * FROM schedules WHERE id = ?', args: [req.params.id] });
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });

    const s = existing.rows[0];
    const isOwner = parseInt(s.created_by) === parseInt(req.user.id);
    const isAdmin = req.user.role === 'ADMIN' || req.user.role === 'SUPER_ADMIN';
    if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Not authorized' });

    const { title, description, type, start_datetime, end_datetime, all_day, location, color, shoot_id, status, attendee_ids } = req.body;

    await db.execute({
      sql: `UPDATE schedules SET
              title = COALESCE(?, title), description = COALESCE(?, description),
              type = COALESCE(?, type), start_datetime = COALESCE(?, start_datetime),
              end_datetime = COALESCE(?, end_datetime), all_day = COALESCE(?, all_day),
              location = COALESCE(?, location), color = COALESCE(?, color),
              shoot_id = COALESCE(?, shoot_id), status = COALESCE(?, status),
              updated_at = datetime('now')
            WHERE id = ?`,
      args: [title, description, type, start_datetime, end_datetime, all_day !== undefined ? (all_day ? 1 : 0) : null,
             location, color, shoot_id, status, req.params.id]
    });

    // Update attendees if provided
    if (attendee_ids) {
      await db.execute({ sql: 'DELETE FROM schedule_attendees WHERE schedule_id = ?', args: [req.params.id] });
      const attendees = new Set([String(req.user.id), ...attendee_ids.map(String)]);
      for (const uid of attendees) {
        try { await db.execute({ sql: 'INSERT OR IGNORE INTO schedule_attendees (schedule_id, user_id) VALUES (?, ?)', args: [req.params.id, uid] }); } catch (_) {}
      }
    }

    const io = req.app.get('io');
    if (io) io.emit('schedule_updated');

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update schedule' });
  }
});

// DELETE schedule
router.delete('/:id', async (req, res) => {
  try {
    const existing = await db.execute({ sql: 'SELECT * FROM schedules WHERE id = ?', args: [req.params.id] });
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });

    const s = existing.rows[0];
    const isOwner = parseInt(s.created_by) === parseInt(req.user.id);
    const isAdmin = req.user.role === 'ADMIN' || req.user.role === 'SUPER_ADMIN';
    if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Not authorized' });

    await db.execute({ sql: 'DELETE FROM schedule_attendees WHERE schedule_id = ?', args: [req.params.id] });
    await db.execute({ sql: 'DELETE FROM schedules WHERE id = ?', args: [req.params.id] });
    
    const io = req.app.get('io');
    if (io) io.emit('schedule_updated');
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete schedule' });
  }
});

export default router;
