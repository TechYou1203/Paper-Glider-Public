import 'dotenv/config';
import { databaseConfigured, checkDatabase } from './db.js';

export default async function handler(_req: any, res: any) {
  // CORS headers
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (_req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  try {
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

    const payload = JSON.stringify({
      status: 'ok',
      database: dbConnected ? 'connected' : isConfigured ? 'connecting_or_error' : 'missing_database_url',
      dbError,
      timestamp: new Date().toISOString(),
    });

    res.statusCode = 200;
    res.end(payload);
  } catch (err: any) {
    const errorPayload = JSON.stringify({
      status: 'ok',
      database: 'error',
      dbError: err?.message || 'Unexpected server error',
      timestamp: new Date().toISOString(),
    });
    res.statusCode = 200;
    res.end(errorPayload);
  }
}
