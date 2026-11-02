import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  Lock,
  Mail,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  KeyRound,
  Send,
  ShieldCheck,
  RefreshCw,
  Info,
} from 'lucide-react';
import {
  loginWithUsername,
  registerWithUsername,
  loginWithGoogle,
  completeGoogleRegistration,
  requestPasswordReset,
  recoverUsernameByEmail,
  sendPasswordlessLoginLink,
  checkAndCompleteEmailLinkSignIn,
  checkUsernameAvailable,
  completeVerifiedEmailAuth,
  isGoogleRegisteredEmail,
} from '../services/firebase';
import { sendVerificationCode, verifyAuthCode, syncPilotAccount } from '../api/client';
import type { PilotUser } from '../game/types';

interface AuthModalProps {
  onSuccess: (user: PilotUser) => void;
  onContinueAsGuest: () => void;
  onClose?: () => void;
  initialMode?: 'login' | 'register' | 'email-confirm';
  canClose?: boolean;
}

type ModalTab = 'login' | 'register' | 'verify-code' | 'forgot' | 'google-username' | 'email-confirm';

export const AuthModal: React.FC<AuthModalProps> = ({
  onSuccess,
  onContinueAsGuest,
  onClose,
  initialMode = 'register',
  canClose = true,
}) => {
  const [tab, setTab] = useState<ModalTab>(initialMode);
  const [loginMethod, setLoginMethod] = useState<'code' | 'password'>('code');
  const [forgotSubTab, setForgotSubTab] = useState<'password' | 'username'>('password');
  const [verificationType, setVerificationType] = useState<'signup' | 'login'>('signup');

  // Form Fields
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [forgotInput, setForgotInput] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');

  // States
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState<number>(0);

  // Pending Google Sign-In state
  const [pendingGoogleUid, setPendingGoogleUid] = useState<string | null>(null);
  const [pendingGoogleEmail, setPendingGoogleEmail] = useState<string | undefined>(undefined);
  const [pendingGooglePhoto, setPendingGooglePhoto] = useState<string | undefined>(undefined);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  // Clear messages when switching tabs
  const switchTab = (newTab: ModalTab) => {
    setTab(newTab);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  // ─── 1. Initiate Sign-Up with Email & Callsign Validation ────────────────
  const handleInitiateSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim();

    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    if (!cleanUsername || cleanUsername.length < 3) {
      setErrorMessage('Pilot username must be at least 3 characters long.');
      return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(cleanUsername)) {
      setErrorMessage('Username can only contain letters, numbers, underscores, and dashes.');
      return;
    }

    if (password && password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      // 0. Reject if account is registered via Google
      const isGoogle = await isGoogleRegisteredEmail(cleanEmail);
      if (isGoogle) {
        setErrorMessage('This account is registered with Google. Try signing in with Google.');
        setLoading(false);
        return;
      }

      // 1. Validate username is not taken in Firebase
      const available = await checkUsernameAvailable(cleanUsername);
      if (!available) {
        setErrorMessage('This username is taken, try a different one.');
        setLoading(false);
        return;
      }

      // 2. Request backend 6-digit verification code
      const res = await sendVerificationCode(cleanEmail, cleanUsername, 'signup');

      if (!res.success) {
        setErrorMessage(res.error || 'Failed to send verification code. Please try again.');
      } else {
        setVerificationType('signup');
        setVerificationCode('');
        setResendCooldown(45);
        setSuccessMessage('Verification code sent to your email! Please check your inbox or spam folder.');
        setTab('verify-code');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Verification request failed. Please check network.');
    } finally {
      setLoading(false);
    }
  };

  // ─── 2. Initiate Email Code Login ─────────────────────────────────────────
  const handleInitiateCodeLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim() || cleanEmail.split('@')[0];

    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMessage('Please enter your registered email address.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      // Reject if account is registered via Google
      const isGoogle = await isGoogleRegisteredEmail(cleanEmail);
      if (isGoogle) {
        setErrorMessage('This account is registered with Google. Try signing in with Google.');
        setLoading(false);
        return;
      }

      const res = await sendVerificationCode(cleanEmail, cleanUsername, 'login');

      if (!res.success) {
        setErrorMessage(res.error || 'Failed to send verification code.');
      } else {
        setVerificationType('login');
        setVerificationCode('');
        setResendCooldown(45);
        setSuccessMessage('Login verification code sent! Check your inbox or spam folder.');
        setTab('verify-code');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Login request failed.');
    } finally {
      setLoading(false);
    }
  };

  // ─── 3. Verify 6-Digit Code & Launch Flight ───────────────────────────────
  const handleVerifyCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = verificationCode.trim();

    if (!cleanCode || cleanCode.length < 6) {
      setErrorMessage('Please enter the complete 6-digit verification code.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      // 1. Verify code on server
      const res = await verifyAuthCode(
        email.trim().toLowerCase(),
        cleanCode,
        username.trim(),
        verificationType
      );

      if (!res.success) {
        setErrorMessage(
          res.error || 'Invalid or expired verification code. Please check your Gmail (including Spam folder) and try again.'
        );
        setLoading(false);
        return;
      }

      // 2. Complete verified authentication across Firebase and local profile
      const authRes = await completeVerifiedEmailAuth(
        username.trim(),
        email.trim().toLowerCase(),
        password || undefined
      );

      if (authRes.success && authRes.user) {
        // 3. Link pilot with Neon DB
        await syncPilotAccount(authRes.user.uid, authRes.user.username, authRes.user.email, 'otp').catch(() => {});
        onSuccess(authRes.user);
      } else {
        setErrorMessage(authRes.error || 'Failed to finalize pilot profile.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ─── 4. Resend Verification Code ──────────────────────────────────────────
  const handleResendCode = async () => {
    if (resendCooldown > 0) return;
    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await sendVerificationCode(
        email.trim().toLowerCase(),
        username.trim(),
        verificationType
      );
      if (res.success) {
        setResendCooldown(45);
        setSuccessMessage('A fresh verification code has been dispatched to your email!');
      } else {
        setErrorMessage(res.error || 'Failed to resend code.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Resend failed.');
    } finally {
      setLoading(false);
    }
  };

  // ─── 5. Password Login Fallback ───────────────────────────────────────────
  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setErrorMessage('Please enter your username or email.');
      return;
    }
    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await loginWithUsername(username.trim(), password);

      if (!res.success) {
        setErrorMessage(res.error || 'Login failed.');
      } else if (res.needsUsername && res.user) {
        setPendingGoogleUid(res.user.uid);
        setPendingGoogleEmail(res.user.email);
        setTab('google-username');
      } else if (res.user) {
        onSuccess(res.user);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  // ─── 6. Google Sign-In ───────────────────────────────────────────────────
  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await loginWithGoogle();

      if (!res.success) {
        setErrorMessage(res.error || 'Google login cancelled or failed.');
      } else if (res.needsUsername && res.user) {
        setPendingGoogleUid(res.user.uid);
        setPendingGoogleEmail(res.user.email);
        setPendingGooglePhoto(res.user.photoURL);
        setUsername(res.user.username || '');
        setTab('google-username');
      } else if (res.user) {
        onSuccess(res.user);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Google login failed.');
    } finally {
      setGoogleLoading(false);
    }
  };

  // ─── 7. Complete Google Username Selection ────────────────────────────────
  const handleCompleteUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingGoogleUid || !username.trim()) {
      setErrorMessage('Please choose a username.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await completeGoogleRegistration(
        pendingGoogleUid,
        username.trim(),
        pendingGoogleEmail
      );

      if (!res.success) {
        setErrorMessage(res.error || 'Username registration failed.');
      } else if (res.user) {
        onSuccess(res.user);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to complete registration.');
    } finally {
      setLoading(false);
    }
  };

  // ─── 8. Account Recovery ──────────────────────────────────────────────────
  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotInput.trim()) {
      setErrorMessage('Please enter your information.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      if (forgotSubTab === 'password') {
        const res = await requestPasswordReset(forgotInput.trim());
        if (!res.success) {
          setErrorMessage(res.error || 'Failed to send password reset.');
        } else {
          setSuccessMessage(res.message);
        }
      } else {
        const res = await recoverUsernameByEmail(forgotInput.trim());
        if (!res.success) {
          setErrorMessage(res.error || 'Username recovery failed.');
        } else {
          setSuccessMessage(`Registered username found: "${res.username}". You can now log in!`);
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Recovery failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#262421]/60 backdrop-blur-xs select-none overflow-y-auto animate-fade-in">
      <div className="relative w-full max-w-md bg-[#fffef9] border-3 border-[#2d2a26] rounded-2xl shadow-[6px_6px_0px_#2d2a26] p-5 sm:p-6 text-center my-auto">
        {/* Close Button */}
        {canClose && onClose && (
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#475569] border border-[#2d2a26] transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        )}

        {/* Project Logo */}
        <div className="flex justify-center mb-3">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-[#fffef9] border-2 border-[#2d2a26] shadow-[3px_3px_0px_#2d2a26] flex items-center justify-center p-1.5 overflow-hidden">
            <img src="/logo.svg" alt="Paper Glider Logo" className="w-full h-full object-contain" />
          </div>
        </div>

        {/* Header Title */}
        <h2 className="font-title text-3xl sm:text-4xl font-extrabold text-[#1e293b] leading-tight">
          {tab === 'register' && 'Pilot Registration'}
          {tab === 'verify-code' && 'Enter Verification Code'}
          {tab === 'login' && 'Pilot Sign In'}
          {tab === 'forgot' && 'Account Recovery'}
          {tab === 'google-username' && 'Choose Your Callsign'}
        </h2>
        <p className="font-sketch text-xs sm:text-sm font-bold text-[#64748b] mt-0.5 mb-4">
          {tab === 'register' && 'Enter your email & unique pilot callsign to receive your verification code.'}
          {tab === 'verify-code' && 'Enter the 6-digit code sent to your email to verify your flight authorization.'}
          {tab === 'login' && 'Sign in to access your saved high scores and global ranks.'}
          {tab === 'forgot' && 'Recover your forgotten username or reset your account password.'}
          {tab === 'google-username' && 'Choose a unique pilot callsign for the leaderboard.'}
        </p>

        {/* Primary Tabs (Register vs Login) */}
        {tab !== 'verify-code' && tab !== 'google-username' && tab !== 'forgot' && tab !== 'email-confirm' && (
          <div className="grid grid-cols-2 gap-2 p-1 bg-[#f1f5f9] border-2 border-[#2d2a26] rounded-xl mb-4">
            <button
              type="button"
              onClick={() => switchTab('register')}
              className={`py-2 text-sm font-sketch font-bold rounded-lg transition-all cursor-pointer ${
                tab === 'register'
                  ? 'bg-[#ffffff] text-[#1e293b] shadow-[2px_2px_0px_#2d2a26] border border-[#2d2a26]'
                  : 'text-[#64748b] hover:text-[#1e293b]'
              }`}
            >
              New Pilot (Sign Up)
            </button>
            <button
              type="button"
              onClick={() => switchTab('login')}
              className={`py-2 text-sm font-sketch font-bold rounded-lg transition-all cursor-pointer ${
                tab === 'login'
                  ? 'bg-[#ffffff] text-[#1e293b] shadow-[2px_2px_0px_#2d2a26] border border-[#2d2a26]'
                  : 'text-[#64748b] hover:text-[#1e293b]'
              }`}
            >
              Sign In
            </button>
          </div>
        )}

        {/* Error Alert Box */}
        {errorMessage && (
          <div className="mb-4 p-3 bg-[#fee2e2] border-2 border-[#dc2626] rounded-xl text-left flex flex-col gap-2 shadow-[2px_2px_0px_#dc2626] animate-shake">
            <div className="flex items-start gap-2">
              <AlertTriangle className="text-[#dc2626] shrink-0 mt-0.5" size={18} />
              <p className="font-sketch text-xs sm:text-sm font-bold text-[#991b1b] leading-tight">
                {errorMessage}
              </p>
            </div>
            {errorMessage.toLowerCase().includes('google') && (
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={googleLoading}
                className="mt-1 w-full py-2 px-3 bg-white hover:bg-gray-50 border-2 border-[#2d2a26] rounded-lg font-sketch text-xs sm:text-sm font-bold text-[#1e293b] flex items-center justify-center gap-2 shadow-[2px_2px_0px_#2d2a26] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer transition-transform"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>Sign In with Google Instead</span>
              </button>
            )}
          </div>
        )}

        {/* Success Alert Box */}
        {successMessage && (
          <div className="mb-4 p-3 bg-[#dcfce7] border-2 border-[#16a34a] rounded-xl text-left flex items-start gap-2 shadow-[2px_2px_0px_#16a34a]">
            <CheckCircle2 className="text-[#16a34a] shrink-0 mt-0.5" size={18} />
            <p className="font-sketch text-xs sm:text-sm font-bold text-[#166534] leading-tight">
              {successMessage}
            </p>
          </div>
        )}

        {/* ─── TAB 1: SIGN UP WITH EMAIL, USERNAME & VERIFICATION CODE ─────── */}
        {tab === 'register' && (
          <form onSubmit={handleInitiateSignup} className="space-y-3 text-left">
            <div>
              <label className="block font-sketch text-xs font-bold text-[#475569] uppercase tracking-wider mb-1">
                Email Address <span className="text-[#dc2626]">*</span>
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#64748b]">
                  <Mail size={16} />
                </span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your.email@gmail.com"
                  className="w-full pl-9 pr-3 py-2 bg-[#ffffff] border-2 border-[#2d2a26] rounded-xl font-sketch text-base font-bold text-[#1e293b] focus:outline-none focus:ring-2 focus:ring-[#facc15] shadow-[2px_2px_0px_#2d2a26]"
                />
              </div>
            </div>

            <div>
              <label className="block font-sketch text-xs font-bold text-[#475569] uppercase tracking-wider mb-1">
                Pilot Callsign / Username <span className="text-[#dc2626]">*</span>
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#64748b]">
                  <User size={16} />
                </span>
                <input
                  type="text"
                  required
                  minLength={3}
                  maxLength={24}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. AcePilot99"
                  className="w-full pl-9 pr-3 py-2 bg-[#ffffff] border-2 border-[#2d2a26] rounded-xl font-sketch text-base font-bold text-[#1e293b] focus:outline-none focus:ring-2 focus:ring-[#facc15] shadow-[2px_2px_0px_#2d2a26]"
                />
              </div>
              <p className="font-sketch text-[11px] text-[#64748b] mt-0.5">
                We'll validate that this callsign is unique before dispatching your flight code.
              </p>
            </div>

            <div>
              <label className="block font-sketch text-xs font-bold text-[#475569] uppercase tracking-wider mb-1">
                Password <span className="text-[#94a3b8] font-normal">(Optional backup)</span>
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#64748b]">
                  <Lock size={16} />
                </span>
                <input
                  type="password"
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Leave blank for code-only login"
                  className="w-full pl-9 pr-3 py-2 bg-[#ffffff] border-2 border-[#2d2a26] rounded-xl font-sketch text-base font-bold text-[#1e293b] focus:outline-none focus:ring-2 focus:ring-[#facc15] shadow-[2px_2px_0px_#2d2a26]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 bg-[#fde047] hover:bg-[#facc15] active:translate-x-0.5 active:translate-y-0.5 text-[#1e293b] font-sketch text-lg font-black border-2 border-[#2d2a26] rounded-xl shadow-[3px_3px_0px_#2d2a26] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  <span>Validating & Dispatching Code...</span>
                </>
              ) : (
                <>
                  <span>Send Verification Code</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
        )}

        {/* ─── TAB 2: VERIFICATION CODE ENTRY SCREEN ──────────────────────── */}
        {tab === 'verify-code' && (
          <form onSubmit={handleVerifyCodeSubmit} className="space-y-3.5 text-left animate-in fade-in">
            {/* Pilot Identity Capsule */}
            <div className="p-3 bg-[#f8fafc] border-2 border-[#2d2a26] rounded-xl shadow-[2px_2px_0px_#2d2a26] flex items-center justify-between">
              <div>
                <span className="font-sketch text-[11px] font-bold uppercase text-[#64748b] block">
                  Authorizing Pilot
                </span>
                <span className="font-title text-base font-black text-[#0284c7]">
                  {username || 'Aviator'}
                </span>
              </div>
              <div className="text-right">
                <span className="font-sketch text-[11px] font-bold uppercase text-[#64748b] block">
                  Sent To Email
                </span>
                <span className="font-sketch text-xs font-bold text-[#1e293b] truncate max-w-[180px] block">
                  {email}
                </span>
              </div>
            </div>

            {/* Spam Section Callout (As specifically requested by user) */}
            <div className="p-3 bg-[#fef3c7] border-2 border-[#d97706] rounded-xl text-left flex items-start gap-2.5 shadow-[2px_2px_0px_#d97706]">
              <AlertTriangle className="text-[#d97706] shrink-0 mt-0.5" size={18} />
              <div className="font-sketch text-xs sm:text-sm font-bold text-[#92400e] leading-snug">
                <p className="font-black mb-0.5">Cannot find the code in your Gmail inbox?</p>
                <p>
                  Please check your <u>Spam or Junk folder</u>! Automated verification emails may occasionally land there if not marked as safe.
                </p>
              </div>
            </div>

            {/* 6-Digit Code Input Box */}
            <div>
              <label className="block font-sketch text-xs font-bold text-[#475569] uppercase tracking-wider mb-1.5 text-center">
                Enter 6-Digit Verification Code
              </label>
              <input
                type="text"
                required
                autoFocus
                maxLength={6}
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="123456"
                className="w-full text-center py-3 bg-[#ffffff] border-3 border-[#2d2a26] rounded-xl font-mono text-3xl font-black text-[#1e293b] tracking-[8px] focus:outline-none focus:ring-3 focus:ring-[#facc15] shadow-[3px_3px_0px_#2d2a26]"
              />
            </div>

            {/* Verify & Launch Button */}
            <button
              type="submit"
              disabled={loading || verificationCode.length < 6}
              className="w-full py-3 bg-[#fde047] hover:bg-[#facc15] active:translate-x-0.5 active:translate-y-0.5 text-[#1e293b] font-sketch text-lg font-black border-2 border-[#2d2a26] rounded-xl shadow-[3px_3px_0px_#2d2a26] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  <span>Verifying Code...</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={20} />
                  <span>Verify Code & Start Flight</span>
                </>
              )}
            </button>

            {/* Secondary Actions: Resend & Edit Email */}
            <div className="flex items-center justify-between pt-1 font-sketch text-xs font-bold">
              <button
                type="button"
                onClick={handleResendCode}
                disabled={resendCooldown > 0 || loading}
                className="text-[#0284c7] hover:underline disabled:text-[#94a3b8] cursor-pointer"
              >
                {resendCooldown > 0 ? `Resend Code in ${resendCooldown}s` : 'Resend Code'}
              </button>

              <button
                type="button"
                onClick={() => switchTab(verificationType === 'signup' ? 'register' : 'login')}
                className="text-[#64748b] hover:text-[#1e293b] hover:underline cursor-pointer"
              >
                ← Edit Email / Callsign
              </button>
            </div>
          </form>
        )}

        {/* ─── TAB 3: SIGN IN ────────────────────────────────────────────── */}
        {tab === 'login' && (
          <div className="space-y-3">
            {/* Login Method Sub-Toggle */}
            <div className="flex gap-2 p-1 bg-[#f8fafc] border border-[#cbd5e1] rounded-xl mb-2">
              <button
                type="button"
                onClick={() => {
                  setLoginMethod('code');
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                className={`flex-1 py-1.5 text-xs font-sketch font-bold rounded-lg cursor-pointer flex items-center justify-center gap-1.5 ${
                  loginMethod === 'code'
                    ? 'bg-[#ffffff] text-[#1e293b] shadow-[1px_1px_0px_#2d2a26] border border-[#2d2a26]'
                    : 'text-[#64748b]'
                }`}
              >
                <Sparkles size={13} className="text-[#eab308]" />
                <span>Email Verification Code</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setLoginMethod('password');
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                className={`flex-1 py-1.5 text-xs font-sketch font-bold rounded-lg cursor-pointer flex items-center justify-center gap-1.5 ${
                  loginMethod === 'password'
                    ? 'bg-[#ffffff] text-[#1e293b] shadow-[1px_1px_0px_#2d2a26] border border-[#2d2a26]'
                    : 'text-[#64748b]'
                }`}
              >
                <KeyRound size={13} />
                <span>Password</span>
              </button>
            </div>

            {/* Sub-form A: Email Verification Code Login */}
            {loginMethod === 'code' ? (
              <form onSubmit={handleInitiateCodeLogin} className="space-y-3 text-left">
                <div>
                  <label className="block font-sketch text-xs font-bold text-[#475569] uppercase tracking-wider mb-1">
                    Registered Email Address <span className="text-[#dc2626]">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#64748b]">
                      <Mail size={16} />
                    </span>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your.email@gmail.com"
                      className="w-full pl-9 pr-3 py-2 bg-[#ffffff] border-2 border-[#2d2a26] rounded-xl font-sketch text-base font-bold text-[#1e293b] focus:outline-none focus:ring-2 focus:ring-[#facc15] shadow-[2px_2px_0px_#2d2a26]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-sketch text-xs font-bold text-[#475569] uppercase tracking-wider mb-1">
                    Pilot Username / Callsign <span className="text-[#94a3b8] font-normal">(Optional)</span>
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#64748b]">
                      <User size={16} />
                    </span>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Your pilot callsign"
                      className="w-full pl-9 pr-3 py-2 bg-[#ffffff] border-2 border-[#2d2a26] rounded-xl font-sketch text-base font-bold text-[#1e293b] focus:outline-none focus:ring-2 focus:ring-[#facc15] shadow-[2px_2px_0px_#2d2a26]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 py-3 bg-[#fde047] hover:bg-[#facc15] active:translate-x-0.5 active:translate-y-0.5 text-[#1e293b] font-sketch text-lg font-black border-2 border-[#2d2a26] rounded-xl shadow-[3px_3px_0px_#2d2a26] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <RefreshCw size={18} className="animate-spin" />
                      <span>Sending Code...</span>
                    </>
                  ) : (
                    <>
                      <span>Send 6-Digit Login Code</span>
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </form>
            ) : (
              /* Sub-form B: Password Login */
              <form onSubmit={handlePasswordLogin} className="space-y-3 text-left">
                <div>
                  <label className="block font-sketch text-xs font-bold text-[#475569] uppercase tracking-wider mb-1">
                    Username or Email
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#64748b]">
                      <User size={16} />
                    </span>
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Username or email"
                      className="w-full pl-9 pr-3 py-2 bg-[#ffffff] border-2 border-[#2d2a26] rounded-xl font-sketch text-base font-bold text-[#1e293b] focus:outline-none focus:ring-2 focus:ring-[#facc15] shadow-[2px_2px_0px_#2d2a26]"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="font-sketch text-xs font-bold text-[#475569] uppercase tracking-wider">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => switchTab('forgot')}
                      className="font-sketch text-xs font-bold text-[#0284c7] hover:underline cursor-pointer"
                    >
                      Forgot?
                    </button>
                  </div>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#64748b]">
                      <Lock size={16} />
                    </span>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Your password"
                      className="w-full pl-9 pr-3 py-2 bg-[#ffffff] border-2 border-[#2d2a26] rounded-xl font-sketch text-base font-bold text-[#1e293b] focus:outline-none focus:ring-2 focus:ring-[#facc15] shadow-[2px_2px_0px_#2d2a26]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 py-3 bg-[#fde047] hover:bg-[#facc15] active:translate-x-0.5 active:translate-y-0.5 text-[#1e293b] font-sketch text-lg font-black border-2 border-[#2d2a26] rounded-xl shadow-[3px_3px_0px_#2d2a26] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? 'Signing In...' : 'Log In to Hangar'}
                  <ArrowRight size={18} />
                </button>
              </form>
            )}
          </div>
        )}

        {/* ─── TAB 4: FORGOT USERNAME / PASSWORD ─────────────────────────── */}
        {tab === 'forgot' && (
          <div className="space-y-4 text-left">
            <div className="flex gap-2 p-1 bg-[#f1f5f9] border-2 border-[#2d2a26] rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setForgotSubTab('password');
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                className={`flex-1 py-1.5 text-xs font-sketch font-bold rounded-lg cursor-pointer ${
                  forgotSubTab === 'password'
                    ? 'bg-[#ffffff] text-[#1e293b] shadow-[1px_1px_0px_#2d2a26] border border-[#2d2a26]'
                    : 'text-[#64748b]'
                }`}
              >
                Forgot Password
              </button>
              <button
                type="button"
                onClick={() => {
                  setForgotSubTab('username');
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                className={`flex-1 py-1.5 text-xs font-sketch font-bold rounded-lg cursor-pointer ${
                  forgotSubTab === 'username'
                    ? 'bg-[#ffffff] text-[#1e293b] shadow-[1px_1px_0px_#2d2a26] border border-[#2d2a26]'
                    : 'text-[#64748b]'
                }`}
              >
                Forgot Username
              </button>
            </div>

            <form onSubmit={handleForgotSubmit} className="space-y-3">
              <div>
                <label className="block font-sketch text-xs font-bold text-[#475569] uppercase tracking-wider mb-1">
                  {forgotSubTab === 'password' ? 'Username or Email' : 'Registered Recovery Email'}
                </label>
                <input
                  type="text"
                  required
                  value={forgotInput}
                  onChange={(e) => setForgotInput(e.target.value)}
                  placeholder={forgotSubTab === 'password' ? 'Username or email' : 'pilot@example.com'}
                  className="w-full px-3 py-2 bg-[#ffffff] border-2 border-[#2d2a26] rounded-xl font-sketch text-base font-bold text-[#1e293b] focus:outline-none focus:ring-2 focus:ring-[#facc15] shadow-[2px_2px_0px_#2d2a26]"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-[#fde047] hover:bg-[#facc15] text-[#1e293b] font-sketch text-base font-bold border-2 border-[#2d2a26] rounded-xl shadow-[3px_3px_0px_#2d2a26] cursor-pointer"
              >
                {loading
                  ? 'Searching...'
                  : forgotSubTab === 'password'
                  ? 'Send Password Reset'
                  : 'Find My Username'}
              </button>
            </form>

            <button
              type="button"
              onClick={() => switchTab('login')}
              className="w-full text-center font-sketch text-xs font-bold text-[#475569] hover:text-[#1e293b] pt-1 cursor-pointer block"
            >
              ← Back to Sign In
            </button>
          </div>
        )}

        {/* ─── TAB 5: CHOOSE USERNAME FOR GOOGLE USER ────────────────────── */}
        {tab === 'google-username' && (
          <div className="space-y-4 text-left">
            <div className="flex items-center gap-3 p-3 bg-[#f0fdf4] border-2 border-[#16a34a] rounded-xl shadow-[2px_2px_0px_#16a34a]">
              {pendingGooglePhoto ? (
                <img
                  src={pendingGooglePhoto}
                  alt="Google Avatar"
                  className="w-10 h-10 rounded-full border-2 border-[#16a34a] shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-[#dcfce7] border-2 border-[#16a34a] flex items-center justify-center text-lg shrink-0">
                  ✈️
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 size={15} className="text-[#16a34a] shrink-0" />
                  <span className="font-sketch text-xs font-bold text-[#166534] uppercase tracking-wider">
                    Google Connected
                  </span>
                </div>
                {pendingGoogleEmail && (
                  <p className="font-sketch text-xs text-[#15803d] font-bold truncate">
                    {pendingGoogleEmail}
                  </p>
                )}
              </div>
            </div>

            <p className="font-sketch text-xs sm:text-sm text-[#475569]">
              Enter your desired <span className="font-bold text-[#1e293b]">pilot callsign</span> below. This unique name will be displayed on the global scoreboard and your flight logs.
            </p>

            <form onSubmit={handleCompleteUsername} className="space-y-3">
              <div>
                <label className="block font-sketch text-xs font-bold text-[#475569] uppercase tracking-wider mb-1">
                  Pilot Username / Callsign <span className="text-[#dc2626]">*</span>
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#64748b]">
                    <User size={16} />
                  </span>
                  <input
                    type="text"
                    required
                    minLength={3}
                    maxLength={24}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. MaverickPilot"
                    className="w-full pl-9 pr-3 py-2.5 bg-[#ffffff] border-2 border-[#2d2a26] rounded-xl font-sketch text-base font-bold text-[#1e293b] focus:outline-none focus:ring-2 focus:ring-[#facc15] shadow-[2px_2px_0px_#2d2a26]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-[#fde047] hover:bg-[#facc15] active:translate-x-0.5 active:translate-y-0.5 text-[#1e293b] font-sketch text-lg font-black border-2 border-[#2d2a26] rounded-xl shadow-[3px_3px_0px_#2d2a26] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? 'Confirming Callsign...' : 'Confirm Callsign & Enter Game'}
                <ArrowRight size={18} />
              </button>
            </form>

            <button
              type="button"
              onClick={() => switchTab('login')}
              className="w-full text-center font-sketch text-xs font-bold text-[#64748b] hover:text-[#1e293b] pt-1 cursor-pointer block"
            >
              ← Back to Sign In options
            </button>
          </div>
        )}

        {/* ─── GOOGLE LOGIN & GUEST DIVIDER ──────────────────────────────── */}
        {tab !== 'verify-code' && tab !== 'google-username' && tab !== 'forgot' && (
          <>
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#cbd5e1]" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-[#fffef9] px-2 font-sketch font-bold text-[#94a3b8]">
                  Or Connect With
                </span>
              </div>
            </div>

            {/* Google Sign-In Button */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading || googleLoading}
              className="w-full py-2.5 px-4 bg-[#ffffff] hover:bg-[#f8fafc] active:translate-x-0.5 active:translate-y-0.5 text-[#1e293b] font-sketch text-base font-bold border-2 border-[#2d2a26] rounded-xl shadow-[3px_3px_0px_#2d2a26] flex items-center justify-center gap-2.5 cursor-pointer transition-all disabled:opacity-60"
            >
              {googleLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-[#4285F4] border-t-transparent rounded-full animate-spin" />
                  <span>Connecting with Google...</span>
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.03h3.88c2.27-2.09 3.66-5.17 3.66-9.12z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.03c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.27v3.13C3.29 21.41 7.37 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.58H1.27C.46 8.2 0 10.04 0 12s.46 3.8 1.27 5.42l4.01-3.13z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.37 0 3.29 2.59 1.27 6.58l4.01 3.13c.95-2.83 3.6-4.96 6.72-4.96z"
                    />
                  </svg>
                  <span>Login with Google</span>
                </>
              )}
            </button>

            {/* ─── GUEST WARNING & CONTINUE WITHOUT LOGIN ──────────────────── */}
            <div className="mt-5 pt-4 border-t border-[#e2e8f0]">
              <div className="bg-[#fef3c7] border-2 border-[#d97706] rounded-xl p-3 text-left mb-3 shadow-[2px_2px_0px_#d97706]">
                <div className="flex items-start gap-2">
                  <span className="text-base sm:text-lg shrink-0">⚠️</span>
                  <div className="text-xs font-sketch text-[#92400e] leading-snug">
                    <span className="font-black uppercase tracking-wider block mb-0.5">
                      Notice: Without login, progress will not be saved!
                    </span>
                    Your high score, unlocked gliders, and paperclips will only be saved locally in this browser.
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={onContinueAsGuest}
                className="w-full py-2.5 px-3 bg-[#f8fafc] hover:bg-[#f1f5f9] text-[#64748b] hover:text-[#1e293b] font-sketch text-sm sm:text-base font-bold border-2 border-[#cbd5e1] hover:border-[#2d2a26] rounded-xl transition-all cursor-pointer"
              >
                Continue without Login (Play as Guest)
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
