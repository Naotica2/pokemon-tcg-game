import Phaser from 'phaser';

export default class SoundManager {
    private static instance: SoundManager;
    private scene: Phaser.Scene;

    private constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    public static init(scene: Phaser.Scene): void {
        if (!SoundManager.instance) {
            SoundManager.instance = new SoundManager(scene);
        } else {
            // Update scene reference if scene changes (though we usually use it globally, newer scene refs helps)
            SoundManager.instance.scene = scene;
        }
    }

    public static getInstance(): SoundManager {
        if (!SoundManager.instance) {
            throw new Error("SoundManager not initialized! Call init() in PreloadScene.");
        }
        return SoundManager.instance;
    }

    // --- PRELOADER ---
    // Call this in your PreloadScene
    public static preload(scene: Phaser.Scene) {
        // Use ABSOLUTE path to avoid issues with deep routes or Vercel rewrites
        const sfxPath = '/sfx/';

        // BGM
        scene.load.audio('bgm_battle', sfxPath + 'bgm_battle.mp3');
        scene.load.audio('bgm_home', sfxPath + 'bgm_home.mp3');

        // Gacha
        scene.load.audio('gacha_shake', sfxPath + 'gacha_pack_shake.mp3');
        scene.load.audio('gacha_rip', sfxPath + 'gacha_pack_rip.mp3');
        scene.load.audio('reveal_common', sfxPath + 'gacha_reveal_common.mp3');
        scene.load.audio('reveal_rare', sfxPath + 'gacha_reveal_rare.mp3');
        scene.load.audio('reveal_ultra', sfxPath + 'gacha_reveal_ultra.mp3');

        // UI
        scene.load.audio('click', sfxPath + 'ui_click.mp3');
        scene.load.audio('success', sfxPath + 'ui_success.mp3');
        scene.load.audio('ui_coin', sfxPath + 'ui_success.mp3'); // Fallback/Alias
        scene.load.audio('ui_error', sfxPath + 'ui_click.mp3'); // Fallback
    }

    // --- PUBLIC API ---

    public playBGM(key: 'bgm_battle' | 'bgm_home') {
        // Stop existing BGM if any
        this.scene.sound.stopAll();

        this.scene.sound.play(key, {
            loop: true,
            volume: 0.5
        });
    }

    public playSFX(key: string, config?: Phaser.Types.Sound.SoundConfig) {
        this.scene.sound.play(key, config);
    }
}
