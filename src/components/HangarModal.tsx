import React from 'react';
import { X, Plane, Lock, Check } from 'lucide-react';
import { GliderSkin } from '../game/types';
import { DEFAULT_SKINS, getGliderStats } from '../game/rules';

interface HangarModalProps {
  paperclips: number;
  selectedSkinId: string;
  unlockedSkins: string[];
  onSelectSkin: (skinId: string) => void;
  onUnlockSkin: (skin: GliderSkin) => void;
  onClose: () => void;
}

export const HangarModal: React.FC<HangarModalProps> = ({
  paperclips,
  selectedSkinId,
  unlockedSkins,
  onSelectSkin,
  onUnlockSkin,
  onClose,
}) => {
  return (
    <div className="absolute inset-0 bg-[#2d2a26]/50 flex items-center justify-center p-4 z-30 select-none">
      <div className="bg-[#fffef9] border-3 border-[#2d2a26] rounded-2xl shadow-[6px_6px_0px_#2d2a26] p-5 max-w-md w-full max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b-2 border-[#e2e8f0]">
          <div className="flex items-center gap-2">
            <Plane className="text-[#16a34a]" size={26} />
            <div>
              <h2 className="font-title text-3xl font-extrabold text-[#1e293b] leading-none">
                Origami Hangar
              </h2>
              <span className="font-sketch text-xs font-bold text-[#64748b]">
                Customize your folded glider
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-[#fffef9] border border-[#2d2a26] px-2.5 py-1 rounded-full text-xs font-sketch font-bold text-[#2d2a26] shadow-xs">
              <span>📎</span> {paperclips}
            </div>
            <button
              onClick={onClose}
              aria-label="Close hangar"
              className="w-8 h-8 flex items-center justify-center bg-[#f1f5f9] hover:bg-[#e2e8f0] border-2 border-[#2d2a26] rounded-full active:translate-x-0.5 active:translate-y-0.5 cursor-pointer text-[#2d2a26]"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Skins Grid */}
        <div className="flex-1 overflow-y-auto py-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {DEFAULT_SKINS.map((skin) => {
            const isUnlocked = unlockedSkins.includes(skin.id);
            const isSelected = selectedSkinId === skin.id;
            const canAfford = paperclips >= skin.costInClips;

            return (
              <div
                key={skin.id}
                className={`bg-[#faf8f0] border-2 border-[#2d2a26] rounded-xl p-3 flex flex-col justify-between shadow-[2px_2px_0px_#2d2a26] transition-transform ${
                  isSelected ? 'ring-2 ring-[#eab308] bg-[#fefce8]' : ''
                }`}
              >
                <div>
                  {/* Miniature Plane Preview */}
                  <div
                    className="w-full h-20 rounded-lg flex items-center justify-center mb-2 border border-[#cbd5e1] overflow-hidden"
                    style={{ backgroundColor: '#f1f5f9' }}
                  >
                    <svg width="60" height="40" viewBox="0 0 60 40" fill="none" className="drop-shadow-sm">
                      <path d="M55 20 L5 5 L20 20 Z" fill={skin.primaryColor} stroke="#2d2a26" strokeWidth="1.5" />
                      <path d="M55 20 L5 35 L20 20 Z" fill={skin.foldColor} stroke="#2d2a26" strokeWidth="1.5" />
                      <line x1="55" y1="20" x2="16" y2="20" stroke="#2d2a26" strokeWidth="1.5" />
                    </svg>
                  </div>

                  <h3 className="font-sketch text-base font-bold text-[#1e293b] leading-tight">
                    {skin.name}
                  </h3>
                  <p className="font-sketch text-xs text-[#64748b] leading-snug line-clamp-2 mt-0.5">
                    {skin.description}
                  </p>
                  {/* Aerodynamic Stat Indicators */}
                  <div className="flex items-center gap-2 mt-2 font-sketch text-[11px] font-bold text-[#475569]">
                    <span className="bg-white/80 border border-[#cbd5e1] px-1.5 py-0.5 rounded">
                      ⚡ Speed {getGliderStats(skin.id).horizontalSpeed}
                    </span>
                    <span className="bg-white/80 border border-[#cbd5e1] px-1.5 py-0.5 rounded">
                      🪂 Fall {getGliderStats(skin.id).maxFallSpeed}
                    </span>
                  </div>
                </div>

                <div className="mt-3">
                  {isSelected ? (
                    <div className="w-full py-1.5 bg-[#10b981] text-white font-sketch text-xs font-bold rounded-lg flex items-center justify-center gap-1 border border-[#2d2a26]">
                      <Check size={14} /> Equipped
                    </div>
                  ) : isUnlocked ? (
                    <button
                      onClick={() => onSelectSkin(skin.id)}
                      className="w-full py-1.5 bg-white hover:bg-slate-50 text-[#1e293b] font-sketch text-xs font-bold rounded-lg border border-[#2d2a26] shadow-[1px_1px_0px_#2d2a26] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
                    >
                      Equip Glider
                    </button>
                  ) : (
                    <button
                      onClick={() => onUnlockSkin(skin)}
                      disabled={!canAfford}
                      className={`w-full py-1.5 font-sketch text-xs font-bold rounded-lg border border-[#2d2a26] flex items-center justify-center gap-1 ${
                        canAfford
                          ? 'bg-[#fde047] hover:bg-[#facc15] text-[#1e293b] shadow-[1px_1px_0px_#2d2a26] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer'
                          : 'bg-[#e2e8f0] text-[#94a3b8] cursor-not-allowed'
                      }`}
                    >
                      <Lock size={12} /> Unlock (📎 {skin.costInClips})
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer info */}
        <div className="pt-2 border-t-2 border-[#e2e8f0] text-center">
          <p className="font-sketch text-xs font-bold text-[#64748b]">
            Collect paperclips in flights or complete daily tasks to craft new aerodynamic folds.
          </p>
        </div>
      </div>
    </div>
  );
};
