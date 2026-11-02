import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { sql } from '../db.js';
import { sendVerificationEmail } from '../email.js';

const router = Router();

// POST /api/auth/guest — Create a new guest player
router.post('/guest', async (req: Request, res: Response) => {
  try {
    const { callsign } = req.body || {};
    const playerCallsign =
      callsign || `Pilot${Math.floor(100 + Math.random() * 900)}`;
    const guestToken = crypto.randomUUID();

    const rows = await sql`
      INSERT INTO players (guest_token, callsign)
      VALUES (${guestToken}, ${playerCallsign})
      RETURNING id, callsign, equipped_skin, paperclips, unlocked_skins, sound_enabled
    `;

    const player = rows[0];

    res.status(201).json({
      token: guestToken,
      player: {
        id: player.id,
        callsign: player.callsign,
        equippedSkin: player.equipped_skin,
        paperclips: player.paperclips,
        unlockedSkins: player.unlocked_skins,
        soundEnabled: player.sound_enabled,
      },
    });
  } catch (error) {
    console.error('Guest auth error:', error);
    res.status(500).json({ error: 'Failed to create guest account' });
  }
});

// POST /api/auth/login — Log in with an existing guest token
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { token } = req.body || {};

    if (!token) {
      res.status(400).json({ error: 'Token is required' });
      return;
    }

    const rows = await sql`
      SELECT id, callsign, equipped_skin, paperclips, unlocked_skins, sound_enabled
      FROM players
      WHERE guest_token = ${token}
    `;

    if (rows.length === 0) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    const player = rows[0];

    res.json({
      player: {
        id: player.id,
        callsign: player.callsign,
        equippedSkin: player.equipped_skin,
        paperclips: player.paperclips,
        unlockedSkins: player.unlocked_skins,
        soundEnabled: player.sound_enabled,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to log in' });
  }
});

// POST /api/auth/sync-pilot — Link or get Neon player for a Firebase pilot
router.post('/sync-pilot', async (req: Request, res: Response) => {
  try {
    const { firebaseUid, callsign, email, authProvider } = req.body || {};
    if (!firebaseUid || !callsign) {
      res.status(400).json({ error: 'firebaseUid and callsign are required' });
      return;
    }

    const cleanEmail = email ? String(email).trim().toLowerCase() : null;
    const provider = authProvider || 'firebase';

    // If signed in with Google, register in google_accounts registry
    if (provider === 'google' && cleanEmail) {
      await sql`
        INSERT INTO google_accounts (email, firebase_uid, callsign, updated_at)
        VALUES (${cleanEmail}, ${firebaseUid}, ${callsign}, NOW())
        ON CONFLICT (email) DO UPDATE
        SET firebase_uid = ${firebaseUid}, callsign = ${callsign}, updated_at = NOW()
      `;
    }

    // 1. Look for existing record by firebase_uid
    let rows = await sql`
      SELECT id, guest_token, callsign, equipped_skin, paperclips, unlocked_skins, sound_enabled
      FROM players
      WHERE firebase_uid = ${firebaseUid}
    `;

    if (rows.length > 0) {
      rows = await sql`
        UPDATE players
        SET callsign = ${callsign},
            email = COALESCE(${cleanEmail}, email),
            auth_provider = COALESCE(${provider}, auth_provider),
            updated_at = NOW()
        WHERE firebase_uid = ${firebaseUid}
        RETURNING id, guest_token, callsign, equipped_skin, paperclips, unlocked_skins, sound_enabled
      `;
      const player = rows[0];
      res.json({
        token: player.guest_token,
        player: {
          id: player.id,
          callsign: player.callsign,
          equippedSkin: player.equipped_skin,
          paperclips: player.paperclips,
          unlockedSkins: player.unlocked_skins,
          soundEnabled: player.sound_enabled,
        },
      });
      return;
    }

    // 2. Not found by firebase_uid; insert new linked pilot
    const guestToken = crypto.randomUUID();
    rows = await sql`
      INSERT INTO players (guest_token, firebase_uid, callsign, email, auth_provider)
      VALUES (${guestToken}, ${firebaseUid}, ${callsign}, ${cleanEmail}, ${provider})
      RETURNING id, guest_token, callsign, equipped_skin, paperclips, unlocked_skins, sound_enabled
    `;

    const player = rows[0];
    res.status(201).json({
      token: player.guest_token,
      player: {
        id: player.id,
        callsign: player.callsign,
        equippedSkin: player.equipped_skin,
        paperclips: player.paperclips,
        unlockedSkins: player.unlocked_skins,
        soundEnabled: player.sound_enabled,
      },
    });
  } catch (error) {
    console.error('Sync pilot error:', error);
    res.status(500).json({ error: 'Failed to sync pilot account' });
  }
});

