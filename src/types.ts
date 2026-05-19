export interface Position {
  x: number;
  y: number;
}

export interface Ship {
  id: string;
  name: string;
  length: number;
  positions: Position[];
  placed: boolean;
  orientation: 'horizontal' | 'vertical';
}

export interface Shot {
  x: number;
  y: number;
  hit: boolean;
  targetId?: string;
}

export interface Player {
  name: string;
  ready: boolean;
  isAi?: boolean;
  ships: Ship[];
  shots: Shot[];
}

export interface GameState {
  players: { [id: string]: Player };
  spectators: { [id: string]: { name: string } };
  turn: string | null;
  turnStartedAt: number | null;
  winner: string | null;
  status: 'lobby' | 'placing' | 'playing' | 'finished';
}

export interface GameSettings {
  gridSize: number;
  turnTimeLimit: number;
  showShipHealth: boolean;
  combatIntensity: 'low' | 'high';
  gameMode: 'standard' | 'rapid';
  maxPlayers: 2 | 4;
  salvoMode: boolean;
  soundEnabled: boolean;
  powerUpsEnabled: boolean;
  theme: 'deep-sea' | 'radar' | 'classic';
}

export interface Room {
  id: string;
  name: string;
  hostId: string;
  settings: GameSettings;
  state: GameState;
}

export const GRID_SIZE = 10;
export const SHIP_TYPES = [
  { name: 'Carrier', length: 5 },
  { name: 'Battleship', length: 4 },
  { name: 'Destroyer', length: 3 },
  { name: 'Submarine', length: 3 },
  { name: 'Patrol Boat', length: 2 },
];
