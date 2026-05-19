import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Ship, Anchor, Swords, ShieldCheck, AlertCircle } from 'lucide-react';

interface LobbyProps {
  onCreate: (roomName: string, playerName: string) => void;
  onJoin: (roomId: string, playerName: string) => void;
  error?: string | null;
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}

export const Lobby: React.FC<LobbyProps> = ({ onCreate, onJoin, error }) => {
  const [playerName, setPlayerName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [mode, setMode] = useState<'create' | 'join' | null>(null);

  const isNameInvalid = playerName.length > 0 && (playerName.length < 3 || playerName.length > 15);

  const handleSubmit = () => {
    if (isNameInvalid) return;
    if (mode === 'create') onCreate(roomName, playerName);
    else onJoin(roomId, playerName);
  };

  return (
    <div className="flex flex-col items-center justify-center p-8 space-y-8 max-w-md mx-auto min-h-[60vh]">
      <motion.div 
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="text-center space-y-2"
      >
        <div className="flex justify-center mb-4">
          <Ship size={64} className="text-blue-400" />
        </div>
        <h1 className="text-5xl font-black italic tracking-tighter text-white uppercase transform -skew-x-12">
          SHIP WAR
        </h1>
        <p className="text-blue-300/80 font-mono text-sm tracking-widest uppercase py-2 border-y border-blue-500/20">
          Multiplayer naval combat
        </p>
      </motion.div>

      {error && (
        <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-2 rounded-lg text-sm w-full text-center">
          {error}
        </div>
      )}

      {!mode ? (
        <div className="grid grid-cols-2 gap-4 w-full">
          <button
            id="btn-mode-create"
            onClick={() => setMode('create')}
            className="flex flex-col items-center justify-center p-6 bg-blue-600 hover:bg-blue-500 border-2 border-blue-400/50 rounded-xl transition-all group"
          >
            <Anchor className="text-white mb-2 group-hover:rotate-12 transition-transform" />
            <span className="text-white font-bold uppercase text-xs tracking-widest">Create Room</span>
          </button>
          <button
            id="btn-mode-join"
            onClick={() => setMode('join')}
            className="flex flex-col items-center justify-center p-6 bg-slate-800 hover:bg-slate-700 border-2 border-slate-600 rounded-xl transition-all group"
          >
            <Swords className="text-white mb-2 group-hover:scale-110 transition-transform" />
            <span className="text-white font-bold uppercase text-xs tracking-widest">Join Game</span>
          </button>
        </div>
      ) : (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full space-y-4 bg-slate-900/50 p-6 rounded-2xl border border-white/10 backdrop-blur-xl"
        >
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-bold text-blue-300 uppercase tracking-widest block">Admiral Callsign</label>
                <span className={cn(
                  "text-[10px] font-mono",
                  playerName.length > 15 ? "text-red-500" : "text-white/40"
                )}>
                  {playerName.length}/15
                </span>
              </div>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Ex: NIMITZ_01"
                className={cn(
                  "w-full bg-slate-800 border-2 rounded-lg px-4 py-3 text-white focus:outline-none transition-all duration-300 font-mono tracking-widest",
                  isNameInvalid ? "border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)] animate-pulse" : "border-white/5 focus:border-blue-500"
                )}
                id="input-player-name"
              />
              <AnimatePresence>
                {isNameInvalid && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-1 mt-2 text-red-400 text-[9px] font-black uppercase tracking-tighter"
                  >
                    <AlertCircle size={10} />
                    <span>Protocol Error: Callsign must be 3-15 characters</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {mode === 'create' ? (
              <div>
                <label className="text-xs font-bold text-blue-300 uppercase tracking-widest mb-1 block">Fleet Name</label>
                <input
                  type="text"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="Task Force Alpha..."
                  className="w-full bg-slate-800 border-2 border-white/5 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors"
                  id="input-room-name"
                />
              </div>
            ) : (
              <div>
                <label className="text-xs font-bold text-blue-300 uppercase tracking-widest mb-1 block">Game Code</label>
                <input
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                  placeholder="XXXXXX"
                  className="w-full bg-slate-800 border-2 border-white/5 rounded-lg px-4 py-3 text-white text-center font-mono tracking-[0.5em] focus:outline-none focus:border-blue-500 transition-colors"
                  id="input-room-id"
                />
              </div>
            )}

            <div className="flex gap-2">
               <button
                onClick={() => setMode(null)}
                className="flex-1 px-4 py-3 border-2 border-white/10 text-white/50 rounded-lg hover:bg-white/5 transition-colors uppercase text-xs font-bold tracking-widest"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={!playerName || isNameInvalid || (mode === 'create' && !roomName) || (mode === 'join' && !roomId)}
                className="flex-[2] bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-500 transition-all font-bold uppercase text-xs tracking-[0.2em] shadow-lg shadow-blue-500/20 disabled:opacity-50"
                id="btn-submit"
              >
                {mode === 'create' ? 'Launch Fleet' : 'Engage Enemy'}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};
