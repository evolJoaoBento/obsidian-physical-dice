import { __awaiter } from "tslib";
import { ItemView, Setting, Notice } from 'obsidian';
import { DiceAPIClient } from './api-client';
export const CHAT_VIEW_TYPE = 'dice-chat-view';
export class DiceChatView extends ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.diceExpression = '';
        this.diceCounts = { d4: 0, d6: 0, d8: 0, d10: 0, d12: 0, d20: 0 };
        this.modifier = 0;
        this.userRole = 'player';
        this.username = '';
        this.isPolling = false;
        this.pollTimeout = null;
        this.lastMessageId = 0;
        this.isConnected = false;
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
    onOpen() {
        return __awaiter(this, void 0, void 0, function* () {
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
                yield this.showAuthenticationSetup();
            }
            else if (!this.isConnected) {
                yield this.showUserSetup();
            }
            else {
                yield this.setupChatInterface();
            }
        });
    }
    showAuthenticationSetup() {
        return __awaiter(this, void 0, void 0, function* () {
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
                submitButton.addEventListener('click', () => __awaiter(this, void 0, void 0, function* () {
                    if (!usernameValue.trim() || !passwordValue.trim()) {
                        new Notice('Please enter both username and password');
                        return;
                    }
                    try {
                        submitButton.disabled = true;
                        submitButton.textContent = isLoginMode ? 'Logging in...' : 'Registering...';
                        let result;
                        if (isLoginMode) {
                            result = yield this.apiClient.login(usernameValue, passwordValue);
                        }
                        else {
                            result = yield this.apiClient.register(usernameValue, passwordValue);
                        }
                        // Store token
                        if (typeof localStorage !== 'undefined') {
                            localStorage.setItem('dice_chat_token', result.token);
                        }
                        new Notice(`${isLoginMode ? 'Login' : 'Registration'} successful!`);
                        yield this.showUserSetup();
                    }
                    catch (error) {
                        console.error('Authentication failed:', error);
                        new Notice(`${isLoginMode ? 'Login' : 'Registration'} failed: ${error.message}`);
                    }
                    finally {
                        submitButton.disabled = false;
                        submitButton.textContent = isLoginMode ? 'Login' : 'Register';
                    }
                }));
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
        });
    }
    showUserSetup() {
        return __awaiter(this, void 0, void 0, function* () {
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
            let roleValue = 'player';
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
                .onChange((value) => {
                roleValue = value;
                updateSessionIdVisibility();
            }));
            // Session ID input - conditional based on role
            let sessionIdSetting = null;
            const updateSessionIdVisibility = () => {
                if (sessionIdSetting) {
                    sessionIdSetting.settingEl.style.display = roleValue === 'dm' ? 'block' : 'block';
                    if (roleValue === 'dm') {
                        // For DMs, make it optional with auto-generation
                        sessionIdSetting.setDesc('Session/Room ID (leave empty to auto-generate)');
                    }
                    else {
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
            joinButton.addEventListener('click', () => __awaiter(this, void 0, void 0, function* () {
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
                    }
                    else {
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
                    const isHealthy = yield this.apiClient.checkHealth();
                    if (!isHealthy) {
                        new Notice('Cannot connect to dice API server. Check your endpoint settings.');
                        return;
                    }
                    yield this.apiClient.joinRoom();
                    this.isConnected = true;
                    yield this.setupChatInterface();
                    this.startPolling();
                    new Notice('Connected to dice chat!');
                }
                catch (error) {
                    console.error('Failed to join chat:', error);
                    if (error.message.includes('Invalid authorization token') || error.message.includes('FORCE_LOGOUT:')) {
                        new Notice('Authentication expired. Server may have been restarted. Logging out...');
                        setTimeout(() => this.logout(), 100); // Force logout with delay
                    }
                    else {
                        new Notice('Failed to connect to chat. Check your API endpoint.');
                    }
                }
                finally {
                    joinButton.disabled = false;
                    joinButton.textContent = 'Connect to Chat';
                }
            }));
        });
    }
    setupChatInterface() {
        return __awaiter(this, void 0, void 0, function* () {
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
            });
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
            }
            else {
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
        });
    }
    setupDMDiceControls(diceSection) {
        // Room ID display for DMs
        const roomIdDisplay = diceSection.createDiv({ cls: 'room-id-display' });
        roomIdDisplay.style.cssText = 'padding: 10px; margin-bottom: 15px; background: var(--background-modifier-success); border-radius: 6px; text-align: center; cursor: pointer; border: 2px solid var(--color-green);';
        const roomIdLabel = roomIdDisplay.createEl('div', { text: 'Room ID (Click to Copy)' });
        roomIdLabel.style.cssText = 'font-size: 11px; color: var(--text-muted); margin-bottom: 5px;';
        const roomIdText = roomIdDisplay.createEl('div', { text: this.apiClient.getRoomId() });
        roomIdText.style.cssText = 'font-family: monospace; font-size: 16px; font-weight: bold; color: var(--text-normal); letter-spacing: 2px;';
        // Click to copy functionality
        roomIdDisplay.addEventListener('click', () => __awaiter(this, void 0, void 0, function* () {
            try {
                yield navigator.clipboard.writeText(this.apiClient.getRoomId());
                const originalText = roomIdText.textContent;
                roomIdText.textContent = 'COPIED!';
                roomIdText.style.color = 'var(--color-green)';
                setTimeout(() => {
                    roomIdText.textContent = originalText;
                    roomIdText.style.color = 'var(--text-normal)';
                }, 1500);
                new Notice('Room ID copied to clipboard!');
            }
            catch (error) {
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
        }));
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
            diceCard.countDisplay = countDisplay;
        });
        // Modifier input
        const modifierContainer = diceSection.createDiv({ cls: 'dice-modifier' });
        modifierContainer.style.cssText = 'display: flex; align-items: center; gap: 10px; margin-bottom: 15px;';
        const modifierLabel = modifierContainer.createEl('label', { text: 'Modifier:' });
        modifierLabel.style.cssText = 'font-weight: 500; color: var(--text-normal);';
        const modifierInput = modifierContainer.createEl('input', {
            type: 'number',
            value: '0'
        });
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
    updateDiceDisplay() {
        // Only update if this is a DM with dice selection UI
        if (this.userRole !== 'dm' || !this.diceSelectionContainer) {
            return;
        }
        // Update individual dice count displays
        const diceCards = this.diceSelectionContainer.querySelectorAll('.dice-card');
        const diceTypes = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];
        diceCards.forEach((card, index) => {
            const diceType = diceTypes[index];
            const countDisplay = card.countDisplay;
            if (countDisplay) {
                countDisplay.textContent = this.diceCounts[diceType].toString();
            }
        });
        // Build expression string
        const diceParts = [];
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
    clearDice() {
        Object.keys(this.diceCounts).forEach(key => {
            this.diceCounts[key] = 0;
        });
        this.modifier = 0;
        // Only reset modifier input if this is a DM with the UI
        if (this.userRole === 'dm') {
            const modifierInput = this.containerEl.querySelector('input[type="number"]');
            if (modifierInput) {
                modifierInput.value = '0';
            }
        }
        this.updateDiceDisplay();
    }
    sendChatMessage() {
        return __awaiter(this, void 0, void 0, function* () {
            const message = this.messageInput.value.trim();
            if (!message)
                return;
            try {
                // Show immediate feedback
                const originalPlaceholder = this.messageInput.placeholder;
                this.messageInput.placeholder = 'Sending...';
                this.messageInput.disabled = true;
                yield this.apiClient.sendMessage(message);
                this.messageInput.value = '';
                yield this.loadMessages(); // Refresh messages
                // Reset placeholder
                this.messageInput.placeholder = originalPlaceholder;
            }
            catch (error) {
                console.error('Failed to send message:', error);
                new Notice('Failed to send message');
                this.messageInput.placeholder = 'Failed to send - try again';
            }
            finally {
                this.messageInput.disabled = false;
                // Focus back to input for continuous typing
                setTimeout(() => {
                    this.messageInput.focus();
                }, 10);
            }
        });
    }
    sendDiceRequest() {
        return __awaiter(this, void 0, void 0, function* () {
            // Only DMs can send dice requests
            if (this.userRole !== 'dm') {
                return;
            }
            if (!this.diceExpression) {
                new Notice('Please select dice first');
                return;
            }
            try {
                yield this.apiClient.sendDiceRequest(this.diceExpression, `Roll ${this.diceExpression} for the game`);
                yield this.loadMessages();
                new Notice('Dice request sent!');
            }
            catch (error) {
                console.error('Failed to send dice request:', error);
                new Notice('Failed to send dice request');
            }
        });
    }
    rollDice() {
        return __awaiter(this, void 0, void 0, function* () {
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
                const result = yield this.apiClient.rollDice({
                    expression: this.diceExpression,
                    description: `Dice roll by ${this.username}`
                });
                yield this.apiClient.sendDiceResult(result);
                yield this.loadMessages();
                // Show local result as well
                new Notice(`Rolled ${result.total} (${result.breakdown})`);
                // Clear dice after rolling
                this.clearDice();
            }
            catch (error) {
                console.error('Failed to roll dice:', error);
                new Notice('Failed to roll dice');
            }
            finally {
                this.rollButton.disabled = false;
                this.rollButton.textContent = 'Roll Dice';
                this.updateDiceDisplay();
            }
        });
    }
    loadMessages() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const response = yield this.apiClient.getMessages(50, 0);
                this.displayMessages(response.messages);
            }
            catch (error) {
                console.error('Failed to load messages:', error);
            }
        });
    }
    displayMessages(messages) {
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
            }
            else if (isDiceResult) {
                messageEl.addClass('dice-result-message');
                messageEl.style.cssText = 'border-left: 4px solid var(--color-green); padding: 15px; margin-bottom: 12px; background: var(--background-secondary); border-radius: 0 8px 8px 0;';
            }
            else {
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
    populateDiceFromRequest(request) {
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
            const modifierInput = this.containerEl.querySelector('input[type="number"]');
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
    startPolling() {
        if (this.isPolling)
            return;
        this.isPolling = true;
        const poll = () => __awaiter(this, void 0, void 0, function* () {
            if (!this.isPolling)
                return;
            try {
                yield this.loadMessages();
            }
            catch (error) {
                console.error('Polling error:', error);
            }
            this.pollTimeout = setTimeout(poll, 3000); // Poll every 3 seconds
        });
        poll();
    }
    stopPolling() {
        this.isPolling = false;
        if (this.pollTimeout) {
            clearTimeout(this.pollTimeout);
            this.pollTimeout = null;
        }
    }
    disconnect() {
        this.stopPolling();
        this.isConnected = false;
        this.showUserSetup();
    }
    logout() {
        this.stopPolling();
        this.isConnected = false;
        this.apiClient.logout();
        new Notice('Logged out successfully');
        this.showAuthenticationSetup();
    }
    handleApiError(error) {
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
    onClose() {
        return __awaiter(this, void 0, void 0, function* () {
            this.stopPolling();
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdC12aWV3LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY2hhdC12aWV3LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQSxPQUFPLEVBQUUsUUFBUSxFQUFpQixPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxhQUFhLEVBQTRCLE1BQU0sY0FBYyxDQUFDO0FBR3ZFLE1BQU0sQ0FBQyxNQUFNLGNBQWMsR0FBRyxnQkFBZ0IsQ0FBQztBQUUvQyxNQUFNLE9BQU8sWUFBYSxTQUFRLFFBQVE7SUFrQnRDLFlBQVksSUFBbUIsRUFBRSxNQUFxQjtRQUNsRCxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7UUFYUixtQkFBYyxHQUFXLEVBQUUsQ0FBQztRQUM1QixlQUFVLEdBQThCLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQztRQUN4RixhQUFRLEdBQVcsQ0FBQyxDQUFDO1FBQ3JCLGFBQVEsR0FBb0IsUUFBUSxDQUFDO1FBQ3JDLGFBQVEsR0FBVyxFQUFFLENBQUM7UUFDdEIsY0FBUyxHQUFZLEtBQUssQ0FBQztRQUMzQixnQkFBVyxHQUEwQixJQUFJLENBQUM7UUFDMUMsa0JBQWEsR0FBVyxDQUFDLENBQUM7UUFDM0IsZ0JBQVcsR0FBWSxLQUFLLENBQUM7UUFJaEMsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7UUFDckIsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLGFBQWEsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxDQUFDO0lBQ3BFLENBQUM7SUFFRCxXQUFXO1FBQ1AsT0FBTyxjQUFjLENBQUM7SUFDMUIsQ0FBQztJQUVELGNBQWM7UUFDVixPQUFPLFdBQVcsQ0FBQztJQUN2QixD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bkIsSUFBSSxDQUFDLFdBQVcsR0FBRyxLQUFLLENBQUM7UUFDekIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUN4QixJQUFJLE1BQU0sQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO1FBQ3RDLElBQUksQ0FBQyx1QkFBdUIsRUFBRSxDQUFDO0lBQ25DLENBQUM7SUFFTyxjQUFjLENBQUMsS0FBVTtRQUM3QixPQUFPLENBQUMsS0FBSyxDQUFDLFlBQVksRUFBRSxLQUFLLENBQUMsQ0FBQztRQUVuQyxzQ0FBc0M7UUFDdEMsSUFBSSxLQUFLLENBQUMsT0FBTyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxFQUFFO1lBQ2hELElBQUksTUFBTSxDQUFDLHNDQUFzQyxDQUFDLENBQUM7WUFDbkQsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2QsT0FBTztTQUNWO1FBRUQsMkJBQTJCO1FBQzNCLElBQUksS0FBSyxDQUFDLE9BQU8sSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFO1lBQzVELElBQUksTUFBTSxDQUFDLHdEQUF3RCxDQUFDLENBQUM7WUFDckUsT0FBTztTQUNWO1FBRUQsZ0JBQWdCO1FBQ2hCLElBQUksTUFBTSxDQUFDLFVBQVUsS0FBSyxDQUFDLE9BQU8sSUFBSSx3QkFBd0IsRUFBRSxDQUFDLENBQUM7SUFDdEUsQ0FBQztJQUVLLE9BQU87O1lBQ1QsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQ3ZCLENBQUM7S0FBQTtDQUNKIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgSXRlbVZpZXcsIFdvcmtzcGFjZUxlYWYsIFNldHRpbmcsIE5vdGljZSB9IGZyb20gJ29ic2lkaWFuJztcclxuaW1wb3J0IHsgRGljZUFQSUNsaWVudCwgQ2hhdE1lc3NhZ2UsIERpY2VSZXF1ZXN0IH0gZnJvbSAnLi9hcGktY2xpZW50JztcclxuaW1wb3J0IEQyMERpY2VQbHVnaW4gZnJvbSAnLi9tYWluJztcclxuXHJcbmV4cG9ydCBjb25zdCBDSEFUX1ZJRVdfVFlQRSA9ICdkaWNlLWNoYXQtdmlldyc7XHJcblxyXG5leHBvcnQgY2xhc3MgRGljZUNoYXRWaWV3IGV4dGVuZHMgSXRlbVZpZXcge1xyXG4gICAgcHJpdmF0ZSBwbHVnaW46IEQyMERpY2VQbHVnaW47XHJcbiAgICBwcml2YXRlIGFwaUNsaWVudDogRGljZUFQSUNsaWVudDtcclxuICAgIHByaXZhdGUgY2hhdENvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XHJcbiAgICBwcml2YXRlIG1lc3NhZ2VJbnB1dDogSFRNTElucHV0RWxlbWVudDtcclxuICAgIHByaXZhdGUgZGljZVNlbGVjdGlvbkNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XHJcbiAgICBwcml2YXRlIGV4cHJlc3Npb25EaXNwbGF5OiBIVE1MRWxlbWVudDtcclxuICAgIHByaXZhdGUgcm9sbEJ1dHRvbjogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcbiAgICBwcml2YXRlIGRpY2VFeHByZXNzaW9uOiBzdHJpbmcgPSAnJztcclxuICAgIHByaXZhdGUgZGljZUNvdW50czogeyBba2V5OiBzdHJpbmddOiBudW1iZXIgfSA9IHsgZDQ6IDAsIGQ2OiAwLCBkODogMCwgZDEwOiAwLCBkMTI6IDAsIGQyMDogMCB9O1xyXG4gICAgcHJpdmF0ZSBtb2RpZmllcjogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgdXNlclJvbGU6ICdkbScgfCAncGxheWVyJyA9ICdwbGF5ZXInO1xyXG4gICAgcHJpdmF0ZSB1c2VybmFtZTogc3RyaW5nID0gJyc7XHJcbiAgICBwcml2YXRlIGlzUG9sbGluZzogYm9vbGVhbiA9IGZhbHNlO1xyXG4gICAgcHJpdmF0ZSBwb2xsVGltZW91dDogTm9kZUpTLlRpbWVvdXQgfCBudWxsID0gbnVsbDtcclxuICAgIHByaXZhdGUgbGFzdE1lc3NhZ2VJZDogbnVtYmVyID0gMDtcclxuICAgIHB1YmxpYyBpc0Nvbm5lY3RlZDogYm9vbGVhbiA9IGZhbHNlO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGxlYWY6IFdvcmtzcGFjZUxlYWYsIHBsdWdpbjogRDIwRGljZVBsdWdpbikge1xyXG4gICAgICAgIHN1cGVyKGxlYWYpO1xyXG4gICAgICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xyXG4gICAgICAgIHRoaXMuYXBpQ2xpZW50ID0gbmV3IERpY2VBUElDbGllbnQocGx1Z2luLnNldHRpbmdzLmFwaUVuZHBvaW50KTtcclxuICAgIH1cclxuXHJcbiAgICBnZXRWaWV3VHlwZSgpIHtcclxuICAgICAgICByZXR1cm4gQ0hBVF9WSUVXX1RZUEU7XHJcbiAgICB9XHJcblxyXG4gICAgZ2V0RGlzcGxheVRleHQoKSB7XHJcbiAgICAgICAgcmV0dXJuICdEaWNlIENoYXQnO1xyXG4gICAgfVxyXG5cclxuICAgIGdldEljb24oKSB7XHJcbiAgICAgICAgcmV0dXJuICdtZXNzYWdlcy1zcXVhcmUnO1xyXG4gICAgfVxyXG5cclxuICAgIGFzeW5jIG9uT3BlbigpIHtcclxuICAgICAgICBjb25zdCBjb250YWluZXIgPSB0aGlzLmNvbnRhaW5lckVsLmNoaWxkcmVuWzFdO1xyXG4gICAgICAgIGNvbnRhaW5lci5lbXB0eSgpO1xyXG4gICAgICAgIGNvbnRhaW5lci5hZGRDbGFzcygnZGljZS1jaGF0LXZpZXcnKTtcclxuXHJcbiAgICAgICAgLy8gQ2hlY2sgaWYgd2UgaGF2ZSBhIHN0b3JlZCB0b2tlblxyXG4gICAgICAgIGlmICh0eXBlb2YgbG9jYWxTdG9yYWdlICE9PSAndW5kZWZpbmVkJykge1xyXG4gICAgICAgICAgICBjb25zdCBzdG9yZWRUb2tlbiA9IGxvY2FsU3RvcmFnZS5nZXRJdGVtKCdkaWNlX2NoYXRfdG9rZW4nKTtcclxuICAgICAgICAgICAgaWYgKHN0b3JlZFRva2VuKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmFwaUNsaWVudC5zZXRBdXRoVG9rZW4oc3RvcmVkVG9rZW4pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoIXRoaXMuYXBpQ2xpZW50LmlzQXV0aGVudGljYXRlZCgpKSB7XHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuc2hvd0F1dGhlbnRpY2F0aW9uU2V0dXAoKTtcclxuICAgICAgICB9IGVsc2UgaWYgKCF0aGlzLmlzQ29ubmVjdGVkKSB7XHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuc2hvd1VzZXJTZXR1cCgpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuc2V0dXBDaGF0SW50ZXJmYWNlKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYXN5bmMgc2hvd0F1dGhlbnRpY2F0aW9uU2V0dXAoKSB7XHJcbiAgICAgICAgY29uc3QgY29udGFpbmVyID0gdGhpcy5jb250YWluZXJFbC5jaGlsZHJlblsxXTtcclxuICAgICAgICBjb250YWluZXIuZW1wdHkoKTtcclxuXHJcbiAgICAgICAgY29uc3QgaGVhZGVyRWwgPSBjb250YWluZXIuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAnZGljZS1jaGF0LWF1dGgtaGVhZGVyJyB9KTtcclxuICAgICAgICBoZWFkZXJFbC5zdHlsZS5jc3NUZXh0ID0gJ3BhZGRpbmc6IDIwcHg7IGJvcmRlci1ib3R0b206IDFweCBzb2xpZCB2YXIoLS1iYWNrZ3JvdW5kLW1vZGlmaWVyLWJvcmRlcik7IHRleHQtYWxpZ246IGNlbnRlcjsgcG9zaXRpb246IHJlbGF0aXZlOyc7XHJcbiAgICAgICAgaGVhZGVyRWwuY3JlYXRlRWwoJ2gyJywgeyB0ZXh0OiAn8J+UkCBBdXRoZW50aWNhdGlvbiBSZXF1aXJlZCcgfSk7XHJcbiAgICAgICAgaGVhZGVyRWwuY3JlYXRlRWwoJ3AnLCB7IHRleHQ6ICdQbGVhc2UgbG9naW4gb3IgcmVnaXN0ZXIgdG8gdXNlIHRoZSBkaWNlIGNoYXQgc3lzdGVtJyB9KTtcclxuXHJcbiAgICAgICAgLy8gQWRkIGxvZ291dCBidXR0b24gaWYgdGhlcmUgYXJlIHN0b3JlZCBjcmVkZW50aWFsc1xyXG4gICAgICAgIGlmICh0eXBlb2YgbG9jYWxTdG9yYWdlICE9PSAndW5kZWZpbmVkJyAmJiBsb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnZGljZV9jaGF0X3Rva2VuJykpIHtcclxuICAgICAgICAgICAgY29uc3QgbG9nb3V0QnRuID0gaGVhZGVyRWwuY3JlYXRlRWwoJ2J1dHRvbicsIHsgdGV4dDogJ0NsZWFyIFN0b3JlZCBMb2dpbicsIGNsczogJ2F1dGgtbG9nb3V0LWJ0bicgfSk7XHJcbiAgICAgICAgICAgIGxvZ291dEJ0bi5zdHlsZS5jc3NUZXh0ID0gJ3Bvc2l0aW9uOiBhYnNvbHV0ZTsgdG9wOiAxNXB4OyByaWdodDogMTVweDsgcGFkZGluZzogNXB4IDEwcHg7IGZvbnQtc2l6ZTogMTFweDsgYmFja2dyb3VuZDogI2ZmNmIzNTsgY29sb3I6IHdoaXRlOyBib3JkZXI6IG5vbmU7IGJvcmRlci1yYWRpdXM6IDNweDsgY3Vyc29yOiBwb2ludGVyOyc7XHJcbiAgICAgICAgICAgIGxvZ291dEJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcclxuICAgICAgICAgICAgICAgIHRoaXMuYXBpQ2xpZW50LmxvZ291dCgpO1xyXG4gICAgICAgICAgICAgICAgbmV3IE5vdGljZSgnU3RvcmVkIGNyZWRlbnRpYWxzIGNsZWFyZWQnKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuc2hvd0F1dGhlbnRpY2F0aW9uU2V0dXAoKTsgLy8gUmVmcmVzaCB0aGUgc2NyZWVuXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICBsb2dvdXRCdG4uYWRkRXZlbnRMaXN0ZW5lcignbW91c2VlbnRlcicsICgpID0+IHtcclxuICAgICAgICAgICAgICAgIGxvZ291dEJ0bi5zdHlsZS5vcGFjaXR5ID0gJzAuOCc7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICBsb2dvdXRCdG4uYWRkRXZlbnRMaXN0ZW5lcignbW91c2VsZWF2ZScsICgpID0+IHtcclxuICAgICAgICAgICAgICAgIGxvZ291dEJ0bi5zdHlsZS5vcGFjaXR5ID0gJzEnO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IGF1dGhDb250YWluZXIgPSBjb250YWluZXIuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAnZGljZS1jaGF0LWF1dGgnIH0pO1xyXG4gICAgICAgIGF1dGhDb250YWluZXIuc3R5bGUuY3NzVGV4dCA9ICdwYWRkaW5nOiAyMHB4OyBtYXgtd2lkdGg6IDQwMHB4OyBtYXJnaW46IDAgYXV0bzsnO1xyXG5cclxuICAgICAgICBsZXQgaXNMb2dpbk1vZGUgPSB0cnVlO1xyXG4gICAgICAgIGxldCB1c2VybmFtZVZhbHVlID0gJyc7XHJcbiAgICAgICAgbGV0IHBhc3N3b3JkVmFsdWUgPSAnJztcclxuXHJcbiAgICAgICAgY29uc3QgdG9nZ2xlVGV4dCA9IGF1dGhDb250YWluZXIuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAnYXV0aC10b2dnbGUnIH0pO1xyXG4gICAgICAgIHRvZ2dsZVRleHQuc3R5bGUuY3NzVGV4dCA9ICd0ZXh0LWFsaWduOiBjZW50ZXI7IG1hcmdpbi1ib3R0b206IDIwcHg7IGNvbG9yOiB2YXIoLS10ZXh0LW11dGVkKTsnO1xyXG5cclxuICAgICAgICBjb25zdCBmb3JtQ29udGFpbmVyID0gYXV0aENvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6ICdhdXRoLWZvcm0nIH0pO1xyXG5cclxuICAgICAgICBjb25zdCB1cGRhdGVGb3JtID0gKCkgPT4ge1xyXG4gICAgICAgICAgICBmb3JtQ29udGFpbmVyLmVtcHR5KCk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCB0aXRsZSA9IGZvcm1Db250YWluZXIuY3JlYXRlRWwoJ2gzJywgeyB0ZXh0OiBpc0xvZ2luTW9kZSA/ICdMb2dpbicgOiAnUmVnaXN0ZXInIH0pO1xyXG4gICAgICAgICAgICB0aXRsZS5zdHlsZS5jc3NUZXh0ID0gJ3RleHQtYWxpZ246IGNlbnRlcjsgbWFyZ2luLWJvdHRvbTogMjBweDsgY29sb3I6IHZhcigtLXRleHQtYWNjZW50KTsnO1xyXG5cclxuICAgICAgICAgICAgbmV3IFNldHRpbmcoZm9ybUNvbnRhaW5lcilcclxuICAgICAgICAgICAgICAgIC5zZXROYW1lKCdVc2VybmFtZScpXHJcbiAgICAgICAgICAgICAgICAuc2V0RGVzYygnWW91ciBhY2NvdW50IHVzZXJuYW1lJylcclxuICAgICAgICAgICAgICAgIC5hZGRUZXh0KHRleHQgPT4gdGV4dFxyXG4gICAgICAgICAgICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcignRW50ZXIgdXNlcm5hbWUnKVxyXG4gICAgICAgICAgICAgICAgICAgIC5zZXRWYWx1ZSh1c2VybmFtZVZhbHVlKVxyXG4gICAgICAgICAgICAgICAgICAgIC5vbkNoYW5nZSgodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdXNlcm5hbWVWYWx1ZSA9IHZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgICAgIG5ldyBTZXR0aW5nKGZvcm1Db250YWluZXIpXHJcbiAgICAgICAgICAgICAgICAuc2V0TmFtZSgnUGFzc3dvcmQnKVxyXG4gICAgICAgICAgICAgICAgLnNldERlc2MoJ1lvdXIgYWNjb3VudCBwYXNzd29yZCcpXHJcbiAgICAgICAgICAgICAgICAuYWRkVGV4dCh0ZXh0ID0+IHRleHRcclxuICAgICAgICAgICAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoJ0VudGVyIHBhc3N3b3JkJylcclxuICAgICAgICAgICAgICAgICAgICAuc2V0VmFsdWUocGFzc3dvcmRWYWx1ZSlcclxuICAgICAgICAgICAgICAgICAgICAudGhlbihpbnB1dCA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlucHV0LmlucHV0RWwudHlwZSA9ICdwYXNzd29yZCc7XHJcbiAgICAgICAgICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgICAgICAgICAub25DaGFuZ2UoKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhc3N3b3JkVmFsdWUgPSB2YWx1ZTtcclxuICAgICAgICAgICAgICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBidXR0b25Db250YWluZXIgPSBmb3JtQ29udGFpbmVyLmNyZWF0ZURpdih7IGNsczogJ2F1dGgtYnV0dG9ucycgfSk7XHJcbiAgICAgICAgICAgIGJ1dHRvbkNvbnRhaW5lci5zdHlsZS5jc3NUZXh0ID0gJ21hcmdpbi10b3A6IDIwcHg7IHRleHQtYWxpZ246IGNlbnRlcjsnO1xyXG5cclxuICAgICAgICAgICAgY29uc3Qgc3VibWl0QnV0dG9uID0gYnV0dG9uQ29udGFpbmVyLmNyZWF0ZUVsKCdidXR0b24nLCB7XHJcbiAgICAgICAgICAgICAgICB0ZXh0OiBpc0xvZ2luTW9kZSA/ICdMb2dpbicgOiAnUmVnaXN0ZXInLFxyXG4gICAgICAgICAgICAgICAgY2xzOiAnbW9kLWN0YSdcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIHN1Ym1pdEJ1dHRvbi5zdHlsZS5jc3NUZXh0ID0gJ21hcmdpbi1yaWdodDogMTBweDsgcGFkZGluZzogMTBweCAyMHB4Oyc7XHJcblxyXG4gICAgICAgICAgICBjb25zdCB0b2dnbGVCdXR0b24gPSBidXR0b25Db250YWluZXIuY3JlYXRlRWwoJ2J1dHRvbicsIHtcclxuICAgICAgICAgICAgICAgIHRleHQ6IGlzTG9naW5Nb2RlID8gJ05lZWQgdG8gcmVnaXN0ZXI/JyA6ICdBbHJlYWR5IGhhdmUgYW4gYWNjb3VudD8nXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICB0b2dnbGVCdXR0b24uc3R5bGUuY3NzVGV4dCA9ICdwYWRkaW5nOiAxMHB4IDIwcHg7JztcclxuXHJcbiAgICAgICAgICAgIC8vIEV2ZW50IGxpc3RlbmVyc1xyXG4gICAgICAgICAgICBzdWJtaXRCdXR0b24uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBpZiAoIXVzZXJuYW1lVmFsdWUudHJpbSgpIHx8ICFwYXNzd29yZFZhbHVlLnRyaW0oKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIG5ldyBOb3RpY2UoJ1BsZWFzZSBlbnRlciBib3RoIHVzZXJuYW1lIGFuZCBwYXNzd29yZCcpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgICAgIHN1Ym1pdEJ1dHRvbi5kaXNhYmxlZCA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICAgICAgc3VibWl0QnV0dG9uLnRleHRDb250ZW50ID0gaXNMb2dpbk1vZGUgPyAnTG9nZ2luZyBpbi4uLicgOiAnUmVnaXN0ZXJpbmcuLi4nO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICBsZXQgcmVzdWx0O1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChpc0xvZ2luTW9kZSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmFwaUNsaWVudC5sb2dpbih1c2VybmFtZVZhbHVlLCBwYXNzd29yZFZhbHVlKTtcclxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmFwaUNsaWVudC5yZWdpc3Rlcih1c2VybmFtZVZhbHVlLCBwYXNzd29yZFZhbHVlKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIC8vIFN0b3JlIHRva2VuXHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBsb2NhbFN0b3JhZ2UgIT09ICd1bmRlZmluZWQnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdkaWNlX2NoYXRfdG9rZW4nLCByZXN1bHQudG9rZW4pO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgbmV3IE5vdGljZShgJHtpc0xvZ2luTW9kZSA/ICdMb2dpbicgOiAnUmVnaXN0cmF0aW9uJ30gc3VjY2Vzc2Z1bCFgKTtcclxuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnNob3dVc2VyU2V0dXAoKTtcclxuXHJcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0F1dGhlbnRpY2F0aW9uIGZhaWxlZDonLCBlcnJvcik7XHJcbiAgICAgICAgICAgICAgICAgICAgbmV3IE5vdGljZShgJHtpc0xvZ2luTW9kZSA/ICdMb2dpbicgOiAnUmVnaXN0cmF0aW9uJ30gZmFpbGVkOiAke2Vycm9yLm1lc3NhZ2V9YCk7XHJcbiAgICAgICAgICAgICAgICB9IGZpbmFsbHkge1xyXG4gICAgICAgICAgICAgICAgICAgIHN1Ym1pdEJ1dHRvbi5kaXNhYmxlZCA9IGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgICAgIHN1Ym1pdEJ1dHRvbi50ZXh0Q29udGVudCA9IGlzTG9naW5Nb2RlID8gJ0xvZ2luJyA6ICdSZWdpc3Rlcic7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgdG9nZ2xlQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgaXNMb2dpbk1vZGUgPSAhaXNMb2dpbk1vZGU7XHJcbiAgICAgICAgICAgICAgICB1cGRhdGVGb3JtKCk7XHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgLy8gSGFuZGxlIEVudGVyIGtleVxyXG4gICAgICAgICAgICBjb25zdCBpbnB1dHMgPSBmb3JtQ29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJ2lucHV0Jyk7XHJcbiAgICAgICAgICAgIGlucHV0cy5mb3JFYWNoKGlucHV0ID0+IHtcclxuICAgICAgICAgICAgICAgIGlucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2tleXByZXNzJywgKGUpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoZS5rZXkgPT09ICdFbnRlcicpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgc3VibWl0QnV0dG9uLmNsaWNrKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIHVwZGF0ZUZvcm0oKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzeW5jIHNob3dVc2VyU2V0dXAoKSB7XHJcbiAgICAgICAgY29uc3QgY29udGFpbmVyID0gdGhpcy5jb250YWluZXJFbC5jaGlsZHJlblsxXTtcclxuICAgICAgICBjb250YWluZXIuZW1wdHkoKTtcclxuXHJcbiAgICAgICAgY29uc3QgaGVhZGVyRWwgPSBjb250YWluZXIuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAnZGljZS1jaGF0LXNldHVwLWhlYWRlcicgfSk7XHJcbiAgICAgICAgaGVhZGVyRWwuc3R5bGUuY3NzVGV4dCA9ICdwYWRkaW5nOiAyMHB4OyBib3JkZXItYm90dG9tOiAxcHggc29saWQgdmFyKC0tYmFja2dyb3VuZC1tb2RpZmllci1ib3JkZXIpOyBwb3NpdGlvbjogcmVsYXRpdmU7JztcclxuICAgICAgICBoZWFkZXJFbC5jcmVhdGVFbCgnaDInLCB7IHRleHQ6ICdKb2luIERpY2UgQ2hhdCcgfSk7XHJcblxyXG4gICAgICAgIC8vIEFkZCBsb2dvdXQgYnV0dG9uXHJcbiAgICAgICAgY29uc3QgbG9nb3V0QnRuID0gaGVhZGVyRWwuY3JlYXRlRWwoJ2J1dHRvbicsIHsgdGV4dDogJ0xvZ291dCcsIGNsczogJ3NldHVwLWxvZ291dC1idG4nIH0pO1xyXG4gICAgICAgIGxvZ291dEJ0bi5zdHlsZS5jc3NUZXh0ID0gJ3Bvc2l0aW9uOiBhYnNvbHV0ZTsgdG9wOiAxNXB4OyByaWdodDogMTVweDsgcGFkZGluZzogNXB4IDEwcHg7IGZvbnQtc2l6ZTogMTFweDsgYmFja2dyb3VuZDogI2ZmNmIzNTsgY29sb3I6IHdoaXRlOyBib3JkZXI6IG5vbmU7IGJvcmRlci1yYWRpdXM6IDNweDsgY3Vyc29yOiBwb2ludGVyOyc7XHJcbiAgICAgICAgbG9nb3V0QnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLmxvZ291dCgpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGxvZ291dEJ0bi5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWVudGVyJywgKCkgPT4ge1xyXG4gICAgICAgICAgICBsb2dvdXRCdG4uc3R5bGUub3BhY2l0eSA9ICcwLjgnO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGxvZ291dEJ0bi5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWxlYXZlJywgKCkgPT4ge1xyXG4gICAgICAgICAgICBsb2dvdXRCdG4uc3R5bGUub3BhY2l0eSA9ICcxJztcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgY29uc3Qgc2V0dXBDb250YWluZXIgPSBjb250YWluZXIuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAnZGljZS1jaGF0LXNldHVwJyB9KTtcclxuICAgICAgICBzZXR1cENvbnRhaW5lci5zdHlsZS5jc3NUZXh0ID0gJ3BhZGRpbmc6IDIwcHg7JztcclxuXHJcbiAgICAgICAgbGV0IHVzZXJuYW1lVmFsdWUgPSAnJztcclxuICAgICAgICBsZXQgcm9sZVZhbHVlOiAnZG0nIHwgJ3BsYXllcicgPSAncGxheWVyJztcclxuICAgICAgICBsZXQgc2Vzc2lvbklkVmFsdWUgPSAnJztcclxuXHJcbiAgICAgICAgbmV3IFNldHRpbmcoc2V0dXBDb250YWluZXIpXHJcbiAgICAgICAgICAgIC5zZXROYW1lKCdVc2VybmFtZScpXHJcbiAgICAgICAgICAgIC5zZXREZXNjKCdZb3VyIGRpc3BsYXkgbmFtZSBpbiB0aGUgY2hhdCcpXHJcbiAgICAgICAgICAgIC5hZGRUZXh0KHRleHQgPT4gdGV4dFxyXG4gICAgICAgICAgICAgICAgLnNldFBsYWNlaG9sZGVyKCdFbnRlciB5b3VyIHVzZXJuYW1lJylcclxuICAgICAgICAgICAgICAgIC5vbkNoYW5nZSgodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB1c2VybmFtZVZhbHVlID0gdmFsdWU7XHJcbiAgICAgICAgICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIG5ldyBTZXR0aW5nKHNldHVwQ29udGFpbmVyKVxyXG4gICAgICAgICAgICAuc2V0TmFtZSgnUm9sZScpXHJcbiAgICAgICAgICAgIC5zZXREZXNjKCdZb3VyIHJvbGUgaW4gdGhlIGdhbWUgc2Vzc2lvbicpXHJcbiAgICAgICAgICAgIC5hZGREcm9wZG93bihkcm9wZG93biA9PiBkcm9wZG93blxyXG4gICAgICAgICAgICAgICAgLmFkZE9wdGlvbigncGxheWVyJywgJ1BsYXllcicpXHJcbiAgICAgICAgICAgICAgICAuYWRkT3B0aW9uKCdkbScsICdHYW1lIE1hc3RlciAvIERNJylcclxuICAgICAgICAgICAgICAgIC5zZXRWYWx1ZSgncGxheWVyJylcclxuICAgICAgICAgICAgICAgIC5vbkNoYW5nZSgodmFsdWU6ICdkbScgfCAncGxheWVyJykgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHJvbGVWYWx1ZSA9IHZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICAgIHVwZGF0ZVNlc3Npb25JZFZpc2liaWxpdHkoKTtcclxuICAgICAgICAgICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgLy8gU2Vzc2lvbiBJRCBpbnB1dCAtIGNvbmRpdGlvbmFsIGJhc2VkIG9uIHJvbGVcclxuICAgICAgICBsZXQgc2Vzc2lvbklkU2V0dGluZzogU2V0dGluZyB8IG51bGwgPSBudWxsO1xyXG4gICAgICAgIGNvbnN0IHVwZGF0ZVNlc3Npb25JZFZpc2liaWxpdHkgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChzZXNzaW9uSWRTZXR0aW5nKSB7XHJcbiAgICAgICAgICAgICAgICBzZXNzaW9uSWRTZXR0aW5nLnNldHRpbmdFbC5zdHlsZS5kaXNwbGF5ID0gcm9sZVZhbHVlID09PSAnZG0nID8gJ2Jsb2NrJyA6ICdibG9jayc7XHJcbiAgICAgICAgICAgICAgICBpZiAocm9sZVZhbHVlID09PSAnZG0nKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gRm9yIERNcywgbWFrZSBpdCBvcHRpb25hbCB3aXRoIGF1dG8tZ2VuZXJhdGlvblxyXG4gICAgICAgICAgICAgICAgICAgIHNlc3Npb25JZFNldHRpbmcuc2V0RGVzYygnU2Vzc2lvbi9Sb29tIElEIChsZWF2ZSBlbXB0eSB0byBhdXRvLWdlbmVyYXRlKScpO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAvLyBGb3IgcGxheWVycywgaXQncyByZXF1aXJlZCB1bmxlc3MgZGVmYXVsdFxyXG4gICAgICAgICAgICAgICAgICAgIHNlc3Npb25JZFNldHRpbmcuc2V0RGVzYygnU2Vzc2lvbi9Sb29tIElEIHRvIGpvaW4gKGxlYXZlIGVtcHR5IGZvciBkZWZhdWx0IHJvb20pJyk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICBzZXNzaW9uSWRTZXR0aW5nID0gbmV3IFNldHRpbmcoc2V0dXBDb250YWluZXIpXHJcbiAgICAgICAgICAgIC5zZXROYW1lKCdTZXNzaW9uIElEJylcclxuICAgICAgICAgICAgLnNldERlc2MoJ1Nlc3Npb24vUm9vbSBJRCB0byBqb2luIChsZWF2ZSBlbXB0eSBmb3IgZGVmYXVsdCByb29tKScpXHJcbiAgICAgICAgICAgIC5hZGRUZXh0KHRleHQgPT4gdGV4dFxyXG4gICAgICAgICAgICAgICAgLnNldFBsYWNlaG9sZGVyKCdFbnRlciBzZXNzaW9uIElEIChvcHRpb25hbCknKVxyXG4gICAgICAgICAgICAgICAgLm9uQ2hhbmdlKCh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHNlc3Npb25JZFZhbHVlID0gdmFsdWU7XHJcbiAgICAgICAgICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIHVwZGF0ZVNlc3Npb25JZFZpc2liaWxpdHkoKTtcclxuXHJcbiAgICAgICAgY29uc3QgYnV0dG9uQ29udGFpbmVyID0gc2V0dXBDb250YWluZXIuY3JlYXRlRGl2KHsgY2xzOiAnZGljZS1jaGF0LWJ1dHRvbnMnIH0pO1xyXG4gICAgICAgIGJ1dHRvbkNvbnRhaW5lci5zdHlsZS5jc3NUZXh0ID0gJ21hcmdpbi10b3A6IDIwcHg7IHRleHQtYWxpZ246IGNlbnRlcjsnO1xyXG5cclxuICAgICAgICBjb25zdCBqb2luQnV0dG9uID0gYnV0dG9uQ29udGFpbmVyLmNyZWF0ZUVsKCdidXR0b24nLCB7XHJcbiAgICAgICAgICAgIHRleHQ6ICdDb25uZWN0IHRvIENoYXQnLFxyXG4gICAgICAgICAgICBjbHM6ICdtb2QtY3RhJ1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGpvaW5CdXR0b24uc3R5bGUuY3NzVGV4dCA9ICdwYWRkaW5nOiAxMHB4IDIwcHg7JztcclxuXHJcbiAgICAgICAgam9pbkJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGFzeW5jICgpID0+IHtcclxuICAgICAgICAgICAgaWYgKCF1c2VybmFtZVZhbHVlLnRyaW0oKSkge1xyXG4gICAgICAgICAgICAgICAgbmV3IE5vdGljZSgnUGxlYXNlIGVudGVyIGEgdXNlcm5hbWUnKTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgIGpvaW5CdXR0b24uZGlzYWJsZWQgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgam9pbkJ1dHRvbi50ZXh0Q29udGVudCA9ICdDb25uZWN0aW5nLi4uJztcclxuXHJcbiAgICAgICAgICAgICAgICB0aGlzLnVzZXJuYW1lID0gdXNlcm5hbWVWYWx1ZTtcclxuICAgICAgICAgICAgICAgIHRoaXMudXNlclJvbGUgPSByb2xlVmFsdWU7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmFwaUNsaWVudC5zZXRVc2VySW5mbyh0aGlzLnVzZXJuYW1lLCB0aGlzLnVzZXJSb2xlKTtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBIYW5kbGUgc2Vzc2lvbiBJRCBiYXNlZCBvbiByb2xlXHJcbiAgICAgICAgICAgICAgICBpZiAocm9sZVZhbHVlID09PSAnZG0nKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gRm9yIERNcywgYXV0by1nZW5lcmF0ZSBpZiBub3QgcHJvdmlkZWRcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCByb29tSWQgPSBzZXNzaW9uSWRWYWx1ZS50cmltKCkgfHwgdGhpcy5hcGlDbGllbnQuZ2VuZXJhdGVSb29tSWQoKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmFwaUNsaWVudC5zZXRSb29tSWQocm9vbUlkKTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gRm9yIHBsYXllcnMsIHVzZSBwcm92aWRlZCBJRCBvciBkZWZhdWx0XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHNlc3Npb25JZFZhbHVlLnRyaW0oKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmFwaUNsaWVudC5zZXRSb29tSWQoc2Vzc2lvbklkVmFsdWUudHJpbSgpKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gRW5zdXJlIHRva2VuIGlzIGxvYWRlZCBmcm9tIHN0b3JhZ2UgYmVmb3JlIGpvaW5pbmdcclxuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgbG9jYWxTdG9yYWdlICE9PSAndW5kZWZpbmVkJykge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHN0b3JlZFRva2VuID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2RpY2VfY2hhdF90b2tlbicpO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChzdG9yZWRUb2tlbiAmJiAhdGhpcy5hcGlDbGllbnQuaXNBdXRoZW50aWNhdGVkKCkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5hcGlDbGllbnQuc2V0QXV0aFRva2VuKHN0b3JlZFRva2VuKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG5cclxuICAgICAgICAgICAgICAgIC8vIENoZWNrIGlmIHNlcnZlciBpcyBhdmFpbGFibGVcclxuICAgICAgICAgICAgICAgIGNvbnN0IGlzSGVhbHRoeSA9IGF3YWl0IHRoaXMuYXBpQ2xpZW50LmNoZWNrSGVhbHRoKCk7XHJcbiAgICAgICAgICAgICAgICBpZiAoIWlzSGVhbHRoeSkge1xyXG4gICAgICAgICAgICAgICAgICAgIG5ldyBOb3RpY2UoJ0Nhbm5vdCBjb25uZWN0IHRvIGRpY2UgQVBJIHNlcnZlci4gQ2hlY2sgeW91ciBlbmRwb2ludCBzZXR0aW5ncy4nKTtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5hcGlDbGllbnQuam9pblJvb20oKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuaXNDb25uZWN0ZWQgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5zZXR1cENoYXRJbnRlcmZhY2UoKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuc3RhcnRQb2xsaW5nKCk7XHJcblxyXG4gICAgICAgICAgICAgICAgbmV3IE5vdGljZSgnQ29ubmVjdGVkIHRvIGRpY2UgY2hhdCEnKTtcclxuXHJcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gam9pbiBjaGF0OicsIGVycm9yKTtcclxuXHJcbiAgICAgICAgICAgICAgICBpZiAoZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnSW52YWxpZCBhdXRob3JpemF0aW9uIHRva2VuJykgfHwgZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnRk9SQ0VfTE9HT1VUOicpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbmV3IE5vdGljZSgnQXV0aGVudGljYXRpb24gZXhwaXJlZC4gU2VydmVyIG1heSBoYXZlIGJlZW4gcmVzdGFydGVkLiBMb2dnaW5nIG91dC4uLicpO1xyXG4gICAgICAgICAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4gdGhpcy5sb2dvdXQoKSwgMTAwKTsgLy8gRm9yY2UgbG9nb3V0IHdpdGggZGVsYXlcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbmV3IE5vdGljZSgnRmFpbGVkIHRvIGNvbm5lY3QgdG8gY2hhdC4gQ2hlY2sgeW91ciBBUEkgZW5kcG9pbnQuJyk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0gZmluYWxseSB7XHJcbiAgICAgICAgICAgICAgICBqb2luQnV0dG9uLmRpc2FibGVkID0gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICBqb2luQnV0dG9uLnRleHRDb250ZW50ID0gJ0Nvbm5lY3QgdG8gQ2hhdCc7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzeW5jIHNldHVwQ2hhdEludGVyZmFjZSgpIHtcclxuICAgICAgICBjb25zdCBjb250YWluZXIgPSB0aGlzLmNvbnRhaW5lckVsLmNoaWxkcmVuWzFdO1xyXG4gICAgICAgIGNvbnRhaW5lci5lbXB0eSgpO1xyXG5cclxuICAgICAgICAvLyBIZWFkZXJcclxuICAgICAgICBjb25zdCBoZWFkZXIgPSBjb250YWluZXIuY3JlYXRlRGl2KHsgY2xzOiAnZGljZS1jaGF0LWhlYWRlcicgfSk7XHJcbiAgICAgICAgaGVhZGVyLnN0eWxlLmNzc1RleHQgPSAnZGlzcGxheTogZmxleDsganVzdGlmeS1jb250ZW50OiBzcGFjZS1iZXR3ZWVuOyBhbGlnbi1pdGVtczogY2VudGVyOyBwYWRkaW5nOiAxNXB4OyBib3JkZXItYm90dG9tOiAxcHggc29saWQgdmFyKC0tYmFja2dyb3VuZC1tb2RpZmllci1ib3JkZXIpOyc7XHJcblxyXG4gICAgICAgIGNvbnN0IHRpdGxlRGl2ID0gaGVhZGVyLmNyZWF0ZURpdigpO1xyXG4gICAgICAgIHRpdGxlRGl2LmNyZWF0ZUVsKCdoMycsIHsgdGV4dDogJ/CfjrIgRGljZSBDaGF0JywgY2xzOiAnZGljZS1jaGF0LXRpdGxlJyB9KTtcclxuICAgICAgICB0aXRsZURpdi5zdHlsZS5tYXJnaW4gPSAnMCc7XHJcblxyXG4gICAgICAgIGNvbnN0IHVzZXJJbmZvRGl2ID0gdGl0bGVEaXYuY3JlYXRlRGl2KHsgY2xzOiAnZGljZS1jaGF0LXVzZXItaW5mbycgfSk7XHJcbiAgICAgICAgdXNlckluZm9EaXYuc3R5bGUuY3NzVGV4dCA9ICdmb250LXNpemU6IDEycHg7IGNvbG9yOiB2YXIoLS10ZXh0LW11dGVkKTsgbGluZS1oZWlnaHQ6IDEuMjsgbWFyZ2luLXRvcDogNXB4Oyc7XHJcblxyXG4gICAgICAgIHVzZXJJbmZvRGl2LmNyZWF0ZUVsKCdkaXYnLCB7IHRleHQ6IGAke3RoaXMudXNlcm5hbWV9ICgke3RoaXMudXNlclJvbGUudG9VcHBlckNhc2UoKX0pYCB9KTtcclxuICAgICAgICB1c2VySW5mb0Rpdi5jcmVhdGVFbCgnZGl2Jywge1xyXG4gICAgICAgICAgICB0ZXh0OiBgUm9vbTogJHt0aGlzLmFwaUNsaWVudC5nZXRSb29tSWQoKX1gLFxyXG4gICAgICAgICAgICBjbHM6ICdkaWNlLWNoYXQtcm9vbS1pZCdcclxuICAgICAgICB9KS5zdHlsZS5jc3NUZXh0ID0gJ2ZvbnQtZmFtaWx5OiBtb25vc3BhY2U7IGZvbnQtc2l6ZTogMTFweDsgb3BhY2l0eTogMC44Oyc7XHJcblxyXG4gICAgICAgIGNvbnN0IGhlYWRlckJ1dHRvbnMgPSBoZWFkZXIuY3JlYXRlRGl2KHsgY2xzOiAnaGVhZGVyLWJ1dHRvbnMnIH0pO1xyXG4gICAgICAgIGhlYWRlckJ1dHRvbnMuc3R5bGUuY3NzVGV4dCA9ICdkaXNwbGF5OiBmbGV4OyBnYXA6IDVweDsnO1xyXG5cclxuICAgICAgICBjb25zdCBkaXNjb25uZWN0QnV0dG9uID0gaGVhZGVyQnV0dG9ucy5jcmVhdGVFbCgnYnV0dG9uJywgeyB0ZXh0OiAnRGlzY29ubmVjdCcsIGNsczogJ2RpY2UtZGlzY29ubmVjdC1idG4nIH0pO1xyXG4gICAgICAgIGRpc2Nvbm5lY3RCdXR0b24uc3R5bGUuY3NzVGV4dCA9ICdwYWRkaW5nOiA1cHggMTBweDsgZm9udC1zaXplOiAxMnB4OyBiYWNrZ3JvdW5kOiB2YXIoLS1iYWNrZ3JvdW5kLW1vZGlmaWVyLWVycm9yKTsgY29sb3I6IHdoaXRlOyBib3JkZXI6IG5vbmU7IGJvcmRlci1yYWRpdXM6IDNweDsgY3Vyc29yOiBwb2ludGVyOyc7XHJcbiAgICAgICAgZGlzY29ubmVjdEJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHRoaXMuZGlzY29ubmVjdCgpKTtcclxuICAgICAgICBkaXNjb25uZWN0QnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZW50ZXInLCAoKSA9PiB7XHJcbiAgICAgICAgICAgIGRpc2Nvbm5lY3RCdXR0b24uc3R5bGUub3BhY2l0eSA9ICcwLjgnO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGRpc2Nvbm5lY3RCdXR0b24uYWRkRXZlbnRMaXN0ZW5lcignbW91c2VsZWF2ZScsICgpID0+IHtcclxuICAgICAgICAgICAgZGlzY29ubmVjdEJ1dHRvbi5zdHlsZS5vcGFjaXR5ID0gJzEnO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBjb25zdCBsb2dvdXRCdXR0b24gPSBoZWFkZXJCdXR0b25zLmNyZWF0ZUVsKCdidXR0b24nLCB7IHRleHQ6ICdMb2dvdXQnLCBjbHM6ICdkaWNlLWxvZ291dC1idG4nIH0pO1xyXG4gICAgICAgIGxvZ291dEJ1dHRvbi5zdHlsZS5jc3NUZXh0ID0gJ3BhZGRpbmc6IDVweCAxMHB4OyBmb250LXNpemU6IDEycHg7IGJhY2tncm91bmQ6ICNmZjZiMzU7IGNvbG9yOiB3aGl0ZTsgYm9yZGVyOiBub25lOyBib3JkZXItcmFkaXVzOiAzcHg7IGN1cnNvcjogcG9pbnRlcjsnO1xyXG4gICAgICAgIGxvZ291dEJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHRoaXMubG9nb3V0KCkpO1xyXG4gICAgICAgIGxvZ291dEJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWVudGVyJywgKCkgPT4ge1xyXG4gICAgICAgICAgICBsb2dvdXRCdXR0b24uc3R5bGUub3BhY2l0eSA9ICcwLjgnO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGxvZ291dEJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWxlYXZlJywgKCkgPT4ge1xyXG4gICAgICAgICAgICBsb2dvdXRCdXR0b24uc3R5bGUub3BhY2l0eSA9ICcxJztcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gTWFpbiBjb250ZW50IGNvbnRhaW5lclxyXG4gICAgICAgIGNvbnN0IG1haW5Db250YWluZXIgPSBjb250YWluZXIuY3JlYXRlRGl2KHsgY2xzOiAnZGljZS1jaGF0LW1haW4nIH0pO1xyXG4gICAgICAgIG1haW5Db250YWluZXIuc3R5bGUuY3NzVGV4dCA9ICdkaXNwbGF5OiBmbGV4OyBoZWlnaHQ6IGNhbGMoMTAwdmggLSAxMjBweCk7IGdhcDogMTVweDsgcGFkZGluZzogMTVweDsnO1xyXG5cclxuICAgICAgICAvLyBDaGF0IHNlY3Rpb24gKGxlZnQgc2lkZSlcclxuICAgICAgICBjb25zdCBjaGF0U2VjdGlvbiA9IG1haW5Db250YWluZXIuY3JlYXRlRGl2KHsgY2xzOiAnZGljZS1jaGF0LXNlY3Rpb24nIH0pO1xyXG4gICAgICAgIGNoYXRTZWN0aW9uLnN0eWxlLmNzc1RleHQgPSAnZmxleDogMTsgZGlzcGxheTogZmxleDsgZmxleC1kaXJlY3Rpb246IGNvbHVtbjsgYm9yZGVyLXJpZ2h0OiAxcHggc29saWQgdmFyKC0tYmFja2dyb3VuZC1tb2RpZmllci1ib3JkZXIpOyBwYWRkaW5nLXJpZ2h0OiAxNXB4Oyc7XHJcblxyXG4gICAgICAgIC8vIENoYXQgbWVzc2FnZXMgY29udGFpbmVyXHJcbiAgICAgICAgdGhpcy5jaGF0Q29udGFpbmVyID0gY2hhdFNlY3Rpb24uY3JlYXRlRGl2KHsgY2xzOiAnZGljZS1jaGF0LW1lc3NhZ2VzJyB9KTtcclxuICAgICAgICB0aGlzLmNoYXRDb250YWluZXIuc3R5bGUuY3NzVGV4dCA9ICdmbGV4OiAxOyBvdmVyZmxvdy15OiBhdXRvOyBib3JkZXI6IDFweCBzb2xpZCB2YXIoLS1iYWNrZ3JvdW5kLW1vZGlmaWVyLWJvcmRlcik7IHBhZGRpbmc6IDE1cHg7IG1hcmdpbi1ib3R0b206IDE1cHg7IGJvcmRlci1yYWRpdXM6IDhweDsgYmFja2dyb3VuZDogdmFyKC0tYmFja2dyb3VuZC1wcmltYXJ5KTsnO1xyXG5cclxuICAgICAgICAvLyBNZXNzYWdlIGlucHV0XHJcbiAgICAgICAgY29uc3QgaW5wdXRDb250YWluZXIgPSBjaGF0U2VjdGlvbi5jcmVhdGVEaXYoeyBjbHM6ICdkaWNlLWNoYXQtaW5wdXQtY29udGFpbmVyJyB9KTtcclxuICAgICAgICBpbnB1dENvbnRhaW5lci5zdHlsZS5jc3NUZXh0ID0gJ2Rpc3BsYXk6IGZsZXg7IGdhcDogOHB4Oyc7XHJcblxyXG4gICAgICAgIHRoaXMubWVzc2FnZUlucHV0ID0gaW5wdXRDb250YWluZXIuY3JlYXRlRWwoJ2lucHV0Jywge1xyXG4gICAgICAgICAgICB0eXBlOiAndGV4dCcsXHJcbiAgICAgICAgICAgIHBsYWNlaG9sZGVyOiAnVHlwZSBhIG1lc3NhZ2UuLi4nXHJcbiAgICAgICAgfSkgYXMgSFRNTElucHV0RWxlbWVudDtcclxuICAgICAgICB0aGlzLm1lc3NhZ2VJbnB1dC5zdHlsZS5jc3NUZXh0ID0gJ2ZsZXg6IDE7IHBhZGRpbmc6IDEwcHg7IGJvcmRlcjogMXB4IHNvbGlkIHZhcigtLWJhY2tncm91bmQtbW9kaWZpZXItYm9yZGVyKTsgYm9yZGVyLXJhZGl1czogNXB4OyBiYWNrZ3JvdW5kOiB2YXIoLS1iYWNrZ3JvdW5kLXByaW1hcnkpOyBjb2xvcjogdmFyKC0tdGV4dC1ub3JtYWwpOyc7XHJcblxyXG4gICAgICAgIGNvbnN0IHNlbmRCdXR0b24gPSBpbnB1dENvbnRhaW5lci5jcmVhdGVFbCgnYnV0dG9uJywge1xyXG4gICAgICAgICAgICB0ZXh0OiAnU2VuZCcsXHJcbiAgICAgICAgICAgIGNsczogJ21vZC1jdGEnXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgc2VuZEJ1dHRvbi5zdHlsZS5jc3NUZXh0ID0gJ3BhZGRpbmc6IDEwcHggMTVweDsnO1xyXG5cclxuICAgICAgICAvLyBTZXQgdXAgbWVzc2FnZSBpbnB1dCBldmVudCBsaXN0ZW5lcnMgaW1tZWRpYXRlbHlcclxuICAgICAgICBzZW5kQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLnNlbmRDaGF0TWVzc2FnZSgpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLm1lc3NhZ2VJbnB1dC5hZGRFdmVudExpc3RlbmVyKCdrZXlwcmVzcycsIChlKSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChlLmtleSA9PT0gJ0VudGVyJykge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zZW5kQ2hhdE1lc3NhZ2UoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBETSBDb250cm9scyBzZWN0aW9uIChyaWdodCBzaWRlKSAtIG9ubHkgc2hvdyBmb3IgRE1zXHJcbiAgICAgICAgaWYgKHRoaXMudXNlclJvbGUgPT09ICdkbScpIHtcclxuICAgICAgICAgICAgY29uc3QgZGljZVNlY3Rpb24gPSBtYWluQ29udGFpbmVyLmNyZWF0ZURpdih7IGNsczogJ2RpY2UtZGljZS1zZWN0aW9uJyB9KTtcclxuICAgICAgICAgICAgZGljZVNlY3Rpb24uc3R5bGUuY3NzVGV4dCA9ICd3aWR0aDogMzUwcHg7IGRpc3BsYXk6IGZsZXg7IGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47IGJhY2tncm91bmQ6IHZhcigtLWJhY2tncm91bmQtc2Vjb25kYXJ5KTsgcGFkZGluZzogMTVweDsgYm9yZGVyLXJhZGl1czogOHB4Oyc7XHJcblxyXG4gICAgICAgICAgICBkaWNlU2VjdGlvbi5jcmVhdGVFbCgnaDQnLCB7IHRleHQ6ICfwn46yIERNIERpY2UgQ29udHJvbHMnIH0pLnN0eWxlLmNzc1RleHQgPSAnbWFyZ2luLXRvcDogMDsgY29sb3I6IHZhcigtLXRleHQtYWNjZW50KTsnO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5zZXR1cERNRGljZUNvbnRyb2xzKGRpY2VTZWN0aW9uKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAvLyBQbGF5ZXIgaW5mbyBzZWN0aW9uXHJcbiAgICAgICAgICAgIGNvbnN0IHBsYXllclNlY3Rpb24gPSBtYWluQ29udGFpbmVyLmNyZWF0ZURpdih7IGNsczogJ2RpY2UtcGxheWVyLXNlY3Rpb24nIH0pO1xyXG4gICAgICAgICAgICBwbGF5ZXJTZWN0aW9uLnN0eWxlLmNzc1RleHQgPSAnd2lkdGg6IDMwMHB4OyBkaXNwbGF5OiBmbGV4OyBmbGV4LWRpcmVjdGlvbjogY29sdW1uOyBiYWNrZ3JvdW5kOiB2YXIoLS1iYWNrZ3JvdW5kLXNlY29uZGFyeSk7IHBhZGRpbmc6IDE1cHg7IGJvcmRlci1yYWRpdXM6IDhweDsnO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgaW5mb0hlYWRlciA9IHBsYXllclNlY3Rpb24uY3JlYXRlRWwoJ2g0JywgeyB0ZXh0OiAn8J+OryBQbGF5ZXIgSW5mbycgfSk7XHJcbiAgICAgICAgICAgIGluZm9IZWFkZXIuc3R5bGUuY3NzVGV4dCA9ICdtYXJnaW4tdG9wOiAwOyBjb2xvcjogdmFyKC0tdGV4dC1hY2NlbnQpOyc7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBpbmZvVGV4dCA9IHBsYXllclNlY3Rpb24uY3JlYXRlRGl2KCk7XHJcbiAgICAgICAgICAgIGluZm9UZXh0LnN0eWxlLmNzc1RleHQgPSAnY29sb3I6IHZhcigtLXRleHQtbXV0ZWQpOyBsaW5lLWhlaWdodDogMS41OyBmb250LXNpemU6IDE0cHg7JztcclxuICAgICAgICAgICAgaW5mb1RleHQuaW5uZXJIVE1MID0gYFxyXG4gICAgICAgICAgICAgICAgPHA+PHN0cm9uZz5Ib3cgdG8gcm9sbCBkaWNlOjwvc3Ryb25nPjwvcD5cclxuICAgICAgICAgICAgICAgIDx1bCBzdHlsZT1cIm1hcmdpbjogMTBweCAwOyBwYWRkaW5nLWxlZnQ6IDIwcHg7XCI+XHJcbiAgICAgICAgICAgICAgICAgICAgPGxpPkNsaWNrIG9uIGNsaWNrYWJsZSBkaWNlIHJlcXVlc3RzIGZyb20gdGhlIERNPC9saT5cclxuICAgICAgICAgICAgICAgICAgICA8bGk+VXNlIHRoZSBtYWluIGRpY2UgaW50ZXJmYWNlIChkaWNlIGljb24gaW4gcmliYm9uKTwvbGk+XHJcbiAgICAgICAgICAgICAgICAgICAgPGxpPlJvbGxzIGFyZSBhdXRvbWF0aWNhbGx5IHNoYXJlZCBpbiBjaGF0PC9saT5cclxuICAgICAgICAgICAgICAgIDwvdWw+XHJcbiAgICAgICAgICAgICAgICA8cD48c3Ryb25nPkRpY2UgcmVxdWVzdHM6PC9zdHJvbmc+IENsaWNrIG9uIGhpZ2hsaWdodGVkIG1lc3NhZ2VzIGZyb20gdGhlIERNIHRvIGF1dG9tYXRpY2FsbHkgc2V0IHVwIGRpY2UgYW5kIG9wZW4gdGhlIDNEIGludGVyZmFjZS48L3A+XHJcbiAgICAgICAgICAgIGA7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc2V0dXBETURpY2VDb250cm9scyhkaWNlU2VjdGlvbjogSFRNTEVsZW1lbnQpIHtcclxuICAgICAgICAvLyBSb29tIElEIGRpc3BsYXkgZm9yIERNc1xyXG4gICAgICAgIGNvbnN0IHJvb21JZERpc3BsYXkgPSBkaWNlU2VjdGlvbi5jcmVhdGVEaXYoeyBjbHM6ICdyb29tLWlkLWRpc3BsYXknIH0pO1xyXG4gICAgICAgIHJvb21JZERpc3BsYXkuc3R5bGUuY3NzVGV4dCA9ICdwYWRkaW5nOiAxMHB4OyBtYXJnaW4tYm90dG9tOiAxNXB4OyBiYWNrZ3JvdW5kOiB2YXIoLS1iYWNrZ3JvdW5kLW1vZGlmaWVyLXN1Y2Nlc3MpOyBib3JkZXItcmFkaXVzOiA2cHg7IHRleHQtYWxpZ246IGNlbnRlcjsgY3Vyc29yOiBwb2ludGVyOyBib3JkZXI6IDJweCBzb2xpZCB2YXIoLS1jb2xvci1ncmVlbik7JztcclxuXHJcbiAgICAgICAgY29uc3Qgcm9vbUlkTGFiZWwgPSByb29tSWREaXNwbGF5LmNyZWF0ZUVsKCdkaXYnLCB7IHRleHQ6ICdSb29tIElEIChDbGljayB0byBDb3B5KScgfSk7XHJcbiAgICAgICAgcm9vbUlkTGFiZWwuc3R5bGUuY3NzVGV4dCA9ICdmb250LXNpemU6IDExcHg7IGNvbG9yOiB2YXIoLS10ZXh0LW11dGVkKTsgbWFyZ2luLWJvdHRvbTogNXB4Oyc7XHJcblxyXG4gICAgICAgIGNvbnN0IHJvb21JZFRleHQgPSByb29tSWREaXNwbGF5LmNyZWF0ZUVsKCdkaXYnLCB7IHRleHQ6IHRoaXMuYXBpQ2xpZW50LmdldFJvb21JZCgpIH0pO1xyXG4gICAgICAgIHJvb21JZFRleHQuc3R5bGUuY3NzVGV4dCA9ICdmb250LWZhbWlseTogbW9ub3NwYWNlOyBmb250LXNpemU6IDE2cHg7IGZvbnQtd2VpZ2h0OiBib2xkOyBjb2xvcjogdmFyKC0tdGV4dC1ub3JtYWwpOyBsZXR0ZXItc3BhY2luZzogMnB4Oyc7XHJcblxyXG4gICAgICAgIC8vIENsaWNrIHRvIGNvcHkgZnVuY3Rpb25hbGl0eVxyXG4gICAgICAgIHJvb21JZERpc3BsYXkuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBuYXZpZ2F0b3IuY2xpcGJvYXJkLndyaXRlVGV4dCh0aGlzLmFwaUNsaWVudC5nZXRSb29tSWQoKSk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBvcmlnaW5hbFRleHQgPSByb29tSWRUZXh0LnRleHRDb250ZW50O1xyXG4gICAgICAgICAgICAgICAgcm9vbUlkVGV4dC50ZXh0Q29udGVudCA9ICdDT1BJRUQhJztcclxuICAgICAgICAgICAgICAgIHJvb21JZFRleHQuc3R5bGUuY29sb3IgPSAndmFyKC0tY29sb3ItZ3JlZW4pJztcclxuXHJcbiAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICByb29tSWRUZXh0LnRleHRDb250ZW50ID0gb3JpZ2luYWxUZXh0O1xyXG4gICAgICAgICAgICAgICAgICAgIHJvb21JZFRleHQuc3R5bGUuY29sb3IgPSAndmFyKC0tdGV4dC1ub3JtYWwpJztcclxuICAgICAgICAgICAgICAgIH0sIDE1MDApO1xyXG5cclxuICAgICAgICAgICAgICAgIG5ldyBOb3RpY2UoJ1Jvb20gSUQgY29waWVkIHRvIGNsaXBib2FyZCEnKTtcclxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBjb3B5OicsIGVycm9yKTtcclxuICAgICAgICAgICAgICAgIC8vIEZhbGxiYWNrIGZvciBvbGRlciBicm93c2Vyc1xyXG4gICAgICAgICAgICAgICAgY29uc3QgdGV4dEFyZWEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCd0ZXh0YXJlYScpO1xyXG4gICAgICAgICAgICAgICAgdGV4dEFyZWEudmFsdWUgPSB0aGlzLmFwaUNsaWVudC5nZXRSb29tSWQoKTtcclxuICAgICAgICAgICAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQodGV4dEFyZWEpO1xyXG4gICAgICAgICAgICAgICAgdGV4dEFyZWEuc2VsZWN0KCk7XHJcbiAgICAgICAgICAgICAgICBkb2N1bWVudC5leGVjQ29tbWFuZCgnY29weScpO1xyXG4gICAgICAgICAgICAgICAgZG9jdW1lbnQuYm9keS5yZW1vdmVDaGlsZCh0ZXh0QXJlYSk7XHJcbiAgICAgICAgICAgICAgICBuZXcgTm90aWNlKCdSb29tIElEIGNvcGllZCB0byBjbGlwYm9hcmQhJyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gRXhwcmVzc2lvbiBkaXNwbGF5XHJcbiAgICAgICAgdGhpcy5leHByZXNzaW9uRGlzcGxheSA9IGRpY2VTZWN0aW9uLmNyZWF0ZURpdih7XHJcbiAgICAgICAgICAgIHRleHQ6ICdObyBkaWNlIHNlbGVjdGVkJyxcclxuICAgICAgICAgICAgY2xzOiAnZGljZS1leHByZXNzaW9uLWRpc3BsYXknXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgdGhpcy5leHByZXNzaW9uRGlzcGxheS5zdHlsZS5jc3NUZXh0ID0gJ3BhZGRpbmc6IDEycHg7IG1hcmdpbi1ib3R0b206IDE1cHg7IGJhY2tncm91bmQ6IHZhcigtLWJhY2tncm91bmQtcHJpbWFyeSk7IGJvcmRlci1yYWRpdXM6IDZweDsgZm9udC1mYW1pbHk6IG1vbm9zcGFjZTsgdGV4dC1hbGlnbjogY2VudGVyOyBmb250LXdlaWdodDogYm9sZDsgYm9yZGVyOiAycHggc29saWQgdmFyKC0tYmFja2dyb3VuZC1tb2RpZmllci1ib3JkZXIpOyc7XHJcblxyXG4gICAgICAgIC8vIERpY2Ugc2VsZWN0aW9uIGdyaWRcclxuICAgICAgICB0aGlzLmRpY2VTZWxlY3Rpb25Db250YWluZXIgPSBkaWNlU2VjdGlvbi5jcmVhdGVEaXYoeyBjbHM6ICdkaWNlLXNlbGVjdGlvbi1ncmlkJyB9KTtcclxuICAgICAgICB0aGlzLmRpY2VTZWxlY3Rpb25Db250YWluZXIuc3R5bGUuY3NzVGV4dCA9ICdkaXNwbGF5OiBncmlkOyBncmlkLXRlbXBsYXRlLWNvbHVtbnM6IHJlcGVhdCgyLCAxZnIpOyBnYXA6IDEycHg7IG1hcmdpbi1ib3R0b206IDE1cHg7JztcclxuXHJcbiAgICAgICAgY29uc3QgZGljZVR5cGVzID0gWydkNCcsICdkNicsICdkOCcsICdkMTAnLCAnZDEyJywgJ2QyMCddO1xyXG4gICAgICAgIGRpY2VUeXBlcy5mb3JFYWNoKGRpY2VUeXBlID0+IHtcclxuICAgICAgICAgICAgY29uc3QgZGljZUNhcmQgPSB0aGlzLmRpY2VTZWxlY3Rpb25Db250YWluZXIuY3JlYXRlRGl2KHsgY2xzOiAnZGljZS1jYXJkJyB9KTtcclxuICAgICAgICAgICAgZGljZUNhcmQuc3R5bGUuY3NzVGV4dCA9ICdib3JkZXI6IDFweCBzb2xpZCB2YXIoLS1iYWNrZ3JvdW5kLW1vZGlmaWVyLWJvcmRlcik7IHBhZGRpbmc6IDEycHg7IGJvcmRlci1yYWRpdXM6IDhweDsgdGV4dC1hbGlnbjogY2VudGVyOyBiYWNrZ3JvdW5kOiB2YXIoLS1iYWNrZ3JvdW5kLXByaW1hcnkpOyc7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBsYWJlbCA9IGRpY2VDYXJkLmNyZWF0ZUVsKCdkaXYnLCB7IHRleHQ6IGRpY2VUeXBlLnRvVXBwZXJDYXNlKCksIGNsczogJ2RpY2UtdHlwZS1sYWJlbCcgfSk7XHJcbiAgICAgICAgICAgIGxhYmVsLnN0eWxlLmNzc1RleHQgPSAnZm9udC13ZWlnaHQ6IGJvbGQ7IGZvbnQtc2l6ZTogMTNweDsgY29sb3I6IHZhcigtLXRleHQtYWNjZW50KTsgbWFyZ2luLWJvdHRvbTogOHB4Oyc7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBjb3VudERpc3BsYXkgPSBkaWNlQ2FyZC5jcmVhdGVFbCgnZGl2Jywge1xyXG4gICAgICAgICAgICAgICAgdGV4dDogJzAnLFxyXG4gICAgICAgICAgICAgICAgY2xzOiAnZGljZS1jb3VudC1kaXNwbGF5J1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgY291bnREaXNwbGF5LnN0eWxlLmNzc1RleHQgPSAnZm9udC1zaXplOiAyMHB4OyBmb250LXdlaWdodDogYm9sZDsgbWFyZ2luOiA4cHggMDsgY29sb3I6IHZhcigtLXRleHQtbm9ybWFsKTsnO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgYnV0dG9uQ29udGFpbmVyID0gZGljZUNhcmQuY3JlYXRlRGl2KHsgY2xzOiAnZGljZS1idXR0b25zJyB9KTtcclxuICAgICAgICAgICAgYnV0dG9uQ29udGFpbmVyLnN0eWxlLmNzc1RleHQgPSAnZGlzcGxheTogZmxleDsgZ2FwOiA2cHg7IGp1c3RpZnktY29udGVudDogY2VudGVyOyc7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBtaW51c0J1dHRvbiA9IGJ1dHRvbkNvbnRhaW5lci5jcmVhdGVFbCgnYnV0dG9uJywgeyB0ZXh0OiAnLScgfSk7XHJcbiAgICAgICAgICAgIGNvbnN0IHBsdXNCdXR0b24gPSBidXR0b25Db250YWluZXIuY3JlYXRlRWwoJ2J1dHRvbicsIHsgdGV4dDogJysnIH0pO1xyXG5cclxuICAgICAgICAgICAgW21pbnVzQnV0dG9uLCBwbHVzQnV0dG9uXS5mb3JFYWNoKGJ0biA9PiB7XHJcbiAgICAgICAgICAgICAgICBidG4uc3R5bGUuY3NzVGV4dCA9ICd3aWR0aDogMzJweDsgaGVpZ2h0OiAzMnB4OyBib3JkZXItcmFkaXVzOiA1MCU7IGZvbnQtd2VpZ2h0OiBib2xkOyBmb250LXNpemU6IDE2cHg7IGN1cnNvcjogcG9pbnRlcjsgYm9yZGVyOiAxcHggc29saWQgdmFyKC0taW50ZXJhY3RpdmUtYWNjZW50KTsgdHJhbnNpdGlvbjogYWxsIDAuMnMgZWFzZTsnO1xyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIG1pbnVzQnV0dG9uLnN0eWxlLmNzc1RleHQgKz0gJ2JhY2tncm91bmQ6IHZhcigtLWJhY2tncm91bmQtcHJpbWFyeSk7IGNvbG9yOiB2YXIoLS10ZXh0LW5vcm1hbCk7JztcclxuICAgICAgICAgICAgcGx1c0J1dHRvbi5zdHlsZS5jc3NUZXh0ICs9ICdiYWNrZ3JvdW5kOiB2YXIoLS1pbnRlcmFjdGl2ZS1hY2NlbnQpOyBjb2xvcjogd2hpdGU7JztcclxuXHJcbiAgICAgICAgICAgIG1pbnVzQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuZGljZUNvdW50c1tkaWNlVHlwZV0gPiAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5kaWNlQ291bnRzW2RpY2VUeXBlXS0tO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudXBkYXRlRGljZURpc3BsYXkoKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICBwbHVzQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5kaWNlQ291bnRzW2RpY2VUeXBlXSsrO1xyXG4gICAgICAgICAgICAgICAgdGhpcy51cGRhdGVEaWNlRGlzcGxheSgpO1xyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIC8vIFN0b3JlIHJlZmVyZW5jZXMgZm9yIHVwZGF0aW5nXHJcbiAgICAgICAgICAgIChkaWNlQ2FyZCBhcyBhbnkpLmNvdW50RGlzcGxheSA9IGNvdW50RGlzcGxheTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gTW9kaWZpZXIgaW5wdXRcclxuICAgICAgICBjb25zdCBtb2RpZmllckNvbnRhaW5lciA9IGRpY2VTZWN0aW9uLmNyZWF0ZURpdih7IGNsczogJ2RpY2UtbW9kaWZpZXInIH0pO1xyXG4gICAgICAgIG1vZGlmaWVyQ29udGFpbmVyLnN0eWxlLmNzc1RleHQgPSAnZGlzcGxheTogZmxleDsgYWxpZ24taXRlbXM6IGNlbnRlcjsgZ2FwOiAxMHB4OyBtYXJnaW4tYm90dG9tOiAxNXB4Oyc7XHJcblxyXG4gICAgICAgIGNvbnN0IG1vZGlmaWVyTGFiZWwgPSBtb2RpZmllckNvbnRhaW5lci5jcmVhdGVFbCgnbGFiZWwnLCB7IHRleHQ6ICdNb2RpZmllcjonIH0pO1xyXG4gICAgICAgIG1vZGlmaWVyTGFiZWwuc3R5bGUuY3NzVGV4dCA9ICdmb250LXdlaWdodDogNTAwOyBjb2xvcjogdmFyKC0tdGV4dC1ub3JtYWwpOyc7XHJcblxyXG4gICAgICAgIGNvbnN0IG1vZGlmaWVySW5wdXQgPSBtb2RpZmllckNvbnRhaW5lci5jcmVhdGVFbCgnaW5wdXQnLCB7XHJcbiAgICAgICAgICAgIHR5cGU6ICdudW1iZXInLFxyXG4gICAgICAgICAgICB2YWx1ZTogJzAnXHJcbiAgICAgICAgfSkgYXMgSFRNTElucHV0RWxlbWVudDtcclxuICAgICAgICBtb2RpZmllcklucHV0LnN0eWxlLmNzc1RleHQgPSAnd2lkdGg6IDgwcHg7IHBhZGRpbmc6IDhweDsgYm9yZGVyOiAxcHggc29saWQgdmFyKC0tYmFja2dyb3VuZC1tb2RpZmllci1ib3JkZXIpOyBib3JkZXItcmFkaXVzOiA0cHg7IGJhY2tncm91bmQ6IHZhcigtLWJhY2tncm91bmQtcHJpbWFyeSk7IGNvbG9yOiB2YXIoLS10ZXh0LW5vcm1hbCk7IHRleHQtYWxpZ246IGNlbnRlcjsnO1xyXG4gICAgICAgIG1vZGlmaWVySW5wdXQuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCAoKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMubW9kaWZpZXIgPSBwYXJzZUludChtb2RpZmllcklucHV0LnZhbHVlKSB8fCAwO1xyXG4gICAgICAgICAgICB0aGlzLnVwZGF0ZURpY2VEaXNwbGF5KCk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIEFjdGlvbiBidXR0b25zXHJcbiAgICAgICAgY29uc3QgYWN0aW9uQnV0dG9ucyA9IGRpY2VTZWN0aW9uLmNyZWF0ZURpdih7IGNsczogJ2RpY2UtYWN0aW9ucycgfSk7XHJcbiAgICAgICAgYWN0aW9uQnV0dG9ucy5zdHlsZS5jc3NUZXh0ID0gJ2Rpc3BsYXk6IGZsZXg7IGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47IGdhcDogMTJweDsnO1xyXG5cclxuICAgICAgICAvLyBSb2xsIGJ1dHRvblxyXG4gICAgICAgIHRoaXMucm9sbEJ1dHRvbiA9IGFjdGlvbkJ1dHRvbnMuY3JlYXRlRWwoJ2J1dHRvbicsIHtcclxuICAgICAgICAgICAgdGV4dDogJ1JvbGwgRGljZScsXHJcbiAgICAgICAgICAgIGNsczogJ21vZC1jdGEgZGljZS1yb2xsLWJ1dHRvbidcclxuICAgICAgICB9KTtcclxuICAgICAgICB0aGlzLnJvbGxCdXR0b24uc3R5bGUuY3NzVGV4dCA9ICdwYWRkaW5nOiAxMnB4OyBmb250LXNpemU6IDE0cHg7IGZvbnQtd2VpZ2h0OiBib2xkOyBib3JkZXItcmFkaXVzOiA2cHg7JztcclxuICAgICAgICB0aGlzLnJvbGxCdXR0b24uZGlzYWJsZWQgPSB0cnVlO1xyXG5cclxuICAgICAgICAvLyBSZXF1ZXN0IGRpY2UgYnV0dG9uXHJcbiAgICAgICAgY29uc3QgcmVxdWVzdEJ1dHRvbiA9IGFjdGlvbkJ1dHRvbnMuY3JlYXRlRWwoJ2J1dHRvbicsIHtcclxuICAgICAgICAgICAgdGV4dDogJ1JlcXVlc3QgRGljZSBSb2xsJyxcclxuICAgICAgICAgICAgY2xzOiAnZGljZS1yZXF1ZXN0LWJ1dHRvbidcclxuICAgICAgICB9KTtcclxuICAgICAgICByZXF1ZXN0QnV0dG9uLnN0eWxlLmNzc1RleHQgPSAncGFkZGluZzogMTJweDsgZm9udC1zaXplOiAxNHB4OyBmb250LXdlaWdodDogYm9sZDsgYm9yZGVyLXJhZGl1czogNnB4OyBiYWNrZ3JvdW5kOiB2YXIoLS1jb2xvci1vcmFuZ2UpOyBjb2xvcjogd2hpdGU7IGJvcmRlcjogMXB4IHNvbGlkIHZhcigtLWNvbG9yLW9yYW5nZSk7JztcclxuXHJcbiAgICAgICAgcmVxdWVzdEJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5zZW5kRGljZVJlcXVlc3QoKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gQ2xlYXIgZGljZSBidXR0b25cclxuICAgICAgICBjb25zdCBjbGVhckJ1dHRvbiA9IGFjdGlvbkJ1dHRvbnMuY3JlYXRlRWwoJ2J1dHRvbicsIHtcclxuICAgICAgICAgICAgdGV4dDogJ0NsZWFyIERpY2UnLFxyXG4gICAgICAgICAgICBjbHM6ICdkaWNlLWNsZWFyLWJ1dHRvbidcclxuICAgICAgICB9KTtcclxuICAgICAgICBjbGVhckJ1dHRvbi5zdHlsZS5jc3NUZXh0ID0gJ3BhZGRpbmc6IDEycHg7IGZvbnQtc2l6ZTogMTRweDsgYm9yZGVyLXJhZGl1czogNnB4OyBiYWNrZ3JvdW5kOiB2YXIoLS1iYWNrZ3JvdW5kLXByaW1hcnkpOyBjb2xvcjogdmFyKC0tdGV4dC1ub3JtYWwpOyBib3JkZXI6IDFweCBzb2xpZCB2YXIoLS1iYWNrZ3JvdW5kLW1vZGlmaWVyLWJvcmRlcik7JztcclxuXHJcbiAgICAgICAgLy8gRXZlbnQgbGlzdGVuZXJzXHJcbiAgICAgICAgdGhpcy5yb2xsQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLnJvbGxEaWNlKCk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGNsZWFyQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLmNsZWFyRGljZSgpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBFdmVudCBsaXN0ZW5lcnMgYWxyZWFkeSBzZXQgdXAgYWJvdmVcclxuXHJcbiAgICAgICAgLy8gTG9hZCBpbml0aWFsIG1lc3NhZ2VzXHJcbiAgICAgICAgdGhpcy5sb2FkTWVzc2FnZXMoKTtcclxuXHJcbiAgICAgICAgLy8gRm9jdXMgdGhlIG1lc3NhZ2UgaW5wdXQgZm9yIGltbWVkaWF0ZSB0eXBpbmdcclxuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5tZXNzYWdlSW5wdXQuZm9jdXMoKTtcclxuICAgICAgICB9LCAxMDApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdXBkYXRlRGljZURpc3BsYXkoKSB7XHJcbiAgICAgICAgLy8gT25seSB1cGRhdGUgaWYgdGhpcyBpcyBhIERNIHdpdGggZGljZSBzZWxlY3Rpb24gVUlcclxuICAgICAgICBpZiAodGhpcy51c2VyUm9sZSAhPT0gJ2RtJyB8fCAhdGhpcy5kaWNlU2VsZWN0aW9uQ29udGFpbmVyKSB7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFVwZGF0ZSBpbmRpdmlkdWFsIGRpY2UgY291bnQgZGlzcGxheXNcclxuICAgICAgICBjb25zdCBkaWNlQ2FyZHMgPSB0aGlzLmRpY2VTZWxlY3Rpb25Db250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnLmRpY2UtY2FyZCcpO1xyXG4gICAgICAgIGNvbnN0IGRpY2VUeXBlcyA9IFsnZDQnLCAnZDYnLCAnZDgnLCAnZDEwJywgJ2QxMicsICdkMjAnXTtcclxuXHJcbiAgICAgICAgZGljZUNhcmRzLmZvckVhY2goKGNhcmQsIGluZGV4KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGRpY2VUeXBlID0gZGljZVR5cGVzW2luZGV4XTtcclxuICAgICAgICAgICAgY29uc3QgY291bnREaXNwbGF5ID0gKGNhcmQgYXMgYW55KS5jb3VudERpc3BsYXk7XHJcbiAgICAgICAgICAgIGlmIChjb3VudERpc3BsYXkpIHtcclxuICAgICAgICAgICAgICAgIGNvdW50RGlzcGxheS50ZXh0Q29udGVudCA9IHRoaXMuZGljZUNvdW50c1tkaWNlVHlwZV0udG9TdHJpbmcoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBCdWlsZCBleHByZXNzaW9uIHN0cmluZ1xyXG4gICAgICAgIGNvbnN0IGRpY2VQYXJ0czogc3RyaW5nW10gPSBbXTtcclxuICAgICAgICBkaWNlVHlwZXMuZm9yRWFjaChkaWNlVHlwZSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvdW50ID0gdGhpcy5kaWNlQ291bnRzW2RpY2VUeXBlXTtcclxuICAgICAgICAgICAgaWYgKGNvdW50ID4gMCkge1xyXG4gICAgICAgICAgICAgICAgZGljZVBhcnRzLnB1c2goY291bnQgPT09IDEgPyBkaWNlVHlwZSA6IGAke2NvdW50fSR7ZGljZVR5cGV9YCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgbGV0IGV4cHJlc3Npb24gPSBkaWNlUGFydHMuam9pbignICsgJykgfHwgJyc7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLm1vZGlmaWVyICE9PSAwKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IG1vZGlmaWVyVGV4dCA9IHRoaXMubW9kaWZpZXIgPiAwID8gYCske3RoaXMubW9kaWZpZXJ9YCA6IGAke3RoaXMubW9kaWZpZXJ9YDtcclxuICAgICAgICAgICAgZXhwcmVzc2lvbiA9IGV4cHJlc3Npb24gPyBgJHtleHByZXNzaW9ufSAke21vZGlmaWVyVGV4dH1gIDogbW9kaWZpZXJUZXh0O1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5kaWNlRXhwcmVzc2lvbiA9IGV4cHJlc3Npb247XHJcbiAgICAgICAgaWYgKHRoaXMuZXhwcmVzc2lvbkRpc3BsYXkpIHtcclxuICAgICAgICAgICAgdGhpcy5leHByZXNzaW9uRGlzcGxheS50ZXh0Q29udGVudCA9IGV4cHJlc3Npb24gfHwgJ05vIGRpY2Ugc2VsZWN0ZWQnO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gRW5hYmxlL2Rpc2FibGUgcm9sbCBidXR0b25cclxuICAgICAgICBjb25zdCBoYXNEaWNlID0gZGljZVR5cGVzLnNvbWUodHlwZSA9PiB0aGlzLmRpY2VDb3VudHNbdHlwZV0gPiAwKTtcclxuICAgICAgICBpZiAodGhpcy5yb2xsQnV0dG9uKSB7XHJcbiAgICAgICAgICAgIHRoaXMucm9sbEJ1dHRvbi5kaXNhYmxlZCA9ICFoYXNEaWNlICYmIHRoaXMubW9kaWZpZXIgPT09IDA7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgY2xlYXJEaWNlKCkge1xyXG4gICAgICAgIE9iamVjdC5rZXlzKHRoaXMuZGljZUNvdW50cykuZm9yRWFjaChrZXkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLmRpY2VDb3VudHNba2V5XSA9IDA7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgdGhpcy5tb2RpZmllciA9IDA7XHJcblxyXG4gICAgICAgIC8vIE9ubHkgcmVzZXQgbW9kaWZpZXIgaW5wdXQgaWYgdGhpcyBpcyBhIERNIHdpdGggdGhlIFVJXHJcbiAgICAgICAgaWYgKHRoaXMudXNlclJvbGUgPT09ICdkbScpIHtcclxuICAgICAgICAgICAgY29uc3QgbW9kaWZpZXJJbnB1dCA9IHRoaXMuY29udGFpbmVyRWwucXVlcnlTZWxlY3RvcignaW5wdXRbdHlwZT1cIm51bWJlclwiXScpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XHJcbiAgICAgICAgICAgIGlmIChtb2RpZmllcklucHV0KSB7XHJcbiAgICAgICAgICAgICAgICBtb2RpZmllcklucHV0LnZhbHVlID0gJzAnO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLnVwZGF0ZURpY2VEaXNwbGF5KCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhc3luYyBzZW5kQ2hhdE1lc3NhZ2UoKSB7XHJcbiAgICAgICAgY29uc3QgbWVzc2FnZSA9IHRoaXMubWVzc2FnZUlucHV0LnZhbHVlLnRyaW0oKTtcclxuICAgICAgICBpZiAoIW1lc3NhZ2UpIHJldHVybjtcclxuXHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgLy8gU2hvdyBpbW1lZGlhdGUgZmVlZGJhY2tcclxuICAgICAgICAgICAgY29uc3Qgb3JpZ2luYWxQbGFjZWhvbGRlciA9IHRoaXMubWVzc2FnZUlucHV0LnBsYWNlaG9sZGVyO1xyXG4gICAgICAgICAgICB0aGlzLm1lc3NhZ2VJbnB1dC5wbGFjZWhvbGRlciA9ICdTZW5kaW5nLi4uJztcclxuICAgICAgICAgICAgdGhpcy5tZXNzYWdlSW5wdXQuZGlzYWJsZWQgPSB0cnVlO1xyXG5cclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5hcGlDbGllbnQuc2VuZE1lc3NhZ2UobWVzc2FnZSk7XHJcbiAgICAgICAgICAgIHRoaXMubWVzc2FnZUlucHV0LnZhbHVlID0gJyc7XHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMubG9hZE1lc3NhZ2VzKCk7IC8vIFJlZnJlc2ggbWVzc2FnZXNcclxuXHJcbiAgICAgICAgICAgIC8vIFJlc2V0IHBsYWNlaG9sZGVyXHJcbiAgICAgICAgICAgIHRoaXMubWVzc2FnZUlucHV0LnBsYWNlaG9sZGVyID0gb3JpZ2luYWxQbGFjZWhvbGRlcjtcclxuXHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIHNlbmQgbWVzc2FnZTonLCBlcnJvcik7XHJcbiAgICAgICAgICAgIG5ldyBOb3RpY2UoJ0ZhaWxlZCB0byBzZW5kIG1lc3NhZ2UnKTtcclxuICAgICAgICAgICAgdGhpcy5tZXNzYWdlSW5wdXQucGxhY2Vob2xkZXIgPSAnRmFpbGVkIHRvIHNlbmQgLSB0cnkgYWdhaW4nO1xyXG4gICAgICAgIH0gZmluYWxseSB7XHJcbiAgICAgICAgICAgIHRoaXMubWVzc2FnZUlucHV0LmRpc2FibGVkID0gZmFsc2U7XHJcbiAgICAgICAgICAgIC8vIEZvY3VzIGJhY2sgdG8gaW5wdXQgZm9yIGNvbnRpbnVvdXMgdHlwaW5nXHJcbiAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5tZXNzYWdlSW5wdXQuZm9jdXMoKTtcclxuICAgICAgICAgICAgfSwgMTApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzeW5jIHNlbmREaWNlUmVxdWVzdCgpIHtcclxuICAgICAgICAvLyBPbmx5IERNcyBjYW4gc2VuZCBkaWNlIHJlcXVlc3RzXHJcbiAgICAgICAgaWYgKHRoaXMudXNlclJvbGUgIT09ICdkbScpIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKCF0aGlzLmRpY2VFeHByZXNzaW9uKSB7XHJcbiAgICAgICAgICAgIG5ldyBOb3RpY2UoJ1BsZWFzZSBzZWxlY3QgZGljZSBmaXJzdCcpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLmFwaUNsaWVudC5zZW5kRGljZVJlcXVlc3QodGhpcy5kaWNlRXhwcmVzc2lvbiwgYFJvbGwgJHt0aGlzLmRpY2VFeHByZXNzaW9ufSBmb3IgdGhlIGdhbWVgKTtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5sb2FkTWVzc2FnZXMoKTtcclxuICAgICAgICAgICAgbmV3IE5vdGljZSgnRGljZSByZXF1ZXN0IHNlbnQhJyk7XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIHNlbmQgZGljZSByZXF1ZXN0OicsIGVycm9yKTtcclxuICAgICAgICAgICAgbmV3IE5vdGljZSgnRmFpbGVkIHRvIHNlbmQgZGljZSByZXF1ZXN0Jyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYXN5bmMgcm9sbERpY2UoKSB7XHJcbiAgICAgICAgLy8gT25seSBETXMgY2FuIHJvbGwgZGljZSBpbiBjaGF0XHJcbiAgICAgICAgaWYgKHRoaXMudXNlclJvbGUgIT09ICdkbScpIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKCF0aGlzLmRpY2VFeHByZXNzaW9uKSB7XHJcbiAgICAgICAgICAgIG5ldyBOb3RpY2UoJ1BsZWFzZSBzZWxlY3QgZGljZSBmaXJzdCcpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICB0aGlzLnJvbGxCdXR0b24uZGlzYWJsZWQgPSB0cnVlO1xyXG4gICAgICAgICAgICB0aGlzLnJvbGxCdXR0b24udGV4dENvbnRlbnQgPSAnUm9sbGluZy4uLic7XHJcblxyXG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmFwaUNsaWVudC5yb2xsRGljZSh7XHJcbiAgICAgICAgICAgICAgICBleHByZXNzaW9uOiB0aGlzLmRpY2VFeHByZXNzaW9uLFxyXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246IGBEaWNlIHJvbGwgYnkgJHt0aGlzLnVzZXJuYW1lfWBcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLmFwaUNsaWVudC5zZW5kRGljZVJlc3VsdChyZXN1bHQpO1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLmxvYWRNZXNzYWdlcygpO1xyXG5cclxuICAgICAgICAgICAgLy8gU2hvdyBsb2NhbCByZXN1bHQgYXMgd2VsbFxyXG4gICAgICAgICAgICBuZXcgTm90aWNlKGBSb2xsZWQgJHtyZXN1bHQudG90YWx9ICgke3Jlc3VsdC5icmVha2Rvd259KWApO1xyXG5cclxuICAgICAgICAgICAgLy8gQ2xlYXIgZGljZSBhZnRlciByb2xsaW5nXHJcbiAgICAgICAgICAgIHRoaXMuY2xlYXJEaWNlKCk7XHJcblxyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byByb2xsIGRpY2U6JywgZXJyb3IpO1xyXG4gICAgICAgICAgICBuZXcgTm90aWNlKCdGYWlsZWQgdG8gcm9sbCBkaWNlJyk7XHJcbiAgICAgICAgfSBmaW5hbGx5IHtcclxuICAgICAgICAgICAgdGhpcy5yb2xsQnV0dG9uLmRpc2FibGVkID0gZmFsc2U7XHJcbiAgICAgICAgICAgIHRoaXMucm9sbEJ1dHRvbi50ZXh0Q29udGVudCA9ICdSb2xsIERpY2UnO1xyXG4gICAgICAgICAgICB0aGlzLnVwZGF0ZURpY2VEaXNwbGF5KCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYXN5bmMgbG9hZE1lc3NhZ2VzKCkge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5hcGlDbGllbnQuZ2V0TWVzc2FnZXMoNTAsIDApO1xyXG4gICAgICAgICAgICB0aGlzLmRpc3BsYXlNZXNzYWdlcyhyZXNwb25zZS5tZXNzYWdlcyk7XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGxvYWQgbWVzc2FnZXM6JywgZXJyb3IpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRpc3BsYXlNZXNzYWdlcyhtZXNzYWdlczogQ2hhdE1lc3NhZ2VbXSkge1xyXG4gICAgICAgIHRoaXMuY2hhdENvbnRhaW5lci5lbXB0eSgpO1xyXG5cclxuICAgICAgICBtZXNzYWdlcy5mb3JFYWNoKG1lc3NhZ2UgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBtZXNzYWdlRWwgPSB0aGlzLmNoYXRDb250YWluZXIuY3JlYXRlRGl2KHsgY2xzOiAnZGljZS1jaGF0LW1lc3NhZ2UnIH0pO1xyXG5cclxuICAgICAgICAgICAgLy8gQ2hlY2sgaWYgdGhpcyBpcyBhIGRpY2UgcmVxdWVzdFxyXG4gICAgICAgICAgICBjb25zdCBkaWNlUmVxdWVzdCA9IHRoaXMuYXBpQ2xpZW50LnBhcnNlRGljZVJlcXVlc3QobWVzc2FnZS5jb250ZW50KTtcclxuICAgICAgICAgICAgY29uc3QgaXNEaWNlUmVzdWx0ID0gbWVzc2FnZS5jb250ZW50LmluY2x1ZGVzKCfwn46vICoqUm9sbGVkJyk7XHJcblxyXG4gICAgICAgICAgICBpZiAoZGljZVJlcXVlc3QpIHtcclxuICAgICAgICAgICAgICAgIG1lc3NhZ2VFbC5hZGRDbGFzcygnZGljZS1yZXF1ZXN0LW1lc3NhZ2UnKTtcclxuICAgICAgICAgICAgICAgIG1lc3NhZ2VFbC5zdHlsZS5jc3NUZXh0ID0gJ2JvcmRlcjogMnB4IHNvbGlkIHZhcigtLWludGVyYWN0aXZlLWFjY2VudCk7IGN1cnNvcjogcG9pbnRlcjsgcGFkZGluZzogMTVweDsgbWFyZ2luLWJvdHRvbTogMTJweDsgYm9yZGVyLXJhZGl1czogOHB4OyBiYWNrZ3JvdW5kOiB2YXIoLS1iYWNrZ3JvdW5kLXNlY29uZGFyeSk7IHRyYW5zaXRpb246IGJhY2tncm91bmQtY29sb3IgMC4ycyBlYXNlOyc7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gTWFrZSBpdCBjbGlja2FibGUgZm9yIHBsYXllcnNcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLnVzZXJSb2xlID09PSAncGxheWVyJyAmJiBkaWNlUmVxdWVzdC5yZXF1ZXN0ZXIgIT09IHRoaXMudXNlcm5hbWUpIHtcclxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlRWwuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucG9wdWxhdGVEaWNlRnJvbVJlcXVlc3QoZGljZVJlcXVlc3QpO1xyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlRWwuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VlbnRlcicsICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZUVsLnN0eWxlLmJhY2tncm91bmQgPSAndmFyKC0tYmFja2dyb3VuZC1tb2RpZmllci1ob3ZlciknO1xyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlRWwuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VsZWF2ZScsICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZUVsLnN0eWxlLmJhY2tncm91bmQgPSAndmFyKC0tYmFja2dyb3VuZC1zZWNvbmRhcnkpJztcclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSBlbHNlIGlmIChpc0RpY2VSZXN1bHQpIHtcclxuICAgICAgICAgICAgICAgIG1lc3NhZ2VFbC5hZGRDbGFzcygnZGljZS1yZXN1bHQtbWVzc2FnZScpO1xyXG4gICAgICAgICAgICAgICAgbWVzc2FnZUVsLnN0eWxlLmNzc1RleHQgPSAnYm9yZGVyLWxlZnQ6IDRweCBzb2xpZCB2YXIoLS1jb2xvci1ncmVlbik7IHBhZGRpbmc6IDE1cHg7IG1hcmdpbi1ib3R0b206IDEycHg7IGJhY2tncm91bmQ6IHZhcigtLWJhY2tncm91bmQtc2Vjb25kYXJ5KTsgYm9yZGVyLXJhZGl1czogMCA4cHggOHB4IDA7JztcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIG1lc3NhZ2VFbC5zdHlsZS5jc3NUZXh0ID0gJ3BhZGRpbmc6IDEycHg7IG1hcmdpbi1ib3R0b206IDEwcHg7IGJvcmRlci1ib3R0b206IDFweCBzb2xpZCB2YXIoLS1iYWNrZ3JvdW5kLW1vZGlmaWVyLWJvcmRlcik7JztcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy8gSGVhZGVyIHdpdGggdXNlcm5hbWUgYW5kIHJvbGVcclxuICAgICAgICAgICAgY29uc3QgaGVhZGVyID0gbWVzc2FnZUVsLmNyZWF0ZURpdih7IGNsczogJ21lc3NhZ2UtaGVhZGVyJyB9KTtcclxuICAgICAgICAgICAgaGVhZGVyLnN0eWxlLmNzc1RleHQgPSAnZm9udC13ZWlnaHQ6IGJvbGQ7IG1hcmdpbi1ib3R0b206IDhweDsgZm9udC1zaXplOiAxM3B4Oyc7XHJcblxyXG4gICAgICAgICAgICBjb25zdCByb2xlQ29sb3IgPSBtZXNzYWdlLnVzZXJfcm9sZSA9PT0gJ2RtJyA/ICd2YXIoLS1jb2xvci1vcmFuZ2UpJyA6ICd2YXIoLS1jb2xvci1ibHVlKSc7XHJcbiAgICAgICAgICAgIGhlYWRlci5pbm5lckhUTUwgPSBgPHNwYW4gc3R5bGU9XCJjb2xvcjogJHtyb2xlQ29sb3J9O1wiPiR7bWVzc2FnZS51c2VybmFtZX0gKCR7bWVzc2FnZS51c2VyX3JvbGUudG9VcHBlckNhc2UoKX0pPC9zcGFuPmA7XHJcblxyXG4gICAgICAgICAgICAvLyBDb250ZW50XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbnRlbnRFbCA9IG1lc3NhZ2VFbC5jcmVhdGVEaXYoeyBjbHM6ICdtZXNzYWdlLWNvbnRlbnQnIH0pO1xyXG4gICAgICAgICAgICBjb250ZW50RWwuc3R5bGUuY3NzVGV4dCA9ICdsaW5lLWhlaWdodDogMS41OyBmb250LXNpemU6IDE0cHg7JztcclxuICAgICAgICAgICAgY29udGVudEVsLmlubmVySFRNTCA9IG1lc3NhZ2UuY29udGVudC5yZXBsYWNlKC9cXG4vZywgJzxicj4nKTtcclxuXHJcbiAgICAgICAgICAgIC8vIFRpbWVzdGFtcFxyXG4gICAgICAgICAgICBpZiAobWVzc2FnZS50aW1lc3RhbXApIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHRpbWVzdGFtcEVsID0gbWVzc2FnZUVsLmNyZWF0ZURpdih7IGNsczogJ21lc3NhZ2UtdGltZXN0YW1wJyB9KTtcclxuICAgICAgICAgICAgICAgIHRpbWVzdGFtcEVsLnN0eWxlLmNzc1RleHQgPSAnZm9udC1zaXplOiAxMXB4OyBjb2xvcjogdmFyKC0tdGV4dC1tdXRlZCk7IG1hcmdpbi10b3A6IDhweDsgdGV4dC1hbGlnbjogcmlnaHQ7JztcclxuICAgICAgICAgICAgICAgIHRpbWVzdGFtcEVsLnRleHRDb250ZW50ID0gbmV3IERhdGUobWVzc2FnZS50aW1lc3RhbXApLnRvTG9jYWxlVGltZVN0cmluZygpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIFNjcm9sbCB0byBib3R0b21cclxuICAgICAgICB0aGlzLmNoYXRDb250YWluZXIuc2Nyb2xsVG9wID0gdGhpcy5jaGF0Q29udGFpbmVyLnNjcm9sbEhlaWdodDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHBvcHVsYXRlRGljZUZyb21SZXF1ZXN0KHJlcXVlc3Q6IERpY2VSZXF1ZXN0KSB7XHJcbiAgICAgICAgLy8gUGFyc2UgdGhlIGRpY2UgZXhwcmVzc2lvbiBhbmQgcG9wdWxhdGUgdGhlIGRpY2Ugc2VsZWN0aW9uXHJcbiAgICAgICAgdGhpcy5jbGVhckRpY2UoKTtcclxuXHJcbiAgICAgICAgY29uc3QgZXhwcmVzc2lvbiA9IHJlcXVlc3QuZXhwcmVzc2lvbjtcclxuXHJcbiAgICAgICAgLy8gU2ltcGxlIHBhcnNlciBmb3IgZXhwcmVzc2lvbnMgbGlrZSBcIjJkNisxZDIwKzNcIlxyXG4gICAgICAgIGNvbnN0IGRpY2VNYXRjaGVzID0gZXhwcmVzc2lvbi5tYXRjaCgvKFxcZCspP2QoXFxkKykvZyk7XHJcbiAgICAgICAgY29uc3QgbW9kaWZpZXJNYXRjaCA9IGV4cHJlc3Npb24ubWF0Y2goLyhbKy1dXFxkKykoPyFbZFxcZF0pLyk7XHJcblxyXG4gICAgICAgIGlmIChkaWNlTWF0Y2hlcykge1xyXG4gICAgICAgICAgICBkaWNlTWF0Y2hlcy5mb3JFYWNoKG1hdGNoID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGRpY2VNYXRjaCA9IG1hdGNoLm1hdGNoKC8oXFxkKyk/ZChcXGQrKS8pO1xyXG4gICAgICAgICAgICAgICAgaWYgKGRpY2VNYXRjaCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvdW50ID0gcGFyc2VJbnQoZGljZU1hdGNoWzFdKSB8fCAxO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHNpZGVzID0gZGljZU1hdGNoWzJdO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGRpY2VUeXBlID0gYGQke3NpZGVzfWA7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmRpY2VDb3VudHMuaGFzT3duUHJvcGVydHkoZGljZVR5cGUpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGljZUNvdW50c1tkaWNlVHlwZV0gKz0gY291bnQ7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChtb2RpZmllck1hdGNoKSB7XHJcbiAgICAgICAgICAgIHRoaXMubW9kaWZpZXIgPSBwYXJzZUludChtb2RpZmllck1hdGNoWzFdKTtcclxuICAgICAgICAgICAgY29uc3QgbW9kaWZpZXJJbnB1dCA9IHRoaXMuY29udGFpbmVyRWwucXVlcnlTZWxlY3RvcignaW5wdXRbdHlwZT1cIm51bWJlclwiXScpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XHJcbiAgICAgICAgICAgIGlmIChtb2RpZmllcklucHV0KSB7XHJcbiAgICAgICAgICAgICAgICBtb2RpZmllcklucHV0LnZhbHVlID0gdGhpcy5tb2RpZmllci50b1N0cmluZygpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLnVwZGF0ZURpY2VEaXNwbGF5KCk7XHJcbiAgICAgICAgbmV3IE5vdGljZShgRGljZSBsb2FkZWQgZnJvbSByZXF1ZXN0OiAke3JlcXVlc3QuZXhwcmVzc2lvbn1gKTtcclxuXHJcbiAgICAgICAgLy8gQWxzbyB0cmlnZ2VyIHRoZSBwaHlzaWNhbCBkaWNlIGludGVyZmFjZSBpZiB0aGUgcGx1Z2luIHN1cHBvcnRzIGl0XHJcbiAgICAgICAgaWYgKHRoaXMucGx1Z2luLmhhbmRsZURpY2VSZXF1ZXN0KSB7XHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLmhhbmRsZURpY2VSZXF1ZXN0KHJlcXVlc3QuZXhwcmVzc2lvbiwgcmVxdWVzdC5kZXNjcmlwdGlvbik7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc3RhcnRQb2xsaW5nKCkge1xyXG4gICAgICAgIGlmICh0aGlzLmlzUG9sbGluZykgcmV0dXJuO1xyXG5cclxuICAgICAgICB0aGlzLmlzUG9sbGluZyA9IHRydWU7XHJcbiAgICAgICAgY29uc3QgcG9sbCA9IGFzeW5jICgpID0+IHtcclxuICAgICAgICAgICAgaWYgKCF0aGlzLmlzUG9sbGluZykgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMubG9hZE1lc3NhZ2VzKCk7XHJcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKCdQb2xsaW5nIGVycm9yOicsIGVycm9yKTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgdGhpcy5wb2xsVGltZW91dCA9IHNldFRpbWVvdXQocG9sbCwgMzAwMCk7IC8vIFBvbGwgZXZlcnkgMyBzZWNvbmRzXHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgcG9sbCgpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc3RvcFBvbGxpbmcoKSB7XHJcbiAgICAgICAgdGhpcy5pc1BvbGxpbmcgPSBmYWxzZTtcclxuICAgICAgICBpZiAodGhpcy5wb2xsVGltZW91dCkge1xyXG4gICAgICAgICAgICBjbGVhclRpbWVvdXQodGhpcy5wb2xsVGltZW91dCk7XHJcbiAgICAgICAgICAgIHRoaXMucG9sbFRpbWVvdXQgPSBudWxsO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRpc2Nvbm5lY3QoKSB7XHJcbiAgICAgICAgdGhpcy5zdG9wUG9sbGluZygpO1xyXG4gICAgICAgIHRoaXMuaXNDb25uZWN0ZWQgPSBmYWxzZTtcclxuICAgICAgICB0aGlzLnNob3dVc2VyU2V0dXAoKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGxvZ291dCgpIHtcclxuICAgICAgICB0aGlzLnN0b3BQb2xsaW5nKCk7XHJcbiAgICAgICAgdGhpcy5pc0Nvbm5lY3RlZCA9IGZhbHNlO1xyXG4gICAgICAgIHRoaXMuYXBpQ2xpZW50LmxvZ291dCgpO1xyXG4gICAgICAgIG5ldyBOb3RpY2UoJ0xvZ2dlZCBvdXQgc3VjY2Vzc2Z1bGx5Jyk7XHJcbiAgICAgICAgdGhpcy5zaG93QXV0aGVudGljYXRpb25TZXR1cCgpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaGFuZGxlQXBpRXJyb3IoZXJyb3I6IGFueSkge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ0FQSSBFcnJvcjonLCBlcnJvcik7XHJcblxyXG4gICAgICAgIC8vIENoZWNrIGZvciA0MDEgYXV0aGVudGljYXRpb24gZXJyb3JzXHJcbiAgICAgICAgaWYgKGVycm9yLm1lc3NhZ2UgJiYgZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnNDAxJykpIHtcclxuICAgICAgICAgICAgbmV3IE5vdGljZSgnU2Vzc2lvbiBleHBpcmVkLiBQbGVhc2UgbG9naW4gYWdhaW4uJyk7XHJcbiAgICAgICAgICAgIHRoaXMubG9nb3V0KCk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIENoZWNrIGZvciBuZXR3b3JrIGVycm9yc1xyXG4gICAgICAgIGlmIChlcnJvci5tZXNzYWdlICYmIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoJ0ZhaWxlZCB0byBmZXRjaCcpKSB7XHJcbiAgICAgICAgICAgIG5ldyBOb3RpY2UoJ05ldHdvcmsgZXJyb3IuIENoZWNrIHlvdXIgY29ubmVjdGlvbiBhbmQgQVBJIGVuZHBvaW50LicpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBHZW5lcmljIGVycm9yXHJcbiAgICAgICAgbmV3IE5vdGljZShgRXJyb3I6ICR7ZXJyb3IubWVzc2FnZSB8fCAnVW5rbm93biBlcnJvciBvY2N1cnJlZCd9YCk7XHJcbiAgICB9XHJcblxyXG4gICAgYXN5bmMgb25DbG9zZSgpIHtcclxuICAgICAgICB0aGlzLnN0b3BQb2xsaW5nKCk7XHJcbiAgICB9XHJcbn0iXX0=