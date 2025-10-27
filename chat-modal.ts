import { Modal, App, Setting, Notice } from 'obsidian';
import { DiceAPIClient, ChatMessage, DiceRequest } from './api-client';
import D20DicePlugin from './main';

export class DiceChatModal extends Modal {
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

    constructor(app: App, plugin: D20DicePlugin) {
        super(app);
        this.plugin = plugin;
        this.apiClient = new DiceAPIClient(plugin.settings.apiEndpoint);
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        this.modalEl.addClass('dice-chat-modal');
        this.modalEl.style.cssText = 'width: 80vw; max-width: 900px; height: 80vh; max-height: 700px;';

        // Setup username and role
        await this.showUserSetup();
    }

    private async showUserSetup() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Join Dice Chat' });

        let usernameValue = '';
        let roleValue: 'dm' | 'player' = 'player';
        let sessionIdValue = '';

        new Setting(contentEl)
            .setName('Username')
            .setDesc('Your display name in the chat')
            .addText(text => text
                .setPlaceholder('Enter your username')
                .onChange((value) => {
                    usernameValue = value;
                }));

        new Setting(contentEl)
            .setName('Role')
            .setDesc('Your role in the game session')
            .addDropdown(dropdown => dropdown
                .addOption('player', 'Player')
                .addOption('dm', 'Game Master / DM')
                .setValue('player')
                .onChange((value: 'dm' | 'player') => {
                    roleValue = value;
                }));

        new Setting(contentEl)
            .setName('Session ID')
            .setDesc('Session/Room ID to join (leave empty for default room)')
            .addText(text => text
                .setPlaceholder('Enter session ID (optional)')
                .onChange((value) => {
                    sessionIdValue = value;
                }));

        const buttonContainer = contentEl.createDiv({ cls: 'dice-chat-buttons' });
        buttonContainer.style.cssText = 'margin-top: 20px; text-align: center;';

        const joinButton = buttonContainer.createEl('button', {
            text: 'Join Chat',
            cls: 'mod-cta'
        });
        joinButton.style.cssText = 'margin-right: 10px; padding: 10px 20px;';

        const cancelButton = buttonContainer.createEl('button', {
            text: 'Cancel',
        });
        cancelButton.style.cssText = 'padding: 10px 20px;';

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

                // Set session ID if provided
                if (sessionIdValue.trim()) {
                    this.apiClient.setRoomId(sessionIdValue.trim());
                }

                // Check if server is available
                const isHealthy = await this.apiClient.checkHealth();
                if (!isHealthy) {
                    new Notice('Cannot connect to dice API server. Check your endpoint settings.');
                    return;
                }

