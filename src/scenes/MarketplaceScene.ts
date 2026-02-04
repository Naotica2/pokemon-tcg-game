import Phaser from 'phaser';
import { Theme } from '../utils/Theme';
import SoundManager from '../utils/SoundManager';
import { supabase } from '../utils/supabaseClient';

interface MarketListing {
    id: string;
    card_id: string;
    price: number; // Changed from price_coins
    seller_id: string;
    // We will join these in fetched data if possible, or fetch separate
    card_data?: {
        name: string;
        // image_url removed for simplicity per user request
    };
    seller_profile?: {
        username: string;
    };
}

export default class MarketplaceScene extends Phaser.Scene {
    private isModalOpen = false; // Flag to disable background interaction
    private listings: MarketListing[] = [];
    private scrollY = 0;
    private container!: Phaser.GameObjects.Container;
    private listContainer!: Phaser.GameObjects.Container;
    private isLoading = false;

    constructor() {
        super('MarketplaceScene');
    }

    create() {
        this.createBackground();
        this.createHeader();

        // Main Content Container
        this.container = this.add.container(0, 150);
        this.listContainer = this.add.container(0, 0);
        this.container.add(this.listContainer);

        // Fetch Data
        this.fetchListings();

        // Scroll Input (Wheel + Touch Drag)
        this.input.on('wheel', (pointer: any, gameObjects: any, deltaX: number, deltaY: number) => {
            if (this.listings.length === 0 || this.isModalOpen) return; // Block scroll if modal open
            this.handleScroll(deltaY);
        });

        // Touch Drag Logic
        let isDown = false;
        let startY = 0;
        let lastY = 0;
        const dragThreshold = 10;
        let hasScrolled = false;

        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            if (this.isModalOpen) return; // Block drag start if modal open
            isDown = true;
            startY = pointer.y;
            lastY = pointer.y;
            hasScrolled = false;
        });

        this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
            if (!isDown || this.isModalOpen) return;

            const deltaY = lastY - pointer.y; // Inverted for "drag up to scroll down"
            lastY = pointer.y;

            // Only register as scroll if moved significantly total
            if (Math.abs(pointer.y - startY) > dragThreshold) {
                hasScrolled = true;
            }

            if (this.listings.length > 0) {
                this.handleScroll(deltaY);
            }
        });

        this.input.on('pointerup', () => {
            isDown = false;
        });

        // Store scroll state in scene for buttons to check
        (this as any).isScrolling = () => hasScrolled;

        // Removing aggressive restart on resize to prevent flickering when keyboard opens on mobile
        // this.scale.on('resize', () => this.scene.restart());
        this.scale.on('resize', this.handleResize, this);
    }

    private handleResize(gameSize: Phaser.Structs.Size) {
        // Only update essential layout if needed
        // For now, doing nothing is better than restarting and losing state/flickering
        // Ideally, we re-run specific layout functions without full restart
        this.createHeader(); // Simple re-render of dynamic elements if strictly necessary
        // But for scrolling lists, it's safer to leave them be or re-calculate bounds silently
    }

    // Helper to unify scroll logic
    private handleScroll(deltaY: number) {
        this.scrollY -= deltaY;

        // Calculate dynamic height based on layout
        const isMobile = this.scale.width < 768;
        // Mobile: 2 Cols. Rows = Length / 2. Height = Rows * (CardHeight + Gap)
        // Desktop: Rows = Length. Height = Length * RowHeight.

        let contentHeight = 0;
        if (isMobile) {
            const cols = 2;
            const gap = 15;
            const cardWidth = (this.scale.width - (gap * (cols + 1))) / cols;
            const cardHeight = cardWidth * 1.6;
            const rows = Math.ceil(this.listings.length / cols);
            contentHeight = rows * (cardHeight + gap) + gap + 100; // +Padding
        } else {
            contentHeight = this.listings.length * 100 + 100;
        }

        const viewHeight = this.scale.height - 200; // Header offset

        // Only clamp if content > view
        if (contentHeight > viewHeight) {
            const minScroll = -(contentHeight - viewHeight);
            this.scrollY = Phaser.Math.Clamp(this.scrollY, minScroll, 0);
        } else {
            this.scrollY = 0;
        }

        this.listContainer.y = this.scrollY;
    }

    private async fetchListings() {
        this.isLoading = true;
        // Show Loading
        const loadingText = this.add.text(this.scale.width / 2, this.scale.height / 2, "LOADING MARKET...", {
            fontSize: '32px', color: '#fff'
        }).setOrigin(0.5);

        try {
            // Join with cards table to get names? 
            // Supabase 'select' with embedded resources needs foreign keys setup correctly in client types
            // For now, simpler raw fetch
            const { data, error } = await supabase
                .from('marketplace_listings')
                .select(`
                    id, card_id, price, seller_id, status,
                    cards ( name ),
                    profiles:seller_id ( username )
                `)
                .eq('status', 'active')
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) throw error;

            if (data) {
                this.listings = data.map((item: any) => {
                    const cardObj = Array.isArray(item.cards) ? item.cards[0] : item.cards;

                    return {
                        id: item.id,
                        card_id: item.card_id,
                        price: item.price,
                        seller_id: item.seller_id,
                        card_data: {
                            name: cardObj?.name || 'Unknown Card'
                        },
                        seller_profile: {
                            username: item.profiles?.username || 'Unknown Trainer'
                        }
                    };
                });

                this.renderListings();
            } else {
                this.add.text(this.scale.width / 2, this.scale.height / 2, "NO LISTINGS FOUND", { fontSize: '32px', color: '#888' }).setOrigin(0.5);
            }
        } catch (err: any) {
            console.error('Market fetch error:', err);
            this.add.text(this.scale.width / 2, this.scale.height / 2, `ERROR: ${err.message || 'UNKNOWN'}`, { fontSize: '24px', color: Theme.colors.error.toString() }).setOrigin(0.5);
        } finally {
            loadingText.destroy();
            this.isLoading = false;
        }
    }

    private createBackground() {
        this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x0a0a0a).setOrigin(0);
        this.add.grid(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 40, 40, 0x000000, 0, 0x111111, 0.5);
    }

    private createHeader() {
        // Shared responsive sizing
        const isMobile = this.scale.width < 768;
        const padding = isMobile ? 20 : 50;

        const backBtn = this.add.text(padding, 50, isMobile ? "←" : "← HOME", {
            fontFamily: Theme.fonts.header.fontFamily, fontSize: isMobile ? '28px' : '32px', color: '#fff'
        }).setInteractive({ useHandCursor: true });

        backBtn.on('pointerdown', () => {
            SoundManager.getInstance().playSFX('click');
            this.scene.start('HomeScene');
        });

        this.add.text(this.scale.width / 2, 50, isMobile ? "MARKET" : "GLOBAL MARKETPLACE", {
            fontFamily: Theme.fonts.header.fontFamily, fontSize: isMobile ? '32px' : '42px', color: Theme.colors.success.toString()
        }).setOrigin(0.5, 0.5); // Center Vertical to match back button
    }

    private renderListings() {
        this.listContainer.removeAll(true);

        const isMobile = this.scale.width < 768; // Breakpoint

        if (this.listings.length === 0) {
            this.add.text(this.scale.width / 2, this.scale.height / 2, "NO ITEMS FOR SALE", {
                fontSize: isMobile ? '24px' : '32px',
                color: '#666'
            }).setOrigin(0.5);
            return;
        }

        const fmtMoney = (val: number) => `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        if (isMobile) {
            // MOBILE: Compact Card Grid
            const cols = 2;
            const gap = 15;
            const cardWidth = (this.scale.width - (gap * (cols + 1))) / cols;
            const cardHeight = cardWidth * 1.6; // Aspect ratio
            const startX = gap + cardWidth / 2;
            let y = gap + cardHeight / 2;

            this.listings.forEach((item, index) => {
                const col = index % cols;
                const row = Math.floor(index / cols);

                const x = startX + col * (cardWidth + gap);
                const cy = y + row * (cardHeight + gap);

                const container = this.add.container(x, cy);

                // BG
                const bg = this.add.rectangle(0, 0, cardWidth, cardHeight, 0x1f1f1f).setStrokeStyle(1, 0x333333);

                // Icon (Smaller)
                const icon = this.add.image(0, -30, 'card_back_highres');
                this.loadExternalImage(icon, item.card_data?.name ? '' : ''); // We don't have URL in this mock type, relying on placeholder or name
                icon.setDisplaySize(cardWidth * 0.6, cardWidth * 0.6 * 1.4);

                // Text
                const name = this.add.text(0, 30, item.card_data?.name?.toUpperCase() || 'UNKNOWN', {
                    fontFamily: Theme.fonts.header.fontFamily, fontSize: '14px', color: '#fff',
                    wordWrap: { width: cardWidth - 10 }, align: 'center'
                }).setOrigin(0.5);

                const price = this.add.text(0, 60, fmtMoney(item.price), {
                    fontFamily: 'Arial Black', fontSize: '16px', color: '#00e676'
                }).setOrigin(0.5);

                // TAP TO BUY (Safe)
                bg.setInteractive({ useHandCursor: true }).on('pointerup', () => {
                    const isScrolling = (this as any).isScrolling ? (this as any).isScrolling() : false;
                    if (!isScrolling) {
                        this.buyItem(item);
                    }
                });

                container.add([bg, icon, name, price]);
                this.listContainer.add(container);
            });

            // Adjust scroll limits based on grid height
            // (Handled generically by content height calc in scroll listener, but we might need to update that logic effectively)
        } else {
            // DESKTOP: Wide Rows
            let y = 0;
            const rowHeight = 100;
            const width = Math.min(1200, this.scale.width * 0.95);
            const startX = this.scale.width / 2;

            this.listings.forEach((item) => {
                const row = this.add.container(startX, y);

                // Row BG
                const bg = this.add.rectangle(0, 0, width, rowHeight - 10, 0x1f1f1f).setStrokeStyle(1, 0x333333);

                // Icon 
                const icon = this.add.image(-width / 2 + 50, 0, 'card_back_highres').setDisplaySize(60, 84);

                // Text Info
                const name = this.add.text(-width / 2 + 100, -20, item.card_data?.name?.toUpperCase() || 'UNKNOWN', {
                    fontFamily: Theme.fonts.header.fontFamily, fontSize: '24px', color: '#fff'
                });
                const seller = this.add.text(-width / 2 + 100, 15, `Seller: ${item.seller_profile?.username}`, {
                    fontSize: '16px', color: '#888'
                });

                // Price & Buy Button
                const priceTag = this.add.text(width / 2 - 200, 0, fmtMoney(item.price), {
                    fontFamily: 'Arial Black', fontSize: '24px', color: '#00e676' // Green for money
                }).setOrigin(1, 0.5);

                const buyBtn = this.createBuyButton(width / 2 - 80, 0, item);

                row.add([bg, icon, name, seller, priceTag, buyBtn]);
                this.listContainer.add(row);

                y += rowHeight;
            });
        }
    }

    private createBuyButton(x: number, y: number, item: MarketListing) {
        const container = this.add.container(x, y);
        const btnBg = this.add.rectangle(0, 0, 120, 50, Theme.colors.success).setInteractive({ useHandCursor: true });
        const btnText = this.add.text(0, 0, "BUY", { fontSize: '20px', color: '#000', fontFamily: 'Arial Black' }).setOrigin(0.5);
        container.add([btnBg, btnText]);

        btnBg.on('pointerdown', () => this.buyItem(item, btnBg, btnText));

        return container;
    }

    private buyItem(item: MarketListing, btnBg?: Phaser.GameObjects.Rectangle, btnText?: Phaser.GameObjects.Text) {
        // Show Confirmation First
        this.createConfirmationModal(item, () => {
            this.executeBuy(item, btnBg, btnText);
        });
    }

    private createConfirmationModal(item: MarketListing, onConfirm: () => void) {
        if (this.isModalOpen) return; // Prevent double open
        this.isModalOpen = true;

        // 1. Full Screen Blocker (Interactive High Depth)
        const blocker = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.7)
            .setOrigin(0)
            .setDepth(3000)
            .setInteractive(); // Swallows input

        // Stop propagation just in case
        blocker.on('pointerdown', (e: any) => {
            e.event.stopPropagation();
        });

        const box = this.add.container(this.scale.width / 2, this.scale.height / 2).setDepth(3001);

        const boxBg = this.add.rectangle(0, 0, 400, 250, 0x222222).setStrokeStyle(2, 0x444444);

        const title = this.add.text(0, -80, "CONFIRM PURCHASE", {
            fontFamily: Theme.fonts.header.fontFamily, fontSize: '28px', color: Theme.colors.warning.toString()
        }).setOrigin(0.5);

        const desc = this.add.text(0, -20, `Buy ${item.card_data?.name}?\nPrice: $${item.price.toLocaleString()}`, {
            fontSize: '20px', color: '#fff', align: 'center', wordWrap: { width: 350 }
        }).setOrigin(0.5);

        // Buttons
        const cancelBtn = this.add.rectangle(-100, 70, 150, 50, 0x555555).setInteractive({ useHandCursor: true });
        const cancelText = this.add.text(-100, 70, "CANCEL", { fontSize: '20px', color: '#fff' }).setOrigin(0.5);

        const confirmBtn = this.add.rectangle(100, 70, 150, 50, Theme.colors.success).setInteractive({ useHandCursor: true });
        const confirmText = this.add.text(100, 70, "BUY NOW", { fontSize: '20px', color: '#000', fontFamily: 'Arial Black' }).setOrigin(0.5);

        box.add([boxBg, title, desc, cancelBtn, cancelText, confirmBtn, confirmText]);

        // Helpers for closing
        const close = () => {
            blocker.destroy();
            box.destroy();
            this.isModalOpen = false;
        };

        // Logic
        cancelBtn.on('pointerdown', (e: any) => {
            e.event.stopPropagation();
            close();
        });

        confirmBtn.on('pointerdown', (e: any) => {
            e.event.stopPropagation();
            close();
            onConfirm();
        });
    }

    private async executeBuy(item: MarketListing, btnBg?: Phaser.GameObjects.Rectangle, btnText?: Phaser.GameObjects.Text) {
        // Real Buy Logic
        SoundManager.getInstance().playSFX('click');
        if (btnBg) btnBg.setFillStyle(0x555555);
        if (btnText) btnText.setText("...");

        try {
            const { error } = await supabase.rpc('buy_market_item', { _listing_id: item.id });
            if (error) throw error;

            SoundManager.getInstance().playSFX('ui_coin');
            if (btnText) btnText.setText("SOLD");
            if (btnBg) btnBg.disableInteractive();

            // Refresh
            this.time.delayedCall(500, () => this.fetchListings());

        } catch (e: any) {
            console.error("Buy failed", e);
            SoundManager.getInstance().playSFX('ui_error');
            if (btnText) btnText.setText("FAIL");
            if (btnBg) {
                btnBg.setFillStyle(Theme.colors.error);
                this.time.delayedCall(1000, () => {
                    btnText!.setText("BUY");
                    btnBg!.setFillStyle(Theme.colors.success);
                    btnBg!.setInteractive();
                });
            }
        }
    }

    private loadExternalImage(target: Phaser.GameObjects.Image, url: string) {
        if (!url) return;

        if (this.textures.exists(url)) {
            target.setTexture(url);
            target.setDisplaySize(60, 84);
            return;
        }

        this.load.image(url, url);
        this.load.once(Phaser.Loader.Events.COMPLETE, () => {
            if (target.scene) {
                target.setTexture(url);
                target.setDisplaySize(60, 84);
            }
        });
        this.load.start();
    }
}
