import Phaser from 'phaser';
import SoundManager from '../utils/SoundManager';
import { Theme } from '../utils/Theme';
import { supabase, getCurrentUser } from '../utils/supabaseClient';

export default class PackOpeningScene extends Phaser.Scene {
    private packContainer!: Phaser.GameObjects.Container;
    private isOpening = false;
    private selectedPackId: number | null = null;
    private pulledCardsData: any[] = [];
    private shopContainer!: Phaser.GameObjects.Container;

    constructor() {
        super('PackOpeningScene');
    }

    preload() {
        // FORCE NEW KEYS v5
        this.load.image('tex_card_back_v5', 'assets/card_back_v3.png');

        // Effects
        this.load.image('particle_glint', 'https://labs.phaser.io/assets/particles/blue.png');
        this.load.image('bg_gradient', 'https://labs.phaser.io/assets/skies/space3.png');

        SoundManager.preload(this);
    }

    create() {
        try { SoundManager.init(this); SoundManager.getInstance().playBGM('bgm_home'); } catch (e) { }

        // 1. GENERATE PLASTIC PACK TEXTURES (Procedural)
        this.createProceduralPacks();

        this.createCinematicBackground();

        this.showShopUI();

        this.scale.on('resize', () => {
            if (!this.isOpening) {
                this.scene.restart();
            }
        });
    }

    /**
     * Creates "Plastic Foil" looking textures using purely code (Phaser Graphics).
     * No external images for packs.
     */
    private createProceduralPacks() {
        // Definitions for styles
        const styles = [
            { key: 'pack_normal', color1: 0xC0C0C0, color2: 0x808080, highlight: 0xFFFFFF }, // Silver
            { key: 'pack_epic', color1: 0x9c27b0, color2: 0x4a148c, highlight: 0xE1BEE7 }, // Purple
            { key: 'pack_god', color1: 0xFFD700, color2: 0xFF8F00, highlight: 0xFFECB3 }  // Gold
        ];

        const w = 220;
        const h = 300;
        const crimpSize = 10;

        styles.forEach(style => {
            if (this.textures.exists(style.key)) return;

            // FIX: Removed 'add: false' which was causing the error
            const g = this.make.graphics({ x: 0, y: 0 });

            // 1. Main Body (Vertical Gradient for Cylinder effect)
            g.fillGradientStyle(style.color1, style.color1, style.color2, style.color2, 1);
            g.fillRect(0, crimpSize, w, h - (crimpSize * 2));

            // 2. Plastic Sheen/Gloss (Diagonal)
            g.fillStyle(0xffffff, 0.3);
            g.beginPath();
            g.moveTo(0, h * 0.2);
            g.lineTo(w, h * 0.1);
            g.lineTo(w, h * 0.4);
            g.lineTo(0, h * 0.6);
            g.closePath();
            g.fillPath();

            // Subtler Gloss
            g.fillStyle(0xffffff, 0.1);
            g.beginPath();
            g.moveTo(0, h * 0.65);
            g.lineTo(w, h * 0.5);
            g.lineTo(w, h * 0.7);
            g.lineTo(0, h * 0.9);
            g.closePath();
            g.fillPath();

            // 3. Crimped Edges (Top and Bottom)
            const crimps = Math.floor(w / 10);

            // Top Crimp
            g.fillStyle(style.color1, 1);
            g.beginPath();
            g.moveTo(0, crimpSize);
            for (let i = 0; i <= crimps; i++) {
                g.lineTo(i * 10 + 5, 0);
                g.lineTo((i + 1) * 10, crimpSize);
            }
            g.lineTo(0, crimpSize);
            g.closePath();
            g.fillPath();

            // Bottom Crimp
            g.fillStyle(style.color2, 1);
            g.beginPath();
            g.moveTo(0, h - crimpSize);
            for (let i = 0; i <= crimps; i++) {
                g.lineTo(i * 10 + 5, h);
                g.lineTo((i + 1) * 10, h - crimpSize);
            }
            g.lineTo(0, h - crimpSize);
            g.closePath();
            g.fillPath();

            // 4. Border/Seam
            g.lineStyle(2, 0x000000, 0.2);
            g.strokeRect(0, crimpSize, w, h - crimpSize * 2);

            // Generate Texture
            g.generateTexture(style.key, w, h);
        });
    }