                await this.apiClient.joinRoom();
                await this.setupChatInterface();
                this.startPolling();

            } catch (error) {
                console.error('Failed to join chat:', error);
                new Notice('Failed to connect to chat. Check your API endpoint.');
            } finally {
                joinButton.disabled = false;
                joinButton.textContent = 'Join Chat';
            }
        });

        cancelButton.addEventListener('click', () => {
            this.close();
        });
    }

    private async setupChatInterface() {
        const { contentEl } = this;
        contentEl.empty();

        // Header
        const header = contentEl.createDiv({ cls: 'dice-chat-header' });
        header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid var(--background-modifier-border); margin-bottom: 10px;';

        const titleDiv = header.createDiv();
        titleDiv.createEl('h3', { text: 'Dice Chat' });
        const userInfoDiv = titleDiv.createDiv({ cls: 'dice-chat-user-info' });
        userInfoDiv.style.cssText = 'font-size: 12px; color: var(--text-muted); line-height: 1.2;';

        userInfoDiv.createEl('div', { text: `${this.username} (${this.userRole.toUpperCase()})` });
        userInfoDiv.createEl('div', {
            text: `Room: ${this.apiClient.getRoomId()}`,
            cls: 'dice-chat-room-id'
        }).style.cssText = 'font-family: monospace; font-size: 11px; opacity: 0.8;';

        const closeButton = header.createEl('button', { text: '×', cls: 'dice-chat-close' });
        closeButton.style.cssText = 'background: none; border: none; font-size: 20px; cursor: pointer; padding: 5px;';
        closeButton.addEventListener('click', () => this.close());

        // Main content container
        const mainContainer = contentEl.createDiv({ cls: 'dice-chat-main' });
        mainContainer.style.cssText = 'display: flex; height: calc(100% - 80px); gap: 10px;';

        // Chat section (left side)
        const chatSection = mainContainer.createDiv({ cls: 'dice-chat-section' });
        chatSection.style.cssText = 'flex: 1; display: flex; flex-direction: column; border-right: 1px solid var(--background-modifier-border); padding-right: 10px;';

        // Chat messages container
        this.chatContainer = chatSection.createDiv({ cls: 'dice-chat-messages' });
        this.chatContainer.style.cssText = 'flex: 1; overflow-y: auto; border: 1px solid var(--background-modifier-border); padding: 10px; margin-bottom: 10px; max-height: 400px;';

        // Message input
        const inputContainer = chatSection.createDiv({ cls: 'dice-chat-input-container' });
        inputContainer.style.cssText = 'display: flex; gap: 5px;';

        this.messageInput = inputContainer.createEl('input', {
            type: 'text',
            placeholder: 'Type a message...'
        }) as HTMLInputElement;
        this.messageInput.style.cssText = 'flex: 1; padding: 8px;';

        const sendButton = inputContainer.createEl('button', {
            text: 'Send',
            cls: 'mod-cta'
        });

        // Dice selection section (right side)
        const diceSection = mainContainer.createDiv({ cls: 'dice-dice-section' });
        diceSection.style.cssText = 'width: 300px; display: flex; flex-direction: column;';

        diceSection.createEl('h4', { text: 'Dice Selection' });

        // Expression display
        this.expressionDisplay = diceSection.createDiv({
            text: 'No dice selected',
            cls: 'dice-expression-display'
        });
        this.expressionDisplay.style.cssText = 'padding: 10px; margin-bottom: 10px; background: var(--background-secondary); border-radius: 5px; font-family: monospace; text-align: center; font-weight: bold;';

        // Dice selection grid
        this.diceSelectionContainer = diceSection.createDiv({ cls: 'dice-selection-grid' });
        this.diceSelectionContainer.style.cssText = 'display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 10px;';

        const diceTypes = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];
        diceTypes.forEach(diceType => {
            const diceCard = this.diceSelectionContainer.createDiv({ cls: 'dice-card' });
            diceCard.style.cssText = 'border: 1px solid var(--background-modifier-border); padding: 10px; border-radius: 5px; text-align: center;';

            diceCard.createEl('div', { text: diceType.toUpperCase(), cls: 'dice-type-label' });

            const countDisplay = diceCard.createEl('div', {
                text: '0',
                cls: 'dice-count-display'
            });
            countDisplay.style.cssText = 'font-size: 18px; font-weight: bold; margin: 5px 0;';

            const buttonContainer = diceCard.createDiv({ cls: 'dice-buttons' });
            buttonContainer.style.cssText = 'display: flex; gap: 5px; justify-content: center;';

            const minusButton = buttonContainer.createEl('button', { text: '-' });
            const plusButton = buttonContainer.createEl('button', { text: '+' });

            [minusButton, plusButton].forEach(btn => {
                btn.style.cssText = 'width: 30px; height: 30px; border-radius: 50%; font-weight: bold;';
            });

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
        modifierContainer.style.cssText = 'display: flex; align-items: center; gap: 10px; margin-bottom: 10px;';

        modifierContainer.createEl('label', { text: 'Modifier:' });
        const modifierInput = modifierContainer.createEl('input', {
            type: 'number',
            value: '0'
        }) as HTMLInputElement;
        modifierInput.style.cssText = 'width: 80px; padding: 5px;';
        modifierInput.addEventListener('input', () => {
            this.modifier = parseInt(modifierInput.value) || 0;
            this.updateDiceDisplay();
        });

        // Action buttons
        const actionButtons = diceSection.createDiv({ cls: 'dice-actions' });
        actionButtons.style.cssText = 'display: flex; flex-direction: column; gap: 10px;';

        // Roll button
        this.rollButton = actionButtons.createEl('button', {
            text: 'Roll Dice',
            cls: 'mod-cta dice-roll-button'
        });
        this.rollButton.disabled = true;

        // Request dice button (for DM)
        if (this.userRole === 'dm') {
            const requestButton = actionButtons.createEl('button', {
                text: 'Request Dice Roll',
                cls: 'dice-request-button'
            });

            requestButton.addEventListener('click', () => {
                this.sendDiceRequest();
            });
        }

        // Clear dice button
        const clearButton = actionButtons.createEl('button', {
            text: 'Clear Dice',
            cls: 'dice-clear-button'
        });

        // Event listeners
        this.rollButton.addEventListener('click', () => {
            this.rollDice();
        });

        clearButton.addEventListener('click', () => {
            this.clearDice();
        });

        sendButton.addEventListener('click', () => {
            this.sendChatMessage();
        });

        this.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendChatMessage();
            }
        });

        // Load initial messages
        await this.loadMessages();
    }

    private updateDiceDisplay() {
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
        this.expressionDisplay.textContent = expression || 'No dice selected';

        // Enable/disable roll button
        const hasDice = diceTypes.some(type => this.diceCounts[type] > 0);
        this.rollButton.disabled = !hasDice && this.modifier === 0;
    }

    private clearDice() {
        Object.keys(this.diceCounts).forEach(key => {
            this.diceCounts[key] = 0;
        });
        this.modifier = 0;

        // Reset modifier input
        const modifierInput = this.contentEl.querySelector('input[type="number"]') as HTMLInputElement;
        if (modifierInput) {
            modifierInput.value = '0';
        }

        this.updateDiceDisplay();
    }

    private async sendChatMessage() {
        const message = this.messageInput.value.trim();
        if (!message) return;

        try {
            this.messageInput.disabled = true;
            await this.apiClient.sendMessage(message);
            this.messageInput.value = '';
            await this.loadMessages(); // Refresh messages
        } catch (error) {
            console.error('Failed to send message:', error);
            new Notice('Failed to send message');
        } finally {
            this.messageInput.disabled = false;
            this.messageInput.focus();
        }
    }

    private async sendDiceRequest() {
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
                messageEl.style.cssText = 'border: 2px solid var(--interactive-accent); cursor: pointer; padding: 10px; margin-bottom: 10px; border-radius: 5px; background: var(--background-secondary);';

                // Make it clickable for players
                if (this.userRole === 'player' && diceRequest.requester !== this.username) {
                    messageEl.addEventListener('click', () => {
                        this.populateDiceFromRequest(diceRequest);
                    });
                }
            } else if (isDiceResult) {
                messageEl.addClass('dice-result-message');
                messageEl.style.cssText = 'border-left: 4px solid var(--color-green); padding: 10px; margin-bottom: 10px; background: var(--background-secondary);';
            } else {
                messageEl.style.cssText = 'padding: 8px; margin-bottom: 8px; border-bottom: 1px solid var(--background-modifier-border);';
            }

            // Header with username and role
            const header = messageEl.createDiv({ cls: 'message-header' });
            header.style.cssText = 'font-weight: bold; margin-bottom: 5px; color: var(--text-accent);';

            const roleColor = message.user_role === 'dm' ? 'var(--color-orange)' : 'var(--color-blue)';
            header.innerHTML = `<span style="color: ${roleColor};">${message.username} (${message.user_role.toUpperCase()})</span>`;

            // Content
            const contentEl = messageEl.createDiv({ cls: 'message-content' });
            contentEl.innerHTML = message.content.replace(/\n/g, '<br>');

            // Timestamp
            if (message.timestamp) {
                const timestampEl = messageEl.createDiv({ cls: 'message-timestamp' });
                timestampEl.style.cssText = 'font-size: 11px; color: var(--text-muted); margin-top: 5px;';
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
            const modifierInput = this.contentEl.querySelector('input[type="number"]') as HTMLInputElement;
            if (modifierInput) {
                modifierInput.value = this.modifier.toString();
            }
        }

        this.updateDiceDisplay();
        new Notice(`Dice loaded from request: ${request.expression}`);
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

    onClose() {
        this.stopPolling();
        const { contentEl } = this;
        contentEl.empty();
    }
}