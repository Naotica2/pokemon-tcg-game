import Phaser from 'phaser';
import { Theme } from '../utils/Theme';
import SoundManager from '../utils/SoundManager';
import { supabase, getCurrentUser } from '../utils/supabaseClient';

export default class ProfileScene extends Phaser.Scene {
    constructor() {
        super('ProfileScene');
    }



    // Override Create to add resize
    create() {
        this.createBackground();
        this.createHeader();
        this.fetchAndDisplayData();

        this.scale.on('resize', () => {
            this.scene.restart();
        });
    }

    private renderDashboardInternal(data: { username: string, wins: number, losses: number, balance: number, totalValue: number }) {
        const cx = this.scale.width / 2;
        const cy = this.scale.height / 2;
        const isMobile = this.scale.width < 768;

        // Avatar
        const avatarBox = this.add.container(cx, cy); // Base pos
        const avatarBg = this.add.rectangle(0, 0, 300, 300, 0x222222).setStrokeStyle(4, 0xffffff);
        const avatarPlaceholder = this.add.text(0, 0, data.username.charAt(0).toUpperCase(), { fontSize: '120px' }).setOrigin(0.5);
        const nameLabel = this.add.text(0, 180, data.username.toUpperCase(), { fontSize: '32px', fontFamily: Theme.fonts.header.fontFamily }).setOrigin(0.5);
        avatarBox.add([avatarBg, avatarPlaceholder, nameLabel]);

        // Stats Box
        const statsBox = this.add.container(cx, cy);

        // Positioning Logic
        if (isMobile) {
            // Stacked
            avatarBox.setPosition(cx, cy - 200);
            avatarBox.setScale(0.7);

            statsBox.setPosition(cx, cy + 150);
        } else {
            // Side by Side
            avatarBox.setPosition(cx - 300, cy);
            avatarBox.setScale(1);

            statsBox.setPosition(cx + 200, cy);
        }

        const createStatCard = (x: number, y: number, label: string, value: string, color: number) => {
            // Stat Card Size scaling
            const w = isMobile ? 320 : 400;
            const h = 100;

            const bg = this.add.rectangle(x, y, w, h, 0x1a1a1a).setStrokeStyle(2, color);
            const lbl = this.add.text(x - (w / 2) + 20, y, label, { fontSize: isMobile ? '18px' : '24px', color: '#aaa' }).setOrigin(0, 0.5);
            const val = this.add.text(x + (w / 2) - 20, y, value, { fontSize: isMobile ? '24px' : '32px', color: '#fff', fontFamily: 'Arial Black' }).setOrigin(1, 0.5);
            statsBox.add([bg, lbl, val]);
        };

        const fmtMoney = (val: number) => `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        createStatCard(0, -120, "BATTLE RECORD", `${data.wins}W - ${data.losses}L`, Theme.colors.warning);
        createStatCard(0, 0, "WALLET BALANCE", fmtMoney(data.balance), Theme.colors.success);
        createStatCard(0, 120, "ASSET VALUE", fmtMoney(data.totalValue), Theme.colors.secondary);

        // Logout
        const logoutBtn = this.add.text(0, 240, "LOGOUT", {
            fontSize: '28px', color: '#ff5252', fontFamily: Theme.fonts.header.fontFamily
        }).setInteractive({ useHandCursor: true }).setOrigin(0.5);

        logoutBtn.on('pointerdown', async () => {
            SoundManager.getInstance().playSFX('click');
            await supabase.auth.signOut();
            window.location.reload();
        });

        statsBox.add(logoutBtn);

        // ADMIN: Sync Data Button
        const syncBtn = this.add.text(0, 290, "[ INTIALIZE DATA ]", {
            fontSize: '18px', color: '#00e676', fontFamily: 'Courier'
        }).setInteractive({ useHandCursor: true }).setOrigin(0.5);

        syncBtn.on('pointerdown', async () => {
            syncBtn.setText("DOWNLOADING...");
            const DataSeeder = (await import('../utils/DataSeeder')).default;
            const res = await DataSeeder.seedGeneticApex();
            if (res.success) {
                syncBtn.setText(`DONE! ADDED ${res.count} CARDS`);
                SoundManager.getInstance().playSFX('success');
            } else {
                syncBtn.setText("FAILED");
                console.error(res.error);
            }
        });
        statsBox.add(syncBtn);
    }

    // Proxy to internal renderer
    // We change the signature in the class to match what we call 
    // But since fetchAndDisplayData calls this, we update the call site or method name
    // Easier here to just replace the method body of renderDashboard


    private createBackground() {
        this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x0f0f1a).setOrigin(0);
        // Hexagon pattern
        const grid = this.add.grid(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 60, 60, 0x000000, 0, 0x222233, 0.2);
    }

    private createHeader() {
        const isMobile = this.scale.width < 768;

        // Back Button
        const backBtn = this.add.text(isMobile ? 20 : 50, isMobile ? 30 : 50, "← HOME", {
            fontFamily: Theme.fonts.header.fontFamily, fontSize: isMobile ? '24px' : '32px', color: '#fff'
        }).setInteractive({ useHandCursor: true });

        backBtn.on('pointerdown', () => {
            SoundManager.getInstance().playSFX('click');
            this.scene.start('HomeScene');
        });

        // Title
        // On mobile, push it down so it doesn't hit the back button
        const titleY = isMobile ? 80 : 50;
        const titleSize = isMobile ? '32px' : '42px';

        this.add.text(this.scale.width / 2, titleY, "PLAYER PROFILE", {
            fontFamily: Theme.fonts.header.fontFamily, fontSize: titleSize, color: Theme.colors.primary.toString()
        }).setOrigin(0.5, 0); // Top-Center origin
    }

    private async fetchAndDisplayData() {
        const loading = this.add.text(this.scale.width / 2, this.scale.height / 2, "LOADING PROFILE...", { fontSize: '30px' }).setOrigin(0.5);

        try {
            const user = await getCurrentUser();
            if (!user) {
                loading.destroy();
                this.renderDashboard({ username: "GUEST", wins: 0, losses: 0, balance: 0, totalValue: 0 });
                return;
            }

            // Parallel Fetch
            const [profileRes, walletRes, collectionRes] = await Promise.all([
                supabase.from('profiles').select('*').eq('id', user.id).single(),
                supabase.from('wallets').select('*').eq('user_id', user.id).single(),
                supabase.from('user_collections').select('quantity, cards(rarity, market_price)').eq('user_id', user.id)
            ]);

            loading.destroy();

            // DATA PROCESSING
            const username = profileRes.data?.username || 'Trainer';
            const wins = profileRes.data?.wins || 0;
            const losses = profileRes.data?.losses || 0;
            // Wallet now uses 'balance' (numeric)
            const balance: number = parseFloat(walletRes.data?.balance || '0');

            // Calculate Asset Value
            let totalValue = 0;
            if (collectionRes.data) {
                collectionRes.data.forEach((item: any) => {
                    let price = parseFloat(item.cards?.market_price || '0');

                    // Fallback if price is 0 (should correspond to seeded values)
                    if (price <= 0) {
                        const rarity = item.cards?.rarity;
                        if (rarity === 'illustration_rare') price = 50.00;
                        else if (rarity === 'double_rare') price = 10.00;
                        else if (rarity === 'rare') price = 2.50;
                        else if (rarity === 'uncommon') price = 0.50;
                        else price = 0.10;
                    }

                    totalValue += (price * item.quantity);
                });
            }

            this.renderDashboard({ username, wins, losses, balance, totalValue });
        } catch (e) {
            console.error(e);
            loading.setText("ERROR LOADING DATA");
        }
    }

    private renderDashboard(data: { username: string, wins: number, losses: number, balance: number, totalValue: number }) {
        const cx = this.scale.width / 2;
        const cy = this.scale.height / 2;
        const isMobile = this.scale.width < 768;

        // --- RESPONSIVE METRICS ---
        const avatarSize = isMobile ? 180 : 300;
        const avatarFontSize = isMobile ? '80px' : '120px';
        const nameFontSize = isMobile ? '24px' : '32px';

        // Layout Config
        // FIX: Ensure Avatar doesn't overlap Header (Top ~100px)
        // Header ends approx Y=100. Avatar Radius = 90. Safe Center Y = 100 + 90 + 20 (padding) = 210.
        // We set minimum Y to 230 to be safe.
        const avatarY = isMobile ? Math.max(230, cy - 180) : cy;
        const avatarX = isMobile ? cx : (cx - 300);

        const statsY = isMobile ? (avatarY + 280) : cy; // Stats follow avatar on mobile
        const statsX = isMobile ? cx : (cx + 200);

        // Avatar Box
        const avatarBox = this.add.container(avatarX, avatarY);
        const avatarBg = this.add.rectangle(0, 0, avatarSize, avatarSize, 0x222222).setStrokeStyle(4, 0xffffff);
        const avatarPlaceholder = this.add.text(0, 0, data.username.charAt(0).toUpperCase(), { fontSize: avatarFontSize }).setOrigin(0.5);
        const nameLabel = this.add.text(0, (avatarSize / 2) + 30, data.username.toUpperCase(), { fontSize: nameFontSize, fontFamily: Theme.fonts.header.fontFamily }).setOrigin(0.5);

        avatarBox.add([avatarBg, avatarPlaceholder, nameLabel]);

        // Stats Box
        const statsBox = this.add.container(statsX, statsY);
        const cardWidth = isMobile ? Math.min(350, this.scale.width * 0.9) : 400;
        const cardHeight = isMobile ? 80 : 100;
        const gap = isMobile ? 90 : 120; // Vertical gap between stats

        const createStatCard = (x: number, y: number, label: string, value: string, color: number) => {
            const bg = this.add.rectangle(x, y, cardWidth, cardHeight, 0x1a1a1a).setStrokeStyle(2, color);

            // Text offsets
            const textX = (cardWidth / 2) - 20;

            const lbl = this.add.text(x - textX, y, label, {
                fontSize: isMobile ? '16px' : '24px', color: '#aaa'
            }).setOrigin(0, 0.5);

            const val = this.add.text(x + textX, y, value, {
                fontSize: isMobile ? '22px' : '32px', color: '#fff', fontFamily: 'Arial Black'
            }).setOrigin(1, 0.5);

            statsBox.add([bg, lbl, val]);
        };

        // Currency Formatter
        const fmtMoney = (val: number) => `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        // Render Stats
        createStatCard(0, -gap, "BATTLE RECORD", `${data.wins}W - ${data.losses}L`, Theme.colors.warning);
        createStatCard(0, 0, "WALLET BALANCE", fmtMoney(data.balance), Theme.colors.success);
        createStatCard(0, gap, "ASSET VALUE", fmtMoney(data.totalValue), Theme.colors.secondary);

        // Logout
        const logoutBtnY = gap * 2;
        const logoutBtn = this.add.text(0, logoutBtnY, "LOGOUT", {
            fontSize: isMobile ? '24px' : '28px', color: '#ff5252', fontFamily: Theme.fonts.header.fontFamily
        }).setInteractive({ useHandCursor: true }).setOrigin(0.5);

        logoutBtn.on('pointerdown', async () => {
            SoundManager.getInstance().playSFX('click');
            await supabase.auth.signOut();
            window.location.reload();
        });

        statsBox.add(logoutBtn);

        // ADMIN BUTTON (Only if needed, keeping it small)
        const syncBtn = this.add.text(0, logoutBtnY + 40, "[ RESET DATA ]", {
            fontSize: '14px', color: '#00e676', fontFamily: 'Courier'
        }).setInteractive({ useHandCursor: true }).setOrigin(0.5);

        syncBtn.on('pointerdown', async () => {
            syncBtn.setText("DOWNLOADING...");
            const DataSeeder = (await import('../utils/DataSeeder')).default;
            const res = await DataSeeder.seedGeneticApex();
            if (res.success) {
                syncBtn.setText(`DONE!`);
                SoundManager.getInstance().playSFX('success');
            } else {
                syncBtn.setText("FAILED");
            }
        });

        statsBox.add(syncBtn);
    }
}