    private createCinematicBackground() {
        if (this.textures.exists('bg_gradient')) {
            const bg = this.add.image(this.scale.width / 2, this.scale.height / 2, 'bg_gradient');
            bg.setDisplaySize(this.scale.width, this.scale.height);
            bg.setAlpha(0.6);
        }
    }

    // --- PHASE 1: SHOP SELECTION ---

    // --- PHASE 1: SHOP SELECTION ---

    private async showShopUI() {
        this.shopContainer = this.add.container(0, 0);

        const isMobile = this.scale.width < 768;

        const title = this.add.text(this.scale.width / 2, isMobile ? 60 : 80, "SELECT BOOSTER PACK", {
            fontFamily: Theme.fonts.header.fontFamily, fontSize: isMobile ? '32px' : '48px', color: '#fff',
            shadow: { blur: 10, color: Theme.colors.primary.toString(), fill: true }
        }).setOrigin(0.5);

        // Back Button
        const backBtn = this.add.text(isMobile ? 20 : 50, isMobile ? 30 : 50, "← HOME", { fontSize: '24px', color: '#aaa' })
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => this.scene.start('HomeScene'));

        this.shopContainer.add([title, backBtn]);

        // Fetch Shop Items
        const { data: items, error } = await supabase
            .from('shop_items')
            .select('*')
            .eq('is_active', true)
            .order('cost_usd', { ascending: true }); // Normal -> Epic -> God

        if (!items || error) {
            this.add.text(this.scale.width / 2, this.scale.height / 2, "ERROR LOADING SHOP", { fontSize: '32px' }).setOrigin(0.5);
            return;
        }

