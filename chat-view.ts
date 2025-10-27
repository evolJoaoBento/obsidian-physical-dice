import { ItemView, WorkspaceLeaf, Setting, Notice } from 'obsidian';
import { DiceAPIClient, ChatMessage, DiceRequest } from './api-client';
import D20DicePlugin from './main';

export const CHAT_VIEW_TYPE = 'dice-chat-view';

export class DiceChatView extends ItemView {
    private plugin: D20DicePlugin;
    private apiClient: DiceAPIClient;
    private chatContainer: HTMLElement;
    private messageInput: HTMLInputElement;
    private diceSelectionContainer: HTMLElement;
    private expressionDisplay: HTMLElement;
    private rollButton: HTMLButtonElement;
    private diceExpression: string = '';
    private diceCounts: { [key: string]: number } = { d4: 0, d6: 0, d8: 0, d10: 0, d12: 0, d20: 0 };
    private modifier: number = 0;
    private userRole: 'dm' | 'player' = 'player';
    private username: string = '';
    private isPolling: boolean = false;
    private pollTimeout: NodeJS.Timeout | null = null;
    private lastMessageId: number = 0;
    public isConnected: boolean = false;

    constructor(leaf: WorkspaceLeaf, plugin: D20DicePlugin) {
        super(leaf);
        this.plugin = plugin;
        this.apiClient = new DiceAPIClient(plugin.settings.apiEndpoint);
    }

    getViewType() {
        return CHAT_VIEW_TYPE;
    }

    getDisplayText() {
        return 'Dice Chat';
    }

    getIcon() {
        return 'messages-square';
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass('dice-chat-view');

        // Check if we have a stored token
        if (typeof localStorage !== 'undefined') {
            const storedToken = localStorage.getItem('dice_chat_token');
            if (storedToken) {
                this.apiClient.setAuthToken(storedToken);
            }
        }

        if (!this.apiClient.isAuthenticated()) {
            await this.showAuthenticationSetup();
        } else if (!this.isConnected) {
            await this.showUserSetup();
        } else {
            await this.setupChatInterface();
        }
    }

