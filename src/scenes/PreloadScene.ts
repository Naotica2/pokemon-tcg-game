import Phaser from 'phaser';
import SoundManager from '../utils/SoundManager';
import { Theme } from '../utils/Theme';
import { supabase } from '../utils/supabaseClient'; // Fixed Import
import DataSeeder from '../utils/DataSeeder';      // Fixed Import

export default class PreloadScene extends Phaser.Scene {
    private loadingText!: Phaser.GameObjects.Text;
    private progressBar!: Phaser.GameObjects.Graphics;
    private progressBox!: Phaser.GameObjects.Graphics;

    constructor() {
        super('PreloadScene');
    }

    preload() {
        // --- GLOBAL ASSETS ---

        // 1. Setup UI for loading
        this.createLoadingUI();

        // 2. Images 
        this.load.on('loaderror', (file: any) => {
            console.warn('Asset load failed:', file.key);
        });

        this.load.image('bg_gradient', 'https://labs.phaser.io/assets/skies/space3.png');
        this.load.image('particle_glint', 'https://labs.phaser.io/assets/particles/blue.png');
        // card_back_highres removed to prevent CORS error (using procedural in scenes)

        // 3. Audio 
        try {
            SoundManager.preload(this);
        } catch (e) {
            console.error("Audio preloading failed", e);
        }

        // Update Progress
        this.load.on('progress', (value: number) => {
            if (this.progressBar) {
                this.progressBar.clear();
                this.progressBar.fillStyle(Theme.colors.primary, 1);
                this.progressBar.fillRect(this.cameras.main.width / 2 - 150, this.cameras.main.height / 2 - 15, 300 * value, 30);
            }
        });
    }

    async create() {
        try {
            // 0. Initialize Audio
            SoundManager.init(this);

            // 1. Check Data Integrity (Auto-Seed)
            this.loadingText.setText('Checking game data...');

            const { count, error } = await supabase
                .from('cards')
                .select('*', { count: 'exact', head: true });

            if (error) {
                console.error("Error checking cards table:", error);
            }

            if (count === 0) {
                this.loadingText.setText('DOWNLOADING ASSETS (FIRST RUN)...');
                console.log("No cards found, seeding data...");
                try {
                    await DataSeeder.seedGeneticApex();
                    console.log("Data seeding complete.");
                    this.loadingText.setText('Data loaded!');
                } catch (seedError) {
                    console.error("Data seeding failed:", seedError);
                    this.loadingText.setText('Setup Warning: Check Console');
                }
            } else {
                console.log(`Found ${count} cards. Ready.`);
                this.loadingText.setText('Ready!');
            }

            // Small delay to ensure render happens
            this.time.delayedCall(500, () => {
                this.destroyLoadingUI();
                this.scene.start('AuthScene');
            });

        } catch (e) {
            console.error("PreloadScene create error:", e);
            this.destroyLoadingUI();
            this.scene.start('AuthScene');
        }
    }

    private createLoadingUI() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        this.progressBar = this.add.graphics();
        this.progressBox = this.add.graphics();
        this.progressBox.fillStyle(0x222222, 0.8);
        this.progressBox.fillRect(width / 2 - 160, height / 2 - 25, 320, 50);

        this.loadingText = this.add.text(width / 2, height / 2 - 50, 'Loading...', {
            fontFamily: 'monospace',
            fontSize: '20px',
            color: '#ffffff'
        });
        this.loadingText.setOrigin(0.5, 0.5);
    }

    private destroyLoadingUI() {
        if (this.progressBar) this.progressBar.destroy();
        if (this.progressBox) this.progressBox.destroy();
        if (this.loadingText) this.loadingText.destroy();
    }
}
