export type PlayerId = string; // UUID
export type CardId = string; // Unique Instance ID

export interface BattleCard {
    instanceId: CardId; // Unique ID for this specific card in the game (not just 'pikachu')
    baseId: string; // e.g., 'A1-001'
    name: string;
    maxHp: number;
    currentHp: number;
    energyAttached: string[]; // ['fire', 'fire', 'colorless']
    statusConditions: ('poisoned' | 'asleep' | 'paralyzed')[];
    isEvolved: boolean;
}

export interface PlayerState {
    id: PlayerId;
    username: string;

    // Zones
    activePokemon: BattleCard | null;
    bench: (BattleCard | null)[]; // Max 5 slots
    hand: BattleCard[]; // Private to player (masked for opponent)
    discardPile: BattleCard[];
    deckCount: number; // Only show count to client
    prizeCards: number; // Starts at 6 (or 3 for Pocket format)
}

export interface GameState {
    matchId: string;
    turnNumber: number;
    currentPlayerId: PlayerId;
    phase: 'draw' | 'main' | 'attack' | 'end';

    player1: PlayerState;
    player2: PlayerState;

    // Audit Log
    lastAction: {
        playerId: PlayerId;
        type: 'play_card' | 'attack' | 'retreat' | 'end_turn';
        details: string;
        timestamp: number;
    } | null;

    winnerId: PlayerId | null;
}

// Client Actions (Payloads sent to Server)
export type BattleAction =
    | { type: 'play_basic'; cardId: CardId; slot: number } // Play to bench
    | { type: 'attach_energy'; cardId: CardId; targetId: CardId }
    | { type: 'attack'; moveIndex: number }
    | { type: 'retreat'; newActiveId: CardId }
    | { type: 'end_turn' };
