import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  const dbUrl = process.env.DATABASE_URL;
  const isConfigured = Boolean(dbUrl && !dbUrl.includes('ep-xxxxx') && !dbUrl.includes('user:password@'));

  let dbConnected = false;
  let dbError = null;

  if (isConfigured) {
    try {
      const sql = neon(dbUrl);
      const rows = await sql`SELECT 1 AS ok`;
      dbConnected = Boolean(rows && rows.length > 0);
    } catch (e) {
      dbError = e?.message || 'Database connection error';
    }
  }

  const payload = JSON.stringify({
    status: 'ok',
    database: dbConnected ? 'connected' : isConfigured ? 'connecting_or_error' : 'missing_database_url',
    dbError,
    timestamp: new Date().toISOString(),
  });

  res.statusCode = 200;
  return res.end(payload);
}
