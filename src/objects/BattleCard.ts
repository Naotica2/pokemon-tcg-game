import Phaser from 'phaser';

export interface CardDefinition {
    id: string; // Database ID (for image lookup)
    name: string;
    hp?: number;
    types?: string[];
    image_url?: string;
}

export default class BattleCard extends Phaser.GameObjects.Container {
    public cardId: string; // Unique Game Instance ID
    public definition: CardDefinition;
    public state: 'HAND' | 'BENCH' | 'ACTIVE' | 'DISCARD' = 'HAND';

    private bg: Phaser.GameObjects.Rectangle;
    private image?: Phaser.GameObjects.Image;
    private glow: Phaser.GameObjects.Graphics;

    public isDragging = false;
    private originalScale = 1;

    constructor(scene: Phaser.Scene, x: number, y: number, cardId: string, definition: CardDefinition) {
        super(scene, x, y);
        this.cardId = cardId;
        this.definition = definition;

        this.setSize(100, 140);

        // 1. Glow (Hidden by default)
        this.glow = scene.add.graphics();
        this.glow.lineStyle(4, 0x00e676, 1);
        this.glow.strokeRect(-52, -72, 104, 144);
        this.glow.setVisible(false);
        this.add(this.glow);

        // 2. Background
        this.bg = scene.add.rectangle(0, 0, 100, 140, 0x222222).setStrokeStyle(1, 0x666666);
        this.add(this.bg);

        // 3. Image (Placeholder or Load)
        if (definition.image_url) {
            this.image = scene.add.image(0, 0, 'temp_card').setDisplaySize(96, 136);
            this.add(this.image);
            this.loadExternalImage(definition.image_url);
        } else {
            // Text fallback
            const name = scene.add.text(0, 0, definition.name, {
                fontSize: '12px', color: '#fff', wordWrap: { width: 90 }, align: 'center'
            }).setOrigin(0.5);
            this.add(name);
        }

        // 4. Interactivity
        this.setInteractive({ useHandCursor: true, draggable: true })
            .on('pointerover', this.onHover, this)
            .on('pointerout', this.onHoverOut, this)
            .on('dragstart', this.onDragStart, this)
            .on('drag', this.onDrag, this)
            .on('dragend', this.onDragEnd, this);

        scene.add.existing(this);
    }

    private onHover() {
        if (this.isDragging) return;
        if (this.state !== 'HAND') return; // Only zoom hand cards

        this.scene.children.bringToTop(this);
        this.scene.tweens.add({
            targets: this,
            y: this.y - 30,
            scale: 1.5,
            duration: 100,
            ease: 'Back.easeOut'
        });
    }

    private onHoverOut() {
        if (this.isDragging) return;
        if (this.state !== 'HAND') return;

        this.scene.tweens.add({
            targets: this,
            y: (this.getData('originY') || this.y + 30), // Fallback if origin not set
            scale: 1,
            duration: 100,
            ease: 'Power2.easeOut'
        });
    }

    private onDragStart(pointer: Phaser.Input.Pointer, dragX: number, dragY: number) {
        this.isDragging = true;
        this.scene.children.bringToTop(this);
        this.setData('originX', this.x);
        this.setData('originY', this.y);
        this.setScale(1.1);
    }

    private onDrag(pointer: Phaser.Input.Pointer, dragX: number, dragY: number) {
        this.x = dragX;
        this.y = dragY;
    }

    private onDragEnd(pointer: Phaser.Input.Pointer, dragX: number, dragY: number, dropped: boolean) {
        this.isDragging = false;

        if (!dropped) {
            // Return to hand animation
            this.scene.tweens.add({
                targets: this,
                x: this.getData('originX'),
                y: this.getData('originY'),
                scale: 1,
                duration: 300,
                ease: 'Power2.easeOut'
            });
        }
    }

    public highlight(active: boolean) {
        this.glow.setVisible(active);
    }

    private loadExternalImage(url: string) {
        if (!this.image) return;

        if (this.scene.textures.exists(url)) {
            this.image.setTexture(url);
            this.image.setDisplaySize(96, 136);
            return;
        }

        this.scene.load.image(url, url);
        this.scene.load.once(`filecomplete-image-${url}`, () => {
            if (this.image && this.image.scene) {
                this.image.setTexture(url);
                this.image.setDisplaySize(96, 136);
            }
        });
        this.scene.load.start();
    }
}
