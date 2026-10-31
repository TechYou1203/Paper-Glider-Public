import express from 'express';
import cors from 'cors';
import { databaseConfigured, checkDatabase } from './db.js';
import authRoutes from './routes/auth.js';
import leaderboardRoutes from './routes/leaderboard.js';
import flightRoutes from './routes/flights.js';
import challengeRoutes from './routes/challenges.js';
import inventoryRoutes from './routes/inventory.js';

export const app = express();
app.use(cors());
app.use(express.json());

// Health & Database Diagnostics check
const handleHealth = async (_req: express.Request, res: express.Response) => {
  const isConfigured = databaseConfigured();
  let dbConnected = false;
  let dbError: string | null = null;
  if (isConfigured) {
    try {
      dbConnected = await checkDatabase();
    } catch (e: any) {
      dbError = e?.message || 'Database query error';
    }
  }
  res.json({
    status: 'ok',
    database: dbConnected ? 'connected' : isConfigured ? 'connecting_or_error' : 'missing_database_url',
    dbError,
    timestamp: new Date().toISOString(),
  });
};

app.get(['/health', '/api/health', '/api', '/'], handleHealth);

// API route groups - mounted with and without /api prefix for robust serverless rewrite handling
app.use(['/api/auth', '/auth'], authRoutes);
app.use(['/api/leaderboard', '/leaderboard'], leaderboardRoutes);
app.use(['/api/flights', '/flights'], flightRoutes);
app.use(['/api/challenges', '/challenges'], challengeRoutes);
app.use(['/api/inventory', '/inventory'], inventoryRoutes);

// Global error handler so serverless function never unceremoniously crashes
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[API Error]:', err);
  res.status(err?.status || 500).json({
    status: 'error',
    error: err?.message || 'Internal Server Error',
  });
});


