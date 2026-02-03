import Phaser from 'phaser';
import { Theme } from '../utils/Theme';
import { supabase } from '../utils/supabaseClient';
import SoundManager from '../utils/SoundManager';

export default class AuthScene extends Phaser.Scene {
    private formElement!: Phaser.GameObjects.DOMElement;
    private isRegistering = false;

    constructor() {
        super('AuthScene');
    }

    create() {
        this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x111111).setOrigin(0);

        const cx = this.scale.width / 2;
        const cy = this.scale.height / 2;

        // Background Art
        if (this.textures.exists('bg_gradient')) {
            const bg = this.add.image(cx, cy, 'bg_gradient').setDisplaySize(this.scale.width, this.scale.height).setAlpha(0.3);
        }

        // Check Session First
        this.checkSession(cx, cy);
    }

    private async checkSession(cx: number, cy: number) {
        const loadingText = this.add.text(cx, cy, "CHECKING SESSION...", {
            fontFamily: Theme.fonts.header.fontFamily, fontSize: '24px', color: '#aaa'
        }).setOrigin(0.5);

        try {
            const { data: { session } } = await supabase.auth.getSession();

            if (session?.user) {
                loadingText.setText(`WELCOME BACK, ${session.user.user_metadata.username || 'TRAINER'}!`);
                SoundManager.getInstance().playSFX('success');

                this.time.delayedCall(1000, () => {
                    this.scene.start('HomeScene');
                });
                return;
            }
        } catch (e) {
            console.error("Auto-login failed", e);
        }

        loadingText.destroy();
        this.showLoginForm(cx, cy);
    }

    private showLoginForm(cx: number, cy: number) {
        // Title
        this.add.text(cx, cy - 250, "POKEMON TCG POCKET", {
            fontFamily: Theme.fonts.header.fontFamily, fontSize: '64px', color: Theme.colors.primary.toString(),
            shadow: { blur: 20, color: Theme.colors.primary.toString(), fill: true }
        }).setOrigin(0.5);

        // HTML Form
        const formHTML = `
            <style>
                .auth-container {
                    background: rgba(20, 20, 30, 0.9);
                    backdrop-filter: blur(10px);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 20px;
                    padding: 40px;
                    width: 400px;
                    text-align: center;
                    font-family: 'Arial', sans-serif;
                    box-shadow: 0 10px 50px rgba(0,0,0,0.5);
                }
                .title { color: white; font-size: 24px; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 2px; }
                
                .input-group { margin-bottom: 15px; text-align: left; }
                .label { display: block; color: #888; margin-bottom: 5px; font-size: 12px; font-weight: bold; }
                input {
                    background: rgba(0, 0, 0, 0.5);
                    border: 1px solid #444;
                    color: white;
                    padding: 12px;
                    width: 100%;
                    border-radius: 6px;
                    font-size: 16px;
                    box-sizing: border-box;
                    outline: none;
                    transition: all 0.2s;
                }
                input:focus { border-color: ${Theme.colors.primary}; box-shadow: 0 0 10px rgba(0,255,0,0.2); }
                
                button {
                    width: 100%;
                    padding: 12px;
                    border: none;
                    border-radius: 6px;
                    font-size: 16px;
                    font-weight: bold;
                    cursor: pointer;
                    margin-top: 10px;
                    text-transform: uppercase;
                    transition: transform 0.1s;
                }
                button:active { transform: scale(0.98); }
                
                .btn-submit { background: linear-gradient(45deg, ${Theme.colors.primary}, #00b8d4); color: #000; }
                .btn-toggle { background: transparent; color: #aaa; font-size: 14px; margin-top: 20px; text-decoration: underline; text-transform: none; font-weight: normal; }
                .btn-guest { background: transparent; border: 1px solid #333; color: #666; font-size: 12px; margin-top: 30px; }

                .hidden { display: none; }
                .error-msg { color: #ff5252; margin-top: 15px; font-size: 14px; min-height: 20px; }
            </style>
            
            <div class="auth-container">
                <div class="title" id="formTitle">LOGIN</div>

                <div class="input-group">
                    <label class="label">USERNAME</label>
                    <input type="text" id="username" placeholder="Trainer Name" autocomplete="off" />
                </div>
                
                <div class="input-group">
                    <label class="label">PASSWORD</label>
                    <input type="password" id="password" placeholder="••••••••" />
                </div>

                <div class="input-group hidden" id="confirmGroup">
                    <label class="label">CONFIRM PASSWORD</label>
                    <input type="password" id="confirmPassword" placeholder="••••••••" />
                </div>
                
                <button class="btn-submit" id="submitBtn">LOGIN</button>
                
                <div class="error-msg" id="errorMsg"></div>

                <button class="btn-toggle" id="toggleBtn">New Trainer? Register Here</button>
                <button class="btn-guest" id="guestBtn">Continue as Guest</button>
            </div>
        `;

        this.formElement = this.add.dom(cx, cy + 20).createFromHTML(formHTML);
        this.formElement.addListener('click');

        this.formElement.on('click', (event: any) => {
            if (event.target.id === 'submitBtn') {
                this.handleSubmit();
            } else if (event.target.id === 'toggleBtn') {
                this.toggleMode();
            } else if (event.target.id === 'guestBtn') {
                SoundManager.getInstance().playSFX('click');
                this.scene.start('HomeScene');
            }
        });
    }

    private toggleMode() {
        this.isRegistering = !this.isRegistering;
        SoundManager.getInstance().playSFX('click');

        const title = this.formElement.getChildByID('formTitle') as HTMLElement;
        const confirmGroup = this.formElement.getChildByID('confirmGroup') as HTMLElement;
        const submitBtn = this.formElement.getChildByID('submitBtn') as HTMLElement;
        const toggleBtn = this.formElement.getChildByID('toggleBtn') as HTMLElement;
        const errorMsg = this.formElement.getChildByID('errorMsg') as HTMLElement;

        errorMsg.innerText = "";

        if (this.isRegistering) {
            title.innerText = "REGISTER NEW TRAINER";
            confirmGroup.classList.remove('hidden');
            submitBtn.innerText = "CREATE ACCOUNT";
            toggleBtn.innerText = "Already have an account? Login";
        } else {
            title.innerText = "LOGIN";
            confirmGroup.classList.add('hidden');
            submitBtn.innerText = "LOGIN";
            toggleBtn.innerText = "New Trainer? Register Here";
        }
    }

    private async handleSubmit() {
        SoundManager.getInstance().playSFX('click');

        const username = (this.formElement.getChildByID('username') as HTMLInputElement).value.trim();
        const password = (this.formElement.getChildByID('password') as HTMLInputElement).value;
        const confirmPass = (this.formElement.getChildByID('confirmPassword') as HTMLInputElement).value;

        if (!username || !password) {
            this.showError("Please fill all fields");
            return;
        }

        if (password.length < 6) {
            this.showError("Password must be 6+ chars");
            return;
        }

        // Validate Input Format (No special chars for username to avoid weird issues)
        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            this.showError("Username: Letters, numbers, _ only");
            return;
        }

        // Register Validation
        if (this.isRegistering && password !== confirmPass) {
            this.showError("Passwords do not match!");
            return;
        }

        // Construct Valid Email
        // Supabase often rejects .local, so use example.com or a real-looking domain
        // We ensure uniqueness by username
        const email = `${username}@pokemon-pocket.com`;

        this.showError("Processing...", '#fff');

        try {
            let error;

            if (this.isRegistering) {
                // REGISTER FLOW
                const res = await supabase.auth.signUp({
                    email,
                    password,
                    options: { data: { username } }
                });
                error = res.error;

                if (!error && res.data.user) {
                    // Auto Login usually works if email confirm disabled
                    // If session null, maybe confirm needed
                    if (!res.data.session) {
                        this.showError("Created! Please Login now.");
                        this.toggleMode(); // Switch back to login
                        return;
                    }
                }
            } else {
                // LOGIN FLOW
                const res = await supabase.auth.signInWithPassword({ email, password });
                error = res.error;
            }

            if (error) {
                if (error.message.includes("Invalid login")) {
                    this.showError("User not found or wrong password");
                } else if (error.message.includes("already registered")) {
                    this.showError("Username taken! Try another");
                } else {
                    this.showError(error.message);
                }
            } else {
                SoundManager.getInstance().playSFX('success');
                this.scene.start('HomeScene');
            }

        } catch (err: any) {
            this.showError("Connection Error");
        }
    }

    private showError(msg: string, color = '#ff5252') {
        const el = this.formElement.getChildByID('errorMsg') as HTMLElement;
        if (el) {
            el.innerText = msg;
            el.style.color = color;
            // Shake effect
            this.tweens.add({
                targets: this.formElement,
                x: '+=5',
                duration: 50,
                yoyo: true,
                repeat: 3
            });
        }
    }
}
