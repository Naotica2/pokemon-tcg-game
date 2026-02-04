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

    constructor() {
        super('GlobalChatScene');
    }

    create() {
        // Z-Index High to stay on top
        this.scene.bringToTop();

        // Ensure this scene stays on top whenever another scene starts
        // Use Game-level events because SceneManager events might not be exposed on the scene property directly in this version's typings
        this.game.events.on('step', () => {
            // Checking every step is overkill?
            // Let's just rely on "bringToTop" being called once at create, and maybe rely on the fact that
            // we launch it in parallel.
            // Actually, simplest hack:
            if (this.scene.manager.getAt(this.scene.manager.scenes.length - 1) !== this) {
                this.scene.bringToTop();
            }
        });

        // 1. Chat Icon (Always Visible)
        this.createChatIcon();

        // 2. Chat Box (Hidden by default)
        this.createChatWindow();

        // 3. Subscription logic
        this.startRealtimeSubscription();

        // Resize Listener
        this.scale.on('resize', this.handleResize, this);
    }

    private handleResize() {
        // Update Icon Position
        this.chatIcon.setPosition(this.scale.width - 60, this.scale.height - 140);

        // Update Box Position/Size
        // We'll just toggle reset
        if (this.isOpen) {
            this.toggleChat(); // Close
            this.toggleChat(); // Open (Re-render)
        }
    }

    private createChatIcon() {
        // Bottom Right floating button
        const x = this.scale.width - 60;
        const y = this.scale.height - 140; // Above "BACK" buttons usually

        this.chatIcon = this.add.container(x, y);

        const bg = this.add.circle(0, 0, 30, 0x000000).setStrokeStyle(2, 0x00ff00);
        const icon = this.add.text(0, 0, "💬", { fontSize: '30px' }).setOrigin(0.5);

        const unreadBadge = this.add.circle(15, -15, 10, 0xff0000).setVisible(false);

        this.chatIcon.add([bg, icon, unreadBadge]);
        this.chatIcon.setDepth(10000); // Super high

        bg.setInteractive({ useHandCursor: true })
            .on('pointerdown', () => this.toggleChat());

        // Hover
        bg.on('pointerover', () => this.tweens.add({ targets: this.chatIcon, scale: 1.1, duration: 100 }));
        bg.on('pointerout', () => this.tweens.add({ targets: this.chatIcon, scale: 1.0, duration: 100 }));
    }

    private createChatWindow() {
        // Overlay container
        this.container = this.add.container(0, 0).setVisible(false).setDepth(10001);

        // Setup empty structures, populate on open
    }

    private async toggleChat() {
        this.isOpen = !this.isOpen;
        this.container.setVisible(this.isOpen);

        if (this.isOpen) {
            // Render Window Content dynamic to size
            this.container.removeAll(true);
            this.renderWindowContent();
            this.fetchMessages();

            // Create Input
            this.createDOMInput();
        } else {
            // Destroy Input AND Button to prevent it sticking around
            this.cleanupDOM();
        }
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

    private renderWindowContent() {
        const isMobile = this.scale.width < 768;
        const w = isMobile ? this.scale.width * 0.9 : 400;
        const h = isMobile ? this.scale.height * 0.6 : 500;

        const x = isMobile ? this.scale.width / 2 : this.scale.width - (w / 2) - 20;
        const y = isMobile ? this.scale.height / 2 : this.scale.height - (h / 2) - 100;

        // 1. Full Screen Blocker (Invisible/Dim) to stop clicks passing through
        // This ensures you don't accidentally click the game scene behind the chat
        const blocker = this.add.rectangle(
            this.scale.width / 2,
            this.scale.height / 2,
            this.scale.width,
            this.scale.height,
            0x000000,
            0.5 // Slight dim for focus
        ).setInteractive(); // interactive but no handler = swallows input in Phaser (usually)

        // Make sure it actually blocks. Phaser input top-down. 
        // We need to explicitly stop propagation or just exist on top.
        blocker.on('pointerdown', (e: any) => {
            // Optional: Close on backdrop click? 
            // User asked to "not click background". 
            // Let's just block it.
            // this.toggleChat(); 
        });

        // 2. Chat Background
        const bg = this.add.rectangle(x, y, w, h, 0x000000, 0.9)
            .setStrokeStyle(1, 0x333333)
            .setInteractive(); // Also make the window itself interactive

        // Header
        const header = this.add.text(x - w / 2 + 20, y - h / 2 + 20, "GLOBAL CHAT", {
            fontSize: '20px', fontFamily: Theme.fonts.header.fontFamily, color: '#00e676'
        });

        // Close
        const close = this.add.text(x + w / 2 - 40, y - h / 2 + 20, "X", {
            fontSize: '24px', color: '#fff'
        }).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.toggleChat());

        // Messages Area (Placeholder Text Object for now, or BitmapText for perf)
        // A scrollable container would be better, but simple text mask is easier for MVP
        this.messageListText = this.add.text(x - w / 2 + 20, y - h / 2 + 60, "Loading...", {
            fontSize: '14px', color: '#fff', wordWrap: { width: w - 40 }
        });

        this.container.add([blocker, bg, header, close, this.messageListText]);
    }

    private createDOMInput() {
        // Cleanup old first just in case
        this.cleanupDOM();

        const isMobile = this.scale.width < 768;
        const w = isMobile ? this.scale.width * 0.9 : 400;
        const h = isMobile ? this.scale.height * 0.6 : 500;

        const x = isMobile ? (this.scale.width - w) / 2 : this.scale.width - w - 20;
        const y = isMobile ? (this.scale.height + h) / 2 - 50 : this.scale.height - 150; // Align with bottom of box

        this.inputElement = document.createElement('input');
        this.inputElement.type = 'text';
        this.inputElement.placeholder = 'Type a message...';
        Object.assign(this.inputElement.style, {
            position: 'absolute',
            left: `${x + 20}px`,
            top: `${y}px`,
            width: `${w - 100}px`,
            height: '30px',
            backgroundColor: '#222',
            color: 'white',
            border: '1px solid #444',
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
            left: `${x + w - 70}px`,
            top: `${y}px`,
            width: '60px',
            height: '42px',
            cursor: 'pointer',
            backgroundColor: '#00e676',
            border: 'none',
            fontWeight: 'bold',
            zIndex: '10005', // High Z-Index
            pointerEvents: 'auto' // Ensure clickable
        });

        const handleClick = (e: Event) => {
            e.stopPropagation();
            if (this.inputElement) {
                const val = this.inputElement.value;
                if (!val) return;

                this.inputElement.value = ''; // Optimistic clear
                this.sendMessage(val);
            }
        };

        // Add multiple listeners for mobile reliability
        btn.onclick = handleClick;
        btn.ontouchend = handleClick; // Mobile tap often faster

        document.body.appendChild(btn);
        this.domBtn = btn;
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
