import React from 'react';
import { Trophy, Calendar, Plane, Volume2, VolumeX, Play, LogIn, LogOut, User as UserIcon } from 'lucide-react';
import { PilotUser, UserStats } from '../game/types';

interface TitleScreenProps {
  onStart: () => void;
  onOpenLeaderboard: () => void;
  onOpenChallenges: () => void;
  onOpenHangar: () => void;
  onToggleSound: () => void;
  onOpenAuth: () => void;
  onLogout?: () => void;
  onReconnect?: () => void;
  currentUser: PilotUser | null;
  stats: UserStats;
  isOnline?: boolean;
  isConnecting?: boolean;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  onStart,
  onOpenLeaderboard,
  onOpenChallenges,
  onOpenHangar,
  onToggleSound,
  onOpenAuth,
  onLogout,
  onReconnect,
  currentUser,
  stats,
  isOnline = false,
  isConnecting = false,
}) => {
  return (
    <div className="absolute inset-0 flex flex-col justify-between items-center p-3 sm:p-6 z-10 pointer-events-none select-none">
      {/* Top Left Game Logo (Disappears when flight begins) */}
      <div className="absolute top-2.5 left-2.5 sm:top-5 sm:left-5 z-20 pointer-events-auto">
        <div className="bg-[#fffef9] border-2 border-[#2d2a26] rounded-xl sm:rounded-2xl p-1 sm:p-1.5 shadow-[3px_3px_0px_#2d2a26] hover:scale-105 transition-transform flex items-center justify-center">
          <img
            src="/logo.svg"
            alt="Paper Glider Logo"
            className="w-11 h-11 sm:w-16 sm:h-16 object-contain"
          />
        </div>
      </div>

      {/* Top Bar Utilities */}
      <div className="w-full flex justify-between items-center max-w-xl pointer-events-auto pl-15 sm:pl-0">
        <div className="flex items-center gap-1.5 sm:gap-2 bg-[#fffef9] border-2 border-[#2d2a26] px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-full shadow-[2px_2px_0px_#2d2a26]">
          <span className="text-xs sm:text-sm font-sketch font-bold text-[#64748b] tracking-wider uppercase">Best:</span>
          <span className="font-title text-xl sm:text-2xl font-bold text-[#1e293b] tabular-nums">{stats.highScore}</span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Paperclip Balance */}
          <div className="flex items-center gap-1.5 bg-[#fffef9] border-2 border-[#2d2a26] px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full shadow-[2px_2px_0px_#2d2a26]">
            <span className="text-sm sm:text-base">📎</span>
            <span className="font-sketch text-sm sm:text-base font-bold text-[#2d2a26] tabular-nums">{stats.paperclips}</span>
          </div>

          {/* Sound Toggle */}
          <button
            onClick={onToggleSound}
            aria-label={stats.soundEnabled ? 'Mute sound' : 'Unmute sound'}
            className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center bg-[#fffef9] border-2 border-[#2d2a26] rounded-full shadow-[2px_2px_0px_#2d2a26] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer text-[#2d2a26] transition-transform"
          >
            {stats.soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
        </div>
      </div>

      {/* Pilot Account Status Pill */}
      <div className="w-full flex justify-between items-center max-w-xl pointer-events-auto mt-1 sm:mt-2 px-1">
        <button
          onClick={onReconnect}
          type="button"
          disabled={isConnecting}
          title={isOnline ? 'Neon DB Online (Connected to PostgreSQL)' : 'Local Storage Mode — Click to reconnect to Neon DB'}
          className="flex items-center gap-1.5 bg-[#fffef9] hover:bg-[#f8fafc] border-2 border-[#2d2a26] px-2.5 py-1 rounded-full shadow-[2px_2px_0px_#2d2a26] text-xs font-sketch font-bold cursor-pointer transition-all active:translate-x-0.5 active:translate-y-0.5"
        >
          <span
            className={`w-2 h-2 rounded-full ${
              isConnecting
                ? 'bg-amber-400 animate-ping'
                : isOnline
                ? 'bg-emerald-500 animate-pulse'
                : 'bg-amber-400'
            }`}
          />
          <span className="text-[#475569]">
            {isConnecting ? 'Connecting...' : isOnline ? 'Neon DB Online' : 'Local Storage'}
          </span>
        </button>

        <div className="ml-auto">
          {currentUser ? (
            <div className="flex items-center gap-2 bg-[#fffef9] border-2 border-[#2d2a26] px-3 py-1 rounded-full shadow-[2px_2px_0px_#2d2a26]">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-sketch text-xs sm:text-sm font-bold text-[#1e293b]">
                Pilot: <span className="text-[#0284c7] font-black">{currentUser.username}</span>
              </span>
              {onLogout && (
                <button
                  onClick={onLogout}
                  title="Log out of account"
                  className="font-sketch text-xs font-bold text-[#dc2626] hover:underline cursor-pointer ml-1 flex items-center gap-1"
                >
                  <LogOut size={12} />
                  <span>Log Out</span>
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="flex items-center gap-1.5 bg-[#fef08a] hover:bg-[#fde047] border-2 border-[#2d2a26] px-3 py-1 rounded-full shadow-[2px_2px_0px_#2d2a26] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer transition-all"
            >
              <UserIcon size={14} className="text-[#1e293b]" />
              <span className="font-sketch text-xs sm:text-sm font-bold text-[#1e293b]">
                Guest (Not Synced) · <span className="underline font-black">Log In to Save</span>
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Main Hero Title Lockup & Emblem */}
      <div className="flex flex-col items-center justify-center text-center my-auto pointer-events-auto max-w-md w-full px-2">
        {/* Bespoke Origami Paper Plane Animation */}
        <div className="relative mb-2 sm:mb-3 animate-bounce" style={{ animationDuration: '2.4s' }}>
          <svg width="120" height="80" viewBox="0 0 130 90" fill="none" className="drop-shadow-[3px_4px_0px_rgba(45,42,38,0.7)] sm:w-[130px] sm:h-[90px]">
            {/* Origami Paper Plane SVG */}
            <path d="M120 45 L15 10 L45 45 Z" fill="#ffffff" stroke="#2d2a26" strokeWidth="3" strokeLinejoin="round" />
            <path d="M120 45 L15 80 L45 45 Z" fill="#e2e8f0" stroke="#2d2a26" strokeWidth="3" strokeLinejoin="round" />
            <path d="M120 45 L45 45 L25 58 Z" fill="#cbd5e1" stroke="#2d2a26" strokeWidth="3" strokeLinejoin="round" />
            <line x1="120" y1="45" x2="35" y2="45" stroke="#2d2a26" strokeWidth="3" strokeLinecap="round" />
            {/* Speed breeze lines */}
            <line x1="8" y1="36" x2="1" y2="36" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="3 3" />
            <line x1="14" y1="45" x2="2" y2="45" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="3 3" />
            <line x1="8" y1="54" x2="1" y2="54" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="3 3" />
          </svg>
        </div>

        {/* Title Lockup */}
        <div className="relative">
          <h1 className="font-title text-5xl sm:text-7xl font-extrabold text-[#1e293b] tracking-tight leading-none drop-shadow-[2px_2px_0px_#ffffff]">
            Paper Glider
          </h1>
          <div className="flex items-center justify-center gap-2 mt-1">
            <span className="h-0.5 w-6 bg-[#2d2a26]" />
            <p className="font-sketch text-base sm:text-xl font-bold text-[#475569] uppercase tracking-wider">
              Sketchbook Flight
            </p>
            <span className="h-0.5 w-6 bg-[#2d2a26]" />
          </div>
        </div>

        {/* Primary Start CTA Button */}
        <button
          data-start="true"
          onClick={onStart}
          className="mt-5 sm:mt-7 flex items-center justify-center gap-3 w-56 sm:w-64 py-3 sm:py-3.5 bg-[#fde047] hover:bg-[#facc15] active:translate-x-1 active:translate-y-1 text-[#1e293b] font-sketch text-xl sm:text-2xl font-black border-3 border-[#2d2a26] rounded-2xl shadow-[5px_5px_0px_#2d2a26] transition-all cursor-pointer"
        >
          <Play size={22} className="fill-[#1e293b]" />
          START FLIGHT
        </button>

        {/* Quick Menu Buttons */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-3 sm:mt-4 w-full">
          <button
            onClick={onOpenLeaderboard}
            className="flex items-center justify-center gap-1 sm:gap-1.5 py-2 sm:py-2.5 px-1 sm:px-1.5 bg-[#ffffff] hover:bg-[#f8fafc] active:translate-x-0.5 active:translate-y-0.5 text-[#2d2a26] font-sketch text-xs sm:text-base font-bold border-2 border-[#2d2a26] rounded-xl shadow-[3px_3px_0px_#2d2a26] cursor-pointer transition-all whitespace-nowrap"
          >
            <Trophy size={15} className="text-[#eab308] shrink-0" />
            <span>Ranks</span>
          </button>

          <button
            onClick={onOpenChallenges}
            className="flex items-center justify-center gap-1 sm:gap-1.5 py-2 sm:py-2.5 px-1 sm:px-1.5 bg-[#ffffff] hover:bg-[#f8fafc] active:translate-x-0.5 active:translate-y-0.5 text-[#2d2a26] font-sketch text-xs sm:text-base font-bold border-2 border-[#2d2a26] rounded-xl shadow-[3px_3px_0px_#2d2a26] cursor-pointer transition-all whitespace-nowrap"
          >
            <Calendar size={15} className="text-[#0284c7] shrink-0" />
            <span>Tasks</span>
          </button>

          <button
            onClick={onOpenHangar}
            className="flex items-center justify-center gap-1 sm:gap-1.5 py-2 sm:py-2.5 px-1 sm:px-1.5 bg-[#ffffff] hover:bg-[#f8fafc] active:translate-x-0.5 active:translate-y-0.5 text-[#2d2a26] font-sketch text-xs sm:text-base font-bold border-2 border-[#2d2a26] rounded-xl shadow-[3px_3px_0px_#2d2a26] cursor-pointer transition-all whitespace-nowrap"
          >
            <Plane size={15} className="text-[#16a34a] shrink-0" />
            <span>Hangar</span>
          </button>
        </div>
      </div>

      {/* Control Hint Line at Bottom */}
      <div className="pointer-events-auto">
        <p className="font-sketch text-xs sm:text-sm font-bold text-[#64748b] bg-[#fffef9]/85 px-3 sm:px-4 py-1.5 rounded-full border border-[#cbd5e1] shadow-xs text-center">
          Tap Screen or Space to Glide · Esc / P to Pause
        </p>
      </div>
    </div>
  );
};
