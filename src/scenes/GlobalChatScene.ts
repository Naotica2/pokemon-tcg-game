import Phaser from 'phaser';
import { supabase, getCurrentUser } from '../utils/supabaseClient';
import { Theme } from '../utils/Theme';
import SoundManager from '../utils/SoundManager';

interface ChatMessage {
    id: string;
    user_id: string;
    content: string;
    created_at: string;
    username?: string; // To be joined
}

export default class GlobalChatScene extends Phaser.Scene {
    private isOpen = false;
    private container!: Phaser.GameObjects.Container;
    private messages: ChatMessage[] = [];

    // UI Elements
    private chatBox!: Phaser.GameObjects.Container;
    private chatIcon!: Phaser.GameObjects.Container;
    private messageListText!: Phaser.GameObjects.Text;
    private inputElement?: HTMLInputElement;
    private domBtn?: HTMLButtonElement; // Fixed: Declared explicitly

    private lastFetch = 0;
    private canExit = false; // Added property

    constructor() {
        super('GlobalChatScene');
    }

    private bgRect!: Phaser.GameObjects.Rectangle;
    private bgGrid!: Phaser.GameObjects.Grid;
    private headerText!: Phaser.GameObjects.Text;
    private backBtn!: Phaser.GameObjects.Text;

    create() {
        // Standard Scene Setup
        this.createBackground();
        this.createHeader();

        // Chat Content Container
        this.container = this.add.container(0, 0);

        // Message Display
        this.createMessageList();

        // Subscription
        this.startRealtimeSubscription();
        this.fetchMessages();

        // Input Setup (Pinned to bottom)
        this.createDOMInput();

        // RESIZE HANDLING
        // Crucial: Do NOT restart scene on resize, because mobile keyboard triggers resize.
        // Restarting kills the input focus and closes the keyboard.
        this.scale.on('resize', this.handleResize, this);
    }

    private handleResize(gameSize: Phaser.Structs.Size) {
        const width = gameSize.width;
        const height = gameSize.height;
        const isMobile = width < 768;

        // 1. Update Background
        if (this.bgRect) this.bgRect.setSize(width, height);
        if (this.bgGrid) {
            this.bgGrid.setPosition(width / 2, height / 2);
            // Grid objects in Phaser 3 often require direct property updates or recreating
            this.bgGrid.width = width;
            this.bgGrid.height = height;
        }

        // 2. Update Header
        if (this.headerText) this.headerText.setPosition(width / 2, 50);

        // 3. Update Message List width
        if (this.messageListText) {
            const w = isMobile ? width * 0.9 : 800;
            this.messageListText.setPosition(width / 2 - w / 2, 120);
            this.messageListText.setStyle({ wordWrap: { width: w } });
        }

        // 4. Update Input Position
        // Use CSS bottom pinning
        const inputW = isMobile ? width - 40 : Math.min(600, width * 0.6);
        const startX = (width - inputW) / 2;

        if (this.inputElement) {
            this.inputElement.style.left = `${startX}px`;
            this.inputElement.style.width = `${inputW - 80}px`;
            // Bottom is handled by CSS now, no need to set Top
        }
        if (this.domBtn) {
            this.domBtn.style.left = `${startX + inputW - 70}px`;
        }
    }

