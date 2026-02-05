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
    private lastSeenEvent: string = "";

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

        // Polling Fallback (Every 2s)
        this.time.addEvent({
            delay: 2000,
            callback: this.fetchMatchState,
            callbackScope: this,
            loop: true
        });

        this.scale.on('resize', this.handleResize, this);

        // Drop Handler (Placeholder for now)
        this.input.on('drop', (pointer: Phaser.Input.Pointer, gameObject: BattleCard, dropZone: any) => {
            this.onCardDrop(pointer, gameObject, dropZone);
        });
    }

    private async fetchMatchState() {
        if (!this.matchId) return;

        // Get User if missing
        if (!this.userId) {
            const user = await getCurrentUser();
            this.userId = user?.id || null;
        }

        const { data, error } = await supabase
            .from('matches')
            .select('*')
            .eq('id', this.matchId)
            .single();

        if (error || !data) {
            // console.error("Error fetching match:", error); // Silence polling errors
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
            // Drop to Bench OR Active
            if (zoneName === 'bench' || zoneName === 'active') { // Both use play_pokemon
                const { data, error } = await supabase.rpc('submit_action', {
                    _match_id: this.matchId,
                    _action_type: 'play_pokemon',
                    _payload: { card_id: cardId } // Internal SQL logic decides active vs bench
                });

                if (error) throw error;
                // console.log("Action Success:", data);
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
        // Fix Opponent ID Logic
        const opponentId = this.getOpponentId(state);
        const opData = state.players[opponentId];

        // COBBLEMON SYNC: Check Pending Actions
        if (state.pending_actions && state.pending_actions[this.userId]) {
            this.updateAttackBtn(true); // I am waiting
        } else {
            this.updateAttackBtn(false); // Reset/Ready
        }

        // Check Resolution Event
        // Fix: Only shake if it's a NEW event
        if (state.last_event === 'combat_resolved' && this.lastSeenEvent !== state.updated_at) {
            this.cameras.main.shake(500, 0.02); // Stronger impact
            // Play Sound?
            // SoundManager.getInstance().playSFX('sfx_attack'); 
            this.lastSeenEvent = state.updated_at; // Track by timestamp
        } else if (state.last_event && this.lastSeenEvent !== state.updated_at) {
            this.lastSeenEvent = state.updated_at;
        }

        this.renderHand(myData.hand);

        // Render Active & Enemy Active
        this.renderActive(myData.active, false);
        this.renderActive(opData ? opData.active : null, true);

        // this.renderBench(myData.bench); // Optional if using strictly 1v1
        // We keep bench if they have extra cards placed there
        this.renderBench(myData.bench);
        this.renderEnemy(opData);
    }

    private getOpponentId(state: any): string {
        const ids = Object.keys(state.players);
        // Returns the ID that is NOT me
        return ids.find(id => id !== this.userId) || '';
    }

    private renderEnemy(opData: any) {
        if (!opData) return;

        // 1. Enemy Hand (Hidden, Just Backs)
        this.enemyHand.removeAll(true);
        const handCount = opData.hand ? opData.hand.length : 0;
        const startX = -(handCount - 1) * 30; // Tighter overlap

        for (let i = 0; i < handCount; i++) {
            // Fake Card Back
            const cardBack = this.add.image(startX + (i * 60), 0, 'tex_card_back_v5');
            cardBack.setDisplaySize(100, 140); // Standard size
            // Removed setScale(0.6) to avoid double-scaling conflict
            this.enemyHand.add(cardBack);
        }

        // 2. Enemy Bench (Visible -> NOW HIDDEN/BACKS)
        this.enemyBench.removeAll(true);
        if (opData.bench) {
            const isMobile = this.scale.width < 768;
            const spacing = isMobile ? 80 : 110;

            opData.bench.forEach((card: any, index: number) => {
                // Slot index mapping
                const slotIndex = index - 2;

                // SHOW BACK ONLY (Mystery Roster)
                const cardBack = this.add.image(slotIndex * spacing, 0, 'tex_card_back_v5');
                cardBack.setDisplaySize(80, 110); // Fixed small size

                this.enemyBench.add(cardBack);
            });
        }
    }

    private renderActive(activeCard: any, isEnemy: boolean) {
        const container = isEnemy ? this.enemyActive : this.playerActive;
        container.removeAll(true); // Clear previous

        // 1. Zone Placeholder
        // Show "Drop Here" if empty and My Turn (or just waiting for input)
        const bg = this.add.rectangle(0, 0, 140, 190, 0x000000, 0.3).setStrokeStyle(2, isEnemy ? 0xff0000 : 0x00ff00);

        if (!activeCard) {
            const txt = this.add.text(0, 0, isEnemy ? "No Active" : "Drop Card Here!", {
                fontSize: '14px', color: '#666'
            }).setOrigin(0.5);
            container.add([bg, txt]);

            // Re-enable drop zone
            if (!isEnemy) {
                bg.setInteractive({ dropZone: true });
                bg.setData('zoneName', 'active'); // Changed to 'active'
            }
            return;
        }

        // 2. Render Card
        const card = new BattleCard(this, 0, 0, activeCard.id, {
            id: activeCard.card_id,
            name: activeCard.name,
            image_url: activeCard.image_url,
            hp: activeCard.hp,
            types: activeCard.types
        });
        // FIX: Force explicit size to avoid texture scaling issues
        card.setDisplaySize(140, 190);
        // card.setScale(1.0); // REMOVED

        // 3. HP Bar
        // Assuming max HP is static around 100-200 for now, or read from definition if available
        // activeCard.hp is current. We need Max HP. 
        // For MVP, if Max not stored, assume 100 or use current if high? 
        // Let's assume Max is 100 for visualization ratio if Max not in JSON.
        // Actually card definition might have it. For now, just show text "HP: 80"

        const currentHp = parseInt(activeCard.hp);
        const maxHp = 100; // Placeholder
        const hpPercent = Phaser.Math.Clamp(currentHp / maxHp, 0, 1);

        const barW = 120;
        const barH = 15;
        const barY = 110;

        const hpBg = this.add.rectangle(0, barY, barW, barH, 0x333333);
        const hpFill = this.add.rectangle(-barW / 2, barY, barW * hpPercent, barH,
            hpPercent > 0.5 ? 0x00e676 : (hpPercent > 0.2 ? 0xffea00 : 0xff0000)
        ).setOrigin(0, 0.5);

        const hpText = this.add.text(0, barY, `${currentHp} HP`, {
            fontSize: '12px', color: '#fff', fontStyle: 'bold'
        }).setOrigin(0.5);

        container.add([bg, card, hpBg, hpFill, hpText]);
    }

    private renderBench(benchData: any[]) {
        // ... (Keep existing bench logic, but ensure 'active' zone is handled separately)
        // ...
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

            // CLICK TO PLAY (Alternative to Drag)
            battleCard.setInteractive({ useHandCursor: true });
            battleCard.on('pointerdown', () => {
                this.playCardAction(uid);
            });
        });
    }

    private async playCardAction(cardId: string) {
        // Optimistic check?
        // Just send RPC. The SQL logic handles Active vs Bench priority.
        try {
            const { error } = await supabase.rpc('submit_action', {
                _match_id: this.matchId,
                _action_type: 'play_pokemon',
                _payload: { card_id: cardId }
            });
            if (error) throw error;
        } catch (e: any) {
            console.error("Play Card Error:", e);
            // alert(e.message); // Optional: Silent fail or toast
        }
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
        // ATTACK BUTTON (Right Side now, not blocking Center)
        const isMobile = this.scale.width < 768;
        const btnX = this.scale.width - (isMobile ? 70 : 120);
        const btnY = this.scale.height / 2; // Middle Right

        this.attackBtn = this.add.container(btnX, btnY);
        // Smaller button if on side
        const bg = this.add.rectangle(0, 0, isMobile ? 120 : 140, 60, 0xff0000)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => this.performAttack());

        bg.setStrokeStyle(3, 0xffffff);

        const text = this.add.text(0, 0, "ATTACK!", {
            fontSize: '28px', color: '#fff', fontStyle: 'bold'
        }).setOrigin(0.5);

        this.attackBtn.add([bg, text]);
    }

    private attackBtn!: Phaser.GameObjects.Container;

    private async performAttack() {
        // Disable locally immediately
        this.updateAttackBtn(true);

        const { error } = await supabase.rpc('submit_action', {
            _match_id: this.matchId,
            _action_type: 'attack',
            _payload: {}
        });

        if (error) {
            console.error(error);
            this.updateAttackBtn(false); // Re-enable on error
            alert("Attack Failed: " + error.message);
        }
    }

    private updateAttackBtn(isWaiting: boolean) {
        if (!this.attackBtn) return;
        const bg = this.attackBtn.list[0] as Phaser.GameObjects.Rectangle;
        const txt = this.attackBtn.list[1] as Phaser.GameObjects.Text;

        if (isWaiting) {
            bg.setFillStyle(0x555555);
            txt.setText("WAITING...");
            bg.disableInteractive();
        } else {
            bg.setFillStyle(0xff0000);
            txt.setText("ATTACK!");
            bg.setInteractive();
        }
    }

    // In handleStateUpdate:
    // Check pending_actions to sync button state
    // if (state.pending_actions && state.pending_actions[this.userId]) { this.updateAttackBtn(true); } 
    // else { this.updateAttackBtn(false); }




    private handleResize(gameSize: Phaser.Structs.Size) {
        // Reload to update positions
        this.scene.restart({ matchId: this.matchId });
    }
}
