import Phaser from 'phaser';
import { supabase, getCurrentUser } from '../utils/supabaseClient';
import { Theme } from '../utils/Theme';

export default class LobbyScene extends Phaser.Scene {
    private lobbyContainer!: Phaser.GameObjects.Container;
    private refreshTimer!: Phaser.Time.TimerEvent;

    constructor() {
        super('LobbyScene');
    }

    create() {
        this.createBackground();
        this.createHeader();

        this.lobbyContainer = this.add.container(0, 100);

        this.createFooter();

        // Initial Load
        this.refreshLobbies();

        // Auto Refresh every 5s
        this.refreshTimer = this.time.addEvent({
            delay: 5000,
            callback: this.refreshLobbies,
            callbackScope: this,
            loop: true
        });
    }

    private createBackground() {
        const bg = this.add.image(this.scale.width / 2, this.scale.height / 2, 'background');
        const scaleX = this.scale.width / bg.width;
        const scaleY = this.scale.height / bg.height;
        const scale = Math.max(scaleX, scaleY);
        bg.setScale(scale).setScrollFactor(0);

        // Overlay for readability
        this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.7).setOrigin(0);
    }

    private createHeader() {
        this.add.text(this.scale.width / 2, 50, "BATTLE LOBBY", {
            fontSize: '32px',
            color: '#fff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        // Back Button
        const backBtn = this.add.text(30, 30, "< BACK", {
            fontSize: '20px', color: '#aaa'
        })
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => {
                this.scene.start('HomeScene');
            });
    }

    private createFooter() {
        const isMobile = this.scale.width < 500;

        // Ensure footer is always at bottom relative to screen height
        const footerY = this.scale.height - (isMobile ? 60 : 80);

        // Create Room Button
        const btn = this.add.container(this.scale.width / 2, footerY);

        const btnW = isMobile ? 180 : 250;
        const btnH = isMobile ? 50 : 60;

        const bg = this.add.rectangle(0, 0, btnW, btnH, 0x00e676)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => this.createRoom());

        const text = this.add.text(0, 0, "CREATE ROOM", {
            fontSize: isMobile ? '18px' : '24px', color: '#000', fontStyle: 'bold'
        }).setOrigin(0.5);

        btn.add([bg, text]);
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
                this.add.text(this.scale.width / 2, 100, "No rooms found. Create one!", {
                    fontSize: '18px', color: '#888'
                }).setOrigin(0.5)
            );
            return;
        }

        let y = 0;
        const isMobile = this.scale.width < 500;
        const rowW = Math.min(600, this.scale.width - 20);
        const rowH = isMobile ? 50 : 60;

        lobbies.forEach((room: any) => {
            const row = this.add.container(this.scale.width / 2, y);

            // Row BG
            const bg = this.add.rectangle(0, 0, rowW, rowH, 0x222222)
                .setStrokeStyle(1, 0x444444);

            // Host Name
            const nameX = isMobile ? -rowW / 2 + 20 : -150;
            const name = this.add.text(nameX, 0, room.host_name || "Unknown", {
                fontSize: isMobile ? '16px' : '18px', color: '#fff'
            }).setOrigin(0, 0.5);

            // Limit Name Length visually?
            if (name.width > (rowW / 2)) {
                name.setText(name.text.substring(0, 10) + '...');
            }

            // Join Button
            const btnX = isMobile ? rowW / 2 - 50 : 150;
            const joinBtn = this.add.container(btnX, 0);
            const joinBg = this.add.rectangle(0, 0, isMobile ? 60 : 80, isMobile ? 30 : 40, 0x2196f3)
                .setInteractive({ useHandCursor: true })
                .on('pointerdown', () => this.joinRoom(room.id));
            const joinTxt = this.add.text(0, 0, "JOIN", { fontSize: '14px', fontStyle: 'bold' }).setOrigin(0.5);
            joinBtn.add([joinBg, joinTxt]);

            row.add([bg, name, joinBtn]);

            this.lobbyContainer.add(row);
            y += (rowH + 10);
        });
    }

    private async createRoom() {
        // Show loading?
        const { data, error } = await supabase.rpc('create_room');
        if (error) {
            alert("Failed to create room: " + error.message);
            return;
        }

        console.log("Room created:", data);
        // Navigate to Battle Scene (Waiting State)
        // Wait, if we go to BattleScene, it needs to handle "Waiting for Opponent" UI.
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