// GET /api/auth/check-google — Check if email or username is registered via Google
router.get('/check-google', async (req: Request, res: Response) => {
  try {
    const email = (req.query.email as string)?.trim().toLowerCase();
    const identifier = (req.query.identifier as string)?.trim().toLowerCase();

    const queryVal = email || identifier;
    if (!queryVal) {
      res.json({ isGoogle: false });
      return;
    }

    if (queryVal.includes('@')) {
      const rows = await sql`
        SELECT email FROM google_accounts
        WHERE LOWER(email) = LOWER(${queryVal})
        LIMIT 1
      `;
      if (rows.length > 0) {
        res.json({ isGoogle: true, message: 'This account is registered with Google. Try signing in with Google.' });
        return;
      }

      const pRows = await sql`
        SELECT id FROM players
        WHERE LOWER(email) = LOWER(${queryVal}) AND auth_provider = 'google'
        LIMIT 1
      `;
      if (pRows.length > 0) {
        res.json({ isGoogle: true, message: 'This account is registered with Google. Try signing in with Google.' });
        return;
      }
    } else {
      const rows = await sql`
        SELECT email FROM google_accounts
        WHERE LOWER(callsign) = LOWER(${queryVal})
        LIMIT 1
      `;
      if (rows.length > 0) {
        res.json({ isGoogle: true, message: 'This account is registered with Google. Try signing in with Google.' });
        return;
      }

      const pRows = await sql`
        SELECT id FROM players
        WHERE LOWER(callsign) = LOWER(${queryVal}) AND auth_provider = 'google'
        LIMIT 1
      `;
      if (pRows.length > 0) {
        res.json({ isGoogle: true, message: 'This account is registered with Google. Try signing in with Google.' });
        return;
      }
    }

    res.json({ isGoogle: false });
  } catch (err) {
    console.error('Check google error:', err);
    res.json({ isGoogle: false });
  }
});

// POST /api/auth/send-verification-code — Validate user details & send 6-digit OTP email
router.post('/send-verification-code', async (req: Request, res: Response) => {
  try {
    const { email, username, type = 'signup' } = req.body || {};

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();
    const cleanUsername = (username || '').trim();

    if (!cleanUsername || cleanUsername.length < 3) {
      res.status(400).json({ error: 'Username must be at least 3 characters long.' });
      return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(cleanUsername)) {
      res.status(400).json({ error: 'Username can only contain letters, numbers, underscores, and dashes.' });
      return;
    }

    // Check if account is registered with Google
    const googleCheck = await sql`
      SELECT email FROM google_accounts
      WHERE LOWER(email) = LOWER(${trimmedEmail})
         OR LOWER(callsign) = LOWER(${cleanUsername})
      LIMIT 1
    `;
    if (googleCheck.length > 0) {
      res.status(400).json({
        error: 'This account is registered with Google. Try signing in with Google.',
        isGoogle: true,
      });
      return;
    }

    const playerGoogleCheck = await sql`
      SELECT id FROM players
      WHERE (LOWER(email) = LOWER(${trimmedEmail}) OR LOWER(callsign) = LOWER(${cleanUsername}))
        AND auth_provider = 'google'
      LIMIT 1
    `;
    if (playerGoogleCheck.length > 0) {
      res.status(400).json({
        error: 'This account is registered with Google. Try signing in with Google.',
        isGoogle: true,
      });
      return;
    }

    // If signing up, validate username is not already taken in Neon DB
    if (type === 'signup') {
      const existing = await sql`
        SELECT id FROM players
        WHERE LOWER(callsign) = LOWER(${cleanUsername})
        LIMIT 1
      `;
      if (existing.length > 0) {
        res.status(400).json({ error: 'This username is taken, try a different one.' });
        return;
      }
    }

    // Generate random 6-digit verification code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Invalidate old unverified codes for this email
    await sql`
      DELETE FROM verification_codes
      WHERE email = ${trimmedEmail} AND verified = false
    `;

    // Store in Neon DB with 10-minute expiration
    await sql`
      INSERT INTO verification_codes (email, username, code, type, expires_at)
      VALUES (${trimmedEmail}, ${cleanUsername}, ${code}, ${type}, NOW() + INTERVAL '10 minutes')
    `;

    // Dispatch the email
    await sendVerificationEmail({
      email: trimmedEmail,
      username: cleanUsername,
      code,
      type,
    });

    res.json({
      success: true,
      message: 'Verification code sent to your email address. Please check your inbox and Spam folder.',
      email: trimmedEmail,
      username: cleanUsername,
    });
  } catch (error) {
    console.error('Send verification code error:', error);
    res.status(500).json({ error: 'Failed to send verification code. Please try again.' });
  }
});

