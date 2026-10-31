import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeUsername,
  checkUsernameAvailable,
  registerWithUsername,
  loginWithUsername,
  loginWithGoogle,
  completeGoogleRegistration,
  requestPasswordReset,
  recoverUsernameByEmail,
  sendPasswordlessLoginLink,
  runWithTimeout,
} from './firebase';

test('auth: username normalization lowercases and trims', () => {
  assert.equal(normalizeUsername('  SkyPilot99  '), 'skypilot99');
  assert.equal(normalizeUsername('Ace_Flyer'), 'ace_flyer');
});

test('auth: prevents short usernames below 3 chars', async () => {
  const res = await registerWithUsername('ab', 'password123');
  assert.equal(res.success, false);
  assert.ok(res.error?.includes('at least 3 characters'));
});

test('auth: registers new username and prevents duplicate registration', async () => {
  const uniqueName = 'Pilot_' + Math.random().toString(36).substring(2, 8);
  const pass = 'topSecret123';

  // 1. First registration should succeed
  const res1 = await registerWithUsername(uniqueName, pass, `${uniqueName.toLowerCase()}@test.com`);
  assert.equal(res1.success, true);
  assert.ok(res1.user);
  assert.equal(res1.user?.username, uniqueName);

  // 2. Second registration with the same username (even different case) must be rejected
  const res2 = await registerWithUsername(uniqueName.toUpperCase(), 'differentPass');
  assert.equal(res2.success, false);
  assert.equal(res2.error, 'This username is taken, try different');
});

test('auth: logs in with valid username and password', async () => {
  const uniqueName = 'Aviator_' + Math.random().toString(36).substring(2, 8);
  const pass = 'gliderPass456';

  await registerWithUsername(uniqueName, pass);

  // Wrong password
  const fail = await loginWithUsername(uniqueName, 'wrongPass');
  assert.equal(fail.success, false);
  assert.ok(fail.error?.includes('Incorrect password'));

  // Correct password
  const success = await loginWithUsername(uniqueName, pass);
  assert.equal(success.success, true);
  assert.equal(success.user?.username, uniqueName);
});

test('auth: recovers username by registered recovery email', async () => {
  const uniqueName = 'Falcon_' + Math.random().toString(36).substring(2, 8);
  const email = `${uniqueName.toLowerCase()}@recovery.org`;

  await registerWithUsername(uniqueName, 'securePassword1', email);

  const found = await recoverUsernameByEmail(email);
  assert.equal(found.success, true);
  assert.ok(found.username?.includes(uniqueName));
});

test('auth: logs in with email and password directly', async () => {
  const uniqueName = 'Jet_' + Math.random().toString(36).substring(2, 8);
  const email = `${uniqueName.toLowerCase()}@flight.org`;
  const pass = 'gliderJet789';

  await registerWithUsername(uniqueName, pass, email);

  const res = await loginWithUsername(email, pass);
  assert.equal(res.success, true);
  assert.equal(res.user?.username, uniqueName);
});

test('auth: sends passwordless magic login link to email', async () => {
  const email = 'pilot_magic@test.com';
  const res = await sendPasswordlessLoginLink(email);
  assert.equal(res.success, true);
  assert.ok(res.message?.includes(email));
});

test('auth: Google login prompts user to choose custom callsign', async () => {
  const googleRes = await loginWithGoogle();
  assert.equal(googleRes.success, true);
  assert.equal(googleRes.needsUsername, true);
  assert.ok(googleRes.user?.uid);
  assert.ok(googleRes.user?.username);

  // User enters custom username
  const customCallsign = 'SkyAce_' + Math.random().toString(36).substring(2, 7);
  const completeRes = await completeGoogleRegistration(
    googleRes.user!.uid,
    customCallsign,
    googleRes.user?.email
  );
  assert.equal(completeRes.success, true);
  assert.equal(completeRes.user?.username, customCallsign);

  // Another registration cannot steal this chosen username
  const dup = await registerWithUsername(customCallsign, 'somePassword123');
  assert.equal(dup.success, false);
  assert.equal(dup.error, 'This username is taken, try different');
});

test('auth: runWithTimeout safeguard prevents infinite freezing', async () => {
  const start = Date.now();
  // Simulate a hanging network/Firestore operation
  const hangingTask = () => new Promise<string>(() => {});
  const fallback = 'SAFE_FALLBACK';

  const result = await runWithTimeout(hangingTask, 150, fallback);
  const elapsed = Date.now() - start;

  assert.equal(result, fallback);
  assert.ok(elapsed >= 140 && elapsed < 500, `Expected ~150ms timeout, took ${elapsed}ms`);
});