    private async showAuthenticationSetup() {
        const container = this.containerEl.children[1];
        container.empty();

        const headerEl = container.createEl('div', { cls: 'dice-chat-auth-header' });
        headerEl.style.cssText = 'padding: 20px; border-bottom: 1px solid var(--background-modifier-border); text-align: center; position: relative;';
        headerEl.createEl('h2', { text: '🔐 Authentication Required' });
        headerEl.createEl('p', { text: 'Please login or register to use the dice chat system' });

        // Add logout button if there are stored credentials
        if (typeof localStorage !== 'undefined' && localStorage.getItem('dice_chat_token')) {
            const logoutBtn = headerEl.createEl('button', { text: 'Clear Stored Login', cls: 'auth-logout-btn' });
            logoutBtn.style.cssText = 'position: absolute; top: 15px; right: 15px; padding: 5px 10px; font-size: 11px; background: #ff6b35; color: white; border: none; border-radius: 3px; cursor: pointer;';
            logoutBtn.addEventListener('click', () => {
                this.apiClient.logout();
                new Notice('Stored credentials cleared');
                this.showAuthenticationSetup(); // Refresh the screen
            });
            logoutBtn.addEventListener('mouseenter', () => {
                logoutBtn.style.opacity = '0.8';
            });
            logoutBtn.addEventListener('mouseleave', () => {
                logoutBtn.style.opacity = '1';
            });
        }

        const authContainer = container.createEl('div', { cls: 'dice-chat-auth' });
        authContainer.style.cssText = 'padding: 20px; max-width: 400px; margin: 0 auto;';

        let isLoginMode = true;
        let usernameValue = '';
        let passwordValue = '';

        const toggleText = authContainer.createEl('div', { cls: 'auth-toggle' });
        toggleText.style.cssText = 'text-align: center; margin-bottom: 20px; color: var(--text-muted);';

        const formContainer = authContainer.createDiv({ cls: 'auth-form' });

        const updateForm = () => {
            formContainer.empty();

            const title = formContainer.createEl('h3', { text: isLoginMode ? 'Login' : 'Register' });
            title.style.cssText = 'text-align: center; margin-bottom: 20px; color: var(--text-accent);';

            new Setting(formContainer)
                .setName('Username')
                .setDesc('Your account username')
                .addText(text => text
                    .setPlaceholder('Enter username')
                    .setValue(usernameValue)
                    .onChange((value) => {
                        usernameValue = value;
                    }));

            new Setting(formContainer)
                .setName('Password')
                .setDesc('Your account password')
                .addText(text => text
                    .setPlaceholder('Enter password')
                    .setValue(passwordValue)
                    .then(input => {
                        input.inputEl.type = 'password';
                    })
                    .onChange((value) => {
                        passwordValue = value;
                    }));

            const buttonContainer = formContainer.createDiv({ cls: 'auth-buttons' });
            buttonContainer.style.cssText = 'margin-top: 20px; text-align: center;';

            const submitButton = buttonContainer.createEl('button', {
                text: isLoginMode ? 'Login' : 'Register',
                cls: 'mod-cta'
            });
            submitButton.style.cssText = 'margin-right: 10px; padding: 10px 20px;';

            const toggleButton = buttonContainer.createEl('button', {
                text: isLoginMode ? 'Need to register?' : 'Already have an account?'
            });
            toggleButton.style.cssText = 'padding: 10px 20px;';

            // Event listeners
            submitButton.addEventListener('click', async () => {
                if (!usernameValue.trim() || !passwordValue.trim()) {
                    new Notice('Please enter both username and password');
                    return;
                }

                try {
                    submitButton.disabled = true;
                    submitButton.textContent = isLoginMode ? 'Logging in...' : 'Registering...';

                    let result;
                    if (isLoginMode) {
                        result = await this.apiClient.login(usernameValue, passwordValue);
                    } else {
                        result = await this.apiClient.register(usernameValue, passwordValue);
                    }

                    // Store token
                    if (typeof localStorage !== 'undefined') {
                        localStorage.setItem('dice_chat_token', result.token);
                    }

                    new Notice(`${isLoginMode ? 'Login' : 'Registration'} successful!`);
                    await this.showUserSetup();

                } catch (error) {
                    console.error('Authentication failed:', error);
                    new Notice(`${isLoginMode ? 'Login' : 'Registration'} failed: ${error.message}`);
                } finally {
                    submitButton.disabled = false;
                    submitButton.textContent = isLoginMode ? 'Login' : 'Register';
                }
            });

            toggleButton.addEventListener('click', () => {
                isLoginMode = !isLoginMode;
                updateForm();
            });

            // Handle Enter key
            const inputs = formContainer.querySelectorAll('input');
            inputs.forEach(input => {
                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        submitButton.click();
                    }
                });
            });
        };

        updateForm();
    }

    private async showUserSetup() {
        const container = this.containerEl.children[1];
        container.empty();

        const headerEl = container.createEl('div', { cls: 'dice-chat-setup-header' });
        headerEl.style.cssText = 'padding: 20px; border-bottom: 1px solid var(--background-modifier-border); position: relative;';
        headerEl.createEl('h2', { text: 'Join Dice Chat' });

        // Add logout button
        const logoutBtn = headerEl.createEl('button', { text: 'Logout', cls: 'setup-logout-btn' });
        logoutBtn.style.cssText = 'position: absolute; top: 15px; right: 15px; padding: 5px 10px; font-size: 11px; background: #ff6b35; color: white; border: none; border-radius: 3px; cursor: pointer;';
        logoutBtn.addEventListener('click', () => {
            this.logout();
        });
        logoutBtn.addEventListener('mouseenter', () => {
            logoutBtn.style.opacity = '0.8';
        });
        logoutBtn.addEventListener('mouseleave', () => {
            logoutBtn.style.opacity = '1';
        });

        const setupContainer = container.createEl('div', { cls: 'dice-chat-setup' });
        setupContainer.style.cssText = 'padding: 20px;';

        let usernameValue = '';
        let roleValue: 'dm' | 'player' = 'player';
        let sessionIdValue = '';

        new Setting(setupContainer)
            .setName('Username')
            .setDesc('Your display name in the chat')
            .addText(text => text
                .setPlaceholder('Enter your username')
                .onChange((value) => {
                    usernameValue = value;
                }));

        new Setting(setupContainer)
            .setName('Role')
            .setDesc('Your role in the game session')
            .addDropdown(dropdown => dropdown
                .addOption('player', 'Player')
                .addOption('dm', 'Game Master / DM')
                .setValue('player')
                .onChange((value: 'dm' | 'player') => {
                    roleValue = value;
                    updateSessionIdVisibility();
                }));

        // Session ID input - conditional based on role
        let sessionIdSetting: Setting | null = null;
        const updateSessionIdVisibility = () => {
            if (sessionIdSetting) {
                sessionIdSetting.settingEl.style.display = roleValue === 'dm' ? 'block' : 'block';
                if (roleValue === 'dm') {
                    // For DMs, make it optional with auto-generation
                    sessionIdSetting.setDesc('Session/Room ID (leave empty to auto-generate)');
                } else {
                    // For players, it's required unless default
                    sessionIdSetting.setDesc('Session/Room ID to join (leave empty for default room)');
                }
            }
        };

        sessionIdSetting = new Setting(setupContainer)
            .setName('Session ID')
            .setDesc('Session/Room ID to join (leave empty for default room)')
            .addText(text => text
                .setPlaceholder('Enter session ID (optional)')
                .onChange((value) => {
                    sessionIdValue = value;
                }));

        updateSessionIdVisibility();

        const buttonContainer = setupContainer.createDiv({ cls: 'dice-chat-buttons' });
        buttonContainer.style.cssText = 'margin-top: 20px; text-align: center;';

        const joinButton = buttonContainer.createEl('button', {
            text: 'Connect to Chat',
            cls: 'mod-cta'
        });
        joinButton.style.cssText = 'padding: 10px 20px;';

        joinButton.addEventListener('click', async () => {
            if (!usernameValue.trim()) {
                new Notice('Please enter a username');
                return;
            }

            try {
                joinButton.disabled = true;
                joinButton.textContent = 'Connecting...';

                this.username = usernameValue;
                this.userRole = roleValue;
                this.apiClient.setUserInfo(this.username, this.userRole);

                // Handle session ID based on role
                if (roleValue === 'dm') {
                    // For DMs, auto-generate if not provided
                    const roomId = sessionIdValue.trim() || this.apiClient.generateRoomId();
                    this.apiClient.setRoomId(roomId);
                } else {
                    // For players, use provided ID or default
                    if (sessionIdValue.trim()) {
                        this.apiClient.setRoomId(sessionIdValue.trim());
                    }
                }

                // Ensure token is loaded from storage before joining
                if (typeof localStorage !== 'undefined') {
                    const storedToken = localStorage.getItem('dice_chat_token');
                    if (storedToken && !this.apiClient.isAuthenticated()) {
                        this.apiClient.setAuthToken(storedToken);
                    }
                }


                // Check if server is available
                const isHealthy = await this.apiClient.checkHealth();
                if (!isHealthy) {
                    new Notice('Cannot connect to dice API server. Check your endpoint settings.');
                    return;
                }

                await this.apiClient.joinRoom();
                this.isConnected = true;
                await this.setupChatInterface();
                this.startPolling();

                new Notice('Connected to dice chat!');

            } catch (error) {
                console.error('Failed to join chat:', error);

                if (error.message.includes('Invalid authorization token') || error.message.includes('FORCE_LOGOUT:')) {
                    new Notice('Authentication expired. Server may have been restarted. Logging out...');
                    setTimeout(() => this.logout(), 100); // Force logout with delay
                } else {
                    new Notice('Failed to connect to chat. Check your API endpoint.');
                }
            } finally {
                joinButton.disabled = false;
                joinButton.textContent = 'Connect to Chat';
            }
        });
    }

    private async setupChatInterface() {
        const container = this.containerEl.children[1];
        container.empty();

        // Header
        const header = container.createDiv({ cls: 'dice-chat-header' });
        header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 15px; border-bottom: 1px solid var(--background-modifier-border);';

        const titleDiv = header.createDiv();
        titleDiv.createEl('h3', { text: '🎲 Dice Chat', cls: 'dice-chat-title' });
        titleDiv.style.margin = '0';

        const userInfoDiv = titleDiv.createDiv({ cls: 'dice-chat-user-info' });
        userInfoDiv.style.cssText = 'font-size: 12px; color: var(--text-muted); line-height: 1.2; margin-top: 5px;';

        userInfoDiv.createEl('div', { text: `${this.username} (${this.userRole.toUpperCase()})` });
        userInfoDiv.createEl('div', {
            text: `Room: ${this.apiClient.getRoomId()}`,
            cls: 'dice-chat-room-id'
        }).style.cssText = 'font-family: monospace; font-size: 11px; opacity: 0.8;';

        const headerButtons = header.createDiv({ cls: 'header-buttons' });
        headerButtons.style.cssText = 'display: flex; gap: 5px;';

        const disconnectButton = headerButtons.createEl('button', { text: 'Disconnect', cls: 'dice-disconnect-btn' });
        disconnectButton.style.cssText = 'padding: 5px 10px; font-size: 12px; background: var(--background-modifier-error); color: white; border: none; border-radius: 3px; cursor: pointer;';
        disconnectButton.addEventListener('click', () => this.disconnect());
        disconnectButton.addEventListener('mouseenter', () => {
            disconnectButton.style.opacity = '0.8';
        });
        disconnectButton.addEventListener('mouseleave', () => {
            disconnectButton.style.opacity = '1';
        });

        const logoutButton = headerButtons.createEl('button', { text: 'Logout', cls: 'dice-logout-btn' });
        logoutButton.style.cssText = 'padding: 5px 10px; font-size: 12px; background: #ff6b35; color: white; border: none; border-radius: 3px; cursor: pointer;';
        logoutButton.addEventListener('click', () => this.logout());
        logoutButton.addEventListener('mouseenter', () => {
            logoutButton.style.opacity = '0.8';
        });
        logoutButton.addEventListener('mouseleave', () => {
            logoutButton.style.opacity = '1';
        });

        // Main content container
        const mainContainer = container.createDiv({ cls: 'dice-chat-main' });
        mainContainer.style.cssText = 'display: flex; height: calc(100vh - 120px); gap: 15px; padding: 15px;';

        // Chat section (left side)
        const chatSection = mainContainer.createDiv({ cls: 'dice-chat-section' });
        chatSection.style.cssText = 'flex: 1; display: flex; flex-direction: column; border-right: 1px solid var(--background-modifier-border); padding-right: 15px;';

        // Chat messages container
        this.chatContainer = chatSection.createDiv({ cls: 'dice-chat-messages' });
        this.chatContainer.style.cssText = 'flex: 1; overflow-y: auto; border: 1px solid var(--background-modifier-border); padding: 15px; margin-bottom: 15px; border-radius: 8px; background: var(--background-primary);';

        // Message input
        const inputContainer = chatSection.createDiv({ cls: 'dice-chat-input-container' });
        inputContainer.style.cssText = 'display: flex; gap: 8px;';

        this.messageInput = inputContainer.createEl('input', {
            type: 'text',
            placeholder: 'Type a message...'
        }) as HTMLInputElement;
        this.messageInput.style.cssText = 'flex: 1; padding: 10px; border: 1px solid var(--background-modifier-border); border-radius: 5px; background: var(--background-primary); color: var(--text-normal);';

        const sendButton = inputContainer.createEl('button', {
            text: 'Send',
            cls: 'mod-cta'
        });
        sendButton.style.cssText = 'padding: 10px 15px;';

        // Set up message input event listeners immediately
        sendButton.addEventListener('click', () => {
            this.sendChatMessage();
        });

        this.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendChatMessage();
            }
        });

        // DM Controls section (right side) - only show for DMs
        if (this.userRole === 'dm') {
            const diceSection = mainContainer.createDiv({ cls: 'dice-dice-section' });
            diceSection.style.cssText = 'width: 350px; display: flex; flex-direction: column; background: var(--background-secondary); padding: 15px; border-radius: 8px;';

            diceSection.createEl('h4', { text: '🎲 DM Dice Controls' }).style.cssText = 'margin-top: 0; color: var(--text-accent);';

            this.setupDMDiceControls(diceSection);
        } else {
            // Player info section
            const playerSection = mainContainer.createDiv({ cls: 'dice-player-section' });
            playerSection.style.cssText = 'width: 300px; display: flex; flex-direction: column; background: var(--background-secondary); padding: 15px; border-radius: 8px;';

            const infoHeader = playerSection.createEl('h4', { text: '🎯 Player Info' });
            infoHeader.style.cssText = 'margin-top: 0; color: var(--text-accent);';

            const infoText = playerSection.createDiv();
            infoText.style.cssText = 'color: var(--text-muted); line-height: 1.5; font-size: 14px;';
            infoText.innerHTML = `
                <p><strong>How to roll dice:</strong></p>
                <ul style="margin: 10px 0; padding-left: 20px;">
                    <li>Click on clickable dice requests from the DM</li>
                    <li>Use the main dice interface (dice icon in ribbon)</li>
                    <li>Rolls are automatically shared in chat</li>
                </ul>
                <p><strong>Dice requests:</strong> Click on highlighted messages from the DM to automatically set up dice and open the 3D interface.</p>
            `;
        }
    }

    private setupDMDiceControls(diceSection: HTMLElement) {
        // Room ID display for DMs
        const roomIdDisplay = diceSection.createDiv({ cls: 'room-id-display' });
        roomIdDisplay.style.cssText = 'padding: 10px; margin-bottom: 15px; background: var(--background-modifier-success); border-radius: 6px; text-align: center; cursor: pointer; border: 2px solid var(--color-green);';

        const roomIdLabel = roomIdDisplay.createEl('div', { text: 'Room ID (Click to Copy)' });
        roomIdLabel.style.cssText = 'font-size: 11px; color: var(--text-muted); margin-bottom: 5px;';

        const roomIdText = roomIdDisplay.createEl('div', { text: this.apiClient.getRoomId() });
        roomIdText.style.cssText = 'font-family: monospace; font-size: 16px; font-weight: bold; color: var(--text-normal); letter-spacing: 2px;';

        // Click to copy functionality
        roomIdDisplay.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(this.apiClient.getRoomId());
                const originalText = roomIdText.textContent;
                roomIdText.textContent = 'COPIED!';
                roomIdText.style.color = 'var(--color-green)';

                setTimeout(() => {
                    roomIdText.textContent = originalText;
                    roomIdText.style.color = 'var(--text-normal)';
                }, 1500);

                new Notice('Room ID copied to clipboard!');
            } catch (error) {
                console.error('Failed to copy:', error);
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = this.apiClient.getRoomId();
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                new Notice('Room ID copied to clipboard!');
            }
        });

        // Expression display
        this.expressionDisplay = diceSection.createDiv({
            text: 'No dice selected',
            cls: 'dice-expression-display'
        });
        this.expressionDisplay.style.cssText = 'padding: 12px; margin-bottom: 15px; background: var(--background-primary); border-radius: 6px; font-family: monospace; text-align: center; font-weight: bold; border: 2px solid var(--background-modifier-border);';

        // Dice selection grid
        this.diceSelectionContainer = diceSection.createDiv({ cls: 'dice-selection-grid' });
        this.diceSelectionContainer.style.cssText = 'display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 15px;';

        const diceTypes = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];
        diceTypes.forEach(diceType => {
            const diceCard = this.diceSelectionContainer.createDiv({ cls: 'dice-card' });
            diceCard.style.cssText = 'border: 1px solid var(--background-modifier-border); padding: 12px; border-radius: 8px; text-align: center; background: var(--background-primary);';

            const label = diceCard.createEl('div', { text: diceType.toUpperCase(), cls: 'dice-type-label' });
            label.style.cssText = 'font-weight: bold; font-size: 13px; color: var(--text-accent); margin-bottom: 8px;';

            const countDisplay = diceCard.createEl('div', {
                text: '0',
                cls: 'dice-count-display'
            });
            countDisplay.style.cssText = 'font-size: 20px; font-weight: bold; margin: 8px 0; color: var(--text-normal);';

            const buttonContainer = diceCard.createDiv({ cls: 'dice-buttons' });
            buttonContainer.style.cssText = 'display: flex; gap: 6px; justify-content: center;';

            const minusButton = buttonContainer.createEl('button', { text: '-' });
            const plusButton = buttonContainer.createEl('button', { text: '+' });

            [minusButton, plusButton].forEach(btn => {
                btn.style.cssText = 'width: 32px; height: 32px; border-radius: 50%; font-weight: bold; font-size: 16px; cursor: pointer; border: 1px solid var(--interactive-accent); transition: all 0.2s ease;';
            });

            minusButton.style.cssText += 'background: var(--background-primary); color: var(--text-normal);';
            plusButton.style.cssText += 'background: var(--interactive-accent); color: white;';

            minusButton.addEventListener('click', () => {
                if (this.diceCounts[diceType] > 0) {
                    this.diceCounts[diceType]--;
                    this.updateDiceDisplay();
                }
            });

            plusButton.addEventListener('click', () => {
                this.diceCounts[diceType]++;
                this.updateDiceDisplay();
            });

            // Store references for updating
            (diceCard as any).countDisplay = countDisplay;
        });

        // Modifier input
        const modifierContainer = diceSection.createDiv({ cls: 'dice-modifier' });
        modifierContainer.style.cssText = 'display: flex; align-items: center; gap: 10px; margin-bottom: 15px;';

        const modifierLabel = modifierContainer.createEl('label', { text: 'Modifier:' });
        modifierLabel.style.cssText = 'font-weight: 500; color: var(--text-normal);';

        const modifierInput = modifierContainer.createEl('input', {
            type: 'number',
            value: '0'
        }) as HTMLInputElement;
        modifierInput.style.cssText = 'width: 80px; padding: 8px; border: 1px solid var(--background-modifier-border); border-radius: 4px; background: var(--background-primary); color: var(--text-normal); text-align: center;';
        modifierInput.addEventListener('input', () => {
            this.modifier = parseInt(modifierInput.value) || 0;
            this.updateDiceDisplay();
        });

        // Action buttons
        const actionButtons = diceSection.createDiv({ cls: 'dice-actions' });
        actionButtons.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';

        // Roll button
        this.rollButton = actionButtons.createEl('button', {
            text: 'Roll Dice',
            cls: 'mod-cta dice-roll-button'
        });
        this.rollButton.style.cssText = 'padding: 12px; font-size: 14px; font-weight: bold; border-radius: 6px;';
        this.rollButton.disabled = true;

        // Request dice button
        const requestButton = actionButtons.createEl('button', {
            text: 'Request Dice Roll',
            cls: 'dice-request-button'
        });
        requestButton.style.cssText = 'padding: 12px; font-size: 14px; font-weight: bold; border-radius: 6px; background: var(--color-orange); color: white; border: 1px solid var(--color-orange);';

        requestButton.addEventListener('click', () => {
            this.sendDiceRequest();
        });

        // Clear dice button
        const clearButton = actionButtons.createEl('button', {
            text: 'Clear Dice',
            cls: 'dice-clear-button'
        });
        clearButton.style.cssText = 'padding: 12px; font-size: 14px; border-radius: 6px; background: var(--background-primary); color: var(--text-normal); border: 1px solid var(--background-modifier-border);';

        // Event listeners
        this.rollButton.addEventListener('click', () => {
            this.rollDice();
        });

        clearButton.addEventListener('click', () => {
            this.clearDice();
        });

        // Event listeners already set up above

        // Load initial messages
        this.loadMessages();

        // Focus the message input for immediate typing
        setTimeout(() => {
            this.messageInput.focus();
        }, 100);
    }

    private updateDiceDisplay() {
        // Only update if this is a DM with dice selection UI
        if (this.userRole !== 'dm' || !this.diceSelectionContainer) {
            return;
        }

        // Update individual dice count displays
        const diceCards = this.diceSelectionContainer.querySelectorAll('.dice-card');
        const diceTypes = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];

        diceCards.forEach((card, index) => {
            const diceType = diceTypes[index];
            const countDisplay = (card as any).countDisplay;
            if (countDisplay) {
                countDisplay.textContent = this.diceCounts[diceType].toString();
            }
        });

        // Build expression string
        const diceParts: string[] = [];
        diceTypes.forEach(diceType => {
            const count = this.diceCounts[diceType];
            if (count > 0) {
                diceParts.push(count === 1 ? diceType : `${count}${diceType}`);
            }
        });

        let expression = diceParts.join(' + ') || '';

        if (this.modifier !== 0) {
            const modifierText = this.modifier > 0 ? `+${this.modifier}` : `${this.modifier}`;
            expression = expression ? `${expression} ${modifierText}` : modifierText;
        }

        this.diceExpression = expression;
        if (this.expressionDisplay) {
            this.expressionDisplay.textContent = expression || 'No dice selected';
        }

        // Enable/disable roll button
        const hasDice = diceTypes.some(type => this.diceCounts[type] > 0);
        if (this.rollButton) {
            this.rollButton.disabled = !hasDice && this.modifier === 0;
        }
    }

    private clearDice() {
        Object.keys(this.diceCounts).forEach(key => {
            this.diceCounts[key] = 0;
        });
        this.modifier = 0;

        // Only reset modifier input if this is a DM with the UI
        if (this.userRole === 'dm') {
            const modifierInput = this.containerEl.querySelector('input[type="number"]') as HTMLInputElement;
            if (modifierInput) {
                modifierInput.value = '0';
            }
        }

        this.updateDiceDisplay();
    }

    private async sendChatMessage() {
        const message = this.messageInput.value.trim();
        if (!message) return;

        try {
            // Show immediate feedback
            const originalPlaceholder = this.messageInput.placeholder;
            this.messageInput.placeholder = 'Sending...';
            this.messageInput.disabled = true;

            await this.apiClient.sendMessage(message);
            this.messageInput.value = '';
            await this.loadMessages(); // Refresh messages

            // Reset placeholder
            this.messageInput.placeholder = originalPlaceholder;

        } catch (error) {
            console.error('Failed to send message:', error);
            new Notice('Failed to send message');
            this.messageInput.placeholder = 'Failed to send - try again';
        } finally {
            this.messageInput.disabled = false;
            // Focus back to input for continuous typing
            setTimeout(() => {
                this.messageInput.focus();
            }, 10);
        }
    }

    private async sendDiceRequest() {
        // Only DMs can send dice requests
        if (this.userRole !== 'dm') {
            return;
        }

        if (!this.diceExpression) {
            new Notice('Please select dice first');
            return;
        }

        try {
            await this.apiClient.sendDiceRequest(this.diceExpression, `Roll ${this.diceExpression} for the game`);
            await this.loadMessages();
            new Notice('Dice request sent!');
        } catch (error) {
            console.error('Failed to send dice request:', error);
            new Notice('Failed to send dice request');
        }
    }

    private async rollDice() {
        // Only DMs can roll dice in chat
        if (this.userRole !== 'dm') {
            return;
        }

        if (!this.diceExpression) {
            new Notice('Please select dice first');
            return;
        }

        try {
            this.rollButton.disabled = true;
            this.rollButton.textContent = 'Rolling...';

            const result = await this.apiClient.rollDice({
                expression: this.diceExpression,
                description: `Dice roll by ${this.username}`
            });

            await this.apiClient.sendDiceResult(result);
            await this.loadMessages();

            // Show local result as well
            new Notice(`Rolled ${result.total} (${result.breakdown})`);

            // Clear dice after rolling
            this.clearDice();

        } catch (error) {
            console.error('Failed to roll dice:', error);
            new Notice('Failed to roll dice');
        } finally {
            this.rollButton.disabled = false;
            this.rollButton.textContent = 'Roll Dice';
            this.updateDiceDisplay();
        }
    }

    private async loadMessages() {
        try {
            const response = await this.apiClient.getMessages(50, 0);
            this.displayMessages(response.messages);
        } catch (error) {
            console.error('Failed to load messages:', error);
        }
    }

    private displayMessages(messages: ChatMessage[]) {
        this.chatContainer.empty();

        messages.forEach(message => {
            const messageEl = this.chatContainer.createDiv({ cls: 'dice-chat-message' });

            // Check if this is a dice request
            const diceRequest = this.apiClient.parseDiceRequest(message.content);
            const isDiceResult = message.content.includes('🎯 **Rolled');

            if (diceRequest) {
                messageEl.addClass('dice-request-message');
                messageEl.style.cssText = 'border: 2px solid var(--interactive-accent); cursor: pointer; padding: 15px; margin-bottom: 12px; border-radius: 8px; background: var(--background-secondary); transition: background-color 0.2s ease;';

                // Make it clickable for players
                if (this.userRole === 'player' && diceRequest.requester !== this.username) {
                    messageEl.addEventListener('click', () => {
                        this.populateDiceFromRequest(diceRequest);
                    });

                    messageEl.addEventListener('mouseenter', () => {
                        messageEl.style.background = 'var(--background-modifier-hover)';
                    });

                    messageEl.addEventListener('mouseleave', () => {
                        messageEl.style.background = 'var(--background-secondary)';
                    });
                }
            } else if (isDiceResult) {
                messageEl.addClass('dice-result-message');
                messageEl.style.cssText = 'border-left: 4px solid var(--color-green); padding: 15px; margin-bottom: 12px; background: var(--background-secondary); border-radius: 0 8px 8px 0;';
            } else {
                messageEl.style.cssText = 'padding: 12px; margin-bottom: 10px; border-bottom: 1px solid var(--background-modifier-border);';
            }

            // Header with username and role
            const header = messageEl.createDiv({ cls: 'message-header' });
            header.style.cssText = 'font-weight: bold; margin-bottom: 8px; font-size: 13px;';

            const roleColor = message.user_role === 'dm' ? 'var(--color-orange)' : 'var(--color-blue)';
            header.innerHTML = `<span style="color: ${roleColor};">${message.username} (${message.user_role.toUpperCase()})</span>`;

            // Content
            const contentEl = messageEl.createDiv({ cls: 'message-content' });
            contentEl.style.cssText = 'line-height: 1.5; font-size: 14px;';
            contentEl.innerHTML = message.content.replace(/\n/g, '<br>');

            // Timestamp
            if (message.timestamp) {
                const timestampEl = messageEl.createDiv({ cls: 'message-timestamp' });
                timestampEl.style.cssText = 'font-size: 11px; color: var(--text-muted); margin-top: 8px; text-align: right;';
                timestampEl.textContent = new Date(message.timestamp).toLocaleTimeString();
            }
        });

        // Scroll to bottom
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    }

    private populateDiceFromRequest(request: DiceRequest) {
        // Parse the dice expression and populate the dice selection
        this.clearDice();

        const expression = request.expression;

        // Simple parser for expressions like "2d6+1d20+3"
        const diceMatches = expression.match(/(\d+)?d(\d+)/g);
        const modifierMatch = expression.match(/([+-]\d+)(?![d\d])/);

        if (diceMatches) {
            diceMatches.forEach(match => {
                const diceMatch = match.match(/(\d+)?d(\d+)/);
                if (diceMatch) {
                    const count = parseInt(diceMatch[1]) || 1;
                    const sides = diceMatch[2];
                    const diceType = `d${sides}`;

                    if (this.diceCounts.hasOwnProperty(diceType)) {
                        this.diceCounts[diceType] += count;
                    }
                }
            });
        }

        if (modifierMatch) {
            this.modifier = parseInt(modifierMatch[1]);
            const modifierInput = this.containerEl.querySelector('input[type="number"]') as HTMLInputElement;
            if (modifierInput) {
                modifierInput.value = this.modifier.toString();
            }
        }

        this.updateDiceDisplay();
        new Notice(`Dice loaded from request: ${request.expression}`);

        // Also trigger the physical dice interface if the plugin supports it
        if (this.plugin.handleDiceRequest) {
            this.plugin.handleDiceRequest(request.expression, request.description);
        }
    }

    private startPolling() {
        if (this.isPolling) return;

        this.isPolling = true;
        const poll = async () => {
            if (!this.isPolling) return;

            try {
                await this.loadMessages();
            } catch (error) {
                console.error('Polling error:', error);
            }

            this.pollTimeout = setTimeout(poll, 3000); // Poll every 3 seconds
        };

        poll();
    }

    private stopPolling() {
        this.isPolling = false;
        if (this.pollTimeout) {
            clearTimeout(this.pollTimeout);
            this.pollTimeout = null;
        }
    }

    private disconnect() {
        this.stopPolling();
        this.isConnected = false;
        this.showUserSetup();
    }

    private logout() {
        this.stopPolling();
        this.isConnected = false;
        this.apiClient.logout();
        new Notice('Logged out successfully');
        this.showAuthenticationSetup();
    }

    private handleApiError(error: any) {
        console.error('API Error:', error);

        // Check for 401 authentication errors
        if (error.message && error.message.includes('401')) {
            new Notice('Session expired. Please login again.');
            this.logout();
            return;
        }

        // Check for network errors
        if (error.message && error.message.includes('Failed to fetch')) {
            new Notice('Network error. Check your connection and API endpoint.');
            return;
        }

        // Generic error
        new Notice(`Error: ${error.message || 'Unknown error occurred'}`);
    }

    async onClose() {
        this.stopPolling();
    }
}