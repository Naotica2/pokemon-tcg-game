import Phaser from 'phaser';
import { Theme } from '../utils/Theme';
import SoundManager from '../utils/SoundManager';
import { supabase, getCurrentUser } from '../utils/supabaseClient';

interface CardData {
    id: string; // db id
    card_id: string; // pokemon id (e.g. '1', '25')
    quantity: number;
    card_def?: {
        name: string;
        rarity: string;
        image_url: string;
        market_price: number;
    }
}

export default class CollectionScene extends Phaser.Scene {
    // Config
    private readonly CARD_WIDTH = 150;
    private readonly CARD_HEIGHT = 210;
    private readonly GAP = 20;
    private COLS = 6; // Dynamic

    // State
    private allCards: CardData[] = [];
    private visibleCards: Phaser.GameObjects.Container[] = [];
    private scrollY = 0;
    private maxScroll = 0;

    // Containers
    private container!: Phaser.GameObjects.Container;
    private gridContainer!: Phaser.GameObjects.Container;
    private isLoading = false;

    constructor() {
        super('CollectionScene');
    }

    async create() {
        SoundManager.getInstance().playBGM('bgm_home');

        // Responsive Calculation
        this.calculateGridMetrics();
        this.scale.on('resize', this.handleResize, this);

        this.createBackground();
        this.createHeader();

        // Containers
        this.container = this.add.container(0, 150); // Offset for header
        this.gridContainer = this.add.container(0, 0);
        this.container.add(this.gridContainer);

        // Fetch Real Data
        await this.fetchUserCollection();

        // Calculate Scroll Limits
        this.recalcScroll();

        // Input Handling (Scroll & Protection)
        let isDragging = false;
        let startY = 0;
        let lastY = 0;

        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            isDragging = false;
            startY = pointer.y;
            lastY = pointer.y;
        });

        this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
            if (pointer.isDown) {
                const dy = pointer.y - lastY;
                this.scrollY = Phaser.Math.Clamp(this.scrollY - dy, 0, this.maxScroll);
                this.updateGrid();
                lastY = pointer.y;

                if (Math.abs(pointer.y - startY) > 10) {
                    isDragging = true; // Mark as drag if moved > 10px
                }
            }
        });

        this.input.on('wheel', (pointer: any, gameObjects: any, deltaX: number, deltaY: number) => {
            this.scrollY = Phaser.Math.Clamp(this.scrollY + deltaY, 0, this.maxScroll);
            this.updateGrid();
        });

        // Initial Render
        this.updateGrid();
    }

    private handleResize(gameSize: Phaser.Structs.Size) {
        this.calculateGridMetrics();
        this.recalcScroll();
        this.updateGrid();
        this.createBackground(); // Redraw BG
    }

    private calculateGridMetrics() {
        // Safe padding
        const availableWidth = this.scale.width - 40;
        this.COLS = Math.floor(availableWidth / (this.CARD_WIDTH + this.GAP));
        this.COLS = Math.max(2, this.COLS); // Min 2 cols

        // Center the grid offset if needed
        const totalGridWidth = (this.COLS * this.CARD_WIDTH) + ((this.COLS - 1) * this.GAP);
        this.gridOffsetX = (this.scale.width - totalGridWidth) / 2;
    }

    private gridOffsetX = 0;

    private recalcScroll() {
        if (!this.allCards.length) return;
        const rows = Math.ceil(this.allCards.length / this.COLS);
        const totalContentHeight = rows * (this.CARD_HEIGHT + this.GAP);
        const viewportHeight = this.scale.height - 150;
        this.maxScroll = Math.max(0, totalContentHeight - viewportHeight + 100);
    }

    private createBackground() {
        if (this.textures.exists('bg_gradient')) {
            const bg = this.add.image(this.scale.width / 2, this.scale.height / 2, 'bg_gradient');
            bg.setDisplaySize(this.scale.width, this.scale.height);
            bg.setAlpha(0.5);
            bg.setDepth(-100);
        } else {
            const bg = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x111111).setOrigin(0);
            bg.setDepth(-100);
        }
    }

    private createHeader() {
        const headerBg = this.add.rectangle(0, 0, this.scale.width, 100, 0x000000, 0.8).setOrigin(0);

        const title = this.add.text(40, 50, "MY COLLECTION", {
            fontFamily: Theme.fonts.header.fontFamily, fontSize: '40px', color: '#fff'
        }).setOrigin(0, 0.5);

        const backBtn = this.add.text(this.scale.width - 40, 50, "BACK", {
            fontSize: '24px', color: '#aaa', backgroundColor: '#333', padding: { x: 10, y: 5 }
        }).setOrigin(1, 0.5)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => this.scene.start('HomeScene'));

        this.add.existing(headerBg);
        this.add.existing(title);
        this.add.existing(backBtn);
    }

    // Virtual Rendering Logic -> Update generic StartX
    private updateGrid() {
        const viewTop = this.scrollY;
        const viewBottom = this.scrollY + this.scale.height;

        this.visibleCards.forEach(c => c.destroy());
        this.visibleCards = [];

        if (this.allCards.length === 0) return;

        const startRow = Math.floor(viewTop / (this.CARD_HEIGHT + this.GAP));
        const endRow = Math.ceil(viewBottom / (this.CARD_HEIGHT + this.GAP));

        const startIndex = Math.max(0, startRow * this.COLS);
        const endIndex = Math.min((endRow + 1) * this.COLS, this.allCards.length);

        // Use pre-calced offset
        const totalGridWidth = (this.COLS * this.CARD_WIDTH) + ((this.COLS - 1) * this.GAP);
        const startX = (this.scale.width - totalGridWidth) / 2 + (this.CARD_WIDTH / 2);

        for (let i = startIndex; i < endIndex; i++) {
            const card = this.allCards[i];
            const row = Math.floor(i / this.COLS);
            const col = i % this.COLS;

            const x = startX + col * (this.CARD_WIDTH + this.GAP);
            const y = this.GAP + row * (this.CARD_HEIGHT + this.GAP) + (this.CARD_HEIGHT / 2) - this.scrollY;

            this.createCardSprite(x, y, card);
        }
    }

    // --- DATA ---

    private async fetchUserCollection() {
        this.isLoading = true;
        const loadingText = this.add.text(this.scale.width / 2, this.scale.height / 2, "Loading Collection...", { fontSize: '32px' }).setOrigin(0.5);

        try {
            const user = await getCurrentUser();
            if (!user) {
                loadingText.setText("Please Login First");
                return;
            }

            // JOIN Query explanation:
            // We need card details from 'cards' table for each 'user_cards' entry.
            // Using default relationship name 'cards' instead of alias 'card' to avoid 404 if alias fails.
            const { data, error } = await supabase
                .from('user_collections')
                .select('*, cards(*)')
                .eq('user_id', user.id)
                .gt('quantity', 0); // FIX: Only fetch cards we actually own (quantity > 0)

            if (error) throw error;

            if (!data || data.length === 0) {
                console.log("Collection empty. Attempting seed / check...");
                loadingText.setText("No cards found. Giving starter pack...");

                // FALLBACK: If empty, maybe give a starter? Or just show empty.
                const DataSeeder = (await import('../utils/DataSeeder')).default;
                await DataSeeder.seedGeneticApex();

                this.allCards = [];
                loadingText.setText("COLLECTION EMPTY. GO OPEN PACKS!");
                this.time.delayedCall(2000, () => loadingText.destroy());
                return;
            }

            this.allCards = data.map((row: any) => ({
                id: row.id,
                card_id: row.card_id,
                quantity: row.quantity,
                // Map 'cards' (nested object) to 'card_def'
                // Supabase returns the relation name if no alias
                card_def: row.cards
            }));

            // Calculate Metrics
            this.recalcScroll();
            this.updateGrid();

        } catch (err: any) {
            console.error(err);
            loadingText.setText(`Error: ${err.message || 'Unknown'}`);
            loadingText.setColor('#ff0000');
        } finally {
            if (this.allCards.length > 0) loadingText.destroy();
            this.isLoading = false;
        }
    }

    // --- SPRITE CREATION ---

    private createCardSprite(x: number, y: number, card: CardData) {
        const container = this.add.container(x, y);
        this.gridContainer.add(container);
        this.visibleCards.push(container);

        // 1. Shadow
        const shadow = this.add.rectangle(5, 5, this.CARD_WIDTH, this.CARD_HEIGHT, 0x000000, 0.5);
        container.add(shadow);

        // 2. Card Background/Frame
        const bg = this.add.rectangle(0, 0, this.CARD_WIDTH, this.CARD_HEIGHT, 0x222222).setStrokeStyle(2, 0x444444);
        container.add(bg);

        // 3. Image
        if (card.card_def?.image_url) {
            const img = this.add.image(0, -20, 'temp_card'); // Placeholder init
            this.loadExternalImage(img, card.card_def.image_url, this.CARD_WIDTH - 10, this.CARD_HEIGHT - 60);
            container.add(img);
        }

        // 4. Quantity Badge
        if (card.quantity > 1) {
            const badge = this.add.circle(this.CARD_WIDTH / 2 - 15, -this.CARD_HEIGHT / 2 + 15, 12, 0xff0000);
            const count = this.add.text(this.CARD_WIDTH / 2 - 15, -this.CARD_HEIGHT / 2 + 15, card.quantity.toString(), {
                fontSize: '12px', color: '#fff', fontStyle: 'bold'
            }).setOrigin(0.5);
            container.add([badge, count]);
        }

        // 5. Name (Bottom)
        const nameText = this.add.text(0, this.CARD_HEIGHT / 2 - 30, card.card_def?.name || 'Unknown', {
            fontSize: '14px', color: '#fff', align: 'center', wordWrap: { width: this.CARD_WIDTH - 10 }
        }).setOrigin(0.5);
        container.add(nameText);

        // Interactivity (Smart Click)
        bg.setInteractive({ useHandCursor: true })
            .on('pointerover', () => {
                this.tweens.add({ targets: container, scale: 1.05, duration: 100 });
                bg.setStrokeStyle(2, 0xffff00);
            })
            .on('pointerout', () => {
                this.tweens.add({ targets: container, scale: 1.0, duration: 100 });
                bg.setStrokeStyle(2, 0x444444);
            })
            .on('pointerup', (pointer: Phaser.Input.Pointer) => {
                // FIX: Only open if it was a TAP (not a Drag)
                // We check the distance moved since pointerdown logic in updateGrid/scene

                // Better Check:
                // We access the scene-wide check logic or just store local down pos?
                // The scene-wide input handlers above track 'isDragging'.

                // Let's rely on the pointer up vs down distance check directly here
                const dist = Phaser.Math.Distance.Between(pointer.downX, pointer.downY, pointer.upX, pointer.upY);
                if (dist < 10) {
                    this.showCardDetail(card);
                }
            });
    }

    private loadExternalImage(target: Phaser.GameObjects.Image, url: string, w: number, h: number) {
        if (this.textures.exists(url)) {
            target.setTexture(url);
            target.setDisplaySize(w, h);
            return;
        }

        this.load.image(url, url);
        this.load.once(`filecomplete-image-${url}`, () => {
            if (target && target.scene) {
                target.setTexture(url);
                target.setDisplaySize(w, h);
            }
        });
        this.load.start();
    }

    private showCardDetail(card: CardData) {
        // Simple overlay for detail view
        const overlay = this.add.rectangle(0, -150, this.scale.width, this.scale.height + 300, 0x000000, 0.9)
            .setOrigin(0).setInteractive();

        // Close on click
        overlay.on('pointerdown', () => {
            // cleanup
            overlay.destroy();
            detailContainer.destroy();
        });

        const cx = this.scale.width / 2;
        const cy = this.scale.height / 2;
        const isMobile = this.scale.width < 768;

        const detailContainer = this.add.container(cx, cy);

        // --- LAYOUT LOGIC ---
        // Desktop: Side-by-Side (Image Left, Info Right)
        // Mobile: Vertical Stack

        const imgX = isMobile ? 0 : -200;
        const imgY = isMobile ? -150 : 0;

        const infoX = isMobile ? 0 : 200;
        const infoY = isMobile ? 80 : -100;

        // Large Card Image
        const largeCard = this.add.image(imgX, imgY, '');
        if (card.card_def?.image_url) {
            this.loadExternalImage(largeCard, card.card_def.image_url, isMobile ? 240 : 300, isMobile ? 330 : 420);
        }

        // Stats
        const info = this.add.text(infoX, infoY,
            `${card.card_def?.name}\n\nRarity: ${card.card_def?.rarity}\nMarket: $${card.card_def?.market_price || 0}`,
            { fontSize: isMobile ? '24px' : '32px', align: isMobile ? 'center' : 'left', color: '#fff', wordWrap: { width: 350 } }
        ).setOrigin(isMobile ? 0.5 : 0, 0.5);

        // Buttons (Anchored to Info)
        const btnStartY = infoY + (isMobile ? 120 : 150);
        const btnGap = 70;

        // Quick Sell Button
        const sellBtn = this.createButton(
            isMobile ? 0 : 200 + 125, // Centered on Right Panel for Desktop
            btnStartY,
            "QUICK SELL (90%)",
            0xff5252,
            async () => {
                await this.instantSellCard(card, 1, overlay);
            }
        );

        // List on Market Button
        const listBtn = this.createButton(
            isMobile ? 0 : 200 + 125,
            btnStartY + btnGap,
            "LIST ON MARKET",
            0x2196f3,
            () => {
                this.createPriceInputModal(card, overlay);
            }
        );

        detailContainer.add([largeCard, info, ...sellBtn, ...listBtn]);
    }

    private createPriceInputModal(card: CardData, parentOverlay: any) {
        // Create HTML Modal Elements
        const modalOverlay = document.createElement('div');
        Object.assign(modalOverlay.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center',
            zIndex: '10000', fontFamily: 'Arial, sans-serif'
        });

        const modalBox = document.createElement('div');
        Object.assign(modalBox.style, {
            backgroundColor: '#222', padding: '30px', borderRadius: '15px',
            border: '2px solid #444', color: '#fff', width: '300px', textAlign: 'center',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
        });

        const title = document.createElement('h3');
        title.innerText = "SELL ON MARKET";
        title.style.margin = '0 0 20px 0';
        title.style.color = Theme.colors.success.toString().replace('0x', '#'); // #00e676

        const label = document.createElement('p');
        label.innerText = `Set price for ${card.card_def?.name}`;
        label.style.marginBottom = '15px';
        label.style.fontSize = '14px';
        label.style.color = '#ccc';

        const input = document.createElement('input');
        input.type = "number";
        input.value = card.card_def?.market_price?.toString() || "1.00";
        input.step = "0.01";
        input.min = "0.01";
        Object.assign(input.style, {
            width: '100%', padding: '10px', fontSize: '24px', borderRadius: '8px',
            border: '1px solid #555', backgroundColor: '#333', color: '#fff', marginBottom: '20px',
            textAlign: 'center'
        });

        const btnContainer = document.createElement('div');
        btnContainer.style.display = 'flex';
        btnContainer.style.gap = '10px';
        btnContainer.style.justifyContent = 'center';

        const cancelBtn = document.createElement('button');
        cancelBtn.innerText = "CANCEL";
        Object.assign(cancelBtn.style, {
            padding: '10px 20px', backgroundColor: '#555', color: '#fff', border: 'none',
            borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold'
        });
        cancelBtn.onclick = () => document.body.removeChild(modalOverlay);

        const confirmBtn = document.createElement('button');
        confirmBtn.innerText = "CONFIRM LISTING";
        Object.assign(confirmBtn.style, {
            padding: '10px 20px', backgroundColor: '#00e676', color: '#000', border: 'none',
            borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold'
        });

        confirmBtn.onclick = async () => {
            const price = parseFloat(input.value);
            if (price > 0) {
                confirmBtn.innerText = "LISTING...";
                confirmBtn.disabled = true;
                await this.listCardForSale(card, price, parentOverlay);
                document.body.removeChild(modalOverlay);
            } else {
                input.style.borderColor = 'red';
            }
        };

        btnContainer.appendChild(cancelBtn);
        btnContainer.appendChild(confirmBtn);

        modalBox.appendChild(title);
        modalBox.appendChild(label);
        modalBox.appendChild(input);
        modalBox.appendChild(btnContainer);
        modalOverlay.appendChild(modalBox);

        document.body.appendChild(modalOverlay);
    }

    private async instantSellCard(card: CardData, amount: number, overlay: any) {
        console.log("Attempting Quick Sell:", { cardId: card.card_id, amount });

        if (!card.card_id) {
            this.showToast("Error: Invalid Card ID", 0xff0000);
            return;
        }

        // Correct RPC Name: instant_sell_card
        const { error } = await supabase.rpc('instant_sell_card', {
            _card_id: card.card_id,
            _amount: amount
        });

        if (!error) {
            this.showToast(`Quick Sold!`, 0x00ff00);
            // overlay.emit('pointerdown'); // Don't close immediately, let user see toast? 
            // Actually closing is fine if toast persists.
            overlay.destroy(); // Manually destroy to be safe
            this.scene.restart(); // Full refresh to update grid
        } else {
            console.error("RPC Error:", error);
            this.showToast("Sell failed: " + error.message, 0xff0000);
        }
    }

    private async listCardForSale(card: CardData, price: number, overlay: any) {
        const { error } = await supabase.rpc('list_card_for_sale', {
            _card_id: card.card_id,
            _price: price
        });

        if (!error) {
            this.showToast(`Listed for $${price}!`, 0x00ff00);
            overlay.emit('pointerdown');
            this.fetchUserCollection();
        } else {
            console.error(error);
            this.showToast("Listing failed: " + error.message, 0xff0000);
        }
    }

    private createButton(x: number, y: number, label: string, color: number, onClick: () => void) {
        const bg = this.add.rectangle(x, y, 250, 50, color).setInteractive({ useHandCursor: true });
        const text = this.add.text(x, y, label, { fontSize: '20px', color: '#fff' }).setOrigin(0.5);

        bg.on('pointerdown', onClick);
        return [bg, text];
    }

    private showToast(message: string, color: number) {
        const toast = this.add.text(this.scale.width / 2, 100, message, {
            fontSize: '24px', backgroundColor: '#000', padding: { x: 20, y: 10 }
        }).setOrigin(0.5).setTint(color).setDepth(2000);

        this.tweens.add({
            targets: toast, alpha: 0, delay: 2000, duration: 500,
            onComplete: () => toast.destroy()
        });
    }
}