    private createBackground() {
        this.bgRect = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x111111).setOrigin(0);
        this.bgGrid = this.add.grid(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 40, 40, 0x000000, 0, 0x222222, 0.5);
    }

    private createHeader() {
        const isMobile = this.scale.width < 768;
        const padding = isMobile ? 20 : 50;

        // Enable exit after 1 second to prevent ghost clicks
        this.time.delayedCall(1000, () => {
            this.canExit = true;
        });

        this.backBtn = this.add.text(padding, 50, "← HOME", {
            fontFamily: Theme.fonts.header.fontFamily, fontSize: isMobile ? '24px' : '32px', color: '#fff'
        })
            .setInteractive({ useHandCursor: true })
            .setScrollFactor(0); // Fix to screen

        this.backBtn.on('pointerdown', () => {
            if (!this.canExit) return; // ignore early clicks

            SoundManager.getInstance().playSFX('click');
            this.shutdown(); // Clean DOM
            this.scene.start('HomeScene');
        });

        this.headerText = this.add.text(this.scale.width / 2, 50, "GLOBAL CHAT", {
            fontFamily: Theme.fonts.header.fontFamily, fontSize: isMobile ? '32px' : '42px', color: Theme.colors.success.toString()
        })
            .setOrigin(0.5, 0.5)
            .setScrollFactor(0);
    }

    private createMessageList() {
        const isMobile = this.scale.width < 768;
        const w = isMobile ? this.scale.width * 0.9 : 800; // Wide on desktop
        const x = this.scale.width / 2;
        const y = 120; // Below header

        // Placeholder for messages (Simple Text for now)
        this.messageListText = this.add.text(x - w / 2, y, "Loading messages...", {
            fontSize: isMobile ? '16px' : '18px',
            color: '#eee',
            wordWrap: { width: w },
            lineSpacing: 10
        });
    }

    // Removed Overlay specific methods (createChatIcon, createChatWindow, toggleChat, cleanupDOM helper logic handles shutdown)


    private createDOMInput() {
        // Cleanup old first just in case
        this.cleanupDOM();

        const isMobile = this.scale.width < 768;
        const w = isMobile ? this.scale.width - 40 : Math.min(600, this.scale.width * 0.6); // Full width-ish
        const startX = (this.scale.width - w) / 2;

        this.inputElement = document.createElement('input');
        this.inputElement.type = 'text';
        this.inputElement.placeholder = 'Type a message...';
        Object.assign(this.inputElement.style, {
            position: 'absolute',
            left: `${startX}px`,
            bottom: '20px', // PINNED TO BOTTOM
            width: `${w - 80}px`, // Room for button
            height: '40px',
            backgroundColor: '#222',
            color: 'white',
            fontSize: '16px',
            border: '1px solid #444',
            borderRadius: '4px',
            zIndex: '10005',
            padding: '5px'
        });

        document.body.appendChild(this.inputElement);

        // Focus handling
        this.inputElement.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage(this.inputElement!.value);
                this.inputElement!.value = '';
            }
        });

        // Send Button (Native DOM)
        const btn = document.createElement('button');
        btn.innerText = "SEND";
        Object.assign(btn.style, {
            position: 'absolute',
            left: `${startX + w - 70}px`,
            bottom: '20px', // PINNED TO BOTTOM
            width: '70px',
            height: '52px', // Match input + padding/border visually
            cursor: 'pointer',
            backgroundColor: '#00e676',
            border: 'none',
            borderRadius: '4px',
            fontWeight: 'bold',
            zIndex: '10006', // Higher than input
            pointerEvents: 'auto', // Ensure clickable
            touchAction: 'manipulation' // Improve touch response
        });

        const handleClick = (e: Event) => {
            e.preventDefault();
            e.stopPropagation();

            if (this.inputElement) {
                const val = this.inputElement.value;
                if (!val) return;

                this.inputElement.value = '';
                this.sendMessage(val);
                this.inputElement.focus(); // Revert to focus to ensure keyboard stays
            }
            return false;
        };

        // Add multiple listeners for mobile reliability
        btn.onclick = handleClick;
        btn.ontouchend = handleClick; // Mobile tap often faster

        document.body.appendChild(btn);
        this.domBtn = btn;
    }

    private cleanupDOM() {
        if (this.inputElement && document.body.contains(this.inputElement)) {
            document.body.removeChild(this.inputElement);
            this.inputElement = undefined;
        }
        if (this.domBtn && document.body.contains(this.domBtn)) {
            document.body.removeChild(this.domBtn);
            this.domBtn = undefined;
        }
    }

    private async sendMessage(content: string) {
        if (!content.trim()) return;

        const user = await getCurrentUser();

        if (!user) {
            console.warn("User not logged in");
            alert("CHAT ERROR: You must be logged in to chat."); // User needs to know!
            return;
        }

        try {
            const { error } = await supabase.rpc('send_chat_message', { _content: content });

            if (error) {
                console.error("Chat RPC Error:", error);
                alert(`CHAT ERROR: ${error.message}`); // User needs to know!
                // Restore text
                if (this.inputElement) this.inputElement.value = content;
            } else {
                this.fetchMessages();
            }
        } catch (e: any) {
            console.error("Chat Exception:", e);
            alert("Chat Failed to Send");
        }
    }

    private async fetchMessages() {
        // Fetch last 50
        const { data, error } = await supabase
            .from('chat_messages')
            .select(`*, profiles:user_id(username)`)
            .order('created_at', { ascending: false }) // Newest first
            .limit(20);

        if (data && !error) {
            this.messages = data.reverse(); // Show oldest to newest
            this.updateMessageDisplay();
        }
    }

    private startRealtimeSubscription() {
        supabase
            .channel('public:chat_messages')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, async (payload: any) => {
                // Fetch user name (Payload often doesn't have Joined data)
                // For simplicity, just refetch or optimistically add "Unknown"
                // Let's refetch single latest to get name

                // Or just:
                const newMsg = payload.new;
                // We need username. Fast hack: Just fetch valid list again or fetch single.
                this.fetchMessages();
            })
            .subscribe();
    }

    private updateMessageDisplay() {
        if (!this.messageListText) return;

        const text = this.messages.map(m => {
            // Safe access profiles (it might be array or object depending on join)
            const user = (m as any).profiles?.username || 'Unknown';
            return `[${user}]: ${m.content}`;
        }).join('\n\n');

        this.messageListText.setText(text);

        // Scroll to bottom (Crude way: adjust Y of text? Or we masked it?)
        // Since we are using simple text, we just cut off old ones.
        // We limit to 20 lines.
    }

    // Cleanup DOM on shutdown
    // Scene shutdown/destroy logic
    shutdown() {
        if (this.inputElement && document.body.contains(this.inputElement)) {
            document.body.removeChild(this.inputElement);
        }
        if (this.domBtn && document.body.contains(this.domBtn)) {
            document.body.removeChild(this.domBtn);
        }
    }
}
