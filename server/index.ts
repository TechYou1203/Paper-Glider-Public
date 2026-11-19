import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { app } from './app.js';

// Serve built frontend assets in production
const distPath = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.resolve(distPath, 'index.html'));
  });
}

const PORT = parseInt(process.env.PORT || process.env.SERVER_PORT || '3001');
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Paper Glider server running on port ${PORT}`);
});

server.on('error', (error) => {
  console.error('HTTP server error:', error);
});

// Last-resort guards. Route handlers already catch their own failures; a stray
// rejection should be logged rather than taking the game offline mid-flight.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason instanceof Error ? reason.message : reason);
});
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

function shutdown(signal: string): void {
  console.log(`Received ${signal}; closing server.`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
