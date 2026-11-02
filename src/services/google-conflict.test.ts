import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recordGoogleEmail,
  isGoogleRegisteredEmail,
  loginWithUsername,
  registerWithUsername,
  completeVerifiedEmailAuth,
} from './firebase.ts';

test('google conflict: recordGoogleEmail tracks google email and isGoogleRegisteredEmail identifies it', async () => {
  const email = 'test_google_pilot_99@gmail.com';
  recordGoogleEmail(email);
  const isGoogle = await isGoogleRegisteredEmail(email);
  assert.equal(isGoogle, true);
});

test('google conflict: loginWithUsername rejects google email with helpful message', async () => {
  const email = 'test_google_pilot_99@gmail.com';
  const res = await loginWithUsername(email, 'somePassword123');
  assert.equal(res.success, false);
  assert.equal(res.error, 'This account is registered with Google. Try signing in with Google.');
});

test('google conflict: registerWithUsername rejects google recovery email', async () => {
  const email = 'test_google_pilot_99@gmail.com';
  const res = await registerWithUsername('NewPilotAce', 'somePassword123', email);
  assert.equal(res.success, false);
  assert.equal(res.error, 'This account is registered with Google. Try signing in with Google.');
});

test('google conflict: completeVerifiedEmailAuth rejects google email', async () => {
  const email = 'test_google_pilot_99@gmail.com';
  const res = await completeVerifiedEmailAuth('NewPilotAce', email);
  assert.equal(res.success, false);
  assert.equal(res.error, 'This account is registered with Google. Try signing in with Google.');
});
