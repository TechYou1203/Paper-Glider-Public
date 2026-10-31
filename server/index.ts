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
app.listen(PORT, '0.0.0.0', () => console.log(`Paper Glider server running on port ${PORT}`));