        const fmtMoney = (val: number) => `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        if (isMobile) {
            // MOBILE: Grid Layout (2 Columns) to save space
            const colCount = 2;

            // Calculate vertical center for grid
            // Grid Height approx: 2 rows * 220 = 440
            // Available height approx: height - header (100)
            const gridHeight = 440;
            const availableHeight = this.scale.height;
            const startY = Math.max(120, (availableHeight - gridHeight) / 2); // Center vertically, but not higher than 120

            const startX = 40; // Left padding
            const cellWidth = (this.scale.width - 60) / colCount;
            const cellHeight = 220;

            items.forEach((item: any, index: number) => {
                let color = 0x888888;
                if (item.tier === 'epic') color = 0x9c27b0;
                if (item.tier === 'god') color = 0xffd700;

                const row = Math.floor(index / colCount);
                const col = index % colCount;

                const x = startX + (cellWidth / 2) + (col * (cellWidth - 10)); // Tight spacing
                const y = startY + (row * cellHeight);

                // Scale down significantly for grid
                this.createShopItem(x, y, item, color, fmtMoney(item.cost_usd), 0.55);
            });
        } else {
            // DESKTOP: Horizontal but smaller
            const startX = this.scale.width / 2 - 300; // Condensed
            const gap = 300;

            items.forEach((item: any, index: number) => {
                let color = 0x888888;
                if (item.tier === 'epic') color = 0x9c27b0;
                if (item.tier === 'god') color = 0xffd700;

                // Scale 0.85 for desktop (was 1.0)
                this.createShopItem(startX + (index * gap), this.scale.height / 2 + 30, item, color, fmtMoney(item.cost_usd), 0.85);
            });
        }
    }

    private createShopItem(x: number, y: number, item: any, color: number, costStr: string, scale: number = 1) {
        const container = this.add.container(x, y);
        container.setScale(scale);

        // Determine which generated texture to use
        let texKey = 'pack_normal';
        if (item.tier === 'epic') texKey = 'pack_epic';
        if (item.tier === 'god') texKey = 'pack_god';

        // Pack Sprite
        const packImg = this.add.sprite(0, 0, texKey);

        // Add subtle scale pulse
        this.tweens.add({
            targets: packImg, scale: { from: 1, to: 1.02 }, duration: 2000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
        });

        const name = this.add.text(0, -180, item.name.toUpperCase(), {
            fontFamily: Theme.fonts.cardName.fontFamily, fontSize: '20px', color: '#fff', align: 'center', wordWrap: { width: 180 },
            stroke: '#000', strokeThickness: 4
        }).setOrigin(0.5);

        const cost = this.add.text(0, 180, costStr, {
            fontSize: '28px', color: '#ffd700', fontFamily: Theme.fonts.header.fontFamily,
            stroke: '#000', strokeThickness: 4
        }).setOrigin(0.5);

        container.add([packImg, name, cost]);

        packImg.setInteractive({ useHandCursor: true })
            .on('pointerover', () => container.setScale(scale * 1.05))
            .on('pointerout', () => container.setScale(scale))
            .on('pointerdown', () => this.buyPack(item));

        this.shopContainer.add(container);
    }

    private async buyPack(item: any) {
        if (this.isOpening) return;

        const user = await getCurrentUser();

        const loading = this.add.text(this.scale.width / 2, this.scale.height / 2, "PURCHASING...", { fontSize: '40px', backgroundColor: '#000' }).setOrigin(0.5).setDepth(100);

        try {
            const { data, error } = await supabase.rpc('open_pack', {
                _user_id: user?.id,
                _shop_item_id: item.id
            });

            if (error) throw error;
            if (!data) throw new Error("No cards returned");

            // MAP NEW RPC OUTPUT (out_card_id, out_name...) TO LOCAL KEYS
            this.pulledCardsData = data.map((d: any) => ({
                card_id: d.out_card_id,
                name: d.out_name,
                rarity: d.out_rarity,
                image_url: d.out_image_url,
                is_new: d.out_is_new
            }));

            this.selectedPackId = item.id;

            // Transition to Opening Sequence
            loading.destroy();

            // Fade out shop
            this.tweens.add({
                targets: this.shopContainer,
                alpha: 0,
                duration: 500,
                onComplete: () => {
                    this.shopContainer.setVisible(false);
                    this.startOpeningSequence(item);
                }
            });

        } catch (e: any) {
            loading.destroy();
            alert("Purchase Failed: " + (e.message || "Insufficient Coins?"));
        }
    }

    // --- PHASE 2: PACK ANIMATION ---

    private startOpeningSequence(item: any) {
        this.isOpening = true;
        this.createPackObject(item);
    }

    private createPackObject(item: any) {
        const cx = this.scale.width / 2;
        const cy = this.scale.height / 2;

        this.packContainer = this.add.container(cx, cy);

        // Determine Texture
        let texKey = 'pack_normal';
        if (item.tier === 'epic') texKey = 'pack_epic';
        if (item.tier === 'god') texKey = 'pack_god';

        // Pack Body 
        const packBody = this.add.sprite(0, 0, texKey);
        packBody.setDisplaySize(300, 410);

        // Glow Effect
        let tint = 0xffffff;
        if (item.tier === 'epic') tint = 0xda70d6;
        if (item.tier === 'god') tint = 0xffd700;
        const packGlow = this.add.pointlight(0, 0, tint, 400, 0.4);

        this.packContainer.add([packGlow, packBody]);
        this.packContainer.setSize(300, 410);

        this.packContainer.setInteractive({ useHandCursor: true });
        this.packContainer.once('pointerdown', () => this.animateOpen());
    }

    private animateOpen() {
        try { SoundManager.getInstance().playSFX('gacha_shake'); } catch (e) { }

        this.tweens.add({
            targets: this.packContainer,
            x: '+=15', y: '+=15', duration: 50, yoyo: true, repeat: 10,
            onComplete: () => {
                try { SoundManager.getInstance().playSFX('gacha_rip'); } catch (e) { }

                // Simple Fade Out and Destroy
                this.tweens.add({
                    targets: this.packContainer,
                    alpha: 0, scaleX: 1.2, scaleY: 1.2, duration: 300,
                    onComplete: () => {
                        this.packContainer.destroy(); // Gone
                        this.dealCardsStage(); // Next
                    }
                });
            }
        });
    }

    private dealCardsStage() {
        const cx = this.scale.width / 2;
        const cy = this.scale.height / 2;
        const isMobile = this.scale.width < 768;

        const count = this.pulledCardsData.length;

        // Calculate safe width for cards
        // Dynamic spacing to fit all cards
        // FIX: Mobile spacing was too tight (80). Increased to 110.
        // Also adjusted safeWidth to use more screen
        const safeWidth = this.scale.width * (isMobile ? 0.95 : 0.8);
        const maxSpacing = isMobile ? 110 : 250;

        let spacing = safeWidth / Math.max(1, count - 1);
        spacing = Math.min(spacing, maxSpacing);

        const cardScale = isMobile ? 0.6 : 0.9;

        // Center offset
        const totalWidth = (count - 1) * spacing;
        const startX = cx - (totalWidth / 2);

        this.pulledCardsData.forEach((card, i) => {
            const tx = startX + (i * spacing);
            // Z-Index: Ensure cards are added in order so last one is on top by default
            // But we will handle z-index on interaction
            this.createCard(cx, cy, card, i, tx, cardScale);
        });

        // Add "Done" button
        this.time.delayedCall(2500, () => {
            // FIX: Move to TOP RIGHT on mobile to avoid bottom nav bars completely
            const btnX = this.scale.width - (isMobile ? 60 : 150);
            const btnY = isMobile ? 50 : (this.scale.height - 80);

            const fontSize = isMobile ? '20px' : '24px';

            const btn = this.add.text(btnX, btnY, "DONE", {
                fontFamily: Theme.fonts.header.fontFamily, // Use correct font
                fontSize: fontSize, backgroundColor: '#fff', color: '#000', padding: { x: 15, y: 8 }
            })
                .setInteractive({ useHandCursor: true })
                .setOrigin(0.5)
                .setDepth(2000) // Ensure it's on top of cards
                .on('pointerdown', () => this.scene.start('HomeScene'));
        });
    }

    private createCard(startX: number, startY: number, data: any, index: number, targetX: number, scale: number) {
        const cardContainer = this.add.container(startX, startY);
        cardContainer.setScale(scale);

        // V5 Card Back
        const back = this.add.sprite(0, 0, 'tex_card_back_v5');
        back.setDisplaySize(240, 335);

        const front = this.add.container(0, 0).setVisible(false);
        front.setScale(0, 1);

        // Front Content
        const img = this.add.image(0, 0, '').setDisplaySize(240, 330);
        this.loadExternalImage(img, data.image_url);

        front.add([img]);
        cardContainer.add([back, front]);

        const isMobile = this.scale.width < 768;

        // Deal Animation to Target X
        this.tweens.add({
            targets: cardContainer,
            x: targetX,
            y: this.scale.height / 2,
            angle: (index - 2) * (isMobile ? 3 : 2), // Reduced fan angle
            duration: 800, delay: index * 100, ease: 'Power2.easeOut',
            onComplete: () => {
                // Interactive Flip
                back.setInteractive({ useHandCursor: true });
                back.on('pointerover', () => back.setTint(0xcccccc));
                back.on('pointerout', () => back.clearTint());

                // Store original state for "Unfocus"
                cardContainer.setData('originalX', targetX);
                cardContainer.setData('originalY', this.scale.height / 2);
                cardContainer.setData('originalAngle', (index - 2) * (isMobile ? 3 : 2));
                cardContainer.setData('originalScale', scale);
                cardContainer.setData('isFocused', false);

                back.on('pointerdown', () => {
                    const isFocused = cardContainer.getData('isFocused');

                    if (isMobile) {
                        this.children.bringToTop(cardContainer);

                        if (!isFocused) {
                            // FOCUS: Zoom to Center
                            this.tweens.add({
                                targets: cardContainer,
                                scale: scale * 1.5,
                                x: this.scale.width / 2,
                                y: this.scale.height / 2,
                                angle: 0,
                                duration: 300,
                                ease: 'Back.easeOut'
                            });
                            cardContainer.setData('isFocused', true);

                            // Flip if not flipped yet
                            if (back.visible) {
                                this.flipCard(cardContainer, back, front, data.rarity, data.name);
                            }
                        } else {
                            // UNFOCUS: Return to Hand
                            this.tweens.add({
                                targets: cardContainer,
                                scale: cardContainer.getData('originalScale'),
                                x: cardContainer.getData('originalX'),
                                y: cardContainer.getData('originalY'),
                                angle: cardContainer.getData('originalAngle'),
                                duration: 300,
                                ease: 'Power2.easeOut'
                            });
                            cardContainer.setData('isFocused', false);
                        }
                    } else {
                        // Desktop: Just flip in place (or maybe small pop)
                        this.children.bringToTop(cardContainer);
                        if (back.visible) {
                            this.flipCard(cardContainer, back, front, data.rarity, data.name);
                        }
                    }
                });
            }
        });
    }

    private flipCard(container: Phaser.GameObjects.Container, back: any, front: any, rarity: string, cardName: string) {
        console.log("Flipping:", cardName);
        try { SoundManager.getInstance().playSFX('gacha_card_flip'); } catch (e) { }

        // Interaction for the Front side too (so we can tap to unfocus after flip)
        const frontImg = front.first; // The image inside front container
        if (frontImg) {
            frontImg.setInteractive({ useHandCursor: true });
            frontImg.on('pointerdown', () => {
                // Forward the click logic (handled by back button initially, but back is hidden now)
                // We need to replicate the Unfocus logic here since 'back' is hidden
                const isFocused = container.getData('isFocused');
                const isMobile = this.scale.width < 768;

                if (isMobile && isFocused) {
                    this.tweens.add({
                        targets: container,
                        scale: container.getData('originalScale'),
                        x: container.getData('originalX'),
                        y: container.getData('originalY'),
                        angle: container.getData('originalAngle'),
                        duration: 300,
                        ease: 'Power2.easeOut'
                    });
                    container.setData('isFocused', false);
                }
            });
        }

        this.tweens.add({
            targets: back, scaleX: 0, duration: 200,
            onComplete: () => {
                back.setVisible(false);
                front.setVisible(true);

                // Sound and Effects based on rarity
                try {
                    if (rarity === 'illustration_rare' || rarity === 'god_rare') {
                        SoundManager.getInstance().playSFX('reveal_ultra');
                        // Add particle burst
                        if (container.scene.textures.exists('particle_glint')) {
                            const particles = container.scene.add.particles(container.x, container.y, 'particle_glint', {
                                speed: { min: 50, max: 150 },
                                scale: { start: 0.4, end: 0 },
                                blendMode: 'ADD',
                                lifespan: 800,
                                quantity: 20
                            });
                            // Destroy particles after emission
                            container.scene.time.delayedCall(1000, () => particles.destroy());
                        }
                    }
                    else {
                        SoundManager.getInstance().playSFX('reveal_common');
                    }
                } catch (e) { }

                this.tweens.add({ targets: front, scaleX: 1, duration: 300, ease: 'Back.easeOut' });
            }
        });
    }

    private loadExternalImage(target: Phaser.GameObjects.Image, url: string) {
        if (!url) {
            console.warn("Missing URL for card image");
            // Fallback
            target.setTexture('tex_card_back_v5');
            return;
        }

        // Check Cache
        if (this.textures.exists(url)) {
            target.setTexture(url);
            target.setDisplaySize(240, 330);
            return;
        }

        // Setup Loader
        console.log("Loading external image:", url);
        this.load.crossOrigin = 'anonymous';
        this.load.image(url, url);

        // Listen for specific file completion
        const onComplete = () => {
            if (target && target.scene) {
                target.setTexture(url);
                target.setDisplaySize(240, 330);
                target.setVisible(true);
            }
        };

        const onError = () => {
            console.error("Failed to load image:", url);
            if (target && target.scene) {
                target.setTexture('tex_card_back_v5'); // Fallback to card back or a "missing" sprite
                target.setDisplaySize(240, 330);
                target.setVisible(true);
            }
        };

        // Event format: 'filecomplete-image-' + key
        this.load.once(`filecomplete-image-${url}`, onComplete);

        // Unfortunately standard Phaser Loader doesn't emit per-file 'loaderror' easily on the scene 
        // without a global listener, but we can check if it failed after a timeout or use the global 
        // load error event filter.

        // Workaround: Global Error Listener for this file
        const errorKey = `loaderror-image-${url}`;
        // Note: Phaser 3.60+ might have better handling, but let's try to catch the global load error
        // However, simplest "User" fix is often just: if it doesn't load in X seconds, show fallback

        // Actually, let's use a simpler "Image" object strategy if Phaser loader is fussy
        // But staying with Phaser loader is better for Cache.

        // Let's rely on the global 'loaderror' for now
        this.load.once(`loaderror`, (file: any) => {
            if (file.key === url) {
                onError();
            }
        });

        this.load.start();
    }
}
