import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { initDB } from './config/database.js';

import authRoutes from './routes/auth.js';
import shootsRoutes from './routes/shoots.js';
import usersRoutes from './routes/users.js';
import tasksRoutes from './routes/tasks.js';
import schedulesRoutes from './routes/schedules.js';
import announcementsRoutes from './routes/announcements.js';
import chatRoutes from './routes/chat.js';
import analyticsRoutes from './routes/analytics.js';
import { requestLogger, globalErrorHandler } from './middleware/logger.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// ── CORS Configuration (shared between Express and Socket.IO) ────────────
const corsConfig = {
  origin: [
    'https://mulhimstudio.vercel.app',
    'http://localhost:5173'
  ],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true
};

// ── HTTP Server + Socket.IO ──────────────────────────────────────────────
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: corsConfig
});

app.set('io', io);

io.on('connection', (socket) => {
  console.log('User connected to socket:', socket.id);

  socket.on('join_conversation', (conversationId) => {
    socket.join(`conversation_${conversationId}`);
  });

  socket.on('leave_conversation', (conversationId) => {
    socket.leave(`conversation_${conversationId}`);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// ── Middleware ────────────────────────────────────────────────────────────
app.use(cors(corsConfig));
app.use(express.json());
app.use(requestLogger);

// ── Database ─────────────────────────────────────────────────────────────
initDB().catch((err) => {
  console.error('Database init failed:', err);
});

// ── API Routes ───────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/shoots', shootsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/schedules', schedulesRoutes);
app.use('/api/announcements', announcementsRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/analytics', analyticsRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// Attach central error handler after all routes
app.use(globalErrorHandler);

// ── Static file serving (only if dist exists) ────────────────────────────
const prodDist = path.join(__dirname, '../dist');
const localDist = path.join(__dirname, '../../frontend/dist');
const distPath = fs.existsSync(prodDist) ? prodDist : (fs.existsSync(localDist) ? localDist : null);

if (distPath) {
  app.use(express.static(distPath));
  app.use((req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ── Global crash protection ──────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled Rejection:', reason);
});

// ── Start server (bind to 0.0.0.0 for Railway) ──────────────────────────
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on 0.0.0.0:${PORT} with WebSockets`);
});
