/**
 * firebase.ts — Firebase Authentication & User Registry Service
 *
 * Provides:
 * - Username & Password registration with uniqueness validation
 * - Case-insensitive username reservation
 * - Username & Password login
 * - Google Sign-In with popup
 * - Forgot username and forgot password recovery
 * - Cloud pilot profile synchronization (highScore, paperclips, skins)
 * - Seamless offline/local fallback when Firebase environment keys are not yet configured
 */

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as fbSignOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  deleteUser,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import type { PilotUser, UserStats } from '../game/types';

// Safely read Vite or Node environment variables
const env: Record<string, string | undefined> =
  typeof import.meta !== 'undefined' && import.meta.env
    ? (import.meta.env as unknown as Record<string, string | undefined>)
    : typeof process !== 'undefined'
    ? process.env
    : {};

function cleanEnvVal(val?: string): string | undefined {
  if (!val) return undefined;
  return val.trim().replace(/^["']+|["']+$/g, '');
}

const rawApiKey = cleanEnvVal(env.VITE_FIREBASE_API_KEY);
const rawProjectId = cleanEnvVal(env.VITE_FIREBASE_PROJECT_ID);
let rawAuthDomain = cleanEnvVal(env.VITE_FIREBASE_AUTH_DOMAIN);

// Auto-align authDomain to match the active projectId
if (rawProjectId && (!rawAuthDomain || !rawAuthDomain.includes(rawProjectId))) {
  rawAuthDomain = `${rawProjectId}.firebaseapp.com`;
}

const firebaseConfig = {
  apiKey: rawApiKey,
  authDomain: rawAuthDomain,
  projectId: rawProjectId,
  storageBucket:
    cleanEnvVal(env.VITE_FIREBASE_STORAGE_BUCKET) ||
    (rawProjectId ? `${rawProjectId}.firebasestorage.app` : undefined),
  messagingSenderId: cleanEnvVal(env.VITE_FIREBASE_MESSAGING_SENDER_ID),
  appId: cleanEnvVal(env.VITE_FIREBASE_APP_ID),
};

// Check if valid Firebase configuration is present
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  !firebaseConfig.apiKey.includes('YOUR_') &&
  firebaseConfig.apiKey !== ''
);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

if (isFirebaseConfigured) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (err) {
    console.warn('Firebase initialization failed, falling back to local registry:', err);
  }
}

/**
 * Executes an async task with a strict timeout safeguard.
 * If Firestore hangs due to unprovisioned database or locked rules,
 * it resolves with fallbackVal instead of freezing the user experience.
 */
export async function runWithTimeout<T>(
  task: () => Promise<T>,
  ms = 2200,
  fallbackVal: T
): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        console.warn(`[Firebase] Operation timed out after ${ms}ms. Proceeding safely.`);
        resolve(fallbackVal);
      }
    }, ms);

    try {
      task()
        .then((res) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(res);
          }
        })
        .catch((err) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            console.warn('[Firebase] Operation failed, falling back:', err);
            resolve(fallbackVal);
          }
        });
    } catch (syncErr) {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        console.warn('[Firebase] Synchronous execution error:', syncErr);
        resolve(fallbackVal);
      }
    }
  });
}

// ─── Local Registry Fallback (Runs when Firebase keys are pending in .env) ───

const LOCAL_USERS_KEY = 'paper_glider_registered_users';
const LOCAL_CURRENT_USER_KEY = 'paper_glider_current_user';

// In-memory cache for SSR/test environments where localStorage might be absent
const memStorage: Record<string, string> = {};

function safeGetItem(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch {}
  return memStorage[key] ?? null;
}

function safeSetItem(key: string, val: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, val);
      return;
    }
  } catch {}
  memStorage[key] = val;
}

function safeRemoveItem(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
      return;
    }
  } catch {}
  delete memStorage[key];
}

interface LocalUserRecord {
  uid: string;
  username: string;
  email: string;
  passwordHash: string;
  paperclips: number;
  highScore: number;
  equippedSkin: string;
  unlockedSkins: string[];
  createdAt: string;
}

