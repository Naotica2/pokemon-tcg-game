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

    // Persistent Identity
    private player1Id: string | null = null;
    private player2Id: string | null = null;
    private debugIdText?: Phaser.GameObjects.Text;

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

    preload() {
        this.load.audio('sfx_attack', 'sfx/attack colorless & PING.mp3');
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
        // Fix: Use matchData.updated_at (Server Timestamp) to track changes reliably
        if (state.last_event && state.last_event.type === 'combat_resolved' && this.lastSeenEvent !== matchData.updated_at) {
            this.cameras.main.shake(500, 0.02);

            // 1. SFX
            this.sound.play('sfx_attack');

            // 2. SHOW FLOATING DAMAGE & DEBUG
            const evt = state.last_event;
            const dmgP1 = evt.dmg_p1 || 0;
            const dmgP2 = evt.dmg_p2 || 0;
            const t1 = evt.debug_type_p1 || '?';
            const t2 = evt.debug_type_p2 || '?';
            const r1 = evt.debug_rarity_p1 || '?';
            const r2 = evt.debug_rarity_p2 || '?';
            const b1 = evt.debug_base_p1 || '?';
            const b2 = evt.debug_base_p2 || '?';
            const n1 = evt.debug_name_p1 || 'P1';
            const n2 = evt.debug_name_p2 || 'P2';

            // Now these are Modifiers (+5, -5, 0)
            const mod1 = evt.mult_p1 || 0;

            // Format Modifier Text
            const modStr = mod1 > 0 ? `+${mod1}` : (mod1 < 0 ? `${mod1}` : '');

            // Debug Toast (Floating/Fading)
            // SHOW RARITY for Debugging
            const dText = this.add.text(this.scale.width / 2, this.scale.height / 2,
                `[${n1}:${r1}(${b1})] vs [${n2}:${r2}(${b2})]\n${t1} vs ${t2} ${modStr ? `(${modStr})` : ''}`,
                { fontSize: '16px', backgroundColor: '#000', color: '#fff', align: 'center' }
            ).setOrigin(0.5).setDepth(3000)
                .setAlpha(1).setScale(1);

            this.tweens.add({
                targets: dText, y: dText.y - 50, alpha: 0,
                duration: 3000, delay: 1000,
                onComplete: () => dText.destroy()
            });

            // Floating Damage (MAPPED BY IDENTITY)
            // Identity Logic with Visual Debug
            if (matchData.player1_id) this.player1Id = matchData.player1_id;
            // Also try to recover P1 ID from state.players keys if possible (First inserted key? Unreliable but hinting)

            const p1ID = (this.player1Id || matchData.player1_id || "").trim();
            const myID = (this.userId || "").trim();
            const isP1 = (myID === p1ID);

            // VISUAL DEBUG FOR IDS (Top Left)
            if (!this.debugIdText) {
                this.debugIdText = this.add.text(10, 10, "", { fontSize: '10px', color: '#00ff00', backgroundColor: '#000' }).setDepth(9999);
            }
            this.debugIdText.setText(`Me: ${myID.substring(0, 8)}...\nP1: ${p1ID.substring(0, 8)}...\nIsP1: ${isP1}\nDmgP1: ${dmgP1}, DmgP2: ${dmgP2}`);

            console.log(`[BattleScene] Identity Check: Me=${myID}, P1=${p1ID}, IsP1=${isP1}`);

            // My Damage Received = If I am P1, dmgP1. If I am P2, dmgP2.
            const dmgToMe = isP1 ? dmgP1 : dmgP2;
            const dmgToOpp = isP1 ? dmgP2 : dmgP1;

            if (dmgToMe > 0) this.showFloatingText(this.playerActive.x, this.playerActive.y, `-${dmgToMe}`, 0xff0000);
            if (dmgToOpp > 0) this.showFloatingText(this.enemyActive.x, this.enemyActive.y, `-${dmgToOpp}`, 0xff0000);

            this.lastSeenEvent = matchData.updated_at;
        } else if (state.last_event && this.lastSeenEvent !== matchData.updated_at) {
            this.lastSeenEvent = matchData.updated_at;
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

    private showFloatingText(x: number, y: number, msg: string, color: number) {
        const txt = this.add.text(x, y, msg, {
            fontSize: '40px', fontStyle: 'bold', stroke: '#000', strokeThickness: 4, color: '#ff0000'
        }).setOrigin(0.5).setDepth(2000);

        this.tweens.add({
            targets: txt, y: y - 100, alpha: 0, duration: 1500, ease: 'Power2',
            onComplete: () => txt.destroy()
        });
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
        container.removeAll(true);

        // 1. Zone Background (Included in createPlaceholders, but we might need to recreate if we clear)
        const bg = this.add.rectangle(0, 0, 150, 200, 0x000000, 0.4).setStrokeStyle(2, isEnemy ? 0xff0000 : 0x00ff00, 0.5);
        container.add(bg);

        if (!activeCard) {
            const txt = this.add.text(0, 0, isEnemy ? "NO ACTIVE" : "PLAY CARD", {
                fontSize: '16px', color: '#555', fontStyle: 'bold'
            }).setOrigin(0.5);
            container.add(txt);
            if (!isEnemy) bg.setInteractive({ dropZone: true }).setData('zoneName', 'active');
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
        card.setDisplaySize(150, 200);

        // 3. HP Bar (Relative to Card Size)
        const currentHp = parseInt(activeCard.hp);
        const maxHp = 100;
        const hpPercent = Phaser.Math.Clamp(currentHp / maxHp, 0, 1);

        const barW = 140;
        const barH = 20;
        const barY = isEnemy ? -120 : 120; // Above for enemy, below for player

        const hpBg = this.add.rectangle(0, barY, barW, barH, 0x000000, 0.8).setStrokeStyle(1, 0x444444);
        const hpFill = this.add.rectangle(-barW / 2, barY, barW * hpPercent, barH,
            hpPercent > 0.5 ? 0x00e676 : (hpPercent > 0.2 ? 0xffea00 : 0xff0000)
        ).setOrigin(0, 0.5);

        const hpText = this.add.text(0, barY, `${currentHp}/${maxHp} HP`, {
            fontSize: '14px', color: '#fff', fontStyle: 'bold'
        }).setOrigin(0.5);

        container.add([card, hpBg, hpFill, hpText]);
    }

    private renderBench(benchData: any[]) {
        this.playerBench.removeAll(true);
        // Recreate slots
        for (let i = -2; i <= 2; i++) {
            const slot = this.add.rectangle(i * 120, 0, 110, 110, 0x000000, 0.2).setStrokeStyle(1, 0x333333);
            slot.setInteractive({ dropZone: true }).setData('zoneName', 'bench');
            this.playerBench.add(slot);
        }

        if (!benchData) return;

        benchData.forEach((cardData: any, index: number) => {
            if (index > 4) return; // Limit to 5
            const slotIndex = index - 2;
            const card = new BattleCard(this, slotIndex * 120, 0, cardData.id, {
                id: cardData.card_id,
                name: cardData.name,
                image_url: cardData.image_url,
                hp: cardData.hp,
                types: cardData.types
            });
            card.setDisplaySize(110, 110); // Square-ish for bench
            this.playerBench.add(card);
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
        this.playerHand.removeAll(true);
        if (!handData || handData.length === 0) return;

        const isPortrait = this.scale.height > this.scale.width;
        // Dynamic Spacing: if many cards, overlap them more
        // In portrait, we have less width, so be more aggressive with overlapping
        const maxDisplayW = (this.scale.width * (isPortrait ? 0.95 : 0.8)) / this.scaleFactor;
        const cardW = 100;
        const spacing = Math.min(cardW + 10, maxDisplayW / handData.length);
        const startX = -(handData.length - 1) * spacing / 2;

        handData.forEach((card: any, index: number) => {
            const battleCard = new BattleCard(this, startX + (index * spacing), 0, card.id, {
                id: card.card_id,
                name: card.name,
                image_url: card.image_url,
                hp: card.hp,
                types: card.types
            });
            battleCard.setDisplaySize(100, 140);
            this.playerHand.add(battleCard);

            battleCard.setInteractive({ useHandCursor: true });
            battleCard.on('pointerdown', () => this.playCardAction(card.id));
        });
    }

    private async playCardAction(cardId: string) {
        try {
            const { error } = await supabase.rpc('submit_action', {
                _match_id: this.matchId,
                _action_type: 'play_pokemon',
                _payload: { card_id: cardId }
            });
            if (error) throw error;
        } catch (e: any) {
            alert("Msg from Prof. Oak: " + e.message);
        }
    }

    private createBackground() {
        // Dark Battle Mat
        this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x121212).setOrigin(0);

        // Grid / Hex pattern
        const grid = this.add.grid(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 50, 50, 0x1e1e1e, 1, 0x111111, 1);
        grid.setAlpha(0.3);
    }


    private scaleFactor: number = 1.0;

    private setupZones() {
        const w = this.scale.width;
        const h = this.scale.height;
        const cx = w / 2;
        const isPortrait = h > w;

        // --- RESPONSIVE CALCS ---
        // Base design is 1280x720.
        const scaleX = w / 1280;
        const scaleY = h / 720;

        // Use a more adaptive scale factor
        if (isPortrait) {
            // In portrait, we want it to feel big! 
            // Boosting from 0.85 to 1.1 to satisfy the "too small" feedback
            this.scaleFactor = (w / 375) * 1.05;
        } else {
            this.scaleFactor = Math.min(scaleX, scaleY);
        }

        // Clamp scale factor to reasonable limits - slightly higher max for mobile
        this.scaleFactor = Phaser.Math.Clamp(this.scaleFactor, 0.4, 1.4);

        // --- PLAYER ZONES ---
        this.playerZone = this.add.container(0, 0);

        // Hand: Bottom Edge - Very close to bottom but visible
        const handY = isPortrait ? h - (70 * this.scaleFactor) : h * 0.90;
        this.playerHand = this.add.container(cx, handY);
        this.playerHand.setScale(this.scaleFactor);

        // Bench: Lower Area - Condensed for larger cards
        const pBenchY = isPortrait ? h * 0.77 : h * 0.78;
        this.playerBench = this.add.container(cx, pBenchY);
        this.playerBench.setScale(this.scaleFactor * 0.85); // Slightly smaller bench to fit 5

        // Active: Lower-Center
        const pActiveY = isPortrait ? h * 0.59 : h * 0.62;
        this.playerActive = this.add.container(cx, pActiveY);
        this.playerActive.setScale(this.scaleFactor);

        // --- ENEMY ZONES ---
        this.enemyZone = this.add.container(0, 0);

        // Enemy Hand: Top Edge
        const eHandY = isPortrait ? (60 * this.scaleFactor) : h * 0.08;
        this.enemyHand = this.add.container(cx, eHandY);
        this.enemyHand.setScale(this.scaleFactor);

        // Enemy Bench: Upper Area
        const eBenchY = isPortrait ? h * 0.20 : h * 0.18;
        this.enemyBench = this.add.container(cx, eBenchY);
        this.enemyBench.setScale(this.scaleFactor * 0.85);

        // Enemy Active: Upper-Center
        const eActiveY = isPortrait ? h * 0.38 : h * 0.35;
        this.enemyActive = this.add.container(cx, eActiveY);
        this.enemyActive.setScale(this.scaleFactor);

        // --- RE-RENDER PLACEHOLDERS ---
        this.createPlaceholders();

        // Deck (Bottom Right)
        const deckX = isPortrait ? w * 0.88 : w * 0.92;
        const deckY = isPortrait ? h * 0.77 : h * 0.88;
        this.playerDeck = this.add.container(deckX, deckY);
        this.playerDeck.setScale(this.scaleFactor * 0.65);
        this.playerDeck.add(this.add.rectangle(0, 0, 100, 140, 0x333333, 0.5).setStrokeStyle(1, 0x666666));
        this.playerDeck.add(this.add.text(0, 0, "DECK", { fontSize: '14px' }).setOrigin(0.5));

        this.add.existing(this.playerZone);
        this.add.existing(this.enemyZone);
    }

    private createPlaceholders() {
        // Player Bench Slots
        for (let i = -2; i <= 2; i++) {
            const slot = this.add.rectangle(i * 120, 0, 110, 110, 0x000000, 0.2).setStrokeStyle(1, 0x333333);
            slot.setInteractive({ dropZone: true }).setData('zoneName', 'bench');
            this.playerBench.add(slot);
        }

        // Active Slots
        const pActBg = this.add.rectangle(0, 0, 150, 200, 0x000000, 0.4).setStrokeStyle(2, 0x00ff00, 0.5);
        pActBg.setInteractive({ dropZone: true }).setData('zoneName', 'active');
        this.playerActive.add(pActBg);

        const eActBg = this.add.rectangle(0, 0, 150, 200, 0x000000, 0.4).setStrokeStyle(2, 0xff0000, 0.5);
        this.enemyActive.add(eActBg);
    }

    private createUI() {
        const w = this.scale.width;
        const h = this.scale.height;

        // ATTACK BUTTON (Dynamic Position)
        const btnX = w * 0.88;
        const btnY = h * 0.50;
        this.attackBtn = this.add.container(btnX, btnY);
        this.attackBtn.setScale(this.scaleFactor);

        const btnW = 160;
        const btnH = 60;

        const bg = this.add.rectangle(0, 0, btnW, btnH, 0xff0000)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => this.performAttack());
        bg.setStrokeStyle(3, 0xffffff);

        const text = this.add.text(0, 0, "ATTACK", {
            fontSize: '24px', color: '#fff', fontStyle: 'bold'
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
