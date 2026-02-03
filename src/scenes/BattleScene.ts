import Phaser from 'phaser';

// Mocking the GameState type if strictly needed, or importing it
// import { GameState } from '../types/GameState';

export default class BattleScene extends Phaser.Scene {
    // UI Containers
    private myHandContainer!: Phaser.GameObjects.Container;
    private myBenchContainer!: Phaser.GameObjects.Container;
    private myActiveContainer!: Phaser.GameObjects.Container;

    private oppHandContainer!: Phaser.GameObjects.Container;
    private oppBenchContainer!: Phaser.GameObjects.Container;
    private oppActiveContainer!: Phaser.GameObjects.Container;

    // Realtime State
    private isMyTurn = false;

    constructor() {
        super('BattleScene');
    }

    preload() {
        // Load Placeholders
        this.load.image('board_bg', 'https://placehold.co/1920x1080/1a1a1a/FFF.png?text=Battle+Mat');
        this.load.image('card_back', 'assets/card_back.png');
        this.load.image('card_front', 'assets/card_placeholder.png'); // Dynamic later
    }

    create() {
        // 1. Background (Battle Mat)
        this.createBackground();

        // 2. Zone Setup (Visual Coordinates)
        this.setupZones();

        // 3. Connect to Server (Mocked for now)
        this.connectToMatch('match-id-123');

        this.scale.on('resize', () => {
            this.createBackground(); // Re-center BG
            this.setupZones();
        });
    }

    private createBackground() {
        if (this.background) this.background.destroy();
        this.background = this.add.image(this.scale.width / 2, this.scale.height / 2, 'board_bg')
            .setDisplaySize(this.scale.width, this.scale.height);
        this.children.sendToBack(this.background);
    }

    private background: Phaser.GameObjects.Image | null = null;

    private setupZones() {
        const cx = this.scale.width / 2;
        const cy = this.scale.height / 2;

        // Clear old containers if they exist (for resize)
        if (this.oppActiveContainer) this.oppActiveContainer.destroy();
        if (this.oppBenchContainer) this.oppBenchContainer.destroy();
        if (this.oppHandContainer) this.oppHandContainer.destroy();
        if (this.myActiveContainer) this.myActiveContainer.destroy();
        if (this.myBenchContainer) this.myBenchContainer.destroy();
        if (this.myHandContainer) this.myHandContainer.destroy();

        // --- OPPONENT (Top) ---
        // Active Spot
        this.oppActiveContainer = this.add.container(cx, cy - 150);
        this.add.rectangle(cx, cy - 150, 100, 140, 0xff0000, 0.3).setOrigin(0.5); // Debug Zone

        // Bench (Top Row)
        this.oppBenchContainer = this.add.container(cx, cy - 300);

        // Hand (Top Edge - Masked)
        this.oppHandContainer = this.add.container(cx, -50);

        // --- PLAYER (Bottom) ---
        // Active Spot
        this.myActiveContainer = this.add.container(cx, cy + 150);
        const myActiveZone = this.add.rectangle(cx, cy + 150, 100, 140, 0x00ff00, 0.3).setOrigin(0.5);
        myActiveZone.setInteractive();
        myActiveZone.on('pointerdown', () => this.handleZoneClick('active'));

        // Bench (Bottom Row)
        this.myBenchContainer = this.add.container(cx, cy + 300);

        // Hand (Bottom Edge)
        this.myHandContainer = this.add.container(cx, this.scale.height - 80);
    }

    private handleZoneClick(zoneType: string) {
        console.log(`Clicked zone: ${zoneType}`);
        // Logic to select card or target for attack would go here
    }

    // --- CORE LOGIC: Rendering the State ---
    // This function is called whenever Supabase Realtime sends a new JSON packet
    public onStateUpdate(gameState: any) { // Type: GameState
        this.isMyTurn = gameState.currentPlayerId === 'my-user-id'; // Replace with real Auth ID

        // 1. Render My Active
        this.renderCard(this.myActiveContainer, gameState.player1.activePokemon);

        // 2. Render My Hand
        this.renderHand(this.myHandContainer, gameState.player1.hand);

        // 3. Update UI Hints
        if (this.isMyTurn) {
            this.add.text(100, 100, "YOUR TURN", { fontSize: '48px', color: '#0f0' });
        }
    }

    private renderCard(container: Phaser.GameObjects.Container, cardData: any) {
        container.removeAll(true);
        if (!cardData) return;

        // Visual
        const card = this.add.sprite(0, 0, 'card_front').setDisplaySize(100, 140);
        container.add(card);

        // Text Info
        const hpText = this.add.text(0, -50, `${cardData.currentHp} HP`, {
            fontSize: '12px', color: '#fff', backgroundColor: '#000'
        }).setOrigin(0.5);
        container.add(hpText);
    }

    private renderHand(container: Phaser.GameObjects.Container, handCards: any[]) {
        container.removeAll(true);

        handCards.forEach((card, index) => {
            // Centered layout
            const xOffset = (index - handCards.length / 2) * 110;
            const sprite = this.add.sprite(xOffset, 0, 'card_front').setDisplaySize(100, 140);

            // INTERACTIVITY
            sprite.setInteractive();
            sprite.on('pointerdown', () => {
                if (this.isMyTurn) this.submitMove('play_basic', { cardId: card.instanceId });
            });

            // Hover Effect
            sprite.on('pointerover', () => {
                this.tweens.add({ targets: sprite, y: -20, duration: 100 });
            });
            sprite.on('pointerout', () => {
                this.tweens.add({ targets: sprite, y: 0, duration: 100 });
            });

            container.add(sprite);
        });
    }

    // --- NETWORKING ---
    private async submitMove(type: string, payload: any) {
        console.log('Sending Move:', type, payload);

        // Call the Edge Function
        // const { data, error } = await supabase.functions.invoke('submit-move', {
        //   body: { matchId: ..., type, payload }
        // });

        // Optimistic Update (Show result immediately while waiting)
        // this.simulateMove(type, payload);
    }

    private connectToMatch(matchId: string) {
        console.log(`Subscribing to match ${matchId}...`);
        // supabase.channel(`match:${matchId}`)
        //   .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches' }, payload => {
        //       this.onStateUpdate(payload.new.current_state);
        //   })
        //   .subscribe();
    }
}
