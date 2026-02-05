import Phaser from 'phaser';
import { supabase, getCurrentUser } from '../utils/supabaseClient';
import { Theme } from '../utils/Theme';

export default class LobbyScene extends Phaser.Scene {
    private lobbyContainer!: Phaser.GameObjects.Container;
    private refreshTimer!: Phaser.Time.TimerEvent;
    private channel: any;
    private createRoomBtn!: Phaser.GameObjects.Container; // Store reference

    constructor() {
        super('LobbyScene');
    }

    create() {
        this.createBackground();
        this.createHeader();

        this.lobbyContainer = this.add.container(0, 120);

        this.createFooter();

        // Initial Load
        this.refreshLobbies();

        // Realtime Subscription
        this.subscribeToLobbies();

        // Fallback polling (every 10s just in case)
        this.refreshTimer = this.time.addEvent({
            delay: 10000,
            callback: this.refreshLobbies,
            callbackScope: this,
            loop: true
        });

        // Cleanup on destroy
        this.events.on('shutdown', () => {
            if (this.channel) supabase.removeChannel(this.channel);
        });
        this.scale.on('resize', this.handleResize, this);
    }

    update() {
        // TOP-RIGHT PINNING (V7)
        if (this.createRoomBtn) {
            const isMobile = this.scale.width < 500;
            const btnX = this.scale.width - (isMobile ? 70 : 100);
            const btnY = 60;

            this.createRoomBtn.setX(btnX);
            this.createRoomBtn.setY(btnY);
        }
    }

    private handleResize(gameSize: Phaser.Structs.Size) {
        this.scene.restart(); // Simple restart to re-layout
    }

