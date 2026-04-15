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

const allowedOrigins = [
  'https://mulhimstudio.vercel.app',
  'http://localhost:5173'
];

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    credentials: true
  }
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

const corsConfig = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('CORS not allowed'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true
};
app.use(cors(corsConfig));
app.options('*', cors(corsConfig));
app.use(express.json());
app.use(requestLogger);

initDB().catch(console.error);

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

const prodDist = path.join(__dirname, '../dist');
const localDist = path.join(__dirname, '../../frontend/dist');
const distPath = fs.existsSync(prodDist) ? prodDist : localDist;

app.use(express.static(distPath));

app.use((req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT} with WebSockets`));
