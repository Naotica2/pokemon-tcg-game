import Phaser from 'phaser';
import { Theme } from '../utils/Theme';
import SoundManager from '../utils/SoundManager';
import { supabase } from '../utils/supabaseClient';

export default class HomeScene extends Phaser.Scene {
    constructor() {
        super('HomeScene');
    }

    async create() {
        this.createBackground();
        this.createParticles();
        this.createTitle();

        // Auto-Seed Check
        await this.checkAndSeedData(); // Await the seeding process

        // Play BGM after potential seeding is done and menu is created
        SoundManager.getInstance().playBGM('bgm_home');

        this.scale.on('resize', this.handleResize, this);
    }

    private handleResize(gameSize: Phaser.Structs.Size) {
        // Simple way: Restart scene to re-calculate everything
        // Or re-position elements. For HomeScene, restarting is cleanest and cheapest.
        this.scene.restart();
    }

    private createParticles() {
        // Ambient particles
        if (this.textures.exists('particle_glint')) {
            this.add.particles(0, 0, 'particle_glint', {
                x: { min: 0, max: this.scale.width },
                y: { min: 0, max: this.scale.height },
                lifespan: 5000,
                speedY: { min: -5, max: -20 },
                scale: { start: 0.05, end: 0 },
                alpha: { start: 0.3, end: 0 },
                quantity: 1,
                frequency: 500,
                blendMode: 'ADD'
            });
        }
    }

    private createTitle() {
        const titleText = "POKEMON TCG\nBY NAOTICA";
        const fontSize = Math.min(this.scale.width * 0.1, 80); // Responsive Font Size

        const title = this.add.text(this.scale.width / 2, this.scale.height * 0.15, titleText, {
            fontFamily: Theme.fonts.header.fontFamily,
            fontSize: `${fontSize}px`,
            color: '#fff',
            align: 'center',
            stroke: Theme.colors.primary.toString(),
            strokeThickness: 2,
            shadow: { blur: 20, color: Theme.colors.primary.toString(), fill: true }
        }).setOrigin(0.5);
    }

    private async checkAndSeedData() {
        try {
            const { count } = await supabase.from('cards').select('*', { count: 'exact', head: true });

            if (count === null || count < 50) {
                const loading = this.add.text(this.scale.width / 2, this.scale.height - 50, "INITIALIZING FIRST TIME SETUP (DOWNLOADING CARDS)...", {
                    fontSize: '20px', color: '#00e676', backgroundColor: '#000'
                }).setOrigin(0.5);

                const DataSeeder = (await import('../utils/DataSeeder')).default;
                await DataSeeder.seedGeneticApex();

                loading.setText("SETUP COMPLETE! ENJOY.");
                this.time.delayedCall(2000, () => loading.destroy());

                // Re-init menu or just let them play
                this.createMenu();
            } else {
                this.createMenu();
            }
        } catch (e) {
            console.error("Auto-seed failed", e);
            this.createMenu(); // Fallback
        }
    }

    private createBackground() {
        if (this.textures.exists('bg_gradient')) {
            const bg = this.add.image(this.scale.width / 2, this.scale.height / 2, 'bg_gradient');
            bg.setDisplaySize(this.scale.width, this.scale.height);
            bg.setAlpha(0.5);
        } else {
            this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x111111).setOrigin(0);
        }
    }

    private createMenu() {
        const isMobile = this.scale.width < 768;

        // Menu Items
        const menuItems = [
            { label: "BATTLE", scene: 'BattleScene', color: Theme.colors.warning },
            { label: "MY COLLECTION", scene: 'CollectionScene', color: Theme.colors.secondary },
            { label: "OPEN PACKS (GACHA)", scene: 'PackOpeningScene', color: Theme.colors.primary },
            { label: "M A R K E T", scene: 'MarketplaceScene', color: Theme.colors.success },
            { label: "MY PROFILE", scene: 'ProfileScene', color: 0x9966ff },
        ];

        // Dynamic Spacing & Centering
        const count = menuItems.length;
        const btnHeightStr = isMobile ? 55 : 65;
        const baseGap = isMobile ? 75 : 85;

        // Calculate total height required
        const totalMenuHeight = (count - 1) * baseGap;

        // Available vertical space: Screen Height - Top Offset (Title) - Bottom Padding
        // Title is at 15%. Title height approx 15%. Safe zone starts at 30% or minimum 220px.
        const safeTopMargin = Math.max(this.scale.height * 0.35, 220);
        const bottomPadding = 40;
        const availableHeight = this.scale.height - safeTopMargin - bottomPadding;

        // Determine Start Y
        let startY = 0;

        if (availableHeight > totalMenuHeight) {
            // Center in the safe zone (bottom 65% of screen)
            startY = safeTopMargin + (availableHeight - totalMenuHeight) / 2;
        } else {
            // If tight, enforce the safe margin so we DON'T overlap title
            startY = safeTopMargin;
        }

        menuItems.forEach((item, index) => {
            this.createMenuButton(this.scale.width / 2, startY + (index * baseGap), item, isMobile);
        });

        // Audio Toggle
        this.createAudioToggle();
    }

    private createMenuButton(x: number, y: number, item: { label: string, scene: string, color: number }, isMobile: boolean) {
        const container = this.add.container(x, y);

        // Responsive Button Width (Balanced: Max 420 for Desktop, 85% for Mobile)
        const btnWidth = isMobile ? this.scale.width * 0.85 : Math.min(420, this.scale.width * 0.6);
        const btnHeight = isMobile ? 55 : 65; // Balanced desktop height
        const fontSize = isMobile ? '22px' : '24px'; // Balanced font size

        // Button Shape
        const bg = this.add.rectangle(0, 0, btnWidth, btnHeight, 0x000000, 0.7)
            .setStrokeStyle(2, item.color)
            .setInteractive({ useHandCursor: true });

        // Text
        const text = this.add.text(0, 0, item.label, {
            fontFamily: Theme.fonts.header.fontFamily,
            fontSize: fontSize,
            color: '#ffffff'
        }).setOrigin(0.5);

        // Icon (Left side)
        const indicator = this.add.rectangle(-btnWidth / 2 + 10, 0, 8, btnHeight - 12, item.color).setOrigin(0, 0.5);
        // Icon (Right side)
        const indicatorRight = this.add.rectangle(btnWidth / 2 - 20, 0, 8, btnHeight - 12, item.color).setOrigin(0, 0.5);

        container.add([bg, indicator, indicatorRight, text]);

        // Interactions
        bg.on('pointerover', () => {
            this.tweens.add({ targets: container, scale: 1.05, duration: 100, ease: 'Back.easeOut' });
            bg.setFillStyle(item.color, 0.3);
            SoundManager.getInstance().playSFX('click', { volume: 0.5 });
        });

        bg.on('pointerout', () => {
            this.tweens.add({ targets: container, scale: 1.0, duration: 100, ease: 'Power2.easeOut' });
            bg.setFillStyle(0x000000, 0.7);
        });

        bg.on('pointerdown', () => {
            SoundManager.getInstance().playSFX('click');
            // Transition effect
            this.cameras.main.fadeOut(300, 0, 0, 0);
            this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
                this.scene.start(item.scene);
            });
        });
    }

    private createAudioToggle() {
        const text = this.add.text(this.scale.width - 40, 40, "🔊", {
            fontSize: '40px', color: '#fff'
        }).setOrigin(1, 0).setInteractive({ useHandCursor: true });

        text.on('pointerdown', () => {
            const isMuted = this.sound.mute;
            this.sound.mute = !isMuted;
            text.setText(this.sound.mute ? "🔇" : "🔊");
        });
    }
}
