import { createClient } from '@libsql/client';
import dotenv from 'dotenv';

dotenv.config();

export const db = createClient({
  url: process.env.DB_PATH || 'file:studio.db'
});

export async function initDB() {
  // ─── Core Tables ──────────────────────────────────────────────────────────

  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'USER',
      job_title TEXT,
      abbreviation TEXT,
      avatar_color TEXT,
      is_active INTEGER DEFAULT 1
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_user_id INTEGER NOT NULL,
      action_by_id INTEGER NOT NULL,
      changes TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(target_user_id) REFERENCES users(id),
      FOREIGN KEY(action_by_id) REFERENCES users(id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS shoots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      person_filmed TEXT,
      shoot_date TEXT,
      duration_hours REAL,
      output_duration TEXT,
      content_types TEXT,
      details TEXT,
      status TEXT DEFAULT 'Scheduled',
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(created_by) REFERENCES users(id)
    )
  `);

  // Legacy table — kept for backward compatibility; all runtime code uses admin_tasks
  await db.execute(`
    CREATE TABLE IF NOT EXISTS shoot_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shoot_id INTEGER,
      user_id INTEGER,
      task_description TEXT,
      is_main_editor INTEGER DEFAULT 0,
      FOREIGN KEY(shoot_id) REFERENCES shoots(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shoot_id INTEGER,
      user_id INTEGER,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(shoot_id) REFERENCES shoots(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS admin_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      shoot_id INTEGER,
      assigned_by INTEGER NOT NULL,
      assigned_to INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(shoot_id) REFERENCES shoots(id),
      FOREIGN KEY(assigned_by) REFERENCES users(id),
      FOREIGN KEY(assigned_to) REFERENCES users(id)
    )
  `);

  // ─── NEW: Schedules ────────────────────────────────────────────────────────

  await db.execute(`
    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      type TEXT DEFAULT 'meeting',
      start_datetime TEXT NOT NULL,
      end_datetime TEXT,
      all_day INTEGER DEFAULT 0,
      location TEXT,
      color TEXT DEFAULT '#c87212',
      shoot_id INTEGER,
      created_by INTEGER NOT NULL,
      status TEXT DEFAULT 'upcoming',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(shoot_id) REFERENCES shoots(id),
      FOREIGN KEY(created_by) REFERENCES users(id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS schedule_attendees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      response TEXT DEFAULT 'pending',
      FOREIGN KEY(schedule_id) REFERENCES schedules(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  // ─── NEW: Announcements ────────────────────────────────────────────────────

  await db.execute(`
    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      priority TEXT DEFAULT 'normal',
      created_by INTEGER NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(created_by) REFERENCES users(id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS announcement_reads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      announcement_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      read_at TEXT DEFAULT (datetime('now')),
      UNIQUE(announcement_id, user_id),
      FOREIGN KEY(announcement_id) REFERENCES announcements(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  // ─── NEW: Chat ─────────────────────────────────────────────────────────────

  await db.execute(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL DEFAULT 'private',
      name TEXT,
      created_by INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(created_by) REFERENCES users(id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS conversation_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT DEFAULT 'member',
      joined_at TEXT DEFAULT (datetime('now')),
      UNIQUE(conversation_id, user_id),
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      is_pinned INTEGER DEFAULT 0,
      pin_expires_at TEXT,
      is_important INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  // ─── Safe Migrations (existing DBs) ───────────────────────────────────────
  const migrations = [
    "ALTER TABLE users ADD COLUMN job_title TEXT",
    "ALTER TABLE users ADD COLUMN abbreviation TEXT",
    "ALTER TABLE users ADD COLUMN avatar_color TEXT",
    "ALTER TABLE shoots ADD COLUMN output_duration TEXT",
    "ALTER TABLE shoots ADD COLUMN task_status TEXT DEFAULT 'pending'",
    "ALTER TABLE shoots ADD COLUMN progress INTEGER DEFAULT 0",
    "ALTER TABLE shoots ADD COLUMN start_datetime TEXT",
    "ALTER TABLE shoots ADD COLUMN end_datetime TEXT",
    "ALTER TABLE admin_tasks ADD COLUMN target_count INTEGER DEFAULT 0",
    "ALTER TABLE admin_tasks ADD COLUMN completed_count INTEGER DEFAULT 0",
    "ALTER TABLE admin_tasks ADD COLUMN incomplete_count INTEGER DEFAULT 0",
    "ALTER TABLE admin_tasks ADD COLUMN is_main_editor INTEGER DEFAULT 0",
    "ALTER TABLE conversation_members ADD COLUMN is_invisible INTEGER DEFAULT 0",
    "ALTER TABLE shoots ADD COLUMN created_at TEXT DEFAULT (datetime('now'))",
    "ALTER TABLE messages ADD COLUMN reply_to_id INTEGER"
  ];
  for (const sql of migrations) {
    try { await db.execute(sql); } catch (_) {}
  }

  // ─── NEW: Audit & Auth ─────────────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS password_reset_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      resolved_at TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Safe unique indexes (idempotent — CREATE IF NOT EXISTS)
  try { await db.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_attendees_unique ON schedule_attendees(schedule_id, user_id)"); } catch (_) {}
  try { await db.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_tasks_shoot_user ON admin_tasks(shoot_id, assigned_to) WHERE shoot_id IS NOT NULL"); } catch (_) {}

  // ─── UNIFICATION: Migrate shoot_assignments to admin_tasks (runs once) ─────
  try {
    // Create a migration tracking table
    await db.execute(`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, ran_at TEXT DEFAULT (datetime('now')))`);
    const migrationDone = await db.execute("SELECT 1 FROM _migrations WHERE name = 'shoot_assignments_to_tasks'");
    if (migrationDone.rows.length === 0) {
      const existingAssignments = await db.execute("SELECT * FROM shoot_assignments");
      for (const a of existingAssignments.rows) {
        const check = await db.execute({
          sql: "SELECT 1 FROM admin_tasks WHERE shoot_id = ? AND assigned_to = ? AND description = ?",
          args: [a.shoot_id, a.user_id, a.task_description]
        });
        if (check.rows.length === 0) {
          const shoot = await db.execute({ sql: "SELECT created_by, title FROM shoots WHERE id = ?", args: [a.shoot_id] });
          const creator = shoot.rows.length ? shoot.rows[0].created_by : 1;
          const shootTitle = shoot.rows.length ? shoot.rows[0].title : 'Shoot';
          await db.execute({
            sql: `INSERT INTO admin_tasks (title, description, shoot_id, assigned_by, assigned_to, status, target_count, completed_count, incomplete_count, is_main_editor)
                  VALUES (?, ?, ?, ?, ?, 'pending', 0, 0, 0, ?)`,
            args: [`Edit: ${shootTitle}`, a.task_description, a.shoot_id, creator, a.user_id, a.is_main_editor || 0]
          });
        }
      }
      await db.execute({ sql: "INSERT INTO _migrations (name) VALUES (?)", args: ['shoot_assignments_to_tasks'] });
      console.log('Migration: shoot_assignments → admin_tasks completed');
    }
  } catch (err) {
    console.error("Migration error for assignments", err.message);
  }
  // Role normalization
  try { await db.execute("UPDATE users SET role = 'ADMIN' WHERE role = 'Admin'"); } catch (_) {}
  try { await db.execute("UPDATE users SET role = 'USER' WHERE role = 'User'"); } catch (_) {}

  // ─── Ensure public channel exists ─────────────────────────────────────────
  try {
    const publicChannel = await db.execute("SELECT id FROM conversations WHERE type = 'public' LIMIT 1");
    if (publicChannel.rows.length === 0) {
      await db.execute({
        sql: "INSERT INTO conversations (type, name, created_by) VALUES ('public', 'General', 1)",
        args: []
      });
    }
  } catch (_) {}

  console.log('Database initialized successfully.');

  // ─── Seed Users ───────────────────────────────────────────────────────────
  const bcrypt = await import('bcryptjs');

  const seedUsers = [
    { name: 'Super Admin', email: 'admin@studio.com', password: 'admin123', role: 'SUPER_ADMIN', job_title: 'Studio Director', abbreviation: 'SA' },
    { name: 'HR Manager', email: 'HR@studio.com', password: 'admin123', role: 'ADMIN', job_title: 'HR Manager', abbreviation: 'HR' },
    { name: 'Khaled Osama', email: 'khaledosama299@gmail.com', password: 'user123', role: 'USER', job_title: 'Video Editor', abbreviation: 'KO' },
  ];

  for (const u of seedUsers) {
    try {
      const existing = await db.execute({ sql: 'SELECT id FROM users WHERE email = ?', args: [u.email] });
      if (existing.rows.length === 0) {
        const hash = await bcrypt.default.hash(u.password, 10);
        await db.execute({
          sql: 'INSERT INTO users (name, email, password_hash, role, job_title, abbreviation) VALUES (?, ?, ?, ?, ?, ?)',
          args: [u.name, u.email, hash, u.role, u.job_title, u.abbreviation]
        });
        console.log(`Seeded: ${u.email} (${u.role})`);
      } else {
        // Ensure role is correct even on existing users
        await db.execute({ sql: 'UPDATE users SET role = ? WHERE email = ?', args: [u.role, u.email] });
      }
    } catch (err) {
      console.error(`Seed error for ${u.email}:`, err.message);
    }
  }

  // Ensure all existing users are members of the public channel
  try {
    const publicCh = await db.execute("SELECT id FROM conversations WHERE type = 'public' LIMIT 1");
    if (publicCh.rows.length > 0) {
      const chId = publicCh.rows[0].id;
      const allUsers = await db.execute('SELECT id FROM users WHERE is_active = 1');
      for (const user of allUsers.rows) {
        try {
          await db.execute({
            sql: 'INSERT OR IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?, ?)',
            args: [chId, user.id]
          });
        } catch (_) {}
      }
    }
  } catch (_) {}
}
