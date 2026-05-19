import React, { useState, useEffect } from 'react';
import { useSocket } from './hooks/useSocket';
import { Lobby } from './components/Lobby';
import { Board } from './components/Board';
import { Room, Ship, GRID_SIZE, SHIP_TYPES, Position, Player } from './types';
import { motion, AnimatePresence } from 'motion/react';
import { Copy, Users, Play, Target, RotateCw, Trophy, AlertTriangle, Shield, Sword, ShieldCheck, Info, LogOut, X } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const SOUND_URLS = {
  place: 'https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3',
  fire: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3',
  hit: 'https://assets.mixkit.co/active_storage/sfx/2570/2570-preview.mp3',
  miss: 'https://assets.mixkit.co/active_storage/sfx/2569/2569-preview.mp3',
  sunk: 'https://assets.mixkit.co/active_storage/sfx/2567/2567-preview.mp3',
};

function playSound(type: keyof typeof SOUND_URLS, enabled: boolean) {
  if (!enabled) return;
  const audio = new Audio(SOUND_URLS[type]);
  audio.volume = 0.4;
  audio.play().catch(() => {}); // Ignore autoplay blocks
}

export default function App() {
  const { socket, connected } = useSocket();
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [myShips, setMyShips] = useState<Ship[]>([]);
  const [placementOrientation, setPlacementOrientation] = useState<'horizontal' | 'vertical'>('horizontal');
  const [placingShipIndex, setPlacingShipIndex] = useState(0);
  const [hoveredCell, setHoveredCell] = useState<Position | null>(null);
  const [hoveredOpponentCell, setHoveredOpponentCell] = useState<{ x: number, y: number, targetId: string } | null>(null);
  const [hoveredRuleId, setHoveredRuleId] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [exitConfirm, setExitConfirm] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [shake, setShake] = useState(false);
  const [sonarActive, setSonarActive] = useState(false);
  const [sonarCharges, setSonarCharges] = useState(2);
  const [sonarResult, setSonarResult] = useState<{ count: number; x: number; y: number } | null>(null);

  const RULE_DESCRIPTIONS: { [key: string]: string } = {
    'soundEnabled': 'Toggles battle sound effects and tactical communications feedback.',
    'combatIntensity': 'High intensity adds tactical screen shake and enhanced VFX on direct hits.',
    'showShipHealth': 'Displays visual integrity indicators below each commissioned vessel.',
    'salvoMode': 'Experimental: Increases firepower based on remaining active fleet units.',
    'powerUpsEnabled': 'Enables satellite-guided sonar pings once per engagement turn.',
    'aiDifficulty': 'Adjusts the strategic intelligence and targeting accuracy of AI Admirals.'
  };

  // Derived state (safely handled if room is null)
  const myId = socket?.id || '';
  const myData = room?.state.players?.[myId];
  const isSpectator = !!room && !myData;
  const isMyTurn = room?.state.turn === myId;
  const opponentIds = room?.state.players ? Object.keys(room.state.players).filter(id => id !== myId) : [];
  const opponentsData = opponentIds.map(id => room!.state.players[id]);
  const opponentData = opponentsData[0] || null;

  // Track sunk ships to play sound
  const [sunkShipsCount, setSunkShipsCount] = useState(0);

  useEffect(() => {
    if (!room) return;
    
    let currentSunkCount = 0;
    (Object.values(room.state.players) as Player[]).forEach((p: Player) => {
      p.ships.forEach(ship => {
        const isSunk = ship.positions.every(pos => 
          (Object.values(room.state.players) as Player[]).some((p2: Player) => 
            p2.shots.some(s => s.x === pos.x && s.y === pos.y && s.hit && (s.targetId === Object.keys(room.state.players).find(k => room.state.players[k] === p)))
          )
        );
        if (isSunk) currentSunkCount++;
      });
    });

    if (currentSunkCount > sunkShipsCount) {
      playSound('sunk', room.settings.soundEnabled);
    }
    setSunkShipsCount(currentSunkCount);
  }, [room?.state.players]);

  const [prevTotalShots, setPrevTotalShots] = useState(0);

  useEffect(() => {
    if (!room) return;
    const allPlayers = Object.values(room.state.players) as Player[];
    const currentTotalShots = allPlayers.reduce((sum, p: Player) => sum + p.shots.length, 0);

    if (currentTotalShots > prevTotalShots) {
      playSound('fire', room.settings.soundEnabled);
      // Something was fired. Find which player's shot count increased.
      let shooter: Player | null = null;
      // In synchronous turn games, it's usually the one whose turn it was
      // But we can check all to be safe
      allPlayers.forEach((p: Player) => {
        if (p.shots.length > 0) {
          shooter = p; // Heuristic: last player in loop with shots
        }
      });

      if (shooter && shooter.shots.length > 0) {
        const lastShot = shooter.shots[shooter.shots.length - 1];
        if (lastShot.hit) {
          playSound('hit', room.settings.soundEnabled);
          if (room.settings.combatIntensity === 'high') {
            setShake(true);
            setTimeout(() => setShake(false), 500);
          }
        } else {
          playSound('miss', room.settings.soundEnabled);
        }
      }
    }
    setPrevTotalShots(currentTotalShots);
  }, [room?.state.players, room?.settings.combatIntensity]);

  // Turn start sound
  useEffect(() => {
    if (isMyTurn && room?.state.status === 'playing') {
      playSound('fire', room.settings.soundEnabled);
    }
  }, [room?.state.turn]);

  useEffect(() => {
    if (room?.state.status === 'playing' && room.state.turnStartedAt && room.settings.turnTimeLimit > 0) {
      const interval = setInterval(() => {
        const elapsed = (Date.now() - room.state.turnStartedAt!) / 1000;
        const remaining = Math.max(0, Math.ceil(room.settings.turnTimeLimit - elapsed));
        setTimeLeft(remaining);
      }, 100);
      return () => clearInterval(interval);
    } else {
      setTimeLeft(null);
    }
  }, [room?.state.status, room?.state.turn, room?.state.turnStartedAt, room?.settings.turnTimeLimit]);

  useEffect(() => {
    if (!socket) return;

    socket.on('room-updated', (updatedRoom: Room) => {
      // If status changed from 'finished' to 'lobby', reset local state
      if (room?.state.status === 'finished' && updatedRoom.state.status === 'lobby') {
        setMyShips([]);
        setPlacingShipIndex(0);
      }
      setRoom(updatedRoom);
      setError(null);
    });

    socket.on('error-msg', (msg: string) => {
      setError(msg);
    });

    socket.on('room-created', ({ roomId }: { roomId: string }) => {
      // Room will be updated via 'room-updated'
    });
  }, [socket]);

  const getPreviewPositions = (x: number, y: number): Position[] => {
    if (placingShipIndex >= SHIP_TYPES.length) return [];
    const length = SHIP_TYPES[placingShipIndex].length;
    const positions: Position[] = [];
    for (let i = 0; i < length; i++) {
      const posX = placementOrientation === 'horizontal' ? x + i : x;
      const posY = placementOrientation === 'vertical' ? y + i : y;
      positions.push({ x: posX, y: posY });
    }
    return positions;
  };

  const isPlacementValid = (positions: Position[]): boolean => {
    const currentGridSize = room?.settings.gridSize || 10;
    return positions.every(pos => 
      pos.x >= 0 && pos.x < currentGridSize && 
      pos.y >= 0 && pos.y < currentGridSize &&
      !myShips.some(s => s.positions.some(p => p.x === pos.x && p.y === pos.y))
    );
  };

  const handleCreateRoom = (roomName: string, playerName: string) => {
    socket?.emit('create-room', { roomName, playerName });
  };

  const handleJoinRoom = (roomId: string, playerName: string) => {
    socket?.emit('join-room', { roomId, playerName });
  };

  const handleCellClick = (x: number, y: number, targetId?: string) => {
    if (!room || isSpectator) return;

    if (room.state.status === 'placing') {
      if (placingShipIndex >= SHIP_TYPES.length) return;

      const positions = getPreviewPositions(x, y);
      if (!isPlacementValid(positions)) return;

      const newShip: Ship = {
        id: `ship-${placingShipIndex}`,
        name: SHIP_TYPES[placingShipIndex].name,
        length: SHIP_TYPES[placingShipIndex].length,
        positions,
        placed: true,
        orientation: placementOrientation,
      };

      const updatedShips = [...myShips, newShip];
      setMyShips(updatedShips);
      setPlacingShipIndex(placingShipIndex + 1);
      playSound('place', room.settings.soundEnabled);

      if (placingShipIndex + 1 === SHIP_TYPES.length) {
        socket?.emit('place-ships', { roomId: room.id, ships: updatedShips });
      }
    } else if (room.state.status === 'playing' && room.state.turn === socket?.id) {
       if (sonarActive) {
         const tid = targetId || Object.keys(room.state.players).find(id => id !== socket?.id);
         if (!tid) return;
         const target = room.state.players[tid];
         let count = 0;
         for (let dx = -1; dx <= 1; dx++) {
           for (let dy = -1; dy <= 1; dy++) {
             const px = x + dx;
             const py = y + dy;
             if (px >= 0 && px < (room.settings.gridSize || 10) && py >= 0 && py < (room.settings.gridSize || 10)) {
               if (target.ships.some(s => s.positions.some(p => p.x === px && p.y === py))) {
                 count++;
               }
             }
           }
         }
         setSonarResult({ count, x, y });
         setSonarActive(false);
         setSonarCharges(prev => prev - 1);
         playSound('fire', room.settings.soundEnabled);
         setTimeout(() => setSonarResult(null), 3000);
         return;
       }
       // In 4 player mode, we need targetId
       const opponentId = targetId || Object.keys(room.state.players).find(id => id !== socket?.id);
       socket?.emit('fire-shot', { roomId: room.id, x, y, targetId: opponentId });
    }
  };

  const handleRandomizeShips = () => {
    const newShips: Ship[] = [];
    const usedPositions = new Set<string>();

    const currentGridSize = room?.settings.gridSize || 10;
    SHIP_TYPES.forEach((type, idx) => {
      let placed = false;
      while (!placed) {
        const orientation = Math.random() > 0.5 ? 'horizontal' : 'vertical';
        const x = Math.floor(Math.random() * (orientation === 'horizontal' ? currentGridSize - type.length : currentGridSize));
        const y = Math.floor(Math.random() * (orientation === 'vertical' ? currentGridSize - type.length : currentGridSize));
        
        const positions: Position[] = [];
        let collision = false;
        for (let i = 0; i < type.length; i++) {
          const px = orientation === 'horizontal' ? x + i : x;
          const py = orientation === 'vertical' ? y + i : y;
          const posKey = `${px},${py}`;
          if (usedPositions.has(posKey)) {
            collision = true;
            break;
          }
          positions.push({ x: px, y: py });
        }

        if (!collision) {
          positions.forEach(p => usedPositions.add(`${p.x},${p.y}`));
          newShips.push({
            id: `ship-${idx}`,
            name: type.name,
            length: type.length,
            positions,
            placed: true,
            orientation,
          });
          placed = true;
        }
      }
    });

    setMyShips(newShips);
    setPlacingShipIndex(SHIP_TYPES.length);
    playSound('place', room.settings.soundEnabled);
    socket?.emit('place-ships', { roomId: room.id, ships: newShips });
  };

  const previewPositions = hoveredCell ? getPreviewPositions(hoveredCell.x, hoveredCell.y) : [];
  const previewStatus = isPlacementValid(previewPositions) ? 'valid' : 'invalid';

  const handleStartPlacing = () => {
    socket?.emit('start-placing', { roomId: room?.id });
  };

  const handleAddAi = () => {
    socket?.emit('add-ai', { roomId: room?.id });
  };

  const copyCode = () => {
    if (room?.id) {
      navigator.clipboard.writeText(room.id);
    }
  };

  const handleLeaveRoom = () => {
    if (socket) {
      socket.emit('leave-room');
    }
    setRoom(null);
    setMyShips([]);
    setPlacingShipIndex(0);
    setError(null);
    setExitConfirm(false);
  };

  const handleUpdateSettings = (newSettings: any) => {
    if (room && socket) {
      socket.emit('update-settings', { roomId: room.id, settings: newSettings });
    }
  };

  const handlePowerUp = (type: string, targetId: string) => {
    if (!room || isSpectator || !isMyTurn) return;
    // For now, let's just emit an event, or implement locally for simpler logic
    // AI ships are known to server, so powerups might need server support.
    // Let's call it 'Recon Scan' and keep it simple.
  };

  if (!connected) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-blue-400 animate-pulse font-mono tracking-widest uppercase">
          Initializing Satellite Link...
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen bg-slate-950 text-white selection:bg-blue-500/30">
        <Lobby onCreate={handleCreateRoom} onJoin={handleJoinRoom} error={error} />
      </div>
    );
  }

  return (
    <div className={cn(
      "min-h-screen transition-colors duration-700",
      room.settings.theme === 'radar' ? "bg-black" : 
      room.settings.theme === 'classic' ? "bg-[#1e293b]" : 
      room.settings.theme === 'neon-horizon' ? "bg-[#0f172a]" :
      room.settings.theme === 'arctic-tundra' ? "bg-[#f8fafc]" :
      room.settings.theme === 'volcanic-depths' ? "bg-[#0c0a09]" :
      "bg-slate-950"
    )}>
      <motion.div 
        animate={shake ? { x: [0, -5, 5, -5, 5, 0], y: [0, 5, -5, 5, -5, 0] } : {}}
        transition={{ duration: 0.4 }}
        className="min-h-screen text-white p-4 sm:p-8 font-sans selection:bg-blue-500/30"
      >
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Rules Manual (Embedded in settings) */}
        <div className="hidden">
           {/* Rapid mode: Each direct hit grants an extra strategic turn. Keep firing as long as you hit. */}
        </div>

        {/* Settings Drawer (Redesigned) */}
        <AnimatePresence>
          {showSettings && (
            <>
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowSettings(false)}
                className="fixed inset-0 z-[60] bg-slate-950/40 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                className="fixed top-0 right-0 bottom-0 z-[70] w-full max-w-sm bg-slate-900 border-l border-white/10 shadow-2xl flex flex-col"
              >
                <div className="p-6 border-b border-white/10 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                      <RotateCw size={24} />
                    </div>
                    <div>
                      <h2 className="text-xl font-black uppercase tracking-tighter italic">Battle Config</h2>
                      <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest">Adjust Fleet Parameters</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowSettings(false)}
                    className="p-2 hover:bg-white/5 rounded-xl transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
                  <section className="space-y-3">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400 flex items-center gap-2">
                       <Shield size={12} /> Grid Scale
                    </h3>
                    <div className="grid grid-cols-3 gap-1">
                       {[8, 10, 12, 15, 18, 20, 22, 25].map(v => (
                         <button
                           key={v}
                           onClick={() => handleUpdateSettings({ ...room.settings, gridSize: v })}
                           className={cn(
                             "py-2 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all",
                             room.settings.gridSize === v ? "bg-blue-600 border-blue-400 text-white shadow-lg" : "bg-white/5 border-white/10 text-white/40"
                           )}
                         >
                           {v}x{v}
                         </button>
                       ))}
                    </div>
                  </section>

                  <section className="space-y-3">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400 flex items-center gap-2">
                      <Target size={12} /> Mission Clock
                    </h3>
                    <div className="grid grid-cols-4 gap-1">
                       {[15, 30, 60, 0].map(v => (
                         <button
                          key={v}
                          onClick={() => handleUpdateSettings({ ...room.settings, turnTimeLimit: v })}
                          className={cn(
                            "py-2 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all",
                            room.settings.turnTimeLimit === v ? "bg-blue-600 border-blue-400 text-white shadow-lg" : "bg-white/5 border-white/10 text-white/40"
                          )}
                         >
                           {v === 0 ? 'INF' : `${v}S`}
                         </button>
                       ))}
                    </div>
                  </section>

                  <section className="space-y-3">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400 flex items-center gap-2">
                       <Target size={12} /> Tactical AI Intellect
                    </h3>
                    <div className="grid grid-cols-3 gap-1">
                       {['easy', 'medium', 'hard'].map(v => (
                         <button
                           key={v}
                           onClick={() => handleUpdateSettings({ ...room.settings, aiDifficulty: v })}
                           className={cn(
                             "py-2 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all",
                             room.settings.aiDifficulty === v ? "bg-blue-600 border-blue-400 text-white shadow-lg" : "bg-white/5 border-white/10 text-white/40"
                           )}
                           onMouseEnter={() => setHoveredRuleId('aiDifficulty')}
                           onMouseLeave={() => setHoveredRuleId(null)}
                         >
                           {v}
                         </button>
                       ))}
                    </div>
                  </section>

                  <section className="space-y-3">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400">Warfare Rules</h3>
                    <div className="grid grid-cols-1 gap-2">
                      {[ 
                        { id: 'soundEnabled', label: 'Audio Interface', icon: <RotateCw size={14} /> },
                        { id: 'combatIntensity', label: 'Combat Impact', icon: <AlertTriangle size={14} />, type: 'toggle-intensity' },
                        { id: 'showShipHealth', label: 'Integrity Bars', icon: <Shield size={14} /> },
                        { id: 'salvoMode', label: 'Salvo Tactics', icon: <Target size={14} /> },
                        { id: 'powerUpsEnabled', label: 'Recon Support', icon: <Info size={14} /> }
                      ].map(item => (
                        <div 
                          key={item.id} 
                          className="flex flex-col gap-2 p-3 bg-white/5 rounded-xl border border-white/10"
                          onMouseEnter={() => setHoveredRuleId(item.id)}
                          onMouseLeave={() => setHoveredRuleId(null)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                                {item.icon}
                              </div>
                              <p className="text-[10px] font-black uppercase tracking-widest leading-none">{item.label}</p>
                            </div>
                            <button 
                              onClick={() => {
                                if (item.type === 'toggle-intensity') {
                                  handleUpdateSettings({ ...room.settings, combatIntensity: room.settings.combatIntensity === 'low' ? 'high' : 'low' });
                                } else {
                                  handleUpdateSettings({ ...room.settings, [item.id]: !room.settings[item.id as keyof typeof room.settings] });
                                }
                              }}
                              className={cn(
                                "w-8 h-4 rounded-full transition-all relative",
                                (item.id === 'combatIntensity' ? room.settings.combatIntensity === 'high' : room.settings[item.id as keyof typeof room.settings]) ? "bg-blue-600" : "bg-slate-700"
                              )}
                            >
                              <div className={cn(
                                "absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all",
                                (item.id === 'combatIntensity' ? room.settings.combatIntensity === 'high' : room.settings[item.id as keyof typeof room.settings]) ? "right-1" : "left-1"
                              )} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Dynamic Rule Descriptions */}
                  <AnimatePresence>
                    {hoveredRuleId && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl"
                      >
                        <p className="text-[9px] font-medium text-blue-300 leading-relaxed uppercase tracking-wider italic">
                          {RULE_DESCRIPTIONS[hoveredRuleId]}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <section className="space-y-3">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400">Atmosphere</h3>
                    <div className="grid grid-cols-2 gap-2">
                       {['deep-sea', 'radar', 'classic', 'neon-horizon', 'arctic-tundra', 'volcanic-depths'].map(t => (
                         <button 
                          key={t}
                          onClick={() => handleUpdateSettings({ ...room.settings, theme: t })}
                          className={cn(
                            "py-3 rounded-xl border text-[8px] font-black uppercase tracking-tighter transition-all text-center",
                            room.settings.theme === t ? "bg-blue-600 border-blue-400 text-white" : "bg-white/5 border-white/10 text-white/30"
                          )}
                         >
                           {t.replace('-', ' ')}
                         </button>
                       ))}
                    </div>
                  </section>

                  <section className="space-y-3">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400">Fleet Capacity</h3>
                    <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
                      {[2, 4].map(n => (
                        <button
                          key={n}
                          onClick={() => handleUpdateSettings({ ...room.settings, maxPlayers: n })}
                          className={cn(
                            "flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all",
                            room.settings.maxPlayers === n ? "bg-blue-600 text-white" : "text-white/20 hover:text-white"
                          )}
                        >
                          {n} ADMIRALS
                        </button>
                      ))}
                    </div>
                  </section>
                </div>

                <div className="p-6 bg-slate-950/50 border-t border-white/10">
                   <button 
                    onClick={() => setShowSettings(false)}
                    className="w-full bg-blue-600 hover:bg-blue-500 py-4 rounded-2xl font-black uppercase tracking-widest transition-all shadow-xl shadow-blue-500/20"
                  >
                    Apply Protocols
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Rules Modal */}
        <AnimatePresence>
          {showRules && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md"
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="bg-slate-900 border border-white/10 rounded-3xl p-8 max-w-lg w-full relative overflow-hidden"
              >
                <button 
                  onClick={() => setShowRules(false)}
                  className="absolute top-4 right-4 p-2 hover:bg-white/5 rounded-full text-white/40"
                >
                  <X />
                </button>
                  <div className="space-y-6">
                    <div className="flex items-center gap-3 text-blue-400">
                      <Target size={32} />
                      <h2 className="text-2xl font-black uppercase tracking-tighter italic">Mission Briefing</h2>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="p-4 bg-white/5 border border-white/10 rounded-2xl space-y-3">
                         <div className="flex items-center gap-2 text-blue-300">
                            <Shield size={16} />
                            <h4 className="text-xs font-black uppercase tracking-widest">I. Tactical Deployment</h4>
                         </div>
                         <p className="text-[11px] text-white/60 leading-relaxed uppercase font-medium">
                            Position your 5-vessel fleet on the tactical grid. Vessels must remain within engagement boundaries and cannot overlap. Once deployment is locked, vessels remain stationary for the duration of the skirmish.
                         </p>
                      </div>

                      <div className="p-4 bg-white/5 border border-white/10 rounded-2xl space-y-3">
                         <div className="flex items-center gap-2 text-orange-400">
                            <Sword size={16} />
                            <h4 className="text-xs font-black uppercase tracking-widest">II. Combat Engagement</h4>
                         </div>
                         <div className="grid grid-cols-2 gap-3">
                            <div className="p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                               <p className="text-[9px] font-black text-red-400 uppercase mb-1">Direct Impact</p>
                               <p className="text-[8px] text-white/40 uppercase">Hull breach confirmed. Vessel integrity reduced.</p>
                            </div>
                            <div className="p-2 bg-slate-500/10 border border-slate-500/20 rounded-lg">
                               <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Evasive/Miss</p>
                               <p className="text-[8px] text-white/40 uppercase">No impact recorded. Rounds landed in deep sea.</p>
                            </div>
                         </div>
                      </div>

                      <div className="p-4 bg-white/5 border border-white/10 rounded-2xl space-y-3">
                         <div className="flex items-center gap-2 text-green-400">
                            <Trophy size={16} />
                            <h4 className="text-xs font-black uppercase tracking-widest">III. Objective: Victory</h4>
                         </div>
                         <p className="text-[11px] text-white/60 leading-relaxed uppercase font-medium">
                            Total fleet eradication is required for mission completion. The first Admiral to record 17 successful impacts wins the skirmish.
                         </p>
                      </div>
                    </div>

                    <button 
                      onClick={() => setShowRules(false)}
                      className="w-full bg-blue-600 hover:bg-blue-500 py-4 rounded-xl font-bold uppercase tracking-widest transition-all shadow-lg shadow-blue-500/20 border-b-4 border-blue-800 active:border-b-0 active:translate-y-1"
                    >
                      Acknowledge Orders
                    </button>
                  </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Header Stats */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 border-b border-white/10 pb-6">
          <div className="space-y-1">
             <div className="flex items-center gap-2 text-blue-400 text-xs font-bold tracking-[0.2em] uppercase">
               <Shield size={14} />
               <span>Command Center</span>
             </div>
             <h2 className="text-3xl font-black tracking-tighter uppercase italic">{room.name}</h2>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setShowRules(true)}
                className="p-2 hover:bg-white/5 rounded-full transition-colors text-white/40 hover:text-blue-400"
                title="Intelligence Report"
              >
                <Info size={20} />
              </button>
              {room.hostId === myId && room.state.status === 'lobby' && (
                <button 
                  onClick={() => setShowSettings(true)}
                  className="p-2 hover:bg-white/5 rounded-full transition-colors text-white/40 hover:text-blue-400"
                  title="Ship Systems / Settings"
                >
                  <RotateCw size={20} />
                </button>
              )}
              <div className="relative">
                <button 
                  onClick={() => setExitConfirm(!exitConfirm)}
                  className={cn(
                    "p-2 rounded-full transition-colors",
                    exitConfirm ? "bg-red-500 text-white" : "hover:bg-red-500/10 text-white/40 hover:text-red-500"
                  )}
                  title="Retreat from Battle"
                >
                  <LogOut size={20} />
                </button>
                <AnimatePresence>
                  {exitConfirm && (
                    <motion.div 
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="absolute right-full mr-2 top-0 bg-red-600 px-4 py-2 rounded-lg flex items-center gap-4 shadow-xl z-50 whitespace-nowrap"
                    >
                      <span className="text-xs font-black uppercase italic">Abandon Fleet?</span>
                      <div className="flex gap-2">
                         <button onClick={handleLeaveRoom} className="bg-white text-red-600 px-2 py-1 rounded text-[10px] font-black uppercase">Yes</button>
                         <button onClick={() => setExitConfirm(false)} className="bg-red-800 text-white px-2 py-1 rounded text-[10px] font-black uppercase">No</button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="h-6 w-[1px] bg-white/10 mx-2" />

            <div className="flex flex-col items-center">
               <span className="text-[10px] text-white/40 uppercase font-bold tracking-widest">Game Code</span>
               <div 
                onClick={copyCode}
                className="flex items-center gap-2 bg-white/5 px-4 py-2 border border-white/10 rounded-lg cursor-pointer hover:bg-white/10 transition-colors"
               >
                 <span className="font-mono text-lg font-bold tracking-[0.3em]">{room.id}</span>
                 <Copy size={14} className="text-blue-400" />
               </div>
            </div>
            
            <div className="h-10 w-[1px] bg-white/10 mx-2" />

            <div className="space-y-1">
               <div className="flex items-center gap-2 text-white/40 text-[10px] font-bold tracking-widest uppercase">
                 <Users size={14} />
                 <span>Fleet Status</span>
               </div>
               <div className="flex -space-x-2">
                 <div className="w-8 h-8 rounded-full bg-blue-600 border-2 border-slate-950 flex items-center justify-center text-xs font-bold">
                   {myData?.name[0] || '?'}
                 </div>
                 {opponentData ? (
                   <div className="w-8 h-8 rounded-full bg-red-600 border-2 border-slate-950 flex items-center justify-center text-xs font-bold">
                     {opponentData.name[0]}
                   </div>
                 ) : (
                   <div className="w-8 h-8 rounded-full bg-slate-800 border-2 border-slate-950 flex items-center justify-center text-xs animate-pulse">
                     ?
                   </div>
                 )}
                 {Object.keys(room.state.spectators || {}).length > 0 && (
                   <div className="ml-2 flex items-center gap-1 bg-white/5 px-2 py-1 rounded-full border border-white/10 text-[8px] font-black uppercase text-white/40">
                     <Users size={10} />
                     {Object.keys(room.state.spectators).length} Watching
                   </div>
                 )}
               </div>
            </div>
          </div>
        </div>

        {/* Game Area */}
        <AnimatePresence mode="wait">
          {room.state.status === 'lobby' && (
            <motion.div 
              key="lobby"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              className="grid lg:grid-cols-2 gap-8 bg-slate-900/50 rounded-3xl border border-white/5 backdrop-blur-sm p-8"
            >
              <div className="flex flex-col items-center justify-center space-y-6 py-12 border-b lg:border-b-0 lg:border-r border-white/5">
                <div className="text-center space-y-4">
                  <Target size={48} className="mx-auto text-blue-500 animate-spin-slow" />
                  <h3 className="text-2xl font-bold uppercase tracking-widest leading-none">Command Manifest</h3>
                  <div className="flex flex-col gap-2 w-full max-w-xs mx-auto mt-6">
                    {Object.keys(room.state.players).map((pid) => {
                      const p = room.state.players[pid];
                      const isHost = pid === room.hostId;
                      return (
                        <div key={pid} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
                              isHost ? "bg-blue-600" : "bg-slate-700"
                            )}>
                              {p.name[0]}
                            </div>
                            <div className="text-left">
                              <p className="text-xs font-black uppercase tracking-widest">{p.name} {pid === myId && "(You)"}</p>
                              <p className="text-[8px] font-bold text-blue-500/60 uppercase tracking-widest">{isHost ? "Admiral / Host" : "Captain / Officer"}</p>
                            </div>
                          </div>
                          {p.ready && <Shield size={12} className="text-green-500" />}
                        </div>
                      );
                    })}
                    {Array.from({ length: room.settings.maxPlayers - Object.keys(room.state.players).length }).map((_, i) => (
                      <div key={i} className="p-3 border border-dashed border-white/10 rounded-xl text-center">
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/5 italic">Waiting for connection...</p>
                      </div>
                    ))}
                  </div>
                </div>

                {opponentData && myId === room.hostId && (
                   <div className="flex flex-col gap-4 w-full max-w-xs">
                     <button
                      onClick={handleStartPlacing}
                      className="w-full bg-blue-600 hover:bg-blue-500 text-white px-12 py-4 rounded-full font-black uppercase text-sm tracking-[0.3em] shadow-xl shadow-blue-500/20 ring-4 ring-blue-500/10 flex items-center justify-center gap-3 group transition-all"
                      id="btn-start"
                    >
                      <Play size={18} fill="currentColor" />
                      Initiate Battle
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                       <button
                        onClick={() => setShowSettings(true)}
                        className="bg-white/5 border border-white/10 hover:bg-white/10 text-white p-3 rounded-xl font-bold uppercase text-[9px] tracking-[0.2em] transition-all flex items-center justify-center gap-2"
                      >
                        <RotateCw size={12} />
                        Settings
                      </button>
                      {Object.keys(room.state.players).length < room.settings.maxPlayers && (
                        <button
                          onClick={handleAddAi}
                          className="bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 text-blue-400 p-3 rounded-xl font-bold uppercase text-[9px] tracking-[0.2em] transition-all flex items-center justify-center gap-2"
                        >
                          <Target size={12} />
                          Add AI
                        </button>
                      )}
                    </div>
                   </div>
                )}

                {opponentData && myId !== room.hostId && (
                  <div className="flex items-center gap-3 px-6 py-3 bg-white/5 rounded-full border border-white/10 italic text-white/40 text-sm">
                    <AlertTriangle size={14} className="text-yellow-500/50" />
                    Waiting for Host to Launch...
                  </div>
                )}
              </div>

              <div className="space-y-6 py-8 px-4">
                 <div className="flex items-center gap-3 text-blue-400">
                    <RotateCw size={24} />
                    <h4 className="font-bold uppercase tracking-[0.2em]">Mission Parameters</h4>
                 </div>
                 
                 <div className="grid gap-4">
                    <div className="bg-white/5 p-4 rounded-xl border border-white/10 flex justify-between items-center">
                       <div>
                          <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Grid Scale</p>
                          <p className="text-lg font-black italic">{room.settings.gridSize} X {room.settings.gridSize}</p>
                       </div>
                       <Shield className="text-white/10" size={32} />
                    </div>

                    <div className="bg-white/5 p-4 rounded-xl border border-white/10 flex justify-between items-center">
                       <div>
                          <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Player Limit</p>
                          <p className="text-lg font-black italic">{room.settings.maxPlayers} Admirals</p>
                       </div>
                       <Users className="text-white/10" size={32} />
                    </div>

                    <div className="bg-white/5 p-4 rounded-xl border border-white/10 flex justify-between items-center">
                       <div>
                          <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Turn Duration</p>
                          <p className="text-lg font-black italic">{room.settings.turnTimeLimit === 0 ? "Unlimited" : `${room.settings.turnTimeLimit} Combat Seconds`}</p>
                       </div>
                       <Target className="text-white/10" size={32} />
                    </div>

                    <div className="bg-blue-500/5 p-4 rounded-xl border border-blue-500/10">
                       <p className="text-[10px] font-bold text-blue-400/50 uppercase tracking-widest mb-1">Battle Protocol</p>
                       <div className="flex justify-between items-center pr-2">
                         <div className="space-y-1">
                            <p className="text-[9px] text-blue-300/40 uppercase font-black">Mode: <span className="text-blue-400">{room.settings.gameMode}</span></p>
                            <p className="text-[9px] text-blue-300/40 uppercase font-black">Salvo: <span className="text-blue-400">{room.settings.salvoMode ? "ENABLED" : "DISABLED"}</span></p>
                         </div>
                         <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                            <Target size={20} className="text-blue-500/40" />
                         </div>
                       </div>
                    </div>
                 </div>
              </div>
            </motion.div>
          )}

          {room.state.status === 'placing' && (
            <motion.div 
              key="placing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="grid lg:grid-cols-2 gap-12"
            >
              <div className="space-y-6">
                <div className="p-6 bg-blue-900/20 border border-blue-500/30 rounded-2xl space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="font-bold uppercase tracking-widest text-blue-300">Deployment Phase</h3>
                    <div className="flex items-center gap-2 px-3 py-1 bg-blue-500/20 rounded-full text-[10px] font-black uppercase">
                      <AlertTriangle size={12} className="text-yellow-400" />
                      Strategic positioning
                    </div>
                  </div>
                  
                  {placingShipIndex < SHIP_TYPES.length ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                         <div className="space-y-1">
                           <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">
                             Deploying Fleet: {myShips.length + 1} of {SHIP_TYPES.length}
                           </span>
                           <h4 className="text-xl font-black italic uppercase tracking-tight">{SHIP_TYPES[placingShipIndex].name}</h4>
                         </div>
                         <div className="bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20 text-[10px] font-bold text-blue-300">
                           Size: {SHIP_TYPES[placingShipIndex].length} Units
                         </div>
                      </div>
                      
                      <div className="bg-white/5 rounded-xl p-4 border border-white/5 space-y-3">
                        <p className="text-[8px] font-bold text-white/20 uppercase tracking-[0.2em]">Ship Inventory Status</p>
                        <div className="grid grid-cols-5 gap-2">
                           {SHIP_TYPES.map((s, i) => (
                             <div 
                              key={i} 
                              className={cn(
                                "h-1 rounded-full transition-all",
                                i < myShips.length ? "bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]" : 
                                i === placingShipIndex ? "bg-blue-500 animate-pulse" : 
                                "bg-white/10"
                              )} 
                             />
                           ))}
                        </div>
                        <div className="flex flex-wrap gap-2">
                           {SHIP_TYPES.map((s, i) => (
                             <div 
                              key={i} 
                              className={cn(
                                "px-2 py-1 rounded text-[7px] font-black uppercase tracking-tighter border transition-all",
                                i < myShips.length ? "bg-green-500/10 border-green-500/30 text-green-400" : 
                                i === placingShipIndex ? "bg-blue-600 border-blue-400 text-white" : 
                                "bg-white/5 border-white/10 text-white/20"
                              )}
                             >
                               {s.name[0]}{s.name.slice(1,3)} ({s.length})
                             </div>
                           ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => setPlacementOrientation(prev => prev === 'horizontal' ? 'vertical' : 'horizontal')}
                          className="flex items-center justify-center gap-2 bg-white/5 border border-white/10 p-3 rounded-xl hover:bg-white/10 transition-colors uppercase text-[10px] font-bold tracking-widest"
                        >
                          <RotateCw size={14} className="text-blue-400" />
                          Rotate
                        </button>
                        <button
                          onClick={handleRandomizeShips}
                          className="flex items-center justify-center gap-2 bg-blue-500/10 border border-blue-500/20 p-3 rounded-xl hover:bg-blue-500/20 transition-colors uppercase text-[10px] font-bold tracking-widest text-blue-400"
                        >
                          <Play size={14} />
                          Auto
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-green-500/20 border border-green-500/50 p-8 rounded-xl text-center flex flex-col items-center gap-3">
                      <ShieldCheck className="text-green-400" size={32} />
                      <div>
                        <p className="text-green-300 font-bold uppercase tracking-[0.2em] text-sm">Fleet Deployed</p>
                        <p className="text-green-500/60 text-[10px] uppercase font-bold">Waiting for opponent to battle check</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {SHIP_TYPES.map((type, idx) => (
                    <div key={idx} className={cn(
                      "p-3 rounded-lg border text-xs font-bold uppercase tracking-widest transition-all",
                      idx < myShips.length ? "bg-green-500/10 border-green-500/50 text-green-400 line-through" : 
                      idx === placingShipIndex ? "bg-blue-600 border-blue-400 text-white animate-pulse" :
                      "bg-white/5 border-white/10 text-white/20"
                    )}>
                      {type.name} ({type.length})
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-center">
                <div className="space-y-4 relative">
                   <p className="text-center text-xs font-bold uppercase tracking-[0.3em] text-white/30">
                    {isSpectator ? "Tactical Deployment" : "Your Grid Selection"}
                   </p>
                   <Board 
                    gridSize={room.settings.gridSize}
                    ships={isSpectator ? [] : myShips} 
                    onCellClick={isSpectator ? undefined : handleCellClick}
                    onCellMouseEnter={isSpectator ? undefined : (x, y) => setHoveredCell({ x, y })}
                    onCellMouseLeave={() => setHoveredCell(null)}
                    previewPositions={previewPositions}
                    previewStatus={previewStatus}
                    showShipHealth={room.settings.showShipHealth}
                    theme={room.settings.theme}
                   />

                   {/* Placement Intel Overlay */}
                   <AnimatePresence>
                     {room.state.status === 'placing' && hoveredCell && (
                       (() => {
                         const placedShip = myShips.find(s => s.positions.some(p => p.x === hoveredCell.x && p.y === hoveredCell.y));
                         const currentPlacingShip = placingShipIndex < SHIP_TYPES.length ? SHIP_TYPES[placingShipIndex] : null;
                         const shipToShow = placedShip || (currentPlacingShip ? { ...currentPlacingShip, isPlacing: true } : null);
                         
                         if (!shipToShow) return null;

                         return (
                           <motion.div
                             initial={{ opacity: 0, scale: 0.9, x: 20 }}
                             animate={{ opacity: 1, scale: 1, x: 0 }}
                             exit={{ opacity: 0, scale: 0.9, x: 20 }}
                             className="absolute -right-48 top-12 w-44 bg-slate-900/90 border border-blue-500/50 p-4 rounded-2xl shadow-2xl z-[100] backdrop-blur-xl pointer-events-none"
                           >
                             <div className="space-y-3">
                               <div className="flex items-center gap-2">
                                 <div className={cn("w-2 h-2 rounded-full", (shipToShow as any).isPlacing ? "bg-blue-500 animate-ping" : "bg-green-500")} />
                                 <span className="text-[9px] font-black uppercase tracking-widest text-blue-400">
                                   {(shipToShow as any).isPlacing ? "Deployment Intel" : "Vessel Logged"}
                                 </span>
                               </div>
                               <div>
                                 <p className="text-xs font-black text-white uppercase italic">{shipToShow.name}</p>
                                 <p className="text-[10px] font-mono text-white/40">Class: Vessel L-{shipToShow.length}</p>
                               </div>
                               <div className="h-[1px] bg-white/10" />
                               <div className="space-y-1">
                                 <p className={cn(
                                   "text-[8px] font-black uppercase tracking-widest",
                                   (shipToShow as any).isPlacing ? (previewStatus === 'valid' ? "text-green-500" : "text-red-500") : "text-green-400"
                                 )}>
                                   Status: {(shipToShow as any).isPlacing ? (previewStatus === 'valid' ? "READY" : "ERROR") : "ACTIVE"}
                                 </p>
                                 {(shipToShow as any).isPlacing && previewStatus !== 'valid' && (
                                   <p className="text-[7px] text-white/30 leading-tight">
                                     Intersection or perimeter breach. Reposition immediately.
                                   </p>
                                 )}
                                 {!(shipToShow as any).isPlacing && (
                                   <p className="text-[7px] text-white/30 leading-tight">
                                     Vessel is currently holding tactical position on the grid.
                                   </p>
                                 )}
                               </div>
                             </div>
                           </motion.div>
                         );
                       })()
                     )}
                   </AnimatePresence>
                </div>
              </div>
            </motion.div>
          )}

          {room.state.status === 'playing' && (
            <motion.div 
              key="playing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col gap-12"
            >
              {/* Turn Sequence Tracker */}
              <div className="flex flex-wrap items-center justify-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/10">
                {Object.keys(room.state.players).map((pid, idx) => {
                  const p = room.state.players[pid];
                  const isCurrent = room.state.turn === pid;
                  const isDefeated = Object.keys(room.state.players).reduce((sum, otherPid) => {
                    return sum + room.state.players[otherPid].shots.filter((s: any) => s.hit && s.targetId === pid).length;
                  }, 0) >= 17;

                  return (
                    <div key={pid} className="flex items-center gap-3">
                      <div className={cn(
                        "flex items-center gap-3 px-4 py-2 rounded-xl border-2 transition-all relative overflow-hidden",
                        isCurrent ? "bg-blue-600/20 border-blue-500 scale-110 z-10" : 
                        isDefeated ? "bg-red-950/40 border-red-900/40 opacity-50 grayscale" :
                        "bg-white/5 border-white/10 grayscale-[0.5]"
                      )}>
                        {isCurrent && <motion.div layoutId="cur-turn" className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500" />}
                        <div className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border",
                          isCurrent ? "bg-blue-500 border-white/20" : "bg-slate-800 border-white/10"
                        )}>
                          {p.name[0]}
                        </div>
                        <div className="flex flex-col">
                          <span className={cn(
                            "text-xs font-black uppercase tracking-widest tabular-nums leading-none",
                            isCurrent ? "text-white" : "text-white/30"
                          )}>{p.name}</span>
                          <span className="text-[7px] font-bold uppercase tracking-[0.2em] text-white/20 leading-none mt-1">
                            {pid === room.hostId ? "Admiral" : "Captain"}
                          </span>
                        </div>
                        {isDefeated && <X size={14} className="text-red-500 absolute top-1 right-1" />}
                      </div>
                      {idx < Object.keys(room.state.players).length - 1 && <Sword size={12} className="text-white/10" />}
                    </div>
                  );
                })}
              </div>

              {/* Turn Banner */}
               <div className={cn(
                "w-full px-6 py-4 rounded-2xl border-b-4 transition-all overflow-hidden relative flex flex-col sm:flex-row items-center justify-between gap-4",
                isMyTurn ? "bg-blue-600 border-blue-400" : "bg-red-950 border-red-800"
              )}>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
                <h3 className="relative text-2xl font-black uppercase tracking-[0.5em] italic flex items-center gap-4">
                  {isMyTurn ? <Sword /> : <Shield />}
                  {isMyTurn ? "Your Orders, Admiral" : "Incoming Fire Detected"}
                </h3>

                {isMyTurn && room.settings.powerUpsEnabled && sonarCharges > 0 && (
                   <button 
                    onClick={() => setSonarActive(!sonarActive)}
                    className={cn(
                      "px-6 py-2 rounded-full border text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                      sonarActive ? "bg-blue-600 border-white text-white shadow-[0_0_15px_rgba(59,130,246,0.5)]" : "bg-white/10 border-white/20 text-white/60 hover:bg-white/20"
                    )}
                   >
                     <Target size={14} className={cn(sonarActive && "animate-pulse")} />
                     Sonar Ping ({sonarCharges} Left)
                   </button>
                )}
                {timeLeft !== null && (
                  <div className="relative flex flex-col items-end">
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/50 mb-1">Turn Expiry</span>
                    <div className="flex items-center gap-3">
                       <span className={cn(
                         "text-3xl font-black italic tabular-nums leading-none transition-all duration-300",
                         timeLeft <= 5 ? "text-red-500 animate-pulse drop-shadow-[0_0_8px_rgba(239,68,68,0.8)] scale-125" : "text-white"
                       )}>{timeLeft}s</span>
                       <div className="w-12 h-12 relative flex items-center justify-center">
                          <svg className="w-full h-full -rotate-90">
                             <circle 
                              cx="24" cy="24" r="20" 
                              fill="none" 
                              stroke="currentColor" 
                              strokeWidth="4" 
                              className="text-white/10"
                             />
                             <motion.circle 
                              cx="24" cy="24" r="20" 
                              fill="none" 
                              stroke="currentColor" 
                              strokeWidth="4" 
                              strokeDasharray="125.6"
                              initial={{ strokeDashoffset: 0 }}
                              animate={{ 
                                strokeDashoffset: 125.6 * (1 - timeLeft / room.settings.turnTimeLimit),
                                transition: { duration: 1, ease: "linear" }
                              }}
                              className={timeLeft <= 5 ? "text-red-500" : "text-blue-500"}
                             />
                          </svg>
                       </div>
                    </div>
                  </div>
                )}
              </div>

              <div className={cn(
                "grid gap-12",
                room.settings.maxPlayers === 4 ? "lg:grid-cols-2" : "lg:grid-cols-2"
              )}>
                {/* Board Layout logic for 4 players */}
                {(() => {
                  const opponentIds = Object.keys(room.state.players).filter(id => id !== myId);
                  
                  return (
                    <>
                      {opponentIds.map((targetId) => {
                        const targetData = room.state.players[targetId];
                        const isTargetDefeated = Object.keys(room.state.players).reduce((sum, pid) => {
                            return sum + room.state.players[pid].shots.filter((s: any) => s.hit && s.targetId === targetId).length;
                        }, 0) >= 17;

                        return (
                          <div key={targetId} className="space-y-6 flex flex-col items-center">
                            <div className="flex items-center gap-2 mb-2">
                              <Target className={cn(isTargetDefeated ? "text-slate-500" : "text-red-500")} />
                              <h4 className="text-xs font-black uppercase tracking-[0.3em] text-red-400">
                                {targetData.name}'s Defense Grid {isTargetDefeated && "(SUNK)"}
                              </h4>
                            </div>
                            <div className="relative group">
                              <Board 
                                gridSize={room.settings.gridSize}
                                isOpponent 
                                isMyTurn={isMyTurn}
                                shots={Object.keys(room.state.players).flatMap(pid => room.state.players[pid].shots.filter((s: any) => s.targetId === targetId || (room.settings.maxPlayers === 2 && !s.targetId)))} 
                                onCellClick={!isSpectator && isMyTurn && !isTargetDefeated ? (x, y) => handleCellClick(x, y, targetId) : undefined}
                                onCellMouseEnter={(x, y) => setHoveredOpponentCell({ x, y, targetId })}
                                onCellMouseLeave={() => setHoveredOpponentCell(null)}
                                ships={targetData.ships}
                                theme={room.settings.theme}
                              />
                              
                              {/* Vessel Intelligence Panel */}
                              <AnimatePresence>
                                {hoveredOpponentCell && hoveredOpponentCell.targetId === targetId && (() => {
                                  const shipAtHover = targetData.ships.find(s => s.positions.some(p => p.x === hoveredOpponentCell.x && p.y === hoveredOpponentCell.y));
                                  const isRevealed = (Object.values(room.state.players) as Player[]).some((p: Player) => p.shots.some(s => s.x === hoveredOpponentCell.x && s.y === hoveredOpponentCell.y && s.targetId === targetId));
                                  
                                  if (shipAtHover && isRevealed) {
                                    const hits = shipAtHover.positions.filter(pos => 
                                      (Object.values(room.state.players) as Player[]).some((p: Player) => p.shots.some(s => s.x === pos.x && s.y === pos.y && s.targetId === targetId && s.hit))
                                    ).length;
                                    const healthPercent = ((shipAtHover.length - hits) / shipAtHover.length) * 100;

                                    return (
                                      <motion.div
                                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        className="absolute -top-24 left-1/2 -translate-x-1/2 w-48 bg-slate-900/90 backdrop-blur-md border border-blue-500/30 p-3 rounded-xl z-[60] shadow-2xl pointer-events-none"
                                      >
                                        <div className="flex items-center gap-2 mb-2">
                                          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                                          <p className="text-[10px] font-black uppercase tracking-widest text-blue-400">Vessel Intelligence</p>
                                        </div>
                                        <div className="space-y-2">
                                          <div className="flex justify-between items-end">
                                            <p className="text-xs font-bold text-white uppercase">{shipAtHover.type}</p>
                                            <p className="text-[9px] font-mono text-white/40">{shipAtHover.length - hits}/{shipAtHover.length} HP</p>
                                          </div>
                                          <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                                            <motion.div 
                                              initial={{ width: 0 }}
                                              animate={{ width: `${healthPercent}%` }}
                                              className={cn(
                                                "h-full transition-all duration-500",
                                                healthPercent > 60 ? "bg-green-500" : healthPercent > 30 ? "bg-yellow-500" : "bg-red-500"
                                              )}
                                            />
                                          </div>
                                          <p className="text-[8px] font-medium text-white/30 italic">
                                            {healthPercent === 0 ? "VESSEL ELIMINATED" : hits > 0 ? "HULL INTEGRITY COMPROMISED" : "SCAN INITIALIZED"}
                                          </p>
                                        </div>
                                      </motion.div>
                                    );
                                  }
                                  return null;
                                })()}
                              </AnimatePresence>

                              {sonarResult && (
                                <div className="absolute inset-0 pointer-events-none z-20 flex items-center justify-center">
                                  <motion.div 
                                    initial={{ scale: 0.5, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    className="bg-blue-600 px-4 py-2 rounded-full border border-white/40 shadow-[0_0_20px_rgba(59,130,246,0.5)]"
                                  >
                                    <p className="text-[10px] font-black uppercase tracking-widest text-white">
                                      Sonar Ping: {sonarResult.count} Units Detected
                                    </p>
                                  </motion.div>
                                </div>
                              )}
                            </div>
                            <div className="bg-white/5 p-4 rounded-xl border border-white/10 w-full text-center">
                               <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-1">Impact on {targetData.name}</p>
                               <p className="text-3xl font-black italic">
                                 {Object.keys(room.state.players).reduce((sum, pid) => sum + room.state.players[pid].shots.filter((s: any) => s.hit && s.targetId === targetId).length, 0)} 
                                 <span className="text-white/20 text-xl"> / 17</span>
                               </p>
                            </div>
                          </div>
                        );
                      })}

                      <div className="space-y-6 flex flex-col items-center">
                         <div className="flex items-center gap-2 mb-2">
                           <Shield className="text-blue-500" />
                           <h4 className="text-xs font-black uppercase tracking-[0.3em] text-blue-400">Home Fleet Defense</h4>
                         </div>
                         <Board 
                          gridSize={room.settings.gridSize}
                          ships={myData?.ships || []} 
                          shots={Object.keys(room.state.players).flatMap(pid => room.state.players[pid].shots.filter((s: any) => s.targetId === myId))} 
                          showShipHealth={room.settings.showShipHealth}
                          theme={room.settings.theme}
                         />
                         <div className="bg-white/5 p-4 rounded-xl border border-white/10 w-full text-center">
                            <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-1">Incoming Impacts</p>
                            <p className="text-3xl font-black italic">
                              {Object.keys(room.state.players).reduce((sum, pid) => sum + room.state.players[pid].shots.filter((s: any) => s.hit && s.targetId === myId).length, 0)} 
                              <span className="text-white/20 text-xl"> / 17</span>
                            </p>
                         </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </motion.div>
          )}

           {room.state.status === 'finished' && (() => {
               const myHits = myData?.shots.filter(s => s.hit).length || 0;
               const totalShots = myData?.shots.length || 0;
               const myAccuracy = totalShots > 0 ? Math.round((myHits / totalShots) * 100) : 0;
               const opponentHits = opponentData?.shots.filter(s => s.hit).length || 0;
               
               return (
                <motion.div 
                  key="finished"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex flex-col items-center justify-center py-12 space-y-10 bg-slate-900 border border-white/10 rounded-3xl relative overflow-hidden px-8"
                >
                  <div className="absolute inset-0 bg-blue-500/5 blur-3xl rounded-full translate-y-1/2" />
                  
                  <div className="text-center space-y-4 relative z-10 w-full max-w-2xl">
                    <Trophy size={100} className={cn("mx-auto mb-6", room.state.winner === myId ? "text-yellow-400 animate-bounce" : "text-slate-500 shadow-[0_0_30px_rgba(100,116,139,0.3)]")} />
                    <h2 className="text-6xl font-black italic tracking-tighter uppercase leading-none">
                      {room.state.winner === myId ? "Victory Secured" : "Fleet Destroyed"}
                    </h2>
                    <p className="text-white/50 uppercase tracking-[0.4em] font-bold text-sm">
                      {room.state.winner === myId ? `Admiral ${myData?.name || 'You'} stand triumphant` : "Report to the admiralty for debriefing"}
                    </p>
                  </div>

                  <div className="grid sm:grid-cols-3 gap-4 w-full max-w-3xl relative z-10">
                     <div className="bg-white/5 border border-white/10 p-6 rounded-2xl text-center space-y-1">
                        <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Accuracy</p>
                        <p className="text-4xl font-black italic text-blue-400">{myAccuracy}%</p>
                     </div>
                     <div className="bg-white/5 border border-white/10 p-6 rounded-2xl text-center space-y-1">
                        <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Enemy Hull Impact</p>
                        <p className="text-4xl font-black italic text-red-500">{myHits}<span className="text-xl text-white/20">/17</span></p>
                     </div>
                     <div className="bg-white/5 border border-white/10 p-6 rounded-2xl text-center space-y-1">
                        <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Total Fire Power</p>
                        <p className="text-4xl font-black italic text-white">{myData?.shots.length || 0}</p>
                     </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4 relative z-10 w-full max-w-md">
                    <button
                      onClick={() => socket?.emit('play-again', { roomId: room.id })}
                      className="flex-1 bg-blue-600 text-white px-12 py-5 rounded-2xl font-black uppercase text-sm tracking-[0.2em] hover:bg-blue-500 transition-all shadow-xl shadow-blue-500/20 flex items-center justify-center gap-2"
                    >
                      <RotateCw size={18} />
                      Next Skirmish
                    </button>
                    <button
                      onClick={() => window.location.reload()}
                      className="flex-1 bg-white/5 border border-white/10 text-white px-12 py-5 rounded-2xl font-black uppercase text-sm tracking-[0.2em] hover:bg-white/10 transition-all flex items-center justify-center"
                    >
                      Return to Port
                    </button>
                  </div>
                </motion.div>
               );
             })()}
        </AnimatePresence>

        {/* Footer */}
        <footer className="pt-12 pb-6 text-center border-t border-white/5">
          <p className="text-white/20 text-[10px] uppercase font-bold tracking-[0.5em]">
            Developed by <span className="text-blue-500/50">DeepInk Team</span>
          </p>
        </footer>
      </div>
    </motion.div>
    </div>
  );
}
