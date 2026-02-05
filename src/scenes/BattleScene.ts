import Phaser from 'phaser';
import BattleCard from '../objects/BattleCard';
import { supabase, getCurrentUser } from '../utils/supabaseClient';
import { Theme } from '../utils/Theme';
import SoundManager from '../utils/SoundManager';

export default class BattleScene extends Phaser.Scene {
    // Game State
    private matchId: string | null = null;
    private userId: string | null = null;
    private isPlayerTurn = false;
    private waitingText?: Phaser.GameObjects.Text;

    // UI Containers (Anchored)
    private enemyZone!: Phaser.GameObjects.Container;
    private playerZone!: Phaser.GameObjects.Container;

    // Sub-Containers
    private playerHand!: Phaser.GameObjects.Container;
    private playerBench!: Phaser.GameObjects.Container;
    private playerActive!: Phaser.GameObjects.Container;

    // Decks
    private playerDeck!: Phaser.GameObjects.Container;
    private playerDiscard!: Phaser.GameObjects.Container;

    private enemyHand!: Phaser.GameObjects.Container;
    private enemyBench!: Phaser.GameObjects.Container;
    private enemyActive!: Phaser.GameObjects.Container;

    constructor() {
        super('BattleScene');
    }

    init(data: { matchId: string }) {
        this.matchId = data.matchId;
        console.log("BattleScene Init: Match ID", this.matchId);
    }

    create() {
        this.createBackground();
        this.setupZones();
        this.createUI();

        // Real Data Flow
        if (this.matchId) {
            this.fetchMatchState();
            this.subscribeToMatch();
        }

        this.scale.on('resize', this.handleResize, this);

        // Drop Handler (Placeholder for now)
        this.input.on('drop', (pointer: any, gameObject: BattleCard, dropZone: any) => {
            this.onCardDrop(pointer, gameObject, dropZone);
        });
    }

    private async fetchMatchState() {
        if (!this.matchId) return;

        // Get User
        const user = await getCurrentUser();
        this.userId = user?.id || null;

        const { data, error } = await supabase
            .from('matches')
            .select('*')
            .eq('id', this.matchId)
            .single();

        if (error || !data) {
            console.error("Error fetching match:", error);
            return;
        }

        this.handleStateUpdate(data);
    }

