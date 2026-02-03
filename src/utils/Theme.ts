import Phaser from 'phaser';

export const Theme = {
    colors: {
        primary: 0x00ffff, // Cyber Blue
        secondary: 0xff00ff, // Cyber Pink
        background: 0x1a1a1a, // Dark Grey
        surface: 0x2a2a2a, // Lighter Grey (Cards/Panels)
        success: 0x00ff00,
        error: 0xff0000,
        warning: 0xffaa00,
        text: {
            primary: '#ffffff',
            secondary: '#aaaaaa',
            accent: '#00ffff'
        }
    },

    fonts: {
        header: { fontFamily: 'Impact, Arial Black', fontSize: '32px' },
        body: { fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '16px' },
        cardName: { fontFamily: 'Arial Black', fontSize: '18px' }
    },

    styles: {
        glassPanel: (scene: Phaser.Scene, x: number, y: number, width: number, height: number) => {
            const r = scene.add.rectangle(x, y, width, height, 0xffffff, 0.1);
            r.setStrokeStyle(1, 0xffffff, 0.3);
            return r;
        },

        button: (scene: Phaser.Scene, x: number, y: number, text: string, onClick: () => void) => {
            const container = scene.add.container(x, y);

            const bg = scene.add.rectangle(0, 0, 200, 50, 0x00ffff)
                .setInteractive({ useHandCursor: true })
                .setAlpha(0.8);

            // Cyber punk cut corner style
            // (Simplified for now as rectangle)

            const label = scene.add.text(0, 0, text.toUpperCase(), {
                fontFamily: 'Arial Black', fontSize: '20px', color: '#000'
            }).setOrigin(0.5);

            container.add([bg, label]);

            bg.on('pointerdown', () => {
                scene.tweens.add({ targets: container, scale: 0.95, duration: 50, yoyo: true });
                onClick();
            });

            bg.on('pointerover', () => bg.setAlpha(1));
            bg.on('pointerout', () => bg.setAlpha(0.8));

            return container;
        }
    }
};
