import express from 'express';
import { db } from '../config/database.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth);

// Get tasks assigned to or by the current user
router.get('/', async (req, res) => {
  try {
    const isAdmin = req.user.role === 'ADMIN' || req.user.role === 'SUPER_ADMIN';
    
    let sql = `SELECT t.*,
              s.title as shoot_title,
              COALESCE(ab.name, 'Deleted User') as assigned_by_name,
              COALESCE(ab.abbreviation, '??') as assigned_by_abbreviation,
              COALESCE(ab.is_active, 0) as assigned_by_is_active,
              COALESCE(at2.name, 'Deleted User') as assigned_to_name,
              COALESCE(at2.abbreviation, '??') as assigned_to_abbreviation,
              COALESCE(at2.is_active, 0) as assigned_to_is_active
            FROM admin_tasks t
            LEFT JOIN shoots s ON t.shoot_id = s.id
            LEFT JOIN users ab ON t.assigned_by = ab.id
            LEFT JOIN users at2 ON t.assigned_to = at2.id`;
    
    let args = [];
    if (!isAdmin) {
      sql += ` WHERE t.assigned_to = ? OR t.assigned_by = ?`;
      args = [req.user.id, req.user.id];
    }
    sql += ` ORDER BY t.created_at DESC`;

    const result = await db.execute({ sql, args });
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error fetching tasks' });
  }
});

// Get count of pending tasks for current user (for dashboard badge)
router.get('/pending-count', async (req, res) => {
  try {
    const result = await db.execute({
      sql: "SELECT COUNT(*) as count FROM admin_tasks WHERE assigned_to = ? AND status = 'pending'",
      args: [req.user.id]
    });
    res.json({ count: result.rows[0].count });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Create a task (ADMIN or SUPER_ADMIN can assign to other admins)
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { title, description, shoot_id, assigned_to } = req.body;
    if (!title || !assigned_to) {
      return res.status(400).json({ error: 'Title and assigned_to are required' });
    }

    // Verify target is ADMIN or SUPER_ADMIN
    const targetUser = await db.execute({
      sql: "SELECT role FROM users WHERE id = ?",
      args: [assigned_to]
    });
    if (targetUser.rows.length === 0) {
      return res.status(404).json({ error: 'Target user not found' });
    }
    // Removed restriction preventing assignment to USER role

    const { target_count } = req.body;
    let targetCountVal = parseInt(target_count) || 0;

    const result = await db.execute({
      sql: `INSERT INTO admin_tasks (title, description, shoot_id, assigned_by, assigned_to, status, target_count, completed_count)
            VALUES (?, ?, ?, ?, ?, 'pending', ?, 0) RETURNING *`,
      args: [title, description || null, shoot_id || null, req.user.id, assigned_to, targetCountVal]
    });

    const io = req.app.get('io');
    if (io) io.emit('task_created', result.rows[0]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error creating task' });
  }
});

// Update task status and counts
router.patch('/:id/status', async (req, res) => {
  try {
    const { status, completed_count } = req.body;
    const validStatuses = ['pending', 'in_progress', 'done'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    // Only the assigned person can update status
    const task = await db.execute({
      sql: 'SELECT assigned_to, assigned_by FROM admin_tasks WHERE id = ?',
      args: [req.params.id]
    });
    if (task.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    // The assigned person, the assigner, or any admin can update
    const isAssigned = parseInt(task.rows[0].assigned_to) === parseInt(req.user.id);
    const isAssigner = parseInt(task.rows[0].assigned_by) === parseInt(req.user.id);
    const isAdminRole = req.user.role === 'ADMIN' || req.user.role === 'SUPER_ADMIN';
    if (!isAssigned && !isAssigner && !isAdminRole) {
      return res.status(403).json({ error: 'Not authorized to update this task' });
    }

    const updates = [];
    const args = [];
    if (status) { updates.push('status = ?'); args.push(status); }
    if (completed_count !== undefined) { updates.push('completed_count = ?'); args.push(completed_count); }
    if (req.body.incomplete_count !== undefined) { updates.push('incomplete_count = ?'); args.push(req.body.incomplete_count); }
    if (updates.length > 0) {
      args.push(req.params.id);
      await db.execute({
        sql: `UPDATE admin_tasks SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`,
        args
      });
    }

    const io = req.app.get('io');
    if (io) io.emit('task_updated', { id: req.params.id, status, completed_count, incomplete_count: req.body.incomplete_count });

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error updating task' });
  }
});

// Delete a task (creator or SUPER_ADMIN)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const task = await db.execute({
      sql: 'SELECT assigned_by FROM admin_tasks WHERE id = ?',
      args: [req.params.id]
    });
    if (task.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    if (parseInt(task.rows[0].assigned_by) !== parseInt(req.user.id) && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Only the task creator can delete it' });
    }

    await db.execute({ sql: 'DELETE FROM admin_tasks WHERE id = ?', args: [req.params.id] });

    const io = req.app.get('io');
    if (io) io.emit('task_deleted', { id: req.params.id });

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error deleting task' });
  }
});

export default router;
