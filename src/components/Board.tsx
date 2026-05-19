import React from 'react';
import { GRID_SIZE, Position, Shot, Ship } from '../types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion } from 'motion/react';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface BoardProps {
  gridSize?: number;
  ships?: Ship[];
  shots?: Shot[];
  onCellClick?: (x: number, y: number) => void;
  onCellMouseEnter?: (x: number, y: number) => void;
  onCellMouseLeave?: () => void;
  previewPositions?: Position[];
  previewStatus?: 'valid' | 'invalid';
  isOpponent?: boolean;
  showShipHealth?: boolean;
  theme?: 'deep-sea' | 'radar' | 'classic' | 'neon-horizon' | 'arctic-tundra' | 'volcanic-depths';
  isMyTurn?: boolean;
}

export const Board: React.FC<BoardProps> = ({ 
  gridSize = 10,
  ships = [], 
  shots = [], 
  onCellClick, 
  onCellMouseEnter,
  onCellMouseLeave,
  previewPositions = [],
  previewStatus = 'valid',
  isOpponent = false,
  showShipHealth = true,
  theme = 'deep-sea',
  isMyTurn = false
}) => {
  const [internalHover, setInternalHover] = React.useState<Position | null>(null);

  const isShipSunk = (ship: Ship) => {
    return ship.positions.every(pos => 
      shots.some(s => s.x === pos.x && s.y === pos.y && s.hit)
    );
  };

  const renderCell = (x: number, y: number) => {
    const shot = shots.find((s) => s.x === x && s.y === y);
    const ship = ships.find((s) => s.positions.some((pos) => pos.x === x && pos.y === y));
    const isHit = shot && shot.hit;
    const isMiss = shot && !shot.hit;
    
    const isSunk = ship && isShipSunk(ship);
    const isPreview = previewPositions.some(p => p.x === x && p.y === y);

    // Calculate ship health if it's our ship
    let shipHits = 0;
    if (!isOpponent && ship) {
      shipHits = ship.positions.filter(pos => 
        shots.some(s => s.x === pos.x && s.y === pos.y && s.hit)
      ).length;
    }

    const themeStyles = {
      'deep-sea': {
        cell: "border-blue-200/30",
        ship: "bg-blue-500/20",
        miss: "bg-gray-400/30",
        hit: "bg-red-500/50",
        hover: "hover:bg-blue-100/10",
        board: "border-blue-400/50 bg-slate-900 shadow-blue-500/20",
      },
      'radar': {
        cell: "border-green-500/30",
        ship: "bg-green-500/10",
        miss: "bg-green-900/40",
        hit: "bg-green-400/60 shadow-[inset_0_0_10px_rgba(74,222,128,0.5)]",
        hover: "hover:bg-green-500/20",
        board: "border-green-500/60 bg-black shadow-green-500/30 font-mono",
      },
      'classic': {
        cell: "border-slate-400/40",
        ship: "bg-slate-500/40",
        miss: "bg-blue-200/50",
        hit: "bg-red-600/60",
        hover: "hover:bg-slate-200/20",
        board: "border-slate-800 bg-slate-400/10 shadow-slate-900/40",
      },
      'neon-horizon': {
        cell: "border-fuchsia-500/30",
        ship: "bg-fuchsia-500/10 shadow-[0_0_8px_rgba(232,121,249,0.3)]",
        miss: "bg-indigo-500/40",
        hit: "bg-cyan-400 shadow-[0_0_20px_rgba(34,211,238,1)] border-cyan-300",
        hover: "hover:bg-fuchsia-500/20",
        board: "border-fuchsia-500/50 bg-indigo-950 shadow-fuchsia-500/30",
      },
      'arctic-tundra': {
        cell: "border-sky-200/50",
        ship: "bg-white/20 shadow-[0_0_10px_rgba(255,255,255,0.4)]",
        miss: "bg-sky-100/40",
        hit: "bg-sky-300 shadow-[0_0_15px_rgba(125,211,252,1)] border-white",
        hover: "hover:bg-sky-200/30",
        board: "border-sky-300/50 bg-slate-50 shadow-sky-400/20",
      },
      'volcanic-depths': {
        cell: "border-red-900/40",
        ship: "bg-stone-800/60 shadow-[0_0_8px_rgba(249,115,22,0.2)]",
        miss: "bg-orange-900/30",
        hit: "bg-orange-500 shadow-[0_0_20px_rgba(249,115,22,1)] border-orange-400",
        hover: "hover:bg-orange-950/40",
        board: "border-orange-900/60 bg-stone-950 shadow-orange-950/40",
      }
    }[theme];

    const posIndex = ship?.positions.findIndex(p => p.x === x && p.y === y) || 0;

    return (
      <div
        key={`${x}-${y}`}
        id={`cell-${x}-${y}`}
        onMouseEnter={() => {
          setInternalHover({ x, y });
          onCellMouseEnter?.(x, y);
        }}
        onMouseLeave={() => {
          setInternalHover(null);
          onCellMouseLeave?.();
        }}
        onClick={() => onCellClick?.(x, y)}
        className={cn(
          "w-8 h-8 sm:w-10 sm:h-10 border flex items-center justify-center cursor-pointer transition-colors relative overflow-hidden",
          themeStyles.cell,
          !isOpponent && ship && (isSunk ? "bg-red-900/40" : themeStyles.ship),
          isOpponent && isSunk && "bg-red-900/20",
          shot && (isHit ? themeStyles.hit : themeStyles.miss),
          !shot && !isPreview && themeStyles.hover,
          !isOpponent && isPreview && (previewStatus === 'valid' ? "bg-green-500/40" : "bg-red-500/40")
        )}
      >
        {/* Targeting Reticle */}
        {isOpponent && isMyTurn && !shot && internalHover?.x === x && internalHover?.y === y && (
          <motion.div 
            initial={{ scale: 2, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="absolute inset-0 z-50 pointer-events-none flex items-center justify-center"
          >
            <div className="absolute inset-0 border-[1px] border-red-500/30 animate-pulse" />
            <div className="w-full h-[0.5px] bg-red-500/40 absolute" />
            <div className="w-[0.5px] h-full bg-red-500/40 absolute" />
            <div className="w-4 h-4 border border-red-500/60 rounded-full flex items-center justify-center">
              <div className="w-1 h-1 bg-red-500 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
            </div>
            {/* Corners */}
            <div className="absolute top-1 left-1 w-1.5 h-1.5 border-t border-l border-red-500" />
            <div className="absolute top-1 right-1 w-1.5 h-1.5 border-t border-r border-red-500" />
            <div className="absolute bottom-1 left-1 w-1.5 h-1.5 border-b border-l border-red-500" />
            <div className="absolute bottom-1 right-1 w-1.5 h-1.5 border-b border-r border-red-500" />
          </motion.div>
        )}

        {/* Sunk Indicator Overlay - Dramatic Version */}
        {isSunk && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: posIndex * 0.1, ease: "backOut" }}
            className="absolute inset-0 bg-red-950/80 flex items-center justify-center z-10"
          >
            {/* Structural Fracture UI */}
            <svg className="absolute inset-0 w-full h-full opacity-30 text-red-400" viewBox="0 0 100 100">
               <path d="M10,10 L30,40 L10,60 M90,10 L70,40 L90,60" fill="none" stroke="currentColor" strokeWidth="3" />
            </svg>
            
            {/* Sinking Bubbles/VFX */}
            <motion.div 
              animate={{ 
                y: [-10, -40],
                x: [-5, 5, -5],
                opacity: [0, 1, 0],
                scale: [0.5, 1, 0.5]
              }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear", delay: posIndex * 0.2 }}
              className="absolute bottom-0 w-2 h-2 bg-blue-300/40 rounded-full blur-[1px]"
            />
            
            <motion.div 
              animate={{ 
                rotate: [45, 50, 40, 45],
                scale: [0.8, 1.2, 0.8]
              }}
              transition={{ duration: 1, repeat: Infinity, delay: posIndex * 0.05 }}
              className="w-full h-1 bg-red-500/40 blur-[1px] absolute" 
            />
            <motion.div 
              animate={{ 
                rotate: [-45, -40, -50, -45],
                scale: [1.2, 0.8, 1.2]
              }}
              transition={{ duration: 1, repeat: Infinity, delay: posIndex * 0.05 }}
              className="w-full h-1 bg-red-500/40 blur-[1px] absolute" 
            />

            {/* Vessel Loss Indicator */}
            {posIndex === Math.floor(ship!.length / 2) && (
              <motion.div
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: [0, 1, 1, 0.5], scale: [0.5, 1, 1.2, 1] }}
                transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 2 }}
                className="absolute inset-0 flex items-center justify-center pointer-events-none z-30"
              >
                <div className="bg-red-600/95 shadow-[0_0_15px_rgba(220,38,38,0.6)] border border-red-400 px-1 py-0.5 rounded rotate-[-12deg] flex items-center gap-1">
                  <div className="w-1 h-1 bg-white rounded-full animate-pulse" />
                  <span className="text-[7px] font-black uppercase text-white tracking-widest">SUNK</span>
                  <div className="w-1 h-1 bg-white rounded-full animate-pulse" />
                </div>
              </motion.div>
            )}

            {/* Sinking Crackling Energy (Theme Specific) */}
            {theme === 'neon-horizon' && (
              <motion.div 
                animate={{ opacity: [0, 1, 0], scale: [0.8, 1.2, 0.8] }}
                transition={{ duration: 0.2, repeat: Infinity, delay: posIndex * 0.1 }}
                className="absolute inset-0 bg-cyan-400/20 mix-blend-overlay blur-[2px]"
              />
            )}
          </motion.div>
        )}

        {/* Ship Health Indicator for owner */}
        {!isOpponent && ship && !shot && showShipHealth && (
          <div className="absolute bottom-1 left-1 right-1 h-0.5 bg-blue-500/20 rounded-full overflow-hidden">
             <div 
              className="h-full bg-blue-400" 
              style={{ width: `${((ship.length - shipHits) / ship.length) * 100}%` }}
             />
          </div>
        )}
        
        {shot && (
          <>
            {isHit && (
              <>
                {/* Core Explosion */}
                <motion.div 
                  initial={{ scale: 0, opacity: 1 }}
                  animate={{ scale: [0, 4, 0], opacity: [1, 0.8, 0] }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className="absolute inset-0 rounded-full z-10 border-8 border-orange-500 blur-sm"
                />
                <motion.div 
                  initial={{ scale: 0, rotate: 0 }}
                  animate={{ scale: [1, 2, 1.5], rotate: 45, opacity: [0.8, 1, 0.5] }}
                  transition={{ duration: 0.5 }}
                  className="absolute inset-0 bg-yellow-400/40 blur-md rounded-full z-10"
                />
                
                {/* Fragments/Debris */}
                {[...Array(6)].map((_, i) => (
                  <motion.div
                    key={i}
                    initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                    animate={{ 
                      x: (Math.random() - 0.5) * 60, 
                      y: (Math.random() - 0.5) * 60,
                      opacity: 0,
                      scale: 0.5,
                      rotate: Math.random() * 360
                    }}
                    transition={{ duration: 0.7, ease: "circOut" }}
                    className="absolute w-1 h-1 bg-gray-400 rounded-sm z-20"
                  />
                ))}

                {/* Persistent Damage Smoke */}
                <motion.div 
                  animate={{ 
                    scale: [1, 1.2, 1],
                    opacity: [0.3, 0.6, 0.3]
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className={cn(
                    "absolute inset-0 bg-black/40 blur-md rounded-full z-10",
                    ship && shipHits >= ship.length / 2 && "bg-black/60 blur-lg scale-150"
                  )}
                />
              </>
            )}
            <div className={cn(
              "w-3 h-3 rounded-full relative z-20",
              isHit ? "bg-red-500 animate-pulse shadow-[0_0_15px_rgba(239,68,68,1)]" : "bg-white/50"
            )} />
          </>
        )}
      </div>
    );
  };

  const grid = [];
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      grid.push(renderCell(x, y));
    }
  }

  return (
    <div 
      className={cn(
        "grid border-2 rounded-lg overflow-hidden shadow-2xl transition-all",
        theme === 'deep-sea' && "border-blue-400/50 bg-slate-900 shadow-blue-500/20",
        theme === 'radar' && "border-green-500/60 bg-black shadow-green-500/30",
        theme === 'classic' && "border-slate-800 bg-slate-300 shadow-slate-900/40",
        theme === 'neon-horizon' && "border-fuchsia-500 bg-indigo-950 shadow-fuchsia-500/40",
        theme === 'arctic-tundra' && "border-sky-300 bg-slate-50 shadow-sky-200/50",
        theme === 'volcanic-depths' && "border-red-900 bg-stone-950 shadow-orange-900/40"
      )}
      style={{
        gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`
      }}
    >
      {grid}
    </div>
  );
};