    private subscribeToMatch() {
        if (!this.matchId) return;

        supabase
            .channel(`match-${this.matchId}`)
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${this.matchId}` },
                (payload: any) => {
                    console.log("Match Update:", payload);
                    this.handleStateUpdate(payload.new);
                }
            )
            .subscribe();
    }

    private async onCardDrop(pointer: any, gameObject: BattleCard, dropZone: any) {
        const zoneName = dropZone.getData('zoneName');
        const cardId = gameObject.cardId;

        console.log(`Attempting to drop ${cardId} on ${zoneName}`);

        // Optimistic UI Update (Snap)
        gameObject.setPosition(dropZone.x, dropZone.y);

        try {
            if (zoneName === 'bench') {
                const { data, error } = await supabase.rpc('submit_action', {
                    _match_id: this.matchId,
                    _action_type: 'play_pokemon',
                    _payload: { card_id: cardId }
                });

                if (error) throw error;
                console.log("Action Success:", data);
                // State update will trigger via Realtime subscription
            }
        } catch (e: any) {
            console.error("Action Failed:", e);
            // Revert Position (TODO: Animate back to hand)
            // For now, simpler: we wait for state update which will correct the board
            // But if it fails, we should move it back explicitly or refresh
            alert("Msg from Prof. Oak: " + e.message);
            this.handleStateUpdate({ game_state: this.lastState }); // Revert
        }
    }

    // CORE RENDERER
    private lastState: any = null;


    private handleStateUpdate(matchData: any) {
        if (!this.userId) return;

        // Handle direct state object or wrapped in matchData
        const state = matchData.game_state;

        // WAITING STATE CHECK
        if (matchData.status === 'waiting') {
            // Assuming showWaitingUI() is a method that creates/updates this.waitingText
            // For now, let's just create it here if it doesn't exist
            if (!this.waitingText) {
                this.waitingText = this.add.text(this.scale.width / 2, this.scale.height / 2, "WAITING FOR OPPONENT...", {
                    fontSize: '32px',
                    color: '#ffffff',
                    backgroundColor: '#000000',
                    padding: { x: 20, y: 10 }
                }).setOrigin(0.5).setDepth(100);
            }
            return;
        } else {
            if (this.waitingText) {
                this.waitingText.destroy();
                this.waitingText = undefined;
            }
        }

        if (!state || !state.players) return; // Not started yet

        const myData = state.players[this.userId];
        const opponentId = this.matchId // This might need cleaner logic if we just have state
            ? (state.turn_owner === this.userId ? state.turn_owner : this.getOpponentId(state))
            : null;

        // Correct Opponent ID Logic using Match Data if available or deducing
        // If we are P1, Opp is P2.

        this.renderHand(myData.hand);
        this.renderBench(myData.bench);
        // this.renderActive(myData.active); // TODO
        // this.renderEnemy(opData); // TODO
    }

    private getOpponentId(state: any): string {
        const ids = Object.keys(state.players);
        return ids.find(id => id !== this.userId) || '';
    }

    private renderBench(benchData: any[]) {
        // Clear previous
        this.playerBench.each((c: any) => {
            if (c instanceof BattleCard) c.destroy();
        });
        this.playerBench.removeAll(true); // Ensure clean container

        if (!benchData) return;

        // Bench Layout: Fixed 5 slots.
        // We defined slots in setupZones at [-2, -1, 0, 1, 2] * 110/80
        // benchData is just an array. We fill from left? Or should we have specific indices?
        // Pokemon TCG Bench is usually just a list up to 5.

        const isMobile = this.scale.width < 768;
        const spacing = isMobile ? 80 : 110;

        benchData.forEach((card: any, index: number) => {
            // -2 to +2 logic: Index 0 -> -2, Index 4 -> +2
            // Actually, let's just center them or fill slots 0..4
            // Our slots visual loop was: for (let i = -2; i <= 2; i++)

            // Let's map index 0 to slot -2 (Leftmost)
            const slotIndex = index - 2;

            const definition = {
                id: card.card_id,
                name: card.name,
                image_url: card.image_url,
                hp: card.hp,
                types: card.types
            };

            const battleCard = new BattleCard(this, 0, 0, card.id, definition);
            battleCard.state = 'BENCH'; // Disable Drag? Or allow Drag to Active?
            battleCard.highlight(false); // Remove glow

            // Scale down for bench
            battleCard.setScale(0.8);

            this.playerBench.add(battleCard);
            battleCard.setPosition(slotIndex * spacing, 0);
        });
    }

    private showWaitingUI() {
        if (!this.waitingText) {
            this.waitingText = this.add.text(this.scale.width / 2, this.scale.height / 2, "WAITING FOR OPPONENT...", {
                fontSize: '32px', color: '#00e676', backgroundColor: '#000', padding: { x: 20, y: 10 }
            }).setOrigin(0.5).setDepth(100);
        }
    }

    private renderHand(handData: any[]) {
        // Clear previous hand (inefficient but safe for MVP)
        // Ideally we diff the state
        this.playerHand.each((c: any) => {
            // BattleCards are in the scene actually (based on previous setupDebugBoard fix), 
            // but let's check where we put them this time.
            // If we use the Container approach properly:
            if (c instanceof BattleCard) c.destroy();
        });

        // Actually, in setupDebugBoard we put them in SCENE. 
        // We should probably track them in an array `this.handCards`.
        // For now, let's just clear specific group if we had one.

        // Simpler: Just rely on a specific container for the Hand?
        // Let's use `this.playerHand` container which we created in `setupZones`.
        this.playerHand.removeAll(true);

        if (!handData) return;

        // Render
        const startX = -(handData.length - 1) * 45; // Center alignment offset (90/2)

        handData.forEach((card: any, index: number) => {
            // Card Definition from JSON
            const definition = {
                id: card.card_id,
                name: card.name,
                image_url: card.image_url,
                hp: card.hp,
                types: card.types
            };

            // Unique Instance ID
            const uid = card.id;

            // Create Card
            // We add to Container `this.playerHand` so they move with it
            const battleCard = new BattleCard(this, 0, 0, uid, definition);
            this.playerHand.add(battleCard);

            battleCard.setPosition(startX + (index * 90), 0);

            // Correct resizing/interactive relative to container?
            // Phaser Containers handle this well usually.
        });
    }

    private createBackground() {
        // Dark Battle Mat
        this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x121212).setOrigin(0);

        // Grid / Hex pattern
        const grid = this.add.grid(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 50, 50, 0x1e1e1e, 1, 0x111111, 1);
        grid.setAlpha(0.3);
    }

    private setupZones() {
        const w = this.scale.width;
        const h = this.scale.height;
        const cx = w / 2;
        const cy = h / 2;
        const isMobile = w < 768;

        // --- ZONES ---
        // We use relative positioning (0.0 to 1.0) for responsiveness

        // 1. Player Zone (Bottom Half)
        this.playerZone = this.add.container(0, 0);

        // Active Spot (Center-ish Bottom)
        const pActiveY = isMobile ? h * 0.6 : h * 0.65;
        this.playerActive = this.add.container(cx, pActiveY);
        const pActiveBg = this.add.rectangle(0, 0, 140, 190, 0x000000, 0.5).setStrokeStyle(2, 0x00ff00);
        const pActiveLbl = this.add.text(0, 0, "ACTIVE", { fontSize: '12px', color: '#444' }).setOrigin(0.5);
        this.playerActive.add([pActiveBg, pActiveLbl]);

        // Bench (Below Active)
        const pBenchY = isMobile ? h * 0.8 : h * 0.82;
        this.playerBench = this.add.container(cx, pBenchY);
        // 5 Bench Slots
        for (let i = -2; i <= 2; i++) {
            const slot = this.add.rectangle(i * (isMobile ? 80 : 110), 0, isMobile ? 70 : 100, isMobile ? 70 : 100, 0x000000, 0.3).setStrokeStyle(1, 0x444444);
            this.playerBench.add(slot);
        }

        // Hand (Bottom Edge)
        this.playerHand = this.add.container(cx, h - 50);

        // Deck & Discard (Bottom Right)
        const deckX = w - (isMobile ? 60 : 100);
        const deckY = h - (isMobile ? 100 : 150);
        this.playerDeck = this.add.container(deckX, deckY);
        this.playerDeck.add(this.add.rectangle(0, 0, 80, 110, 0x333333).setStrokeStyle(1, 0x666666));
        this.playerDeck.add(this.add.text(0, 0, "DECK", { fontSize: '10px' }).setOrigin(0.5));


        // 2. Enemy Zone (Top Half, Mirrored)
        this.enemyZone = this.add.container(0, 0);

        // Enemy Active
        const eActiveY = isMobile ? h * 0.4 : h * 0.35;
        this.enemyActive = this.add.container(cx, eActiveY);
        const eActiveBg = this.add.rectangle(0, 0, 140, 190, 0x000000, 0.5).setStrokeStyle(2, 0xff0000);
        const eActiveLbl = this.add.text(0, 0, "ENEMY", { fontSize: '12px', color: '#444' }).setOrigin(0.5);
        this.enemyActive.add([eActiveBg, eActiveLbl]);

        // Enemy Bench (Above Active)
        const eBenchY = isMobile ? h * 0.2 : h * 0.18;
        this.enemyBench = this.add.container(cx, eBenchY);
        for (let i = -2; i <= 2; i++) {
            const slot = this.add.rectangle(i * (isMobile ? 80 : 110), 0, isMobile ? 70 : 100, isMobile ? 70 : 100, 0x000000, 0.3).setStrokeStyle(1, 0x444444);
            this.enemyBench.add(slot);
        }

        // Enemy Hand (Top Edge - Hidden/Backs)
        this.enemyHand = this.add.container(cx, 50);

        this.add.existing(this.playerZone);
        this.add.existing(this.enemyZone);

        // ENABLE ZONES for Drop

        // Active
        pActiveBg.setInteractive({ dropZone: true });
        pActiveBg.setData('zoneName', 'active');

        // Bench
        this.playerBench.each((child: any) => {
            child.setInteractive({ dropZone: true });
            child.setData('zoneName', 'bench');
        });
    }

    private createUI() {
        // Phase Indicator (Right Side)
        const phaseBox = this.add.container(this.scale.width - 100, this.scale.height / 2);
        const bg = this.add.rectangle(0, 0, 180, 50, 0x000000, 0.8);
        const text = this.add.text(0, 0, "DRAW PHASE", {
            fontSize: '18px', color: '#fff', fontStyle: 'bold'
        }).setOrigin(0.5);

        phaseBox.add([bg, text]);

        // Back Button (Top Left)
        const backBtn = this.add.text(40, 40, "SURRENDER", {
            fontSize: '16px', color: '#ff5555'
        })
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', async () => {
                // Call Surrender Logic
                // We don't await strictly because we want to leave immediately usually,
                // but for cleanup it's better to wait or show "Leaving..."
                const { error } = await supabase.rpc('surrender_match', { _match_id: this.matchId });
                if (error) console.error("Surrender failed", error);

                this.scene.start('HomeScene');
            });

        // END TURN BUTTON
        const endTurnBtn = this.add.text(this.scale.width - 100, this.scale.height - 100, "END TURN", {
            fontSize: '20px', backgroundColor: '#aa0000', padding: { x: 10, y: 10 }
        })
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', async () => {
                try {
                    const { error } = await supabase.rpc('submit_action', {
                        _match_id: this.matchId,
                        _action_type: 'end_turn',
                        _payload: {}
                    });
                    if (error) throw error;
                } catch (e: any) {
                    console.error(e);
                    alert(e.message);
                }
            });

        // ATTACK BUTTON
        const attackBtn = this.add.text(this.scale.width - 240, this.scale.height - 100, "ATTACK", {
            fontSize: '20px', backgroundColor: '#e65100', padding: { x: 10, y: 10 }
        })
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', async () => {
                try {
                    const { error } = await supabase.rpc('submit_action', {
                        _match_id: this.matchId,
                        _action_type: 'attack',
                        _payload: {}
                    });
                    if (error) throw error;
                } catch (e: any) {
                    console.error(e);
                    alert(e.message);
                }
            });
    }



    private handleResize(gameSize: Phaser.Structs.Size) {
        // Reload to update positions
        this.scene.restart({ matchId: this.matchId });
    }
}
