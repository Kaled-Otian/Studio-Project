import express from 'express';
import { db } from '../config/database.js';
import { requireAdmin } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAdmin);

// GET /api/analytics
router.get('/', async (req, res) => {
  try {
    const usersResult = await db.execute("SELECT COUNT(*) as total, SUM(is_active) as active FROM users");
    const tasksResult = await db.execute("SELECT COUNT(*) as completed FROM admin_tasks WHERE status = 'done'");
    const shootsResult = await db.execute("SELECT COUNT(*) as in_progress FROM shoots WHERE status IN ('Shooting', 'Editing', 'Reviewing')");
    
    // Recent Audit Logs
    const logsResult = await db.execute(`
      SELECT a.*, u.name as user_name 
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.id
      ORDER BY a.created_at DESC 
      LIMIT 10
    `);

    res.json({
      totalUsers: usersResult.rows[0].total,
      activeUsers: usersResult.rows[0].active || 0,
      tasksCompleted: tasksResult.rows[0].completed,
      shootsInProgress: shootsResult.rows[0].in_progress,
      recentLogs: logsResult.rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

export default router;
