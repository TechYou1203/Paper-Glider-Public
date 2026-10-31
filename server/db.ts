import 'dotenv/config';
import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import { HttpError } from './http.js';

let connection: NeonQueryFunction<false, false> | null = null;

export function databaseConfigured(): boolean {
  const url = process.env.DATABASE_URL;
  return Boolean(url && !url.includes('ep-xxxxx') && !url.includes('user:password@'));
}

export function getSql(): NeonQueryFunction<false, false> {
  if (!databaseConfigured()) throw new HttpError(503, 'Database is not configured. Offline play is available.');
  if (!connection) connection = neon(process.env.DATABASE_URL!);
  return connection;
}

export const sql = new Proxy((() => {}) as unknown as NeonQueryFunction<false, false>, {
  apply(_target, _thisArg, args) {
    const fn = getSql();
    return (fn as any)(...args);
  },
  get(_target, prop) {
    const fn = getSql();
    const val = (fn as any)[prop];
    return typeof val === 'function' ? val.bind(fn) : val;
  },
});

export async function checkDatabase(): Promise<boolean> {
  if (!databaseConfigured()) return false;
  try {
    const rows = await sql`SELECT to_regclass('public.leaderboard') AS leaderboard`;
    return Boolean(rows[0]?.leaderboard);
  } catch {
    return false;
  }
}
