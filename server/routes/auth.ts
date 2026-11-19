import { Router, Response } from 'express';
import crypto from 'crypto';
import { sql } from '../db.js';
import { sendVerificationEmail } from '../email.js';
import { verifyFirebaseIdToken } from '../firebaseAuth.js';
import { authMiddleware, optionalAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { refreshPlayerLeaderboard } from '../ranking.js';
import { callsignValue, HttpError, rateLimit } from '../http.js';

const router = Router();

const MAX_CODE_ATTEMPTS = 5;

const PLAYER_COLUMNS = `
  id, guest_token, callsign, equipped_skin, paperclips, unlocked_skins,
  sound_enabled, firebase_uid, email, auth_provider
`;

function playerPayload(player: any) {
  return {
    id: player.id,
    callsign: player.callsign,
    equippedSkin: player.equipped_skin,
    paperclips: player.paperclips,
    unlockedSkins: player.unlocked_skins,
    soundEnabled: player.sound_enabled,
    email: player.email ?? null,
    firebaseUid: player.firebase_uid ?? null,
    isGuest: !player.firebase_uid && !player.email,
  };
}

function errorResponse(res: Response, error: unknown, fallback: string) {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  console.error(fallback, error);
  res.status(500).json({ error: fallback });
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

// POST /api/auth/guest — Create a new guest player
router.post('/guest', rateLimit(30), async (req, res: Response) => {
  try {
    const { callsign } = req.body || {};
    const playerCallsign = callsign == null
      ? `Pilot${Math.floor(100 + Math.random() * 900)}`
      : callsignValue(callsign);
    const guestToken = crypto.randomUUID();

    const rows = await sql`
      INSERT INTO players (guest_token, callsign)
      VALUES (${guestToken}, ${playerCallsign})
      RETURNING ${sql.unsafe(PLAYER_COLUMNS)}
    `;

    res.status(201).json({
      token: guestToken,
      player: playerPayload(rows[0]),
    });
  } catch (error) {
    errorResponse(res, error, 'Failed to create guest account');
  }
});

// POST /api/auth/login — Log in with an existing guest token
router.post('/login', rateLimit(120), async (req, res: Response) => {
  try {
    const { token } = req.body || {};

    if (typeof token !== 'string' || token.length < 8) {
      res.status(400).json({ error: 'Token is required' });
      return;
    }

    const rows = await sql`
      SELECT ${sql.unsafe(PLAYER_COLUMNS)}
      FROM players
      WHERE guest_token = ${token}
    `;

    if (rows.length === 0) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    res.json({ player: playerPayload(rows[0]) });
  } catch (error) {
    errorResponse(res, error, 'Failed to log in');
  }
});

// POST /api/auth/sync-pilot — Link or get the Neon player for a verified pilot
router.post('/sync-pilot', rateLimit(60), optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { firebaseUid, callsign, email, authProvider, idToken } = req.body || {};
    const suppliedCallsign = callsign == null ? null : callsignValue(callsign);
    const suppliedEmail = normalizeEmail(email);

    let trustedUid: string | null = null;
    let trustedEmail: string | null = null;
    let provider = typeof authProvider === 'string' ? authProvider.slice(0, 32) : 'firebase';

    if (idToken) {
      // The UID is derived from a signed Firebase ID token, never from the body.
      const verified = await verifyFirebaseIdToken(idToken);
      if (firebaseUid && String(firebaseUid) !== verified.uid) {
        throw new HttpError(401, 'Firebase session does not match this pilot.');
      }
      trustedUid = verified.uid;
      // Only a verified email may be used to link an existing account. An
      // unverified Firebase email must never grant ownership of that address.
      trustedEmail = verified.emailVerified ? verified.email : null;
      provider = verified.provider === 'google' ? 'google' : 'firebase';
    } else {
      // Local/email-only pilots prove ownership with a recently verified OTP.
      // Use 403 (not 401) so the client does not discard a valid bearer token
      // merely because a fresh proof is required.
      if (!suppliedEmail || !suppliedCallsign) {
        throw new HttpError(403, 'Verify your email address again to link this pilot.');
      }
      const proof = await sql`
        SELECT id
        FROM verification_codes
        WHERE LOWER(email) = ${suppliedEmail}
          AND LOWER(username) = LOWER(${suppliedCallsign ?? ''})
          AND verified = true
          AND created_at > NOW() - INTERVAL '30 minutes'
        ORDER BY created_at DESC
        LIMIT 1
      `;
      if (proof.length === 0) {
        throw new HttpError(403, 'Verify your email address again to link this pilot.');
      }
      trustedEmail = suppliedEmail;
      provider = 'otp';
    }

    let player: any = null;

    if (trustedUid) {
      const rows = await sql`
        SELECT ${sql.unsafe(PLAYER_COLUMNS)}
        FROM players
        WHERE firebase_uid = ${trustedUid}
        LIMIT 1
      `;
      player = rows[0] || null;
    }

    if (!player && trustedEmail) {
      const rows = await sql`
        SELECT ${sql.unsafe(PLAYER_COLUMNS)}
        FROM players
        WHERE LOWER(email) = ${trustedEmail}
        LIMIT 1
      `;
      const emailPlayer = rows[0] || null;

      if (emailPlayer?.firebase_uid && trustedUid && emailPlayer.firebase_uid !== trustedUid) {
        throw new HttpError(409, 'This email is already linked to a different sign-in method.');
      }
      player = emailPlayer;
    }

    // A brand-new sign-in on a device that has been playing as a guest should
    // upgrade that same player row, not silently abandon its flights and clips.
    if (!player && req.player && !req.player.firebaseUid && !req.player.email) {
      const rows = await sql`
        SELECT ${sql.unsafe(PLAYER_COLUMNS)}
        FROM players
        WHERE id = ${req.player.id}
        LIMIT 1
      `;
      player = rows[0] || null;
    }

    if (player) {
      if (player.firebase_uid && trustedUid && player.firebase_uid !== trustedUid) {
        throw new HttpError(409, 'This account is already linked to a different sign-in method.');
      }
      if (player.email && trustedEmail && String(player.email).toLowerCase() !== trustedEmail) {
        throw new HttpError(409, 'This account is already linked to a different email address.');
      }

      // A boot-time sync must never overwrite the callsign a pilot chose on
      // another device. Only a guest upgrade adopts the signup callsign;
      // explicit renames go through PATCH /inventory/settings.
      const isGuestUpgrade = !player.firebase_uid && !player.email;
      const nextCallsign = isGuestUpgrade
        ? suppliedCallsign || player.callsign
        : player.callsign;

      const rows = await sql`
        UPDATE players
        SET firebase_uid = COALESCE(firebase_uid, ${trustedUid}),
            email = COALESCE(email, ${trustedEmail}),
            callsign = ${nextCallsign},
            auth_provider = CASE
              WHEN auth_provider IS NULL OR auth_provider = 'guest' THEN ${provider}
              ELSE auth_provider
            END,
            updated_at = NOW()
        WHERE id = ${player.id}
        RETURNING ${sql.unsafe(PLAYER_COLUMNS)}
      `;
      player = rows[0];
    } else {
      if (!suppliedCallsign) {
        throw new HttpError(400, 'A callsign is required to create a pilot account.');
      }
      const guestToken = crypto.randomUUID();
      const rows = await sql`
        INSERT INTO players (guest_token, firebase_uid, callsign, email, auth_provider)
        VALUES (${guestToken}, ${trustedUid}, ${suppliedCallsign}, ${trustedEmail}, ${provider})
        RETURNING ${sql.unsafe(PLAYER_COLUMNS)}
      `;
      player = rows[0];
    }

    if (provider === 'google' && trustedEmail && trustedUid) {
      await sql`
        INSERT INTO google_accounts (email, firebase_uid, callsign, updated_at)
        VALUES (${trustedEmail}, ${trustedUid}, ${player.callsign}, NOW())
        ON CONFLICT (email) DO UPDATE
        SET firebase_uid = EXCLUDED.firebase_uid,
            callsign = EXCLUDED.callsign,
            updated_at = NOW()
      `;
    }

    // Linking a guest makes its existing verified flights eligible. Populate
    // both boards immediately so the pilot is ranked on this very sign-in.
    await refreshPlayerLeaderboard(player.id).catch((error) => {
      console.error('Leaderboard refresh after pilot sync failed:', error);
    });

    res.json({ token: player.guest_token, player: playerPayload(player) });
  } catch (error: any) {
    if (error?.code === '23505') {
      res.status(409).json({ error: 'This email or sign-in method is already linked to another pilot.' });
      return;
    }
    errorResponse(res, error, 'Failed to sync pilot account');
  }
});

