import express from 'express';
import { db } from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

// ─── Conversations ─────────────────────────────────────────────────────────

// GET all conversations for current user
router.get('/conversations', async (req, res) => {
  try {
    const result = await db.execute({
      sql: `SELECT c.*, cm.role as member_role,
              (SELECT content FROM messages m WHERE m.conversation_id = c.id
               AND m.deleted_at IS NULL ORDER BY m.created_at DESC LIMIT 1) as last_message,
              (SELECT created_at FROM messages m WHERE m.conversation_id = c.id
               AND m.deleted_at IS NULL ORDER BY m.created_at DESC LIMIT 1) as last_message_at,
              (SELECT u.name FROM messages m JOIN users u ON m.user_id = u.id
               WHERE m.conversation_id = c.id AND m.deleted_at IS NULL
               ORDER BY m.created_at DESC LIMIT 1) as last_sender
            FROM conversations c
            JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ?
            ORDER BY last_message_at DESC NULLS LAST`,
      args: [req.user.id]
    });

    // Attach members for each conversation
    const enriched = await Promise.all(result.rows.map(async (conv) => {
      const members = await db.execute({
        sql: `SELECT u.id, u.name, u.abbreviation, u.job_title, u.role as user_role, cm.role as conv_role, cm.is_invisible
              FROM conversation_members cm JOIN users u ON cm.user_id = u.id
              WHERE cm.conversation_id = ?`,
        args: [conv.id]
      });
      // Filter out invisible members unless the requester is SUPER_ADMIN
      const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
      const visibleMembers = members.rows.filter(m => !m.is_invisible || (isSuperAdmin || m.id === req.user.id));
      return { ...conv, members: visibleMembers };
    }));

    res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// POST create conversation (private or group)
router.post('/conversations', async (req, res) => {
  try {
    const { type, name, member_ids } = req.body;
    if (!type || !member_ids || !member_ids.length) {
      return res.status(400).json({ error: 'Type and at least one member required' });
    }

    const validTypes = ['private', 'group'];
    if (!validTypes.includes(type)) return res.status(400).json({ error: 'Invalid type. Use private or group' });

    if (type === 'private') {
      const otherUserId = member_ids[0];
      // Check if private conversation already exists between these two users
      const existing = await db.execute({
        sql: `SELECT c.id FROM conversations c
              JOIN conversation_members m1 ON m1.conversation_id = c.id AND m1.user_id = ?
              JOIN conversation_members m2 ON m2.conversation_id = c.id AND m2.user_id = ?
              WHERE c.type = 'private'
              LIMIT 1`,
        args: [req.user.id, otherUserId]
      });
      if (existing.rows.length > 0) {
        return res.json({ id: existing.rows[0].id, existing: true });
      }
    }

    const result = await db.execute({
      sql: "INSERT INTO conversations (type, name, created_by) VALUES (?, ?, ?) RETURNING *",
      args: [type, name || null, req.user.id]
    });
    const convId = result.rows[0].id;

    // Add creator + members
    const members = new Set([String(req.user.id), ...member_ids.map(String)]);
    for (const uid of members) {
      try {
        await db.execute({
          sql: 'INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, ?)',
          args: [convId, uid, uid === String(req.user.id) ? 'admin' : 'member']
        });
      } catch (_) {}
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

// ─── Members ─────────────────────────────────────────────────────────────

// Add member to conversation (SUPER_ADMIN or Admin of conversation)
router.post('/conversations/:id/members', async (req, res) => {
  try {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });

    if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Only SUPER_ADMIN can add members to existing conversations' });

    await db.execute({
      sql: 'INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, ?)',
      args: [req.params.id, user_id, 'member']
    });

    const userRes = await db.execute({ sql: 'SELECT id, name, abbreviation, job_title, role as user_role FROM users WHERE id = ?', args: [user_id] });
    const newMember = { ...userRes.rows[0], conv_role: 'member' };

    const io = req.app.get('io');
    if (io) io.to(`conversation_${req.params.id}`).emit('member_added', newMember);

    res.json(newMember);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add member' });
  }
});

// Remove member from conversation (SUPER_ADMIN or Admin of conversation)
router.delete('/conversations/:id/members/:userId', async (req, res) => {
  try {
    if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Only SUPER_ADMIN can remove members' });

    await db.execute({
      sql: 'DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?',
      args: [req.params.id, req.params.userId]
    });

    const io = req.app.get('io');
    if (io) io.to(`conversation_${req.params.id}`).emit('member_removed', { user_id: req.params.userId });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// Toggle invisible mode (SUPER_ADMIN only)
router.patch('/conversations/:id/invisible', async (req, res) => {
  try {
    if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Only SUPER_ADMIN can be invisible' });

    const { is_invisible } = req.body;
    
    await db.execute({
      sql: 'UPDATE conversation_members SET is_invisible = ? WHERE conversation_id = ? AND user_id = ?',
      args: [is_invisible ? 1 : 0, req.params.id, req.user.id]
    });

    const io = req.app.get('io');
    if (io) io.to(`conversation_${req.params.id}`).emit(is_invisible ? 'member_removed' : 'member_added', {
      user_id: req.user.id,
      id: req.user.id,
      name: req.user.name,
      abbreviation: req.user.abbreviation, // Emulated payload to handle UI re-add
      is_invisible: 1
    });

    res.json({ success: true, is_invisible });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update visibility' });
  }
});

// ─── Messages ──────────────────────────────────────────────────────────────

// GET messages in a conversation (with pagination)
router.get('/conversations/:id/messages', async (req, res) => {
  try {
    const convId = req.params.id;
    const limit = parseInt(req.query.limit) || 50;
    const before = req.query.before; // cursor for pagination

    // Verify user is member
    const isMember = await db.execute({
      sql: 'SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?',
      args: [convId, req.user.id]
    });
    if (!isMember.rows.length) return res.status(403).json({ error: 'Not a member of this conversation' });

    const whereClause = before ? 'AND m.created_at < ?' : '';
    const queryArgs = before ? [convId, before, limit] : [convId, limit];

    const result = await db.execute({
      sql: `SELECT m.*, u.name as user_name, u.abbreviation
            FROM messages m JOIN users u ON m.user_id = u.id
            WHERE m.conversation_id = ? AND m.deleted_at IS NULL ${whereClause}
            ORDER BY m.created_at DESC LIMIT ?`,
      args: queryArgs
    });

    res.json(result.rows.reverse()); // Return in chronological order
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// GET new messages since a timestamp (for polling)
router.get('/conversations/:id/messages/since', async (req, res) => {
  try {
    const { since } = req.query;
    if (!since) return res.status(400).json({ error: 'since param required' });

    const isMember = await db.execute({
      sql: 'SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?',
      args: [req.params.id, req.user.id]
    });
    if (!isMember.rows.length) return res.status(403).json({ error: 'Not a member' });

    const result = await db.execute({
      sql: `SELECT m.*, u.name as user_name, u.abbreviation
            FROM messages m JOIN users u ON m.user_id = u.id
            WHERE m.conversation_id = ? AND m.created_at > ? AND m.deleted_at IS NULL
            ORDER BY m.created_at ASC`,
      args: [req.params.id, since]
    });

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to poll messages' });
  }
});

// POST send message
router.post('/conversations/:id/messages', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Message cannot be empty' });

    const isMember = await db.execute({
      sql: 'SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?',
      args: [req.params.id, req.user.id]
    });
    if (!isMember.rows.length) return res.status(403).json({ error: 'Not a member of this conversation' });

    const result = await db.execute({
      sql: `INSERT INTO messages (conversation_id, user_id, content) VALUES (?, ?, ?) RETURNING *`,
      args: [req.params.id, req.user.id, content.trim()]
    });

    const userRes = await db.execute({ sql: 'SELECT name, abbreviation FROM users WHERE id = ?', args: [req.user.id] });
    const msg = { ...result.rows[0], user_name: userRes.rows[0]?.name, abbreviation: userRes.rows[0]?.abbreviation };
    
    const io = req.app.get('io');
    if (io) io.to(`conversation_${req.params.id}`).emit('new_message', msg);
    
    res.status(201).json(msg);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// PATCH pin / mark important / edit message
router.patch('/messages/:id', async (req, res) => {
  try {
    const msg = await db.execute({ sql: 'SELECT * FROM messages WHERE id = ?', args: [req.params.id] });
    if (!msg.rows.length) return res.status(404).json({ error: 'Message not found' });

    const m = msg.rows[0];
    const isOwner = parseInt(m.user_id) === parseInt(req.user.id);
    const isAdmin = req.user.role === 'ADMIN' || req.user.role === 'SUPER_ADMIN';

    const { is_pinned, pin_duration_hours, is_important, content } = req.body;

    let pinExpiresAt = m.pin_expires_at;
    if (is_pinned !== undefined) {
      if (!isAdmin && !isOwner) return res.status(403).json({ error: 'Not authorized' });
      if (is_pinned && pin_duration_hours) {
        const expiry = new Date();
        expiry.setHours(expiry.getHours() + parseInt(pin_duration_hours));
        pinExpiresAt = expiry.toISOString();
      } else if (!is_pinned) {
        pinExpiresAt = null;
      }
    }

    if (content !== undefined && !isOwner) return res.status(403).json({ error: 'Only the author can edit' });

    await db.execute({
      sql: `UPDATE messages SET
              is_pinned = COALESCE(?, is_pinned),
              pin_expires_at = ?,
              is_important = COALESCE(?, is_important),
              content = COALESCE(?, content),
              updated_at = datetime('now')
            WHERE id = ?`,
      args: [
        is_pinned !== undefined ? (is_pinned ? 1 : 0) : null,
        pinExpiresAt,
        is_important !== undefined ? (is_important ? 1 : 0) : null,
        content || null,
        req.params.id
      ]
    });

    const io = req.app.get('io');
    if (io) io.to(`conversation_${m.conversation_id}`).emit('message_updated', { id: req.params.id, is_pinned, pin_expires_at: pinExpiresAt, is_important, content });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update message' });
  }
});

// DELETE (soft-delete) message
router.delete('/messages/:id', async (req, res) => {
  try {
    const msg = await db.execute({ sql: 'SELECT * FROM messages WHERE id = ?', args: [req.params.id] });
    if (!msg.rows.length) return res.status(404).json({ error: 'Message not found' });

    const isOwner = parseInt(msg.rows[0].user_id) === parseInt(req.user.id);
    const isAdmin = req.user.role === 'ADMIN' || req.user.role === 'SUPER_ADMIN';
    if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Not authorized' });

    await db.execute({
      sql: "UPDATE messages SET deleted_at = datetime('now'), content = '[Message deleted]' WHERE id = ?",
      args: [req.params.id]
    });

    const io = req.app.get('io');
    if (io) io.to(`conversation_${msg.rows[0].conversation_id}`).emit('message_deleted', { id: req.params.id });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

export default router;
