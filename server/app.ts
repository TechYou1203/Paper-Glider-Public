import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import leaderboardRoutes from './routes/leaderboard.js';
import flightRoutes from './routes/flights.js';
import challengeRoutes from './routes/challenges.js';
import inventoryRoutes from './routes/inventory.js';

export const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/flights', flightRoutes);
app.use('/api/challenges', challengeRoutes);
app.use('/api/inventory', inventoryRoutes);

// Health check
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
