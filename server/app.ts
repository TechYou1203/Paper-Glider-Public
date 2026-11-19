import express from 'express';
import cors from 'cors';
import { databaseConfigured, checkDatabase } from './db.js';
import { errorHandler } from './http.js';
import authRoutes from './routes/auth.js';
import leaderboardRoutes from './routes/leaderboard.js';
import flightRoutes from './routes/flights.js';
import challengeRoutes from './routes/challenges.js';
import inventoryRoutes from './routes/inventory.js';

export const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Restore originalUrl if rewritten by serverless host (Vercel)
app.use((req, _res, next) => {
  if (req.originalUrl && req.originalUrl !== req.url) {
    req.url = req.originalUrl;
  }
  next();
});

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

// Unknown API paths must stay JSON (the SPA fallback belongs to server/index.ts).
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.path === '/api' || req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  next();
});

// Sanitized JSON error responses: never leak database errors or query details.
app.use(errorHandler);


