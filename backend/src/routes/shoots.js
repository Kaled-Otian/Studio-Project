import express from 'express';
import { db } from '../config/database.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth);

// GET all shoots — scoped by role
router.get('/', async (req, res) => {
  try {
    let result;
    if (req.user.role === 'USER') {
      // Users only see shoots they are assigned to via tasks
      result = await db.execute({
        sql: `SELECT DISTINCT s.* FROM shoots s
              JOIN admin_tasks a ON a.shoot_id = s.id
              WHERE a.assigned_to = ?
              ORDER BY s.shoot_date DESC`,
        args: [req.user.id]
      });
    } else {
      // ADMIN and SUPER_ADMIN see all shoots
      result = await db.execute('SELECT * FROM shoots ORDER BY shoot_date DESC');
    }
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error fetching shoots' });
  }
});

// Create a new shoot (ADMIN or SUPER_ADMIN only)
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { title, person_filmed, shoot_date, start_datetime, end_datetime, duration_hours, output_duration, content_types, details } = req.body;
    if (!title || (!shoot_date && !start_datetime)) {
      return res.status(400).json({ error: 'Title and date/time are required' });
    }

    const result = await db.execute({
      sql: `INSERT INTO shoots (
              title, person_filmed, shoot_date, start_datetime, end_datetime, 
              duration_hours, output_duration, content_types, details, created_by, task_status, progress
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0) RETURNING *`,
      args: [
        title, person_filmed, shoot_date || null, start_datetime || null, end_datetime || null, 
        duration_hours, output_duration, JSON.stringify(content_types || []), details, req.user.id
      ]
    });

    const io = req.app.get('io');
    if (io) io.emit('shoot_created', result.rows[0]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error creating shoot' });
  }
});

// Get shoot details — users only if assigned
router.get('/:id', async (req, res) => {
  try {
    const shoot = await db.execute({
      sql: 'SELECT * FROM shoots WHERE id = ?',
      args: [req.params.id]
    });
    if (shoot.rows.length === 0) return res.status(404).json({ error: 'Shoot not found' });

    // Enforce visibility for USER role
    if (req.user.role === 'USER') {
      const isAssigned = await db.execute({
        sql: 'SELECT 1 FROM admin_tasks WHERE shoot_id = ? AND assigned_to = ?',
        args: [req.params.id, req.user.id]
      });
      if (isAssigned.rows.length === 0) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const assignments = await db.execute({
      sql: `SELECT a.*, a.assigned_to as user_id, a.description as task_description,
              COALESCE(u.name, 'Deleted User') as user_name, 
              COALESCE(u.job_title, '') as job_title,
              COALESCE(u.abbreviation, '??') as abbreviation,
              COALESCE(u.is_active, 0) as user_is_active
            FROM admin_tasks a 
            LEFT JOIN users u ON a.assigned_to = u.id 
            WHERE a.shoot_id = ?`,
      args: [req.params.id]
    });

    const notes = await db.execute({
      sql: `SELECT n.*, 
              COALESCE(u.name, 'Deleted User') as user_name,
              COALESCE(u.abbreviation, '??') as abbreviation,
              COALESCE(u.is_active, 0) as user_is_active
            FROM notes n 
            LEFT JOIN users u ON n.user_id = u.id 
            WHERE n.shoot_id = ? ORDER BY n.created_at DESC`,
      args: [req.params.id]
    });

    res.json({ ...shoot.rows[0], assignments: assignments.rows, notes: notes.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error fetching shoot' });
  }
});

// Assign an editor (Creates a unified task)
router.post('/:id/assignments', requireAdmin, async (req, res) => {
  try {
    const { user_id, task_description, is_main_editor, target_count } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });

    const shoot = await db.execute({ sql: "SELECT title FROM shoots WHERE id = ?", args: [req.params.id] });
    const shootTitle = shoot.rows.length ? shoot.rows[0].title : 'Shoot';

    const result = await db.execute({
      sql: `INSERT INTO admin_tasks (title, description, shoot_id, assigned_by, assigned_to, status, target_count, completed_count, incomplete_count, is_main_editor) 
            VALUES (?, ?, ?, ?, ?, 'pending', ?, 0, 0, ?) RETURNING *`,
      args: [`Edit: ${shootTitle}`, task_description || '', req.params.id, req.user.id, user_id, parseInt(target_count) || 0, is_main_editor ? 1 : 0]
    });

    const io = req.app.get('io');
    if (io) io.emit('task_created', result.rows[0]);

    res.status(201).json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error assigning editor' });
  }
});

// Remove assignment (ADMIN or SUPER_ADMIN)
router.delete('/:id/assignments/:assignmentId', requireAdmin, async (req, res) => {
  try {
    await db.execute({
      sql: 'DELETE FROM admin_tasks WHERE id = ? AND shoot_id = ?',
      args: [req.params.assignmentId, req.params.id]
    });
    
    const io = req.app.get('io');
    if (io) io.emit('task_deleted', { id: req.params.assignmentId });
    
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error removing assignment' });
  }
});

// Update shoot details (ADMIN/SUPER_ADMIN or assigned editor)
router.patch('/:id', async (req, res) => {
  try {
    const { title, person_filmed, shoot_date, start_datetime, end_datetime, duration_hours, output_duration, details, progress, task_status } = req.body;

    if (req.user.role === 'USER') {
      const isAssigned = await db.execute({
        sql: 'SELECT 1 FROM admin_tasks WHERE shoot_id = ? AND assigned_to = ?',
        args: [req.params.id, req.user.id]
      });
      if (isAssigned.rows.length === 0) {
        return res.status(403).json({ error: 'Not authorized to edit this shoot' });
      }
    }

    await db.execute({
      sql: `UPDATE shoots
            SET title = COALESCE(?, title),
                person_filmed = COALESCE(?, person_filmed),
                shoot_date = COALESCE(?, shoot_date),
                start_datetime = COALESCE(?, start_datetime),
                end_datetime = COALESCE(?, end_datetime),
                duration_hours = COALESCE(?, duration_hours),
                output_duration = COALESCE(?, output_duration),
                details = COALESCE(?, details),
                progress = COALESCE(?, progress),
                task_status = COALESCE(?, task_status)
            WHERE id = ?`,
      args: [title, person_filmed, shoot_date, start_datetime, end_datetime, duration_hours, output_duration, details, progress, task_status, req.params.id]
    });

    const io = req.app.get('io');
    if (io) io.emit('shoot_updated', { id: req.params.id, task_status, progress });

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error updating shoot' });
  }
});

// Delete shoot (ADMIN or SUPER_ADMIN only)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    // Delete assignments and notes first (if not cascading correctly)
    // Delete assignments, notes, tasks, and schedules to prevent foreign key constraint failures
    await db.execute({ sql: 'DELETE FROM shoot_assignments WHERE shoot_id = ?', args: [req.params.id] }); // Keep for legacy cleanup
    await db.execute({ sql: 'DELETE FROM notes WHERE shoot_id = ?', args: [req.params.id] });
    await db.execute({ sql: 'DELETE FROM admin_tasks WHERE shoot_id = ?', args: [req.params.id] });
    
    // For schedules, we might need to delete schedule_attendees first if ON DELETE CASCADE is missing
    const scheds = await db.execute({ sql: 'SELECT id FROM schedules WHERE shoot_id = ?', args: [req.params.id] });
    for (const row of scheds.rows) {
      await db.execute({ sql: 'DELETE FROM schedule_attendees WHERE schedule_id = ?', args: [row.id] });
    }
    await db.execute({ sql: 'DELETE FROM schedules WHERE shoot_id = ?', args: [req.params.id] });

    await db.execute({ sql: 'DELETE FROM shoots WHERE id = ?', args: [req.params.id] });
    
    const io = req.app.get('io');
    if (io) io.emit('shoot_deleted', { id: req.params.id });

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error deleting shoot' });
  }
});