// POST /api/auth/verify-code — Validate 6-digit OTP code & activate pilot session
router.post('/verify-code', async (req: Request, res: Response) => {
  try {
    const { email, code, username, type = 'signup' } = req.body || {};

    if (!email || !code) {
      res.status(400).json({ error: 'Email and verification code are required.' });
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedCode = code.toString().trim();

    // Look for matching unexpired code
    const rows = await sql`
      SELECT id, email, username, code, expires_at, verified
      FROM verification_codes
      WHERE email = ${trimmedEmail}
        AND code = ${trimmedCode}
        AND expires_at > NOW()
        AND verified = false
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (rows.length === 0) {
      res.status(400).json({
        error: 'Invalid or expired verification code. Please check your Gmail (including Spam folder) and try again.',
      });
      return;
    }

    const verificationRecord = rows[0];

    // Mark verified
    await sql`
      UPDATE verification_codes
      SET verified = true
      WHERE id = ${verificationRecord.id}
    `;

    // Look up or create player in Neon DB
    const finalCallsign = username?.trim() || verificationRecord.username;
    let playerRows = await sql`
      SELECT id, guest_token, callsign, equipped_skin, paperclips, unlocked_skins, sound_enabled
      FROM players
      WHERE LOWER(callsign) = LOWER(${finalCallsign})
      LIMIT 1
    `;

    if (playerRows.length === 0) {
      const guestToken = crypto.randomUUID();
      playerRows = await sql`
        INSERT INTO players (guest_token, callsign)
        VALUES (${guestToken}, ${finalCallsign})
        RETURNING id, guest_token, callsign, equipped_skin, paperclips, unlocked_skins, sound_enabled
      `;
    }

    const player = playerRows[0];

    res.json({
      success: true,
      token: player.guest_token,
      player: {
        id: player.id,
        callsign: player.callsign,
        equippedSkin: player.equipped_skin,
        paperclips: player.paperclips,
        unlockedSkins: player.unlocked_skins,
        soundEnabled: player.sound_enabled,
      },
    });
  } catch (error) {
    console.error('Verify code error:', error);
    res.status(500).json({ error: 'Failed to verify code. Please try again.' });
  }
});

// DELETE /api/auth/account — Permanently delete pilot account & all Neon DB details
router.delete('/account', async (req: Request, res: Response) => {
  try {
    const { firebaseUid, callsign, token } = req.body || {};
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const activeToken = token || bearerToken;

    if (!firebaseUid && !callsign && !activeToken) {
      res.status(400).json({ error: 'Identification required to delete account' });
      return;
    }

    const deleted = await sql`
      DELETE FROM players
      WHERE (firebase_uid IS NOT NULL AND firebase_uid = ${firebaseUid || ''})
         OR (guest_token IS NOT NULL AND guest_token = ${activeToken || ''})
         OR (callsign IS NOT NULL AND callsign = ${callsign || ''})
      RETURNING id, callsign, firebase_uid, email
    `;

    // Also remove from google_accounts and verification_codes
    if (firebaseUid || callsign) {
      await sql`
        DELETE FROM google_accounts
        WHERE (firebase_uid IS NOT NULL AND firebase_uid = ${firebaseUid || ''})
           OR (callsign IS NOT NULL AND callsign = ${callsign || ''})
      `;
      await sql`
        DELETE FROM verification_codes
        WHERE (username IS NOT NULL AND username = ${callsign || ''})
      `;
    }

    res.json({
      success: true,
      deletedCount: deleted.length,
      message: 'Pilot account and all associated records permanently removed from Neon DB.',
    });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Failed to delete account from Neon DB' });
  }
});

export default router;
