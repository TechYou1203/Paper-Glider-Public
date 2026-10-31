import React, { useState } from 'react';
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
} from '../services/firebase';
import type { PilotUser } from '../game/types';

interface AuthModalProps {
  onSuccess: (user: PilotUser) => void;
  onContinueAsGuest: () => void;
  onClose?: () => void;
  initialMode?: 'login' | 'register' | 'email-confirm';
  canClose?: boolean;
}

type ModalTab = 'login' | 'register' | 'forgot' | 'google-username' | 'email-confirm';

export const AuthModal: React.FC<AuthModalProps> = ({
  onSuccess,
  onContinueAsGuest,
  onClose,
  initialMode = 'register',
  canClose = true,
}) => {
  const [tab, setTab] = useState<ModalTab>(initialMode);
  const [loginMethod, setLoginMethod] = useState<'password' | 'magic-link'>('password');
  const [forgotSubTab, setForgotSubTab] = useState<'password' | 'username'>('password');

  // Form Fields
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [magicLinkEmail, setMagicLinkEmail] = useState('');
  const [forgotInput, setForgotInput] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');

  // States
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [pendingGoogleUid, setPendingGoogleUid] = useState<string | null>(null);
  const [pendingGoogleEmail, setPendingGoogleEmail] = useState<string | undefined>(undefined);
  const [pendingGooglePhoto, setPendingGooglePhoto] = useState<string | undefined>(undefined);

  // Clear messages when switching tabs
  const switchTab = (newTab: ModalTab) => {
    setTab(newTab);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  // ─── 1. Register with Username, Email & Password ──────────────────────────
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setErrorMessage('Please enter a pilot username.');
      return;
    }
    if (!password) {
      setErrorMessage('Please enter a password.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await registerWithUsername(
        username.trim(),
        password,
        email.trim() || undefined
      );

      if (!res.success) {
        setErrorMessage(res.error || 'Registration failed.');
      } else if (res.user) {
        onSuccess(res.user);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  // ─── 2. Login with Username or Email & Password ───────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
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

  // ─── 3. Passwordless Magic Link Sign-In ──────────────────────────────────
  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!magicLinkEmail.trim()) {
      setErrorMessage('Please enter your email address.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await sendPasswordlessLoginLink(magicLinkEmail.trim());

      if (!res.success) {
        setErrorMessage(res.error || 'Failed to send magic login link.');
      } else {
        setSuccessMessage(res.message || 'Magic login link sent to your email! Check your inbox.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to send magic login link.');
    } finally {
      setLoading(false);
    }
  };

  // ─── 4. Confirm Email for Magic Link opened on different browser ──────────
  const handleConfirmMagicLinkEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmEmail.trim()) {
      setErrorMessage('Please enter your email address.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const { isEmailLink, result } = await checkAndCompleteEmailLinkSignIn(
        window.location.href,
        confirmEmail.trim()
      );

      if (!isEmailLink || !result?.success) {
        setErrorMessage(result?.error || 'Invalid or expired email sign-in link.');
      } else if (result.needsUsername && result.user) {
        setPendingGoogleUid(result.user.uid);
        setPendingGoogleEmail(result.user.email);
        setTab('google-username');
      } else if (result.user) {
        onSuccess(result.user);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to complete sign-in.');
    } finally {
      setLoading(false);
    }
  };

  // ─── 5. Google Sign-In ───────────────────────────────────────────────────
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

  // ─── 6. Complete Google / Passwordless Username Selection ─────────────────
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
      setErrorMessage(err.message || 'Failed to register username.');
    } finally {
      setLoading(false);
    }
  };

  // ─── 7. Forgot Password / Username ───────────────────────────────────────
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
        {/* Close Button (if applicable) */}
        {canClose && onClose && (
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#475569] border border-[#2d2a26] transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        )}

        {/* Project Logo Emblem */}
        <div className="flex justify-center mb-3">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-[#fffef9] border-2 border-[#2d2a26] shadow-[3px_3px_0px_#2d2a26] flex items-center justify-center p-1.5 overflow-hidden">
            <img
              src="/logo.svg"
              alt="Paper Glider Logo"
              className="w-full h-full object-contain"
            />
          </div>
        </div>

        {/* Header Title */}
        <h2 className="font-title text-3xl sm:text-4xl font-extrabold text-[#1e293b] leading-tight">
          {tab === 'register' && 'Enter Pilot Username'}
          {tab === 'login' && (loginMethod === 'magic-link' ? 'Magic Link Login' : 'Pilot Sign In')}
          {tab === 'forgot' && 'Account Recovery'}
          {tab === 'google-username' && 'Choose Your Callsign'}
          {tab === 'email-confirm' && 'Confirm Email Sign-In'}
        </h2>
        <p className="font-sketch text-xs sm:text-sm font-bold text-[#64748b] mt-0.5 mb-4">
          {tab === 'register' && 'Create your pilot callsign to save high scores & sync across devices.'}
          {tab === 'login' &&
            (loginMethod === 'magic-link'
              ? 'Receive an instant login link to sign in without typing a password.'
              : 'Sign in with your Username or Email to access your saved records.')}
          {tab === 'forgot' && 'Recover your forgotten username or reset your account password.'}
          {tab === 'google-username' && 'Choose a unique pilot callsign for the leaderboard.'}
          {tab === 'email-confirm' && 'Confirm your email to complete passwordless sign-in.'}
        </p>

        {/* Primary Tabs (Register vs Login) */}
        {tab !== 'google-username' && tab !== 'forgot' && tab !== 'email-confirm' && (
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
          <div className="mb-4 p-3 bg-[#fee2e2] border-2 border-[#dc2626] rounded-xl text-left flex items-start gap-2 shadow-[2px_2px_0px_#dc2626] animate-shake">
            <AlertTriangle className="text-[#dc2626] shrink-0 mt-0.5" size={18} />
            <p className="font-sketch text-xs sm:text-sm font-bold text-[#991b1b] leading-tight">
              {errorMessage}
            </p>
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

        {/* ─── TAB 1: REGISTER WITH USERNAME, EMAIL & PASSWORD ───────────── */}
        {tab === 'register' && (
          <form onSubmit={handleRegister} className="space-y-3 text-left">
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
                  maxLength={24}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. MaverickPilot"
                  className="w-full pl-9 pr-3 py-2 bg-[#ffffff] border-2 border-[#2d2a26] rounded-xl font-sketch text-base font-bold text-[#1e293b] focus:outline-none focus:ring-2 focus:ring-[#facc15] shadow-[2px_2px_0px_#2d2a26]"
                />
              </div>
            </div>

            <div>
              <label className="block font-sketch text-xs font-bold text-[#475569] uppercase tracking-wider mb-1">
                Email Address <span className="text-[#94a3b8] font-normal">(For passwordless & recovery)</span>
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#64748b]">
                  <Mail size={16} />
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="pilot@example.com"
                  className="w-full pl-9 pr-3 py-2 bg-[#ffffff] border-2 border-[#2d2a26] rounded-xl font-sketch text-base font-bold text-[#1e293b] focus:outline-none focus:ring-2 focus:ring-[#facc15] shadow-[2px_2px_0px_#2d2a26]"
                />
              </div>
            </div>

            <div>
              <label className="block font-sketch text-xs font-bold text-[#475569] uppercase tracking-wider mb-1">
                Password <span className="text-[#dc2626]">*</span>
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#64748b]">
                  <Lock size={16} />
                </span>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full pl-9 pr-3 py-2 bg-[#ffffff] border-2 border-[#2d2a26] rounded-xl font-sketch text-base font-bold text-[#1e293b] focus:outline-none focus:ring-2 focus:ring-[#facc15] shadow-[2px_2px_0px_#2d2a26]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 bg-[#fde047] hover:bg-[#facc15] active:translate-x-0.5 active:translate-y-0.5 text-[#1e293b] font-sketch text-lg font-black border-2 border-[#2d2a26] rounded-xl shadow-[3px_3px_0px_#2d2a26] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? 'Validating Username...' : 'Save Username & Start Flying'}
              <ArrowRight size={18} />
            </button>
          </form>
        )}

        {/* ─── TAB 2: SIGN IN (PASSWORD OR PASSWORDLESS MAGIC LINK) ───────── */}
        {tab === 'login' && (
          <div className="space-y-3">
            {/* Login Method Sub-Toggle */}
            <div className="flex gap-2 p-1 bg-[#f8fafc] border border-[#cbd5e1] rounded-xl mb-2">
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
              <button
                type="button"
                onClick={() => {
                  setLoginMethod('magic-link');
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                className={`flex-1 py-1.5 text-xs font-sketch font-bold rounded-lg cursor-pointer flex items-center justify-center gap-1.5 ${
                  loginMethod === 'magic-link'
                    ? 'bg-[#ffffff] text-[#1e293b] shadow-[1px_1px_0px_#2d2a26] border border-[#2d2a26]'
                    : 'text-[#64748b]'
                }`}
              >
                <Sparkles size={13} className="text-[#eab308]" />
                <span>Passwordless (Magic Link)</span>
              </button>
            </div>

            {/* Sub-form A: Username / Email & Password */}
            {loginMethod === 'password' ? (
              <form onSubmit={handleLogin} className="space-y-3 text-left">
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
                      placeholder="Username or pilot@example.com"
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
                      Forgot username/password?
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
            ) : (
              /* Sub-form B: Passwordless Magic Link */
              <form onSubmit={handleSendMagicLink} className="space-y-3 text-left">
                <div>
                  <label className="block font-sketch text-xs font-bold text-[#475569] uppercase tracking-wider mb-1">
                    Your Email Address
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#64748b]">
                      <Mail size={16} />
                    </span>
                    <input
                      type="email"
                      required
                      value={magicLinkEmail}
                      onChange={(e) => setMagicLinkEmail(e.target.value)}
                      placeholder="pilot@example.com"
                      className="w-full pl-9 pr-3 py-2 bg-[#ffffff] border-2 border-[#2d2a26] rounded-xl font-sketch text-base font-bold text-[#1e293b] focus:outline-none focus:ring-2 focus:ring-[#facc15] shadow-[2px_2px_0px_#2d2a26]"
                    />
                  </div>
                  <p className="font-sketch text-[11px] text-[#64748b] mt-1">
                    We will email you a secure 1-click link to sign in instantly without needing a password.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 py-3 bg-[#fde047] hover:bg-[#facc15] active:translate-x-0.5 active:translate-y-0.5 text-[#1e293b] font-sketch text-base sm:text-lg font-black border-2 border-[#2d2a26] rounded-xl shadow-[3px_3px_0px_#2d2a26] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Send size={16} />
                  <span>{loading ? 'Sending Magic Link...' : 'Email Me Sign-In Link'}</span>
                </button>
              </form>
            )}
          </div>
        )}

        {/* ─── TAB 3: CONFIRM EMAIL LINK (opened on different browser) ───── */}
        {tab === 'email-confirm' && (
          <form onSubmit={handleConfirmMagicLinkEmail} className="space-y-3 text-left">
            <div>
              <label className="block font-sketch text-xs font-bold text-[#475569] uppercase tracking-wider mb-1">
                Confirm Your Email Address
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#64748b]">
                  <Mail size={16} />
                </span>
                <input
                  type="email"
                  required
                  value={confirmEmail}
                  onChange={(e) => setConfirmEmail(e.target.value)}
                  placeholder="Enter the email you sent the link to"
                  className="w-full pl-9 pr-3 py-2 bg-[#ffffff] border-2 border-[#2d2a26] rounded-xl font-sketch text-base font-bold text-[#1e293b] focus:outline-none focus:ring-2 focus:ring-[#facc15] shadow-[2px_2px_0px_#2d2a26]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[#fde047] hover:bg-[#facc15] text-[#1e293b] font-sketch text-lg font-black border-2 border-[#2d2a26] rounded-xl shadow-[3px_3px_0px_#2d2a26] cursor-pointer"
            >
              {loading ? 'Verifying Link...' : 'Complete Sign-In'}
            </button>
          </form>
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
                  {forgotSubTab === 'password'
                    ? 'Enter Username or Recovery Email'
                    : 'Enter Registered Recovery Email'}
                </label>
                <input
                  type="text"
                  required
                  value={forgotInput}
                  onChange={(e) => setForgotInput(e.target.value)}
                  placeholder={
                    forgotSubTab === 'password'
                      ? 'Username or pilot@example.com'
                      : 'pilot@example.com'
                  }
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

        {/* ─── TAB 5: CHOOSE USERNAME FOR GOOGLE / MAGIC LINK USER ───────── */}
        {tab === 'google-username' && (
          <div className="space-y-4 text-left">
            {/* Google Authentication Confirmation Badge */}
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
                <p className="font-sketch text-[11px] text-[#64748b] mt-1">
                  Must be 3–24 characters. Letters, numbers, and dashes allowed.
                </p>
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

        {/* ─── OR DIVIDER & GOOGLE LOGIN ─────────────────────────────────── */}
        {tab !== 'google-username' && tab !== 'forgot' && tab !== 'email-confirm' && (
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
                  {/* Google "G" SVG */}
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
              {/* Prominent Warning Callout */}
              <div className="bg-[#fef3c7] border-2 border-[#d97706] rounded-xl p-3 text-left mb-3 shadow-[2px_2px_0px_#d97706]">
                <div className="flex items-start gap-2">
                  <span className="text-base sm:text-lg shrink-0">⚠️</span>
                  <div className="text-xs font-sketch text-[#92400e] leading-snug">
                    <span className="font-black uppercase tracking-wider block mb-0.5">
                      Notice: Without login, progress will not be saved!
                    </span>
                    Your high score, unlocked gliders, and paperclips will only be saved locally in this browser. You won't be able to access your records from another device.
                  </div>
                </div>
              </div>

              {/* Continue without Login CTA */}
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