// Update shoot status, task_status, and progress (Admins or assigned users)
router.patch('/:id/status', async (req, res) => {
  try {
    const { status, progress, task_status } = req.body;
    
    // Check permissions
    if (req.user.role === 'USER') {
      const isAssigned = await db.execute({
        sql: 'SELECT 1 FROM admin_tasks WHERE shoot_id = ? AND assigned_to = ?',
        args: [req.params.id, req.user.id]
      });
      if (isAssigned.rows.length === 0) {
        return res.status(403).json({ error: 'Not authorized to update this shoot' });
      }
    }

    const updates = [];
    const args = [];

    if (status) {
      const validStatuses = ['Scheduled', 'Shooting', 'Editing', 'Reviewing', 'Completed'];
      if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status value' });
      updates.push('status = ?');
      args.push(status);
    }
    if (progress !== undefined) {
      updates.push('progress = ?');
      args.push(progress);
    }
    if (task_status !== undefined) {
      updates.push('task_status = ?');
      args.push(task_status);
    }

    if (updates.length > 0) {
      args.push(req.params.id);
      await db.execute({
        sql: `UPDATE shoots SET ${updates.join(', ')} WHERE id = ?`,
        args
      });
      
      const io = req.app.get('io');
      if (io) io.emit('shoot_updated', { id: req.params.id, status, progress, task_status });
    }

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error updating status' });
  }
});

// Add note (any authenticated user — but USER must be assigned)
router.post('/:id/notes', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Note content is required' });

    if (req.user.role === 'USER') {
      const isAssigned = await db.execute({
        sql: 'SELECT 1 FROM admin_tasks WHERE shoot_id = ? AND assigned_to = ?',
        args: [req.params.id, req.user.id]
      });
      if (isAssigned.rows.length === 0) {
        return res.status(403).json({ error: 'Must be assigned to this shoot to add notes' });
      }
    }

    const result = await db.execute({
      sql: "INSERT INTO notes (shoot_id, user_id, content, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now')) RETURNING *",
      args: [req.params.id, req.user.id, content]
    });

    const userRes = await db.execute({
      sql: 'SELECT name FROM users WHERE id = ?',
      args: [req.user.id]
    });

    res.status(201).json({ ...result.rows[0], user_name: userRes.rows[0]?.name });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error adding note' });
  }
});

export default router;