    private subscribeToLobbies() {
        this.channel = supabase
            .channel('lobby-updates')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'matches' },
                (payload: any) => {
                    console.log('Lobby Update:', payload);
                    this.refreshLobbies(); // Refresh full list on any change for simplicity
                }
            )
            .subscribe();
    }

    private createBackground() {
        const bg = this.add.image(this.scale.width / 2, this.scale.height / 2, 'background');
        const scaleX = this.scale.width / bg.width;
        const scaleY = this.scale.height / bg.height;
        const scale = Math.max(scaleX, scaleY);
        bg.setScale(scale).setScrollFactor(0);

        // Overlay for readability
        this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.8).setOrigin(0);
    }

    private createHeader() {
        this.add.text(this.scale.width / 2, 60, "BATTLE ARENA (V7)", {
            fontSize: '36px',
            color: '#fff',
            fontStyle: 'bold',
            fontFamily: Theme.fonts.header.fontFamily
        }).setOrigin(0.5);

        // Back Button
        const backBtn = this.add.container(40, 40);
        const backBg = this.add.circle(0, 0, 25, 0x333333).setStrokeStyle(1, 0x666666);
        const backTxt = this.add.text(0, 0, "<", { fontSize: '24px', color: '#fff' }).setOrigin(0.5);
        backBtn.add([backBg, backTxt]);

        backBtn.setInteractive(new Phaser.Geom.Circle(0, 0, 30), Phaser.Geom.Circle.Contains)
            .on('pointerdown', () => {
                this.scene.start('HomeScene');
            });
    }

    private createFooter() {
        const isMobile = this.scale.width < 500;

        // RELOCATION: Top Right Corner
        // No longer a footer. It's a header action button.
        const btnX = this.scale.width - (isMobile ? 70 : 100);
        const btnY = 60; // Same as header centerY

        // Create Room Button
        this.createRoomBtn = this.add.container(btnX, btnY);
        this.createRoomBtn.setScrollFactor(0).setDepth(2000); // UI Layer

        const btnW = isMobile ? 100 : 140;
        const btnH = isMobile ? 40 : 50;

        const bg = this.add.rectangle(0, 0, btnW, btnH, 0x00e676)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => this.createRoom());

        bg.setStrokeStyle(2, 0x000000);

        const text = this.add.text(0, 0, "+ BATTLE", {
            fontSize: isMobile ? '14px' : '18px', color: '#000', fontStyle: 'bold'
        }).setOrigin(0.5);

        this.createRoomBtn.add([bg, text]);
    }

    private async refreshLobbies() {
        const { data, error } = await supabase.rpc('get_lobbies');

        if (error) {
            console.error("Error fetching lobbies:", error);
            return;
        }

        this.renderLobbies(data || []);
    }

    private renderLobbies(lobbies: any[]) {
        this.lobbyContainer.removeAll(true);

        if (lobbies.length === 0) {
            this.lobbyContainer.add(
                this.add.text(this.scale.width / 2, 100, "No active battles.\nStart one below!", {
                    fontSize: '18px', color: '#888', align: 'center'
                }).setOrigin(0.5)
            );
            return;
        }

        let y = 0;
        const isMobile = this.scale.width < 500;
        const rowW = Math.min(600, this.scale.width - 40);
        const rowH = isMobile ? 70 : 80;

        lobbies.forEach((room: any) => {
            const row = this.add.container(this.scale.width / 2, y);

            // Row BG
            const bg = this.add.rectangle(0, 0, rowW, rowH, 0x1f1f1f)
                .setStrokeStyle(1, 0x333333);

            // Avatar Placeholder (Circle)
            const avaX = -rowW / 2 + (isMobile ? 40 : 50);
            const avatarParams = isMobile ? 20 : 25;
            const avatar = this.add.circle(avaX, 0, avatarParams, 0x444444);
            // If we had images: this.add.image...

            // Host Name
            const nameX = avaX + (isMobile ? 35 : 45);
            const hostName = room.host_name || "Unknown Trainer";
            const name = this.add.text(nameX, -10, hostName, {
                fontSize: isMobile ? '16px' : '20px', color: '#fff', fontStyle: 'bold'
            }).setOrigin(0, 0.5);

            // Status Text
            const status = this.add.text(nameX, 15, "Waiting for opponent...", {
                fontSize: '12px', color: '#aaa'
            }).setOrigin(0, 0.5);

            // Join Button
            const btnW = isMobile ? 80 : 100;
            const btnH = isMobile ? 36 : 44;
            const btnX = rowW / 2 - (btnW / 2) - 20;

            const joinBtn = this.add.container(btnX, 0);
            const joinBg = this.add.rectangle(0, 0, btnW, btnH, 0x2979ff)
                .setInteractive({ useHandCursor: true })
                .on('pointerdown', () => this.joinRoom(room.id));

            const joinTxt = this.add.text(0, 0, "JOIN", {
                fontSize: '14px', fontStyle: 'bold'
            }).setOrigin(0.5);

            joinBtn.add([joinBg, joinTxt]);

            row.add([bg, avatar, name, status, joinBtn]);

            this.lobbyContainer.add(row);
            y += (rowH + 15);
        });
    }

    private async createRoom() {
        // Show loading/waiting UI immediately
        const loading = this.add.container(0, 0);
        const bg = this.add.rectangle(this.scale.width / 2, this.scale.height / 2, 300, 150, 0x000000, 0.9).setStrokeStyle(1, 0x444444);
        const txt = this.add.text(this.scale.width / 2, this.scale.height / 2 - 20, "Creating Room...", { fontSize: '20px' }).setOrigin(0.5);
        loading.add([bg, txt]);
        this.add.existing(loading);

        const { data, error } = await supabase.rpc('create_room');

        loading.destroy();

        if (error) {
            alert("Failed to create room: " + error.message);
            return;
        }

        console.log("Room created:", data);
        this.scene.start('BattleScene', { matchId: data.id });
    }

    private async joinRoom(matchId: string) {
        const { data, error } = await supabase.rpc('join_room', { _match_id: matchId });
        if (error) {
            alert("Failed to join room: " + error.message);
            return;
        }

        console.log("Joined room:", data);
        this.scene.start('BattleScene', { matchId: matchId });
    }
}
