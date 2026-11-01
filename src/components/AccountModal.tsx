import React, { useState } from 'react';
import { X, User, Trash2, LogOut, ShieldAlert, CheckCircle2, Database, Award, Paperclip } from 'lucide-react';
import { PilotUser, UserStats } from '../game/types';

interface AccountModalProps {
  currentUser: PilotUser;
  stats: UserStats;
  isOnline: boolean;
  onClose: () => void;
  onLogout: () => void;
  onDeleteAccount: () => Promise<{ success: boolean; error?: string }>;
}

export const AccountModal: React.FC<AccountModalProps> = ({
  currentUser,
  stats,
  isOnline,
  onClose,
  onLogout,
  onDeleteAccount,
}) => {
  const [confirmDelete, setConfirmDelete] = useState<boolean>(false);
  const [deleteInput, setDeleteInput] = useState<string>('');
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleDelete = async () => {
    if (deleteInput.trim().toLowerCase() !== 'delete') {
      setErrorMsg('Please type DELETE to confirm.');
      return;
    }

    setIsDeleting(true);
    setErrorMsg(null);
    try {
      const res = await onDeleteAccount();
      if (!res.success && res.error) {
        setErrorMsg(res.error);
        setIsDeleting(false);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to delete account. Please try again.');
      setIsDeleting(false);
    }
  };

  return (
    <div className="absolute inset-0 bg-[#2d2a26]/60 backdrop-blur-xs flex items-center justify-center p-4 z-40 select-none animate-in fade-in duration-150">
      <div className="bg-[#fffef9] border-3 border-[#2d2a26] rounded-2xl shadow-[6px_6px_0px_#2d2a26] p-5 max-w-md w-full max-h-[90vh] flex flex-col overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b-2 border-[#e2e8f0]">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-[#e0f2fe] border-2 border-[#2d2a26] flex items-center justify-center text-[#0284c7]">
              <User size={22} />
            </div>
            <div>
              <h2 className="font-title text-2xl sm:text-3xl font-extrabold text-[#1e293b] leading-tight">
                Pilot Dossier
              </h2>
              <p className="font-sketch text-xs font-bold text-[#64748b]">
                Manage account & cloud profile
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isDeleting}
            aria-label="Close Account Panel"
            className="w-8 h-8 flex items-center justify-center bg-[#f1f5f9] hover:bg-[#e2e8f0] border-2 border-[#2d2a26] rounded-full active:translate-x-0.5 active:translate-y-0.5 cursor-pointer text-[#2d2a26] transition-transform"
          >
            <X size={16} />
          </button>
        </div>

        {/* Pilot Identity Card */}
        <div className="mt-4 bg-[#faf8f0] border-2 border-[#2d2a26] rounded-xl p-3.5 shadow-[2px_2px_0px_#2d2a26] space-y-2">
          <div className="flex justify-between items-center">
            <span className="font-sketch text-xs font-bold uppercase tracking-wider text-[#64748b]">
              Callsign
            </span>
            <span className="font-title text-lg font-black text-[#0284c7]">
              {currentUser.username}
            </span>
          </div>

          <div className="flex justify-between items-center text-xs font-sketch">
            <span className="font-bold text-[#64748b]">Email / Provider</span>
            <span className="font-bold text-[#1e293b] truncate max-w-[200px]">
              {currentUser.email || 'Google Pilot Sign-In'}
            </span>
          </div>

          <div className="flex justify-between items-center text-xs font-sketch">
            <span className="font-bold text-[#64748b]">Database Status</span>
            <span className="flex items-center gap-1 font-bold text-[#1e293b]">
              <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`} />
              {isOnline ? 'Neon DB Online (Synchronized)' : 'Local Storage Mode'}
            </span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="bg-[#f8fafc] border-2 border-[#2d2a26] rounded-xl p-2.5 text-center shadow-[1px_1px_0px_#2d2a26]">
            <Award size={16} className="mx-auto text-[#eab308] mb-0.5" />
            <div className="font-title text-lg font-bold text-[#1e293b] leading-tight">
              {stats.highScore}
            </div>
            <div className="font-sketch text-[10px] font-bold text-[#64748b] uppercase">Best</div>
          </div>

          <div className="bg-[#f8fafc] border-2 border-[#2d2a26] rounded-xl p-2.5 text-center shadow-[1px_1px_0px_#2d2a26]">
            <Paperclip size={16} className="mx-auto text-[#64748b] mb-0.5" />
            <div className="font-title text-lg font-bold text-[#1e293b] leading-tight">
              {stats.paperclips}
            </div>
            <div className="font-sketch text-[10px] font-bold text-[#64748b] uppercase">Clips</div>
          </div>

          <div className="bg-[#f8fafc] border-2 border-[#2d2a26] rounded-xl p-2.5 text-center shadow-[1px_1px_0px_#2d2a26]">
            <Database size={16} className="mx-auto text-[#0284c7] mb-0.5" />
            <div className="font-title text-lg font-bold text-[#1e293b] leading-tight">
              {stats.unlockedSkins?.length || 1}
            </div>
            <div className="font-sketch text-[10px] font-bold text-[#64748b] uppercase">Skins</div>
          </div>
        </div>

        {/* Standard Actions */}
        <div className="mt-4 pt-3 border-t-2 border-[#e2e8f0] flex flex-col gap-2">
          <button
            onClick={() => {
              onClose();
              onLogout();
            }}
            disabled={isDeleting}
            className="flex items-center justify-center gap-2 py-2.5 px-4 bg-[#f1f5f9] hover:bg-[#e2e8f0] border-2 border-[#2d2a26] rounded-xl font-sketch font-bold text-sm text-[#1e293b] shadow-[2px_2px_0px_#2d2a26] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer transition-all"
          >
            <LogOut size={16} />
            <span>Log Out of Flight Deck</span>
          </button>
        </div>

        {/* Danger Zone: Permanent Account Deletion */}
        <div className="mt-4 pt-3 border-t-2 border-[#fecaca] bg-[#fff1f2] border-2 border-[#f43f5e] rounded-xl p-3 shadow-[2px_2px_0px_#2d2a26]">
          <div className="flex items-center gap-2 mb-1.5">
            <ShieldAlert size={18} className="text-[#e11d48]" />
            <h3 className="font-sketch font-black text-sm uppercase tracking-wide text-[#9f1239]">
              Danger Zone
            </h3>
          </div>

          <p className="font-sketch text-xs text-[#be123c] leading-snug mb-3">
            Permanently delete this pilot account. This action immediately wipes your credentials from <strong>Firebase</strong> and permanently deletes all flights, leaderboard scores, and paperclips from <strong>Neon DB</strong>.
          </p>

          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={isDeleting}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-[#fee2e2] hover:bg-[#fecaca] border-2 border-[#e11d48] rounded-xl font-sketch font-bold text-xs text-[#9f1239] shadow-[2px_2px_0px_#9f1239] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer transition-all"
            >
              <Trash2 size={14} />
              <span>Permanently Delete Account</span>
            </button>
          ) : (
            <div className="bg-white border-2 border-[#e11d48] rounded-xl p-3 space-y-2 animate-in fade-in duration-150">
              <p className="font-sketch text-xs font-bold text-[#881337]">
                Type <span className="underline font-black">DELETE</span> to confirm permanent erasure:
              </p>
              <input
                type="text"
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
                placeholder="DELETE"
                disabled={isDeleting}
                className="w-full px-3 py-1.5 border-2 border-[#2d2a26] rounded-lg font-sketch text-xs font-bold uppercase tracking-wider text-[#1e293b] focus:outline-none focus:ring-2 focus:ring-[#e11d48]"
              />

              {errorMsg && (
                <p className="font-sketch text-xs font-bold text-[#b91c1c] leading-tight">
                  {errorMsg}
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleDelete}
                  disabled={isDeleting || deleteInput.trim().toLowerCase() !== 'delete'}
                  className="flex-1 py-1.5 bg-[#e11d48] hover:bg-[#be123c] disabled:opacity-50 border-2 border-[#2d2a26] rounded-lg font-sketch font-bold text-xs text-white shadow-[2px_2px_0px_#2d2a26] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer transition-all flex items-center justify-center gap-1.5"
                >
                  {isDeleting ? (
                    <span className="animate-spin">⏳</span>
                  ) : (
                    <Trash2 size={13} />
                  )}
                  <span>{isDeleting ? 'Erasing Everything...' : 'Confirm Erase'}</span>
                </button>
                <button
                  onClick={() => {
                    setConfirmDelete(false);
                    setDeleteInput('');
                    setErrorMsg(null);
                  }}
                  disabled={isDeleting}
                  className="px-3 py-1.5 bg-[#f1f5f9] hover:bg-[#e2e8f0] border-2 border-[#2d2a26] rounded-lg font-sketch font-bold text-xs text-[#2d2a26] cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