function getLocalUsers(): Record<string, LocalUserRecord> {
  try {
    const raw = safeGetItem(LOCAL_USERS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocalUsers(users: Record<string, LocalUserRecord>) {
  try {
    safeSetItem(LOCAL_USERS_KEY, JSON.stringify(users));
  } catch {}
}

// ─── Username Utilities ──────────────────────────────────────────────────────

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

/** Converts a raw username into an internal email if no recovery email was provided */
function makeInternalEmail(username: string): string {
  const safe = normalizeUsername(username).replace(/[^a-z0-9]/g, '');
  return `${safe || 'pilot'}@paperglider.app`;
}

// ─── Core Authentication API ────────────────────────────────────────────────

export interface AuthResult {
  success: boolean;
  user?: PilotUser;
  error?: string;
  needsUsername?: boolean;
}

/**
 * Check if a username is already taken.
 * Protected with a strict timeout so Firestore issues never freeze the UI.
 * Pass allowedUid when an existing logged-in user is confirming/retaining their own callsign.
 */
export async function checkUsernameAvailable(
  username: string,
  allowedUid?: string
): Promise<boolean> {
  const norm = normalizeUsername(username);
  if (!norm || norm.length < 2) return false;

  // 1. Check local registry first
  const localUsers = getLocalUsers();
  if (localUsers[norm]) {
    if (!allowedUid || localUsers[norm].uid !== allowedUid) {
      return false;
    }
  }

  // 2. Check Firestore with 2000ms timeout safeguard
  if (db) {
    return await runWithTimeout<boolean>(
      async () => {
        const docRef = doc(db, 'usernames', norm);
        const snap = await getDoc(docRef);
        if (!snap.exists()) return true;
        const data = snap.data();
        if (allowedUid && data?.uid === allowedUid) return true;
        return false;
      },
      2000,
      true // fallback: never block the player if Firestore is slow or unprovisioned
    );
  }

  return true;
}

/**
 * Register a new user with Username, Password, and optional Recovery Email.
 */
export async function registerWithUsername(
  username: string,
  password: string,
  recoveryEmail?: string
): Promise<AuthResult> {
  const trimmedUser = username.trim();
  const norm = normalizeUsername(trimmedUser);

  if (!norm || norm.length < 3) {
    return { success: false, error: 'Username must be at least 3 characters long.' };
  }
  if (!password || password.length < 6) {
    return { success: false, error: 'Password must be at least 6 characters long.' };
  }

  // 1. Verify username uniqueness
  const available = await checkUsernameAvailable(norm);
  if (!available) {
    return { success: false, error: 'This username is taken, try different' };
  }

  const effectiveEmail = recoveryEmail?.trim() || makeInternalEmail(trimmedUser);

  // 2. Real Firebase Auth flow
  if (auth && isFirebaseConfigured) {
    try {
      const cred = await createUserWithEmailAndPassword(auth, effectiveEmail, password);
      const user = cred.user;

      try {
        await updateProfile(user, { displayName: trimmedUser });
      } catch {}

      // Reserve username and initialize user doc with timeout guard
      if (db) {
        await runWithTimeout(
          async () => {
            await setDoc(doc(db, 'usernames', norm), {
              username: trimmedUser,
              uid: user.uid,
              email: effectiveEmail,
              hasRealEmail: Boolean(recoveryEmail?.trim()),
              createdAt: serverTimestamp(),
            });

            await setDoc(doc(db, 'users', user.uid), {
              uid: user.uid,
              username: trimmedUser,
              email: effectiveEmail,
              paperclips: 0,
              highScore: 0,
              equippedSkin: 'classic',
              unlockedSkins: ['classic'],
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          },
          2500,
          null
        );
      }

      const pilotUser: PilotUser = {
        uid: user.uid,
        username: trimmedUser,
        email: recoveryEmail?.trim() || undefined,
      };

      // Always mirror locally
      const localUsers = getLocalUsers();
      localUsers[norm] = {
        uid: user.uid,
        username: trimmedUser,
        email: effectiveEmail,
        passwordHash: btoa(password),
        paperclips: 0,
        highScore: 0,
        equippedSkin: 'classic',
        unlockedSkins: ['classic'],
        createdAt: new Date().toISOString(),
      };
      saveLocalUsers(localUsers);

      saveCurrentSession(pilotUser);
      return { success: true, user: pilotUser };
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        return { success: false, error: 'This email is already associated with an account.' };
      }
      return { success: false, error: err.message || 'Registration failed.' };
    }
  }

  // 3. Local Registry Fallback
  const localUsers = getLocalUsers();
  const uid = 'local-' + crypto.randomUUID();
  localUsers[norm] = {
    uid,
    username: trimmedUser,
    email: effectiveEmail,
    passwordHash: btoa(password),
    paperclips: 0,
    highScore: 0,
    equippedSkin: 'classic',
    unlockedSkins: ['classic'],
    createdAt: new Date().toISOString(),
  };
  saveLocalUsers(localUsers);

  const pilotUser: PilotUser = {
    uid,
    username: trimmedUser,
    email: recoveryEmail?.trim() || undefined,
  };
  saveCurrentSession(pilotUser);
  return { success: true, user: pilotUser };
}

/**
 * Log in with Username or Email and Password.
 */
export async function loginWithUsername(
  identifier: string,
  password: string
): Promise<AuthResult> {
  const trimmed = identifier.trim();

  if (!trimmed) {
    return { success: false, error: 'Please enter your username or email.' };
  }
  if (!password) {
    return { success: false, error: 'Please enter your password.' };
  }

  // 1. Real Firebase Auth flow
  if (auth && isFirebaseConfigured) {
    try {
      let targetEmail = trimmed;
      let actualUsername = trimmed;

      if (trimmed.includes('@')) {
        targetEmail = trimmed.toLowerCase();
        const cred = await signInWithEmailAndPassword(auth, targetEmail, password);
        const user = cred.user;

        if (db) {
          const userDoc = await runWithTimeout(
            () => getDoc(doc(db, 'users', user.uid)),
            2000,
            null
          );
          if (userDoc?.exists()) {
            actualUsername = userDoc.data()?.username || user.displayName || trimmed.split('@')[0];
          } else {
            actualUsername = user.displayName || trimmed.split('@')[0];
          }
        } else {
          actualUsername = user.displayName || trimmed.split('@')[0];
        }

        const pilotUser: PilotUser = {
          uid: user.uid,
          username: actualUsername,
          email: user.email || targetEmail,
        };
        saveCurrentSession(pilotUser);
        return { success: true, user: pilotUser };
      } else {
        const norm = normalizeUsername(trimmed);
        let foundEmail: string | null = null;

        if (db) {
          const usernameDoc = await runWithTimeout(
            () => getDoc(doc(db, 'usernames', norm)),
            2000,
            null
          );
          if (usernameDoc?.exists()) {
            const data = usernameDoc.data() as { email: string; username: string };
            foundEmail = data.email;
            actualUsername = data.username || trimmed;
          }
        }

        // Check local registry fallback
        if (!foundEmail) {
          const localUsers = getLocalUsers();
          if (localUsers[norm]) {
            foundEmail = localUsers[norm].email;
            actualUsername = localUsers[norm].username;
          }
        }

        if (!foundEmail) {
          foundEmail = makeInternalEmail(trimmed);
        }

        targetEmail = foundEmail;

        const cred = await signInWithEmailAndPassword(auth, targetEmail, password);
        const user = cred.user;

        const pilotUser: PilotUser = {
          uid: user.uid,
          username: actualUsername || user.displayName || trimmed,
          email: user.email || undefined,
        };
        saveCurrentSession(pilotUser);
        return { success: true, user: pilotUser };
      }
    } catch (err: any) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        return { success: false, error: 'Incorrect password. Please try again.' };
      }
      if (err.code === 'auth/user-not-found') {
        return { success: false, error: 'No account found with that email. Please create an account.' };
      }
      return { success: false, error: err.message || 'Login failed.' };
    }
  }

  // 2. Local Registry Fallback
  const localUsers = getLocalUsers();
  let record: LocalUserRecord | undefined;

  if (trimmed.includes('@')) {
    record = Object.values(localUsers).find(
      (u) => u.email.toLowerCase() === trimmed.toLowerCase()
    );
  } else {
    record = localUsers[normalizeUsername(trimmed)];
  }

  if (!record) {
    return { success: false, error: 'Username or email not found. Please register an account.' };
  }

  if (record.passwordHash !== btoa(password)) {
    return { success: false, error: 'Incorrect password. Please try again.' };
  }

  const pilotUser: PilotUser = {
    uid: record.uid,
    username: record.username,
    email: record.email,
  };
  saveCurrentSession(pilotUser);
  return { success: true, user: pilotUser };
}

/**
 * Log in with Google popup.
 * Resolves with needsUsername: true so the user is always presented
 * with the option to enter or customize their pilot callsign.
 */
export async function loginWithGoogle(): Promise<AuthResult> {
  if (auth && isFirebaseConfigured) {
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const user = cred.user;

      // Extract best suggested username
      let suggestedUsername = user.displayName?.trim() || '';
      if (!suggestedUsername && user.email) {
        suggestedUsername = user.email.split('@')[0];
      }
      if (!suggestedUsername) {
        suggestedUsername = 'Pilot_' + user.uid.substring(0, 5);
      }

      // Check if user already had a saved profile in Firestore (with timeout guard)
      if (db) {
        const userDoc = await runWithTimeout(
          () => getDoc(doc(db, 'users', user.uid)),
          1500,
          null
        );
        if (userDoc?.exists() && userDoc.data()?.username) {
          suggestedUsername = userDoc.data().username;
        }
      }

      // Check local storage for previous session username
      const localUsers = getLocalUsers();
      for (const norm in localUsers) {
        if (localUsers[norm].uid === user.uid && localUsers[norm].username) {
          suggestedUsername = localUsers[norm].username;
          break;
        }
      }

      // Always give the user the option to enter or customize their callsign!
      return {
        success: true,
        needsUsername: true,
        user: {
          uid: user.uid,
          username: suggestedUsername,
          email: user.email || undefined,
          photoURL: user.photoURL || undefined,
        },
      };
    } catch (err: any) {
      if (err.code === 'auth/configuration-not-found') {
        return {
          success: false,
          error:
            'Google Sign-In is not enabled yet in your Firebase console. Go to Firebase Console -> Authentication -> Sign-in method -> Google -> Enable and Save. You can also sign in or register with Username & Password above!',
        };
      }
      if (err.code === 'auth/popup-closed-by-user') {
        return { success: false, error: 'Google sign-in popup was closed.' };
      }
      if (err.code === 'auth/unauthorized-domain') {
        return {
          success: false,
          error:
            'This domain is not authorized in Firebase. Add localhost to Firebase Console -> Authentication -> Settings -> Authorized Domains.',
        };
      }
      return { success: false, error: err.message || 'Google sign-in was cancelled or failed.' };
    }
  }

  // Local fallback: simulate Google login
  const mockUid = 'google-mock-' + Date.now();
  return {
    success: true,
    needsUsername: true,
    user: {
      uid: mockUid,
      username: 'GooglePilot',
      email: 'pilot@gmail.com',
    },
  };
}

/**
 * Complete Google Registration by selecting a unique Pilot Username.
 * Protected with timeout guards so Firestore unprovisioned states never hang.
 */
export async function completeGoogleRegistration(
  uid: string,
  username: string,
  email?: string
): Promise<AuthResult> {
  const trimmed = username.trim();
  const norm = normalizeUsername(trimmed);

  if (!norm || norm.length < 3) {
    return { success: false, error: 'Username must be at least 3 characters long.' };
  }

  const available = await checkUsernameAvailable(norm, uid);
  if (!available) {
    return { success: false, error: 'This username is taken, try different' };
  }

  const effectiveEmail = email || auth?.currentUser?.email || makeInternalEmail(trimmed);

  // Update Firebase Auth profile
  if (auth?.currentUser) {
    try {
      await updateProfile(auth.currentUser, { displayName: trimmed });
    } catch (e) {
      console.warn('Could not update Firebase displayName:', e);
    }
  }

  // Save to Firestore with timeout guard so it NEVER freezes
  if (db) {
    await runWithTimeout(
      async () => {
        await setDoc(doc(db, 'usernames', norm), {
          username: trimmed,
          uid,
          email: effectiveEmail,
          hasRealEmail: Boolean(effectiveEmail && !effectiveEmail.endsWith('@paperglider.app')),
          createdAt: serverTimestamp(),
        });

        await setDoc(
          doc(db, 'users', uid),
          {
            uid,
            username: trimmed,
            email: effectiveEmail,
            paperclips: 0,
            highScore: 0,
            equippedSkin: 'classic',
            unlockedSkins: ['classic'],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      },
      2500,
      null
    );
  }

  // Always save to local user registry
  const localUsers = getLocalUsers();
  localUsers[norm] = {
    uid,
    username: trimmed,
    email: effectiveEmail,
    passwordHash: '',
    paperclips: localUsers[norm]?.paperclips ?? 0,
    highScore: localUsers[norm]?.highScore ?? 0,
    equippedSkin: localUsers[norm]?.equippedSkin ?? 'classic',
    unlockedSkins: localUsers[norm]?.unlockedSkins ?? ['classic'],
    createdAt: localUsers[norm]?.createdAt ?? new Date().toISOString(),
  };
  saveLocalUsers(localUsers);

  const pilotUser: PilotUser = {
    uid,
    username: trimmed,
    email: effectiveEmail,
    photoURL: auth?.currentUser?.photoURL || undefined,
  };
  saveCurrentSession(pilotUser);
  return { success: true, user: pilotUser };
}

// ─── Passwordless Sign-In (Email Link) ──────────────────────────────────────

/**
 * Send a magic login link to the user's email for passwordless sign-in.
 */
export async function sendPasswordlessLoginLink(email: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  const normEmail = email.trim().toLowerCase();
  if (!normEmail || !normEmail.includes('@')) {
    return { success: false, error: 'Please enter a valid email address.' };
  }

  if (auth) {
    try {
      const actionCodeSettings = {
        url:
          typeof window !== 'undefined'
            ? window.location.href.split('?')[0]
            : 'http://localhost:3000',
        handleCodeInApp: true,
      };

      await sendSignInLinkToEmail(auth, normEmail, actionCodeSettings);
      safeSetItem('emailForSignIn', normEmail);

      return {
        success: true,
        message: `Magic sign-in link sent to ${normEmail}! Open your email and click the link to fly in without a password.`,
      };
    } catch (err: any) {
      if (err.code === 'auth/configuration-not-found') {
        return {
          success: false,
          error:
            'Passwordless sign-in is not enabled yet in your Firebase console. Go to Firebase Console -> Authentication -> Sign-in method -> Email/Password -> Toggle "Email link (passwordless sign-in)". You can also log in with Password or Google!',
        };
      }
      return { success: false, error: err.message || 'Failed to send magic login link.' };
    }
  }

  // Local fallback simulation
  safeSetItem('emailForSignIn', normEmail);
  return {
    success: true,
    message: `Magic link simulated for ${normEmail}. In full Firebase mode, an instant sign-in email is dispatched!`,
  };
}

/**
 * Inspects URL to see if user opened a Firebase passwordless email link,
 * and completes sign-in automatically.
 */
export async function checkAndCompleteEmailLinkSignIn(
  currentUrl?: string,
  confirmedEmail?: string
): Promise<{
  isEmailLink: boolean;
  needsEmailPrompt?: boolean;
  result?: AuthResult;
}> {
  const url = currentUrl || (typeof window !== 'undefined' ? window.location.href : '');
  if (!url || !auth) {
    return { isEmailLink: false };
  }

  try {
    if (!isSignInWithEmailLink(auth, url)) {
      return { isEmailLink: false };
    }
  } catch {
    return { isEmailLink: false };
  }

  const email = confirmedEmail?.trim().toLowerCase() || safeGetItem('emailForSignIn');

  if (!email) {
    // Opened link on a different browser/device, needs user to confirm their email address
    return { isEmailLink: true, needsEmailPrompt: true };
  }

  try {
    const cred = await signInWithEmailLink(auth, email, url);
    const user = cred.user;

    safeRemoveItem('emailForSignIn');

    // Clean query params from browser address bar
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    if (db) {
      const userDoc = await runWithTimeout(
        () => getDoc(doc(db, 'users', user.uid)),
        2000,
        null
      );
      if (userDoc?.exists()) {
        const data = userDoc.data();
        const pilotUser: PilotUser = {
          uid: user.uid,
          username: data.username || user.displayName || 'Pilot',
          email: user.email || email,
        };
        saveCurrentSession(pilotUser);
        return { isEmailLink: true, result: { success: true, user: pilotUser } };
      }
    }

    // First time passwordless user: needs to choose a unique callsign
    return {
      isEmailLink: true,
      result: {
        success: true,
        needsUsername: true,
        user: {
          uid: user.uid,
          username: 'Pilot',
          email: user.email || email,
        },
      },
    };
  } catch (err: any) {
    return {
      isEmailLink: true,
      result: {
        success: false,
        error: err.message || 'Failed to complete passwordless sign-in.',
      },
    };
  }
}

/**
 * Forgot Password recovery:
 * Accepts a username or recovery email.
 * Sends a password reset email if Firebase is configured, or provides recovery info.
 */
export async function requestPasswordReset(usernameOrEmail: string): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> {
  const input = usernameOrEmail.trim();
  if (!input) return { success: false, message: '', error: 'Please enter your username or email.' };

  if (auth && isFirebaseConfigured) {
    try {
      let targetEmail = input;

      // If user provided a username instead of an email, look it up in Firestore
      if (!input.includes('@')) {
        const norm = normalizeUsername(input);
        let foundEmail: string | null = null;

        if (db) {
          const userDoc = await runWithTimeout(
            () => getDoc(doc(db, 'usernames', norm)),
            2000,
            null
          );
          if (userDoc?.exists()) {
            const data = userDoc.data();
            if (data?.hasRealEmail) {
              foundEmail = data.email;
            }
          }
        }

        if (!foundEmail) {
          const localUsers = getLocalUsers();
          if (localUsers[norm] && localUsers[norm].email && !localUsers[norm].email.endsWith('@paperglider.app')) {
            foundEmail = localUsers[norm].email;
          }
        }

        if (!foundEmail) {
          return {
            success: false,
            message: '',
            error:
              'No recovery email was set for this username. Please contact support or register a new pilot callsign.',
          };
        }
        targetEmail = foundEmail;
      }

      await sendPasswordResetEmail(auth, targetEmail);
      return {
        success: true,
        message: `Password reset link sent to ${targetEmail}. Check your inbox!`,
      };
    } catch (err: any) {
      return { success: false, message: '', error: err.message || 'Password reset failed.' };
    }
  }

  // Local fallback
  return {
    success: true,
    message: `Reset instructions simulated for ${input}. In local mode, you can log in or register a new callsign.`,
  };
}

/**
 * Forgot Username recovery:
 * Accepts recovery email and looks up registered username.
 */
export async function recoverUsernameByEmail(email: string): Promise<{
  success: boolean;
  username?: string;
  error?: string;
}> {
  const normEmail = email.trim().toLowerCase();
  if (!normEmail || !normEmail.includes('@')) {
    return { success: false, error: 'Please enter a valid email address.' };
  }

  if (db) {
    const names = await runWithTimeout(
      async () => {
        const q = query(collection(db, 'usernames'), where('email', '==', normEmail));
        const snaps = await getDocs(q);
        if (snaps.empty) return null;
        return snaps.docs.map((d) => d.data().username);
      },
      2200,
      null
    );

    if (names && names.length > 0) {
      return { success: true, username: names.join(', ') };
    }
  }

  // Local fallback
  const localUsers = getLocalUsers();
  const matched = Object.values(localUsers).filter(
    (u) => u.email.toLowerCase() === normEmail
  );
  if (matched.length === 0) {
    return { success: false, error: 'No pilot account found registered with that email.' };
  }
  return { success: true, username: matched.map((m) => m.username).join(', ') };
}

/**
 * Log Out
 */
export async function logoutUser(): Promise<void> {
  if (auth) {
    try {
      await fbSignOut(auth);
    } catch {}
  }
  clearCurrentSession();
}

/**
 * Permanently delete pilot account from Firebase Auth, Firestore, and Local Registry.
 */
export async function deletePilotAccount(user: PilotUser): Promise<{ success: boolean; error?: string }> {
  let errorMsg: string | undefined;

  // 1. Delete from Firebase Authentication if authenticated
  if (auth && auth.currentUser) {
    try {
      await deleteUser(auth.currentUser);
    } catch (err: any) {
      console.warn('Firebase Auth user deletion warning:', err);
      if (err?.code === 'auth/requires-recent-login') {
        errorMsg = 'Please log out and log in again before deleting your account for security verification.';
      }
    }
  }

  // 2. Delete from Firestore (users & usernames)
  if (db && user.uid && !user.uid.startsWith('local-')) {
    try {
      await runWithTimeout(
        async () => {
          const userRef = doc(db!, 'users', user.uid);
          const usernameRef = doc(db!, 'usernames', user.username.trim().toLowerCase());
          await Promise.allSettled([
            deleteDoc(userRef),
            deleteDoc(usernameRef),
          ]);
        },
        5000,
        null
      );
    } catch (err) {
      console.warn('Firestore document deletion warning:', err);
    }
  }

  // 3. Delete from local registry fallback
  try {
    const localUsers = getLocalUsers();
    const norm = normalizeUsername(user.username);
    if (localUsers[norm]) {
      delete localUsers[norm];
    }
    for (const key of Object.keys(localUsers)) {
      if (localUsers[key].uid === user.uid) {
        delete localUsers[key];
      }
    }
    saveLocalUsers(localUsers);
    safeRemoveItem(`paper_glider_cloud_stats_${user.uid}`);
  } catch {}

  // 4. Clear current session
  clearCurrentSession();

  return { success: !errorMsg, error: errorMsg };
}

/**
 * Sync player stats to Firebase cloud profile
 */
export async function syncCloudStats(uid: string, stats: Partial<UserStats>): Promise<void> {
  if (db && uid && !uid.startsWith('local-')) {
    await runWithTimeout(
      async () => {
        const userRef = doc(db, 'users', uid);
        await updateDoc(userRef, {
          highScore: stats.highScore,
          paperclips: stats.paperclips,
          equippedSkin: stats.selectedSkin,
          unlockedSkins: stats.unlockedSkins,
          updatedAt: serverTimestamp(),
        });
      },
      2000,
      null
    );
  }

  // Also update local record
  const localUsers = getLocalUsers();
  for (const norm in localUsers) {
    if (localUsers[norm].uid === uid) {
      if (stats.highScore != null) localUsers[norm].highScore = Math.max(localUsers[norm].highScore, stats.highScore);
      if (stats.paperclips != null) localUsers[norm].paperclips = stats.paperclips;
      if (stats.selectedSkin != null) localUsers[norm].equippedSkin = stats.selectedSkin;
      if (stats.unlockedSkins != null) localUsers[norm].unlockedSkins = stats.unlockedSkins;
      saveLocalUsers(localUsers);
      break;
    }
  }
}

/**
 * Load cloud stats for a user
 */
export async function loadCloudStats(uid: string): Promise<Partial<UserStats> | null> {
  if (db && uid && !uid.startsWith('local-')) {
    const cloudStats = await runWithTimeout(
      async () => {
        const snap = await getDoc(doc(db, 'users', uid));
        if (snap.exists()) {
          const d = snap.data();
          return {
            highScore: d.highScore ?? 0,
            paperclips: d.paperclips ?? 0,
            selectedSkin: d.equippedSkin ?? 'classic',
            unlockedSkins: d.unlockedSkins ?? ['classic'],
          };
        }
        return null;
      },
      2000,
      null
    );
    if (cloudStats) return cloudStats;
  }

  // Local fallback
  const localUsers = getLocalUsers();
  for (const norm in localUsers) {
    if (localUsers[norm].uid === uid) {
      return {
        highScore: localUsers[norm].highScore,
        paperclips: localUsers[norm].paperclips,
        selectedSkin: localUsers[norm].equippedSkin,
        unlockedSkins: localUsers[norm].unlockedSkins,
      };
    }
  }

  return null;
}

// ─── Session Helpers ────────────────────────────────────────────────────────

function saveCurrentSession(user: PilotUser) {
  try {
    safeSetItem(LOCAL_CURRENT_USER_KEY, JSON.stringify(user));
  } catch {}
}

export function getCurrentSession(): PilotUser | null {
  try {
    const raw = safeGetItem(LOCAL_CURRENT_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearCurrentSession() {
  try {
    safeRemoveItem(LOCAL_CURRENT_USER_KEY);
  } catch {}
}