// GET /api/auth/check-google — Check if email or username is registered via Google
router.get('/check-google', rateLimit(120), async (req, res: Response) => {
  try {
    const email = (req.query.email as string)?.trim().toLowerCase();
    const identifier = (req.query.identifier as string)?.trim().toLowerCase();

    const queryVal = email || identifier;
    if (!queryVal) {
      res.json({ isGoogle: false });
      return;
    }

    const googleRows = queryVal.includes('@')
      ? await sql`SELECT email FROM google_accounts WHERE LOWER(email) = ${queryVal} LIMIT 1`
      : await sql`SELECT email FROM google_accounts WHERE LOWER(callsign) = ${queryVal} LIMIT 1`;

    if (googleRows.length > 0) {
      res.json({ isGoogle: true, message: 'This account is registered with Google. Try signing in with Google.' });
      return;
    }

    const playerRows = queryVal.includes('@')
      ? await sql`
          SELECT id FROM players
          WHERE LOWER(email) = ${queryVal} AND auth_provider = 'google'
          LIMIT 1
        `
      : await sql`
          SELECT id FROM players
          WHERE LOWER(callsign) = ${queryVal} AND auth_provider = 'google'
          LIMIT 1
        `;

    res.json(playerRows.length > 0
      ? { isGoogle: true, message: 'This account is registered with Google. Try signing in with Google.' }
      : { isGoogle: false });
  } catch (err) {
    console.error('Check google error:', err);
    res.json({ isGoogle: false });
  }
});

// POST /api/auth/send-verification-code — Validate details & send a 6-digit OTP
router.post('/send-verification-code', rateLimit(10), optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email, username, type = 'signup' } = req.body || {};

    const trimmedEmail = normalizeEmail(email);
    if (!trimmedEmail) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }

    const cleanUsername = typeof username === 'string' ? username.trim() : '';
    if (cleanUsername.length < 3 || cleanUsername.length > 20) {
      res.status(400).json({ error: 'Username must be between 3 and 20 characters long.' });
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(cleanUsername)) {
      res.status(400).json({ error: 'Username can only contain letters, numbers, underscores, and dashes.' });
      return;
    }

    const verificationType = type === 'login' ? 'login' : 'signup';

    const googleCheck = await sql`
      SELECT email FROM google_accounts
      WHERE LOWER(email) = ${trimmedEmail}
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
      WHERE (LOWER(email) = ${trimmedEmail} OR LOWER(callsign) = LOWER(${cleanUsername}))
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

    if (verificationType === 'signup') {
      const existing = await sql`
        SELECT id, email, firebase_uid
        FROM players
        WHERE LOWER(callsign) = LOWER(${cleanUsername})
           OR LOWER(email) = ${trimmedEmail}
        LIMIT 1
      `;
      // A guest may claim the callsign they are already using when they create
      // an account. That upgrade preserves their flights and paperclips.
      const isCurrentGuest = Boolean(
        existing[0] &&
        req.player &&
        existing[0].id === req.player.id &&
        !existing[0].email &&
        !existing[0].firebase_uid
      );
      if (existing.length > 0 && !isCurrentGuest) {
        res.status(400).json({ error: 'This username or email is already registered. Try logging in.' });
        return;
      }
    }

    // Do not allow a mailbox to be hammered with a new code every second.
    const recent = await sql`
      SELECT id
      FROM verification_codes
      WHERE LOWER(email) = ${trimmedEmail}
        AND verified = false
        AND created_at > NOW() - INTERVAL '60 seconds'
      LIMIT 1
    `;
    if (recent.length > 0) {
      res.status(429).json({ error: 'Please wait a minute before requesting another code.' });
      return;
    }

    const code = crypto.randomInt(100000, 1000000).toString();

    await sql`
      DELETE FROM verification_codes
      WHERE LOWER(email) = ${trimmedEmail} AND verified = false
    `;

    await sql`
      INSERT INTO verification_codes (email, username, code, type, expires_at)
      VALUES (${trimmedEmail}, ${cleanUsername}, ${code}, ${verificationType}, NOW() + INTERVAL '10 minutes')
    `;

    await sendVerificationEmail({
      email: trimmedEmail,
      username: cleanUsername,
      code,
      type: verificationType,
    });

    res.json({
      success: true,
      message: 'Verification code sent to your email address. Please check your inbox and Spam folder.',
      email: trimmedEmail,
      username: cleanUsername,
    });
  } catch (error) {
    errorResponse(res, error, 'Failed to send verification code. Please try again.');
  }
});

// POST /api/auth/verify-code — Validate OTP & activate a pilot session
router.post('/verify-code', rateLimit(20), optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email, code } = req.body || {};

    const trimmedEmail = normalizeEmail(email);
    const trimmedCode = typeof code === 'string' || typeof code === 'number'
      ? String(code).trim()
      : '';

    if (!trimmedEmail || !/^\d{6}$/.test(trimmedCode)) {
      res.status(400).json({ error: 'A valid email and 6-digit verification code are required.' });
      return;
    }

    // Always inspect the newest outstanding code for this email so wrong
    // guesses can be counted and locked out.
    const codeRows = await sql`
      SELECT id, email, username, code, type, attempts, expires_at
      FROM verification_codes
      WHERE LOWER(email) = ${trimmedEmail}
        AND verified = false
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const record = codeRows[0];
    if (!record || new Date(record.expires_at).getTime() <= Date.now()) {
      res.status(400).json({
        error: 'Invalid or expired verification code. Please check your Gmail (including Spam folder) and try again.',
      });
      return;
    }

    if (Number(record.attempts) >= MAX_CODE_ATTEMPTS) {
      res.status(429).json({ error: 'Too many incorrect attempts. Request a new verification code.' });
      return;
    }

    if (String(record.code) !== trimmedCode) {
      await sql`
        UPDATE verification_codes
        SET attempts = COALESCE(attempts, 0) + 1
        WHERE id = ${record.id}
      `;
      res.status(400).json({
        error: 'Invalid or expired verification code. Please check your Gmail (including Spam folder) and try again.',
      });
      return;
    }

    const verificationType = record.type || 'signup';
    // The callsign is the one that was validated and stored when the code was
    // sent. Ignoring a caller-supplied username prevents an OTP for one pilot
    // from being used to claim a different callsign.
    const finalCallsign = callsignValue(record.username);

    const marked = await sql`
      UPDATE verification_codes
      SET verified = true
      WHERE id = ${record.id}
        AND verified = false
        AND COALESCE(attempts, 0) < ${MAX_CODE_ATTEMPTS}
      RETURNING id
    `;
    if (marked.length === 0) {
      res.status(400).json({ error: 'This verification code has already been used.' });
      return;
    }

    let playerRows: any[] = await sql`
      SELECT ${sql.unsafe(PLAYER_COLUMNS)}
      FROM players
      WHERE LOWER(email) = ${trimmedEmail}
      LIMIT 1
    `;

    // New OTP accounts created while playing as a guest upgrade that guest row
    // instead of discarding its verified flights and paperclips.
    if (playerRows.length === 0 && verificationType === 'signup' &&
        req.player && !req.player.firebaseUid && !req.player.email) {
      const upgraded = await sql`
        UPDATE players
        SET email = ${trimmedEmail},
            callsign = ${finalCallsign},
            auth_provider = CASE
              WHEN auth_provider IS NULL OR auth_provider = 'guest' THEN 'otp'
              ELSE auth_provider
            END,
            updated_at = NOW()
        WHERE id = ${req.player.id}
          AND email IS NULL
          AND firebase_uid IS NULL
        RETURNING ${sql.unsafe(PLAYER_COLUMNS)}
      `;
      playerRows = upgraded;
    }

    if (playerRows.length === 0 && verificationType === 'login') {
      // Legacy email accounts did not persist their email on the player row.
      // Linking is only allowed for an unverified account whose callsign was
      // previously verified with the same email.
      const priorProof = await sql`
        SELECT id FROM verification_codes
        WHERE LOWER(username) = LOWER(${finalCallsign})
          AND LOWER(email) = ${trimmedEmail}
          AND verified = true
          AND id <> ${record.id}
        LIMIT 1
      `;

      if (priorProof.length > 0) {
        const candidates = await sql`
          SELECT ${sql.unsafe(PLAYER_COLUMNS)}
          FROM players
          WHERE LOWER(callsign) = LOWER(${finalCallsign})
            AND email IS NULL
            AND firebase_uid IS NULL
          ORDER BY created_at ASC
          LIMIT 1
        `;
        playerRows = candidates;
      }
    }

    let player: any;
    if (playerRows.length > 0) {
      player = playerRows[0];
      if (player.email && String(player.email).toLowerCase() !== trimmedEmail) {
        res.status(409).json({ error: 'This callsign is linked to a different email address.' });
        return;
      }
      const updated = await sql`
        UPDATE players
        SET email = COALESCE(email, ${trimmedEmail}),
            auth_provider = CASE
              WHEN auth_provider IS NULL OR auth_provider = 'guest' THEN 'otp'
              ELSE auth_provider
            END,
            updated_at = NOW()
        WHERE id = ${player.id}
        RETURNING ${sql.unsafe(PLAYER_COLUMNS)}
      `;
      player = updated[0];
    } else {
      if (verificationType === 'login') {
        res.status(404).json({ error: 'No pilot account is linked to this email address.' });
        return;
      }
      const guestToken = crypto.randomUUID();
      try {
        const inserted = await sql`
          INSERT INTO players (guest_token, callsign, email, auth_provider)
          VALUES (${guestToken}, ${finalCallsign}, ${trimmedEmail}, 'otp')
          RETURNING ${sql.unsafe(PLAYER_COLUMNS)}
        `;
        player = inserted[0];
      } catch (insertError: any) {
        if (insertError?.code !== '23505') throw insertError;
        const existing = await sql`
          SELECT ${sql.unsafe(PLAYER_COLUMNS)}
          FROM players
          WHERE LOWER(email) = ${trimmedEmail}
          LIMIT 1
        `;
        if (!existing[0]) throw insertError;
        player = existing[0];
      }
    }

    // A newly linked email makes all of this pilot's verified guest flights
    // eligible for the official boards.
    await refreshPlayerLeaderboard(player.id).catch((error) => {
      console.error('Leaderboard refresh after email verification failed:', error);
    });

    res.json({
      success: true,
      token: player.guest_token,
      player: playerPayload(player),
    });
  } catch (error: any) {
    if (error?.code === '23505') {
      res.status(409).json({ error: 'This username or email is already registered. Try logging in.' });
      return;
    }
    errorResponse(res, error, 'Failed to verify code. Please try again.');
  }
});

// DELETE /api/auth/account — Permanently delete the authenticated pilot
router.delete('/account', rateLimit(10), authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const playerId = req.player!.id;

    const deleted = await sql`
      DELETE FROM players
      WHERE id = ${playerId}
      RETURNING id, callsign, firebase_uid, email
    `;

    if (deleted.length === 0) {
      res.status(404).json({ error: 'Pilot account not found.' });
      return;
    }

    const account = deleted[0];
    if (account.firebase_uid) {
      await sql`DELETE FROM google_accounts WHERE firebase_uid = ${account.firebase_uid}`;
    }
    if (account.email) {
      await sql`DELETE FROM google_accounts WHERE LOWER(email) = LOWER(${account.email})`;
      await sql`DELETE FROM verification_codes WHERE LOWER(email) = LOWER(${account.email})`;
    }

    res.json({
      success: true,
      deletedCount: 1,
      message: 'Pilot account and all associated records permanently removed from Neon DB.',
    });
  } catch (error) {
    errorResponse(res, error, 'Failed to delete account from Neon DB');
  }
});

export default router;
