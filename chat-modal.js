import { __awaiter } from "tslib";
import { Modal, Setting, Notice } from 'obsidian';
import { DiceAPIClient } from './api-client';
export class DiceChatModal extends Modal {
    constructor(app, plugin) {
        super(app);
        this.diceExpression = '';
        this.diceCounts = { d4: 0, d6: 0, d8: 0, d10: 0, d12: 0, d20: 0 };
        this.modifier = 0;
        this.userRole = 'player';
        this.username = '';
        this.isPolling = false;
        this.pollTimeout = null;
        this.lastMessageId = 0;
        this.plugin = plugin;
        this.apiClient = new DiceAPIClient(plugin.settings.apiEndpoint);
    }
    onOpen() {
        return __awaiter(this, void 0, void 0, function* () {
            const { contentEl } = this;
            contentEl.empty();
            this.modalEl.addClass('dice-chat-modal');
            this.modalEl.style.cssText = 'width: 80vw; max-width: 900px; height: 80vh; max-height: 700px;';
            // Setup username and role
            yield this.showUserSetup();
        });
    }
    showUserSetup() {
        return __awaiter(this, void 0, void 0, function* () {
            const { contentEl } = this;
            contentEl.empty();
            contentEl.createEl('h2', { text: 'Join Dice Chat' });
            let usernameValue = '';
            let roleValue = 'player';
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
                .onChange((value) => {
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
                    // Set session ID if provided
                    if (sessionIdValue.trim()) {
                        this.apiClient.setRoomId(sessionIdValue.trim());
                    }
                    // Check if server is available
                    const isHealthy = yield this.apiClient.checkHealth();
                    if (!isHealthy) {
                        new Notice('Cannot connect to dice API server. Check your endpoint settings.');
                        return;
                    }
                    yield this.apiClient.joinRoom();
                    yield this.setupChatInterface();
                    this.startPolling();
                }
                catch (error) {
                    console.error('Failed to join chat:', error);
                    new Notice('Failed to connect to chat. Check your API endpoint.');
                }
                finally {
                    joinButton.disabled = false;
                    joinButton.textContent = 'Join Chat';
                }
            }));
            cancelButton.addEventListener('click', () => {
                this.close();
            });
        });
    }
    setupChatInterface() {
        return __awaiter(this, void 0, void 0, function* () {
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
            });
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
                diceCard.countDisplay = countDisplay;
            });
            // Modifier input
            const modifierContainer = diceSection.createDiv({ cls: 'dice-modifier' });
            modifierContainer.style.cssText = 'display: flex; align-items: center; gap: 10px; margin-bottom: 10px;';
            modifierContainer.createEl('label', { text: 'Modifier:' });
            const modifierInput = modifierContainer.createEl('input', {
                type: 'number',
                value: '0'
            });
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
            yield this.loadMessages();
        });
    }
    updateDiceDisplay() {
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
        this.expressionDisplay.textContent = expression || 'No dice selected';
        // Enable/disable roll button
        const hasDice = diceTypes.some(type => this.diceCounts[type] > 0);
        this.rollButton.disabled = !hasDice && this.modifier === 0;
    }
    clearDice() {
        Object.keys(this.diceCounts).forEach(key => {
            this.diceCounts[key] = 0;
        });
        this.modifier = 0;
        // Reset modifier input
        const modifierInput = this.contentEl.querySelector('input[type="number"]');
        if (modifierInput) {
            modifierInput.value = '0';
        }
        this.updateDiceDisplay();
    }
    sendChatMessage() {
        return __awaiter(this, void 0, void 0, function* () {
            const message = this.messageInput.value.trim();
            if (!message)
                return;
            try {
                this.messageInput.disabled = true;
                yield this.apiClient.sendMessage(message);
                this.messageInput.value = '';
                yield this.loadMessages(); // Refresh messages
            }
            catch (error) {
                console.error('Failed to send message:', error);
                new Notice('Failed to send message');
            }
            finally {
                this.messageInput.disabled = false;
                this.messageInput.focus();
            }
        });
    }
    sendDiceRequest() {
        return __awaiter(this, void 0, void 0, function* () {
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
                messageEl.style.cssText = 'border: 2px solid var(--interactive-accent); cursor: pointer; padding: 10px; margin-bottom: 10px; border-radius: 5px; background: var(--background-secondary);';
                // Make it clickable for players
                if (this.userRole === 'player' && diceRequest.requester !== this.username) {
                    messageEl.addEventListener('click', () => {
                        this.populateDiceFromRequest(diceRequest);
                    });
                }
            }
            else if (isDiceResult) {
                messageEl.addClass('dice-result-message');
                messageEl.style.cssText = 'border-left: 4px solid var(--color-green); padding: 10px; margin-bottom: 10px; background: var(--background-secondary);';
            }
            else {
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
            const modifierInput = this.contentEl.querySelector('input[type="number"]');
            if (modifierInput) {
                modifierInput.value = this.modifier.toString();
            }
        }
        this.updateDiceDisplay();
        new Notice(`Dice loaded from request: ${request.expression}`);
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
    onClose() {
        this.stopPolling();
        const { contentEl } = this;
        contentEl.empty();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdC1tb2RhbC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImNoYXQtbW9kYWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLE9BQU8sRUFBRSxLQUFLLEVBQU8sT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUN2RCxPQUFPLEVBQUUsYUFBYSxFQUE0QixNQUFNLGNBQWMsQ0FBQztBQUd2RSxNQUFNLE9BQU8sYUFBYyxTQUFRLEtBQUs7SUFpQnBDLFlBQVksR0FBUSxFQUFFLE1BQXFCO1FBQ3ZDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQVZQLG1CQUFjLEdBQVcsRUFBRSxDQUFDO1FBQzVCLGVBQVUsR0FBOEIsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDO1FBQ3hGLGFBQVEsR0FBVyxDQUFDLENBQUM7UUFDckIsYUFBUSxHQUFvQixRQUFRLENBQUM7UUFDckMsYUFBUSxHQUFXLEVBQUUsQ0FBQztRQUN0QixjQUFTLEdBQVksS0FBSyxDQUFDO1FBQzNCLGdCQUFXLEdBQTBCLElBQUksQ0FBQztRQUMxQyxrQkFBYSxHQUFXLENBQUMsQ0FBQztRQUk5QixJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztRQUNyQixJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksYUFBYSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLENBQUM7SUFDcEUsQ0FBQztJQUVLLE1BQU07O1lBQ1IsTUFBTSxFQUFFLFNBQVMsRUFBRSxHQUFHLElBQUksQ0FBQztZQUMzQixTQUFTLENBQUMsS0FBSyxFQUFFLENBQUM7WUFFbEIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsaUJBQWlCLENBQUMsQ0FBQztZQUN6QyxJQUFJLENB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RUQsSUFBSSxDQUFDLFdBQVcsR0FBRyxVQUFVLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsdUJBQXVCO1FBQ3RFLENBQUMsQ0FBQSxDQUFDO1FBRUYsSUFBSSxFQUFFLENBQUM7SUFDWCxDQUFDO0lBRU8sV0FBVztRQUNmLElBQUksQ0FBQyxTQUFTLEdBQUcsS0FBSyxDQUFDO1FBQ3ZCLElBQUksSUFBSSxDQUFDLFdBQVcsRUFBRTtZQUNsQixZQUFZLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBQy9CLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDO1NBQzNCO0lBQ0wsQ0FBQztJQUVELE9BQU87UUFDSCxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDbkIsTUFBTSxFQUFFLFNBQVMsRUFBRSxHQUFHLElBQUksQ0FBQztRQUMzQixTQUFTLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDdEIsQ0FBQztDQUNKIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgTW9kYWwsIEFwcCwgU2V0dGluZywgTm90aWNlIH0gZnJvbSAnb2JzaWRpYW4nO1xyXG5pbXBvcnQgeyBEaWNlQVBJQ2xpZW50LCBDaGF0TWVzc2FnZSwgRGljZVJlcXVlc3QgfSBmcm9tICcuL2FwaS1jbGllbnQnO1xyXG5pbXBvcnQgRDIwRGljZVBsdWdpbiBmcm9tICcuL21haW4nO1xyXG5cclxuZXhwb3J0IGNsYXNzIERpY2VDaGF0TW9kYWwgZXh0ZW5kcyBNb2RhbCB7XHJcbiAgICBwcml2YXRlIHBsdWdpbjogRDIwRGljZVBsdWdpbjtcclxuICAgIHByaXZhdGUgYXBpQ2xpZW50OiBEaWNlQVBJQ2xpZW50O1xyXG4gICAgcHJpdmF0ZSBjaGF0Q29udGFpbmVyOiBIVE1MRWxlbWVudDtcclxuICAgIHByaXZhdGUgbWVzc2FnZUlucHV0OiBIVE1MSW5wdXRFbGVtZW50O1xyXG4gICAgcHJpdmF0ZSBkaWNlU2VsZWN0aW9uQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcclxuICAgIHByaXZhdGUgZXhwcmVzc2lvbkRpc3BsYXk6IEhUTUxFbGVtZW50O1xyXG4gICAgcHJpdmF0ZSByb2xsQnV0dG9uOiBIVE1MQnV0dG9uRWxlbWVudDtcclxuICAgIHByaXZhdGUgZGljZUV4cHJlc3Npb246IHN0cmluZyA9ICcnO1xyXG4gICAgcHJpdmF0ZSBkaWNlQ291bnRzOiB7IFtrZXk6IHN0cmluZ106IG51bWJlciB9ID0geyBkNDogMCwgZDY6IDAsIGQ4OiAwLCBkMTA6IDAsIGQxMjogMCwgZDIwOiAwIH07XHJcbiAgICBwcml2YXRlIG1vZGlmaWVyOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSB1c2VyUm9sZTogJ2RtJyB8ICdwbGF5ZXInID0gJ3BsYXllcic7XHJcbiAgICBwcml2YXRlIHVzZXJuYW1lOiBzdHJpbmcgPSAnJztcclxuICAgIHByaXZhdGUgaXNQb2xsaW5nOiBib29sZWFuID0gZmFsc2U7XHJcbiAgICBwcml2YXRlIHBvbGxUaW1lb3V0OiBOb2RlSlMuVGltZW91dCB8IG51bGwgPSBudWxsO1xyXG4gICAgcHJpdmF0ZSBsYXN0TWVzc2FnZUlkOiBudW1iZXIgPSAwO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwbHVnaW46IEQyMERpY2VQbHVnaW4pIHtcclxuICAgICAgICBzdXBlcihhcHApO1xyXG4gICAgICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xyXG4gICAgICAgIHRoaXMuYXBpQ2xpZW50ID0gbmV3IERpY2VBUElDbGllbnQocGx1Z2luLnNldHRpbmdzLmFwaUVuZHBvaW50KTtcclxuICAgIH1cclxuXHJcbiAgICBhc3luYyBvbk9wZW4oKSB7XHJcbiAgICAgICAgY29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XHJcbiAgICAgICAgY29udGVudEVsLmVtcHR5KCk7XHJcblxyXG4gICAgICAgIHRoaXMubW9kYWxFbC5hZGRDbGFzcygnZGljZS1jaGF0LW1vZGFsJyk7XHJcbiAgICAgICAgdGhpcy5tb2RhbEVsLnN0eWxlLmNzc1RleHQgPSAnd2lkdGg6IDgwdnc7IG1heC13aWR0aDogOTAwcHg7IGhlaWdodDogODB2aDsgbWF4LWhlaWdodDogNzAwcHg7JztcclxuXHJcbiAgICAgICAgLy8gU2V0dXAgdXNlcm5hbWUgYW5kIHJvbGVcclxuICAgICAgICBhd2FpdCB0aGlzLnNob3dVc2VyU2V0dXAoKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzeW5jIHNob3dVc2VyU2V0dXAoKSB7XHJcbiAgICAgICAgY29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XHJcbiAgICAgICAgY29udGVudEVsLmVtcHR5KCk7XHJcblxyXG4gICAgICAgIGNvbnRlbnRFbC5jcmVhdGVFbCgnaDInLCB7IHRleHQ6ICdKb2luIERpY2UgQ2hhdCcgfSk7XHJcblxyXG4gICAgICAgIGxldCB1c2VybmFtZVZhbHVlID0gJyc7XHJcbiAgICAgICAgbGV0IHJvbGVWYWx1ZTogJ2RtJyB8ICdwbGF5ZXInID0gJ3BsYXllcic7XHJcbiAgICAgICAgbGV0IHNlc3Npb25JZFZhbHVlID0gJyc7XHJcblxyXG4gICAgICAgIG5ldyBTZXR0aW5nKGNvbnRlbnRFbClcclxuICAgICAgICAgICAgLnNldE5hbWUoJ1VzZXJuYW1lJylcclxuICAgICAgICAgICAgLnNldERlc2MoJ1lvdXIgZGlzcGxheSBuYW1lIGluIHRoZSBjaGF0JylcclxuICAgICAgICAgICAgLmFkZFRleHQodGV4dCA9PiB0ZXh0XHJcbiAgICAgICAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoJ0VudGVyIHlvdXIgdXNlcm5hbWUnKVxyXG4gICAgICAgICAgICAgICAgLm9uQ2hhbmdlKCh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHVzZXJuYW1lVmFsdWUgPSB2YWx1ZTtcclxuICAgICAgICAgICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgbmV3IFNldHRpbmcoY29udGVudEVsKVxyXG4gICAgICAgICAgICAuc2V0TmFtZSgnUm9sZScpXHJcbiAgICAgICAgICAgIC5zZXREZXNjKCdZb3VyIHJvbGUgaW4gdGhlIGdhbWUgc2Vzc2lvbicpXHJcbiAgICAgICAgICAgIC5hZGREcm9wZG93bihkcm9wZG93biA9PiBkcm9wZG93blxyXG4gICAgICAgICAgICAgICAgLmFkZE9wdGlvbigncGxheWVyJywgJ1BsYXllcicpXHJcbiAgICAgICAgICAgICAgICAuYWRkT3B0aW9uKCdkbScsICdHYW1lIE1hc3RlciAvIERNJylcclxuICAgICAgICAgICAgICAgIC5zZXRWYWx1ZSgncGxheWVyJylcclxuICAgICAgICAgICAgICAgIC5vbkNoYW5nZSgodmFsdWU6ICdkbScgfCAncGxheWVyJykgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHJvbGVWYWx1ZSA9IHZhbHVlO1xyXG4gICAgICAgICAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICBuZXcgU2V0dGluZyhjb250ZW50RWwpXHJcbiAgICAgICAgICAgIC5zZXROYW1lKCdTZXNzaW9uIElEJylcclxuICAgICAgICAgICAgLnNldERlc2MoJ1Nlc3Npb24vUm9vbSBJRCB0byBqb2luIChsZWF2ZSBlbXB0eSBmb3IgZGVmYXVsdCByb29tKScpXHJcbiAgICAgICAgICAgIC5hZGRUZXh0KHRleHQgPT4gdGV4dFxyXG4gICAgICAgICAgICAgICAgLnNldFBsYWNlaG9sZGVyKCdFbnRlciBzZXNzaW9uIElEIChvcHRpb25hbCknKVxyXG4gICAgICAgICAgICAgICAgLm9uQ2hhbmdlKCh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHNlc3Npb25JZFZhbHVlID0gdmFsdWU7XHJcbiAgICAgICAgICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIGNvbnN0IGJ1dHRvbkNvbnRhaW5lciA9IGNvbnRlbnRFbC5jcmVhdGVEaXYoeyBjbHM6ICdkaWNlLWNoYXQtYnV0dG9ucycgfSk7XHJcbiAgICAgICAgYnV0dG9uQ29udGFpbmVyLnN0eWxlLmNzc1RleHQgPSAnbWFyZ2luLXRvcDogMjBweDsgdGV4dC1hbGlnbjogY2VudGVyOyc7XHJcblxyXG4gICAgICAgIGNvbnN0IGpvaW5CdXR0b24gPSBidXR0b25Db250YWluZXIuY3JlYXRlRWwoJ2J1dHRvbicsIHtcclxuICAgICAgICAgICAgdGV4dDogJ0pvaW4gQ2hhdCcsXHJcbiAgICAgICAgICAgIGNsczogJ21vZC1jdGEnXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgam9pbkJ1dHRvbi5zdHlsZS5jc3NUZXh0ID0gJ21hcmdpbi1yaWdodDogMTBweDsgcGFkZGluZzogMTBweCAyMHB4Oyc7XHJcblxyXG4gICAgICAgIGNvbnN0IGNhbmNlbEJ1dHRvbiA9IGJ1dHRvbkNvbnRhaW5lci5jcmVhdGVFbCgnYnV0dG9uJywge1xyXG4gICAgICAgICAgICB0ZXh0OiAnQ2FuY2VsJyxcclxuICAgICAgICB9KTtcclxuICAgICAgICBjYW5jZWxCdXR0b24uc3R5bGUuY3NzVGV4dCA9ICdwYWRkaW5nOiAxMHB4IDIwcHg7JztcclxuXHJcbiAgICAgICAgam9pbkJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGFzeW5jICgpID0+IHtcclxuICAgICAgICAgICAgaWYgKCF1c2VybmFtZVZhbHVlLnRyaW0oKSkge1xyXG4gICAgICAgICAgICAgICAgbmV3IE5vdGljZSgnUGxlYXNlIGVudGVyIGEgdXNlcm5hbWUnKTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgIGpvaW5CdXR0b24uZGlzYWJsZWQgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgam9pbkJ1dHRvbi50ZXh0Q29udGVudCA9ICdDb25uZWN0aW5nLi4uJztcclxuXHJcbiAgICAgICAgICAgICAgICB0aGlzLnVzZXJuYW1lID0gdXNlcm5hbWVWYWx1ZTtcclxuICAgICAgICAgICAgICAgIHRoaXMudXNlclJvbGUgPSByb2xlVmFsdWU7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmFwaUNsaWVudC5zZXRVc2VySW5mbyh0aGlzLnVzZXJuYW1lLCB0aGlzLnVzZXJSb2xlKTtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBTZXQgc2Vzc2lvbiBJRCBpZiBwcm92aWRlZFxyXG4gICAgICAgICAgICAgICAgaWYgKHNlc3Npb25JZFZhbHVlLnRyaW0oKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYXBpQ2xpZW50LnNldFJvb21JZChzZXNzaW9uSWRWYWx1ZS50cmltKCkpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIC8vIENoZWNrIGlmIHNlcnZlciBpcyBhdmFpbGFibGVcclxuICAgICAgICAgICAgICAgIGNvbnN0IGlzSGVhbHRoeSA9IGF3YWl0IHRoaXMuYXBpQ2xpZW50LmNoZWNrSGVhbHRoKCk7XHJcbiAgICAgICAgICAgICAgICBpZiAoIWlzSGVhbHRoeSkge1xyXG4gICAgICAgICAgICAgICAgICAgIG5ldyBOb3RpY2UoJ0Nhbm5vdCBjb25uZWN0IHRvIGRpY2UgQVBJIHNlcnZlci4gQ2hlY2sgeW91ciBlbmRwb2ludCBzZXR0aW5ncy4nKTtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5hcGlDbGllbnQuam9pblJvb20oKTtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMuc2V0dXBDaGF0SW50ZXJmYWNlKCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnN0YXJ0UG9sbGluZygpO1xyXG5cclxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBqb2luIGNoYXQ6JywgZXJyb3IpO1xyXG4gICAgICAgICAgICAgICAgbmV3IE5vdGljZSgnRmFpbGVkIHRvIGNvbm5lY3QgdG8gY2hhdC4gQ2hlY2sgeW91ciBBUEkgZW5kcG9pbnQuJyk7XHJcbiAgICAgICAgICAgIH0gZmluYWxseSB7XHJcbiAgICAgICAgICAgICAgICBqb2luQnV0dG9uLmRpc2FibGVkID0gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICBqb2luQnV0dG9uLnRleHRDb250ZW50ID0gJ0pvaW4gQ2hhdCc7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgY2FuY2VsQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLmNsb3NlKCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhc3luYyBzZXR1cENoYXRJbnRlcmZhY2UoKSB7XHJcbiAgICAgICAgY29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XHJcbiAgICAgICAgY29udGVudEVsLmVtcHR5KCk7XHJcblxyXG4gICAgICAgIC8vIEhlYWRlclxyXG4gICAgICAgIGNvbnN0IGhlYWRlciA9IGNvbnRlbnRFbC5jcmVhdGVEaXYoeyBjbHM6ICdkaWNlLWNoYXQtaGVhZGVyJyB9KTtcclxuICAgICAgICBoZWFkZXIuc3R5bGUuY3NzVGV4dCA9ICdkaXNwbGF5OiBmbGV4OyBqdXN0aWZ5LWNvbnRlbnQ6IHNwYWNlLWJldHdlZW47IGFsaWduLWl0ZW1zOiBjZW50ZXI7IHBhZGRpbmc6IDEwcHg7IGJvcmRlci1ib3R0b206IDFweCBzb2xpZCB2YXIoLS1iYWNrZ3JvdW5kLW1vZGlmaWVyLWJvcmRlcik7IG1hcmdpbi1ib3R0b206IDEwcHg7JztcclxuXHJcbiAgICAgICAgY29uc3QgdGl0bGVEaXYgPSBoZWFkZXIuY3JlYXRlRGl2KCk7XHJcbiAgICAgICAgdGl0bGVEaXYuY3JlYXRlRWwoJ2gzJywgeyB0ZXh0OiAnRGljZSBDaGF0JyB9KTtcclxuICAgICAgICBjb25zdCB1c2VySW5mb0RpdiA9IHRpdGxlRGl2LmNyZWF0ZURpdih7IGNsczogJ2RpY2UtY2hhdC11c2VyLWluZm8nIH0pO1xyXG4gICAgICAgIHVzZXJJbmZvRGl2LnN0eWxlLmNzc1RleHQgPSAnZm9udC1zaXplOiAxMnB4OyBjb2xvcjogdmFyKC0tdGV4dC1tdXRlZCk7IGxpbmUtaGVpZ2h0OiAxLjI7JztcclxuXHJcbiAgICAgICAgdXNlckluZm9EaXYuY3JlYXRlRWwoJ2RpdicsIHsgdGV4dDogYCR7dGhpcy51c2VybmFtZX0gKCR7dGhpcy51c2VyUm9sZS50b1VwcGVyQ2FzZSgpfSlgIH0pO1xyXG4gICAgICAgIHVzZXJJbmZvRGl2LmNyZWF0ZUVsKCdkaXYnLCB7XHJcbiAgICAgICAgICAgIHRleHQ6IGBSb29tOiAke3RoaXMuYXBpQ2xpZW50LmdldFJvb21JZCgpfWAsXHJcbiAgICAgICAgICAgIGNsczogJ2RpY2UtY2hhdC1yb29tLWlkJ1xyXG4gICAgICAgIH0pLnN0eWxlLmNzc1RleHQgPSAnZm9udC1mYW1pbHk6IG1vbm9zcGFjZTsgZm9udC1zaXplOiAxMXB4OyBvcGFjaXR5OiAwLjg7JztcclxuXHJcbiAgICAgICAgY29uc3QgY2xvc2VCdXR0b24gPSBoZWFkZXIuY3JlYXRlRWwoJ2J1dHRvbicsIHsgdGV4dDogJ8OXJywgY2xzOiAnZGljZS1jaGF0LWNsb3NlJyB9KTtcclxuICAgICAgICBjbG9zZUJ1dHRvbi5zdHlsZS5jc3NUZXh0ID0gJ2JhY2tncm91bmQ6IG5vbmU7IGJvcmRlcjogbm9uZTsgZm9udC1zaXplOiAyMHB4OyBjdXJzb3I6IHBvaW50ZXI7IHBhZGRpbmc6IDVweDsnO1xyXG4gICAgICAgIGNsb3NlQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gdGhpcy5jbG9zZSgpKTtcclxuXHJcbiAgICAgICAgLy8gTWFpbiBjb250ZW50IGNvbnRhaW5lclxyXG4gICAgICAgIGNvbnN0IG1haW5Db250YWluZXIgPSBjb250ZW50RWwuY3JlYXRlRGl2KHsgY2xzOiAnZGljZS1jaGF0LW1haW4nIH0pO1xyXG4gICAgICAgIG1haW5Db250YWluZXIuc3R5bGUuY3NzVGV4dCA9ICdkaXNwbGF5OiBmbGV4OyBoZWlnaHQ6IGNhbGMoMTAwJSAtIDgwcHgpOyBnYXA6IDEwcHg7JztcclxuXHJcbiAgICAgICAgLy8gQ2hhdCBzZWN0aW9uIChsZWZ0IHNpZGUpXHJcbiAgICAgICAgY29uc3QgY2hhdFNlY3Rpb24gPSBtYWluQ29udGFpbmVyLmNyZWF0ZURpdih7IGNsczogJ2RpY2UtY2hhdC1zZWN0aW9uJyB9KTtcclxuICAgICAgICBjaGF0U2VjdGlvbi5zdHlsZS5jc3NUZXh0ID0gJ2ZsZXg6IDE7IGRpc3BsYXk6IGZsZXg7IGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47IGJvcmRlci1yaWdodDogMXB4IHNvbGlkIHZhcigtLWJhY2tncm91bmQtbW9kaWZpZXItYm9yZGVyKTsgcGFkZGluZy1yaWdodDogMTBweDsnO1xyXG5cclxuICAgICAgICAvLyBDaGF0IG1lc3NhZ2VzIGNvbnRhaW5lclxyXG4gICAgICAgIHRoaXMuY2hhdENvbnRhaW5lciA9IGNoYXRTZWN0aW9uLmNyZWF0ZURpdih7IGNsczogJ2RpY2UtY2hhdC1tZXNzYWdlcycgfSk7XHJcbiAgICAgICAgdGhpcy5jaGF0Q29udGFpbmVyLnN0eWxlLmNzc1RleHQgPSAnZmxleDogMTsgb3ZlcmZsb3cteTogYXV0bzsgYm9yZGVyOiAxcHggc29saWQgdmFyKC0tYmFja2dyb3VuZC1tb2RpZmllci1ib3JkZXIpOyBwYWRkaW5nOiAxMHB4OyBtYXJnaW4tYm90dG9tOiAxMHB4OyBtYXgtaGVpZ2h0OiA0MDBweDsnO1xyXG5cclxuICAgICAgICAvLyBNZXNzYWdlIGlucHV0XHJcbiAgICAgICAgY29uc3QgaW5wdXRDb250YWluZXIgPSBjaGF0U2VjdGlvbi5jcmVhdGVEaXYoeyBjbHM6ICdkaWNlLWNoYXQtaW5wdXQtY29udGFpbmVyJyB9KTtcclxuICAgICAgICBpbnB1dENvbnRhaW5lci5zdHlsZS5jc3NUZXh0ID0gJ2Rpc3BsYXk6IGZsZXg7IGdhcDogNXB4Oyc7XHJcblxyXG4gICAgICAgIHRoaXMubWVzc2FnZUlucHV0ID0gaW5wdXRDb250YWluZXIuY3JlYXRlRWwoJ2lucHV0Jywge1xyXG4gICAgICAgICAgICB0eXBlOiAndGV4dCcsXHJcbiAgICAgICAgICAgIHBsYWNlaG9sZGVyOiAnVHlwZSBhIG1lc3NhZ2UuLi4nXHJcbiAgICAgICAgfSkgYXMgSFRNTElucHV0RWxlbWVudDtcclxuICAgICAgICB0aGlzLm1lc3NhZ2VJbnB1dC5zdHlsZS5jc3NUZXh0ID0gJ2ZsZXg6IDE7IHBhZGRpbmc6IDhweDsnO1xyXG5cclxuICAgICAgICBjb25zdCBzZW5kQnV0dG9uID0gaW5wdXRDb250YWluZXIuY3JlYXRlRWwoJ2J1dHRvbicsIHtcclxuICAgICAgICAgICAgdGV4dDogJ1NlbmQnLFxyXG4gICAgICAgICAgICBjbHM6ICdtb2QtY3RhJ1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBEaWNlIHNlbGVjdGlvbiBzZWN0aW9uIChyaWdodCBzaWRlKVxyXG4gICAgICAgIGNvbnN0IGRpY2VTZWN0aW9uID0gbWFpbkNvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6ICdkaWNlLWRpY2Utc2VjdGlvbicgfSk7XHJcbiAgICAgICAgZGljZVNlY3Rpb24uc3R5bGUuY3NzVGV4dCA9ICd3aWR0aDogMzAwcHg7IGRpc3BsYXk6IGZsZXg7IGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47JztcclxuXHJcbiAgICAgICAgZGljZVNlY3Rpb24uY3JlYXRlRWwoJ2g0JywgeyB0ZXh0OiAnRGljZSBTZWxlY3Rpb24nIH0pO1xyXG5cclxuICAgICAgICAvLyBFeHByZXNzaW9uIGRpc3BsYXlcclxuICAgICAgICB0aGlzLmV4cHJlc3Npb25EaXNwbGF5ID0gZGljZVNlY3Rpb24uY3JlYXRlRGl2KHtcclxuICAgICAgICAgICAgdGV4dDogJ05vIGRpY2Ugc2VsZWN0ZWQnLFxyXG4gICAgICAgICAgICBjbHM6ICdkaWNlLWV4cHJlc3Npb24tZGlzcGxheSdcclxuICAgICAgICB9KTtcclxuICAgICAgICB0aGlzLmV4cHJlc3Npb25EaXNwbGF5LnN0eWxlLmNzc1RleHQgPSAncGFkZGluZzogMTBweDsgbWFyZ2luLWJvdHRvbTogMTBweDsgYmFja2dyb3VuZDogdmFyKC0tYmFja2dyb3VuZC1zZWNvbmRhcnkpOyBib3JkZXItcmFkaXVzOiA1cHg7IGZvbnQtZmFtaWx5OiBtb25vc3BhY2U7IHRleHQtYWxpZ246IGNlbnRlcjsgZm9udC13ZWlnaHQ6IGJvbGQ7JztcclxuXHJcbiAgICAgICAgLy8gRGljZSBzZWxlY3Rpb24gZ3JpZFxyXG4gICAgICAgIHRoaXMuZGljZVNlbGVjdGlvbkNvbnRhaW5lciA9IGRpY2VTZWN0aW9uLmNyZWF0ZURpdih7IGNsczogJ2RpY2Utc2VsZWN0aW9uLWdyaWQnIH0pO1xyXG4gICAgICAgIHRoaXMuZGljZVNlbGVjdGlvbkNvbnRhaW5lci5zdHlsZS5jc3NUZXh0ID0gJ2Rpc3BsYXk6IGdyaWQ7IGdyaWQtdGVtcGxhdGUtY29sdW1uczogcmVwZWF0KDIsIDFmcik7IGdhcDogMTBweDsgbWFyZ2luLWJvdHRvbTogMTBweDsnO1xyXG5cclxuICAgICAgICBjb25zdCBkaWNlVHlwZXMgPSBbJ2Q0JywgJ2Q2JywgJ2Q4JywgJ2QxMCcsICdkMTInLCAnZDIwJ107XHJcbiAgICAgICAgZGljZVR5cGVzLmZvckVhY2goZGljZVR5cGUgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBkaWNlQ2FyZCA9IHRoaXMuZGljZVNlbGVjdGlvbkNvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6ICdkaWNlLWNhcmQnIH0pO1xyXG4gICAgICAgICAgICBkaWNlQ2FyZC5zdHlsZS5jc3NUZXh0ID0gJ2JvcmRlcjogMXB4IHNvbGlkIHZhcigtLWJhY2tncm91bmQtbW9kaWZpZXItYm9yZGVyKTsgcGFkZGluZzogMTBweDsgYm9yZGVyLXJhZGl1czogNXB4OyB0ZXh0LWFsaWduOiBjZW50ZXI7JztcclxuXHJcbiAgICAgICAgICAgIGRpY2VDYXJkLmNyZWF0ZUVsKCdkaXYnLCB7IHRleHQ6IGRpY2VUeXBlLnRvVXBwZXJDYXNlKCksIGNsczogJ2RpY2UtdHlwZS1sYWJlbCcgfSk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBjb3VudERpc3BsYXkgPSBkaWNlQ2FyZC5jcmVhdGVFbCgnZGl2Jywge1xyXG4gICAgICAgICAgICAgICAgdGV4dDogJzAnLFxyXG4gICAgICAgICAgICAgICAgY2xzOiAnZGljZS1jb3VudC1kaXNwbGF5J1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgY291bnREaXNwbGF5LnN0eWxlLmNzc1RleHQgPSAnZm9udC1zaXplOiAxOHB4OyBmb250LXdlaWdodDogYm9sZDsgbWFyZ2luOiA1cHggMDsnO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgYnV0dG9uQ29udGFpbmVyID0gZGljZUNhcmQuY3JlYXRlRGl2KHsgY2xzOiAnZGljZS1idXR0b25zJyB9KTtcclxuICAgICAgICAgICAgYnV0dG9uQ29udGFpbmVyLnN0eWxlLmNzc1RleHQgPSAnZGlzcGxheTogZmxleDsgZ2FwOiA1cHg7IGp1c3RpZnktY29udGVudDogY2VudGVyOyc7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBtaW51c0J1dHRvbiA9IGJ1dHRvbkNvbnRhaW5lci5jcmVhdGVFbCgnYnV0dG9uJywgeyB0ZXh0OiAnLScgfSk7XHJcbiAgICAgICAgICAgIGNvbnN0IHBsdXNCdXR0b24gPSBidXR0b25Db250YWluZXIuY3JlYXRlRWwoJ2J1dHRvbicsIHsgdGV4dDogJysnIH0pO1xyXG5cclxuICAgICAgICAgICAgW21pbnVzQnV0dG9uLCBwbHVzQnV0dG9uXS5mb3JFYWNoKGJ0biA9PiB7XHJcbiAgICAgICAgICAgICAgICBidG4uc3R5bGUuY3NzVGV4dCA9ICd3aWR0aDogMzBweDsgaGVpZ2h0OiAzMHB4OyBib3JkZXItcmFkaXVzOiA1MCU7IGZvbnQtd2VpZ2h0OiBib2xkOyc7XHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgbWludXNCdXR0b24uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5kaWNlQ291bnRzW2RpY2VUeXBlXSA+IDApIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmRpY2VDb3VudHNbZGljZVR5cGVdLS07XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy51cGRhdGVEaWNlRGlzcGxheSgpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIHBsdXNCdXR0b24uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRpY2VDb3VudHNbZGljZVR5cGVdKys7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnVwZGF0ZURpY2VEaXNwbGF5KCk7XHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgLy8gU3RvcmUgcmVmZXJlbmNlcyBmb3IgdXBkYXRpbmdcclxuICAgICAgICAgICAgKGRpY2VDYXJkIGFzIGFueSkuY291bnREaXNwbGF5ID0gY291bnREaXNwbGF5O1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBNb2RpZmllciBpbnB1dFxyXG4gICAgICAgIGNvbnN0IG1vZGlmaWVyQ29udGFpbmVyID0gZGljZVNlY3Rpb24uY3JlYXRlRGl2KHsgY2xzOiAnZGljZS1tb2RpZmllcicgfSk7XHJcbiAgICAgICAgbW9kaWZpZXJDb250YWluZXIuc3R5bGUuY3NzVGV4dCA9ICdkaXNwbGF5OiBmbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBnYXA6IDEwcHg7IG1hcmdpbi1ib3R0b206IDEwcHg7JztcclxuXHJcbiAgICAgICAgbW9kaWZpZXJDb250YWluZXIuY3JlYXRlRWwoJ2xhYmVsJywgeyB0ZXh0OiAnTW9kaWZpZXI6JyB9KTtcclxuICAgICAgICBjb25zdCBtb2RpZmllcklucHV0ID0gbW9kaWZpZXJDb250YWluZXIuY3JlYXRlRWwoJ2lucHV0Jywge1xyXG4gICAgICAgICAgICB0eXBlOiAnbnVtYmVyJyxcclxuICAgICAgICAgICAgdmFsdWU6ICcwJ1xyXG4gICAgICAgIH0pIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XHJcbiAgICAgICAgbW9kaWZpZXJJbnB1dC5zdHlsZS5jc3NUZXh0ID0gJ3dpZHRoOiA4MHB4OyBwYWRkaW5nOiA1cHg7JztcclxuICAgICAgICBtb2RpZmllcklucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0JywgKCkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLm1vZGlmaWVyID0gcGFyc2VJbnQobW9kaWZpZXJJbnB1dC52YWx1ZSkgfHwgMDtcclxuICAgICAgICAgICAgdGhpcy51cGRhdGVEaWNlRGlzcGxheSgpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBBY3Rpb24gYnV0dG9uc1xyXG4gICAgICAgIGNvbnN0IGFjdGlvbkJ1dHRvbnMgPSBkaWNlU2VjdGlvbi5jcmVhdGVEaXYoeyBjbHM6ICdkaWNlLWFjdGlvbnMnIH0pO1xyXG4gICAgICAgIGFjdGlvbkJ1dHRvbnMuc3R5bGUuY3NzVGV4dCA9ICdkaXNwbGF5OiBmbGV4OyBmbGV4LWRpcmVjdGlvbjogY29sdW1uOyBnYXA6IDEwcHg7JztcclxuXHJcbiAgICAgICAgLy8gUm9sbCBidXR0b25cclxuICAgICAgICB0aGlzLnJvbGxCdXR0b24gPSBhY3Rpb25CdXR0b25zLmNyZWF0ZUVsKCdidXR0b24nLCB7XHJcbiAgICAgICAgICAgIHRleHQ6ICdSb2xsIERpY2UnLFxyXG4gICAgICAgICAgICBjbHM6ICdtb2QtY3RhIGRpY2Utcm9sbC1idXR0b24nXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgdGhpcy5yb2xsQnV0dG9uLmRpc2FibGVkID0gdHJ1ZTtcclxuXHJcbiAgICAgICAgLy8gUmVxdWVzdCBkaWNlIGJ1dHRvbiAoZm9yIERNKVxyXG4gICAgICAgIGlmICh0aGlzLnVzZXJSb2xlID09PSAnZG0nKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlcXVlc3RCdXR0b24gPSBhY3Rpb25CdXR0b25zLmNyZWF0ZUVsKCdidXR0b24nLCB7XHJcbiAgICAgICAgICAgICAgICB0ZXh0OiAnUmVxdWVzdCBEaWNlIFJvbGwnLFxyXG4gICAgICAgICAgICAgICAgY2xzOiAnZGljZS1yZXF1ZXN0LWJ1dHRvbidcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICByZXF1ZXN0QnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zZW5kRGljZVJlcXVlc3QoKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBDbGVhciBkaWNlIGJ1dHRvblxyXG4gICAgICAgIGNvbnN0IGNsZWFyQnV0dG9uID0gYWN0aW9uQnV0dG9ucy5jcmVhdGVFbCgnYnV0dG9uJywge1xyXG4gICAgICAgICAgICB0ZXh0OiAnQ2xlYXIgRGljZScsXHJcbiAgICAgICAgICAgIGNsczogJ2RpY2UtY2xlYXItYnV0dG9uJ1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBFdmVudCBsaXN0ZW5lcnNcclxuICAgICAgICB0aGlzLnJvbGxCdXR0b24uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMucm9sbERpY2UoKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgY2xlYXJCdXR0b24uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMuY2xlYXJEaWNlKCk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHNlbmRCdXR0b24uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMuc2VuZENoYXRNZXNzYWdlKCk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHRoaXMubWVzc2FnZUlucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2tleXByZXNzJywgKGUpID0+IHtcclxuICAgICAgICAgICAgaWYgKGUua2V5ID09PSAnRW50ZXInKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnNlbmRDaGF0TWVzc2FnZSgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIExvYWQgaW5pdGlhbCBtZXNzYWdlc1xyXG4gICAgICAgIGF3YWl0IHRoaXMubG9hZE1lc3NhZ2VzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSB1cGRhdGVEaWNlRGlzcGxheSgpIHtcclxuICAgICAgICAvLyBVcGRhdGUgaW5kaXZpZHVhbCBkaWNlIGNvdW50IGRpc3BsYXlzXHJcbiAgICAgICAgY29uc3QgZGljZUNhcmRzID0gdGhpcy5kaWNlU2VsZWN0aW9uQ29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJy5kaWNlLWNhcmQnKTtcclxuICAgICAgICBjb25zdCBkaWNlVHlwZXMgPSBbJ2Q0JywgJ2Q2JywgJ2Q4JywgJ2QxMCcsICdkMTInLCAnZDIwJ107XHJcblxyXG4gICAgICAgIGRpY2VDYXJkcy5mb3JFYWNoKChjYXJkLCBpbmRleCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBkaWNlVHlwZSA9IGRpY2VUeXBlc1tpbmRleF07XHJcbiAgICAgICAgICAgIGNvbnN0IGNvdW50RGlzcGxheSA9IChjYXJkIGFzIGFueSkuY291bnREaXNwbGF5O1xyXG4gICAgICAgICAgICBpZiAoY291bnREaXNwbGF5KSB7XHJcbiAgICAgICAgICAgICAgICBjb3VudERpc3BsYXkudGV4dENvbnRlbnQgPSB0aGlzLmRpY2VDb3VudHNbZGljZVR5cGVdLnRvU3RyaW5nKCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gQnVpbGQgZXhwcmVzc2lvbiBzdHJpbmdcclxuICAgICAgICBjb25zdCBkaWNlUGFydHM6IHN0cmluZ1tdID0gW107XHJcbiAgICAgICAgZGljZVR5cGVzLmZvckVhY2goZGljZVR5cGUgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBjb3VudCA9IHRoaXMuZGljZUNvdW50c1tkaWNlVHlwZV07XHJcbiAgICAgICAgICAgIGlmIChjb3VudCA+IDApIHtcclxuICAgICAgICAgICAgICAgIGRpY2VQYXJ0cy5wdXNoKGNvdW50ID09PSAxID8gZGljZVR5cGUgOiBgJHtjb3VudH0ke2RpY2VUeXBlfWApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGxldCBleHByZXNzaW9uID0gZGljZVBhcnRzLmpvaW4oJyArICcpIHx8ICcnO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5tb2RpZmllciAhPT0gMCkge1xyXG4gICAgICAgICAgICBjb25zdCBtb2RpZmllclRleHQgPSB0aGlzLm1vZGlmaWVyID4gMCA/IGArJHt0aGlzLm1vZGlmaWVyfWAgOiBgJHt0aGlzLm1vZGlmaWVyfWA7XHJcbiAgICAgICAgICAgIGV4cHJlc3Npb24gPSBleHByZXNzaW9uID8gYCR7ZXhwcmVzc2lvbn0gJHttb2RpZmllclRleHR9YCA6IG1vZGlmaWVyVGV4dDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuZGljZUV4cHJlc3Npb24gPSBleHByZXNzaW9uO1xyXG4gICAgICAgIHRoaXMuZXhwcmVzc2lvbkRpc3BsYXkudGV4dENvbnRlbnQgPSBleHByZXNzaW9uIHx8ICdObyBkaWNlIHNlbGVjdGVkJztcclxuXHJcbiAgICAgICAgLy8gRW5hYmxlL2Rpc2FibGUgcm9sbCBidXR0b25cclxuICAgICAgICBjb25zdCBoYXNEaWNlID0gZGljZVR5cGVzLnNvbWUodHlwZSA9PiB0aGlzLmRpY2VDb3VudHNbdHlwZV0gPiAwKTtcclxuICAgICAgICB0aGlzLnJvbGxCdXR0b24uZGlzYWJsZWQgPSAhaGFzRGljZSAmJiB0aGlzLm1vZGlmaWVyID09PSAwO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgY2xlYXJEaWNlKCkge1xyXG4gICAgICAgIE9iamVjdC5rZXlzKHRoaXMuZGljZUNvdW50cykuZm9yRWFjaChrZXkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLmRpY2VDb3VudHNba2V5XSA9IDA7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgdGhpcy5tb2RpZmllciA9IDA7XHJcblxyXG4gICAgICAgIC8vIFJlc2V0IG1vZGlmaWVyIGlucHV0XHJcbiAgICAgICAgY29uc3QgbW9kaWZpZXJJbnB1dCA9IHRoaXMuY29udGVudEVsLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0W3R5cGU9XCJudW1iZXJcIl0nKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xyXG4gICAgICAgIGlmIChtb2RpZmllcklucHV0KSB7XHJcbiAgICAgICAgICAgIG1vZGlmaWVySW5wdXQudmFsdWUgPSAnMCc7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLnVwZGF0ZURpY2VEaXNwbGF5KCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhc3luYyBzZW5kQ2hhdE1lc3NhZ2UoKSB7XHJcbiAgICAgICAgY29uc3QgbWVzc2FnZSA9IHRoaXMubWVzc2FnZUlucHV0LnZhbHVlLnRyaW0oKTtcclxuICAgICAgICBpZiAoIW1lc3NhZ2UpIHJldHVybjtcclxuXHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgdGhpcy5tZXNzYWdlSW5wdXQuZGlzYWJsZWQgPSB0cnVlO1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLmFwaUNsaWVudC5zZW5kTWVzc2FnZShtZXNzYWdlKTtcclxuICAgICAgICAgICAgdGhpcy5tZXNzYWdlSW5wdXQudmFsdWUgPSAnJztcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5sb2FkTWVzc2FnZXMoKTsgLy8gUmVmcmVzaCBtZXNzYWdlc1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBzZW5kIG1lc3NhZ2U6JywgZXJyb3IpO1xyXG4gICAgICAgICAgICBuZXcgTm90aWNlKCdGYWlsZWQgdG8gc2VuZCBtZXNzYWdlJyk7XHJcbiAgICAgICAgfSBmaW5hbGx5IHtcclxuICAgICAgICAgICAgdGhpcy5tZXNzYWdlSW5wdXQuZGlzYWJsZWQgPSBmYWxzZTtcclxuICAgICAgICAgICAgdGhpcy5tZXNzYWdlSW5wdXQuZm9jdXMoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhc3luYyBzZW5kRGljZVJlcXVlc3QoKSB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmRpY2VFeHByZXNzaW9uKSB7XHJcbiAgICAgICAgICAgIG5ldyBOb3RpY2UoJ1BsZWFzZSBzZWxlY3QgZGljZSBmaXJzdCcpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLmFwaUNsaWVudC5zZW5kRGljZVJlcXVlc3QodGhpcy5kaWNlRXhwcmVzc2lvbiwgYFJvbGwgJHt0aGlzLmRpY2VFeHByZXNzaW9ufSBmb3IgdGhlIGdhbWVgKTtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5sb2FkTWVzc2FnZXMoKTtcclxuICAgICAgICAgICAgbmV3IE5vdGljZSgnRGljZSByZXF1ZXN0IHNlbnQhJyk7XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIHNlbmQgZGljZSByZXF1ZXN0OicsIGVycm9yKTtcclxuICAgICAgICAgICAgbmV3IE5vdGljZSgnRmFpbGVkIHRvIHNlbmQgZGljZSByZXF1ZXN0Jyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYXN5bmMgcm9sbERpY2UoKSB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmRpY2VFeHByZXNzaW9uKSB7XHJcbiAgICAgICAgICAgIG5ldyBOb3RpY2UoJ1BsZWFzZSBzZWxlY3QgZGljZSBmaXJzdCcpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICB0aGlzLnJvbGxCdXR0b24uZGlzYWJsZWQgPSB0cnVlO1xyXG4gICAgICAgICAgICB0aGlzLnJvbGxCdXR0b24udGV4dENvbnRlbnQgPSAnUm9sbGluZy4uLic7XHJcblxyXG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmFwaUNsaWVudC5yb2xsRGljZSh7XHJcbiAgICAgICAgICAgICAgICBleHByZXNzaW9uOiB0aGlzLmRpY2VFeHByZXNzaW9uLFxyXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246IGBEaWNlIHJvbGwgYnkgJHt0aGlzLnVzZXJuYW1lfWBcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLmFwaUNsaWVudC5zZW5kRGljZVJlc3VsdChyZXN1bHQpO1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLmxvYWRNZXNzYWdlcygpO1xyXG5cclxuICAgICAgICAgICAgLy8gU2hvdyBsb2NhbCByZXN1bHQgYXMgd2VsbFxyXG4gICAgICAgICAgICBuZXcgTm90aWNlKGBSb2xsZWQgJHtyZXN1bHQudG90YWx9ICgke3Jlc3VsdC5icmVha2Rvd259KWApO1xyXG5cclxuICAgICAgICAgICAgLy8gQ2xlYXIgZGljZSBhZnRlciByb2xsaW5nXHJcbiAgICAgICAgICAgIHRoaXMuY2xlYXJEaWNlKCk7XHJcblxyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byByb2xsIGRpY2U6JywgZXJyb3IpO1xyXG4gICAgICAgICAgICBuZXcgTm90aWNlKCdGYWlsZWQgdG8gcm9sbCBkaWNlJyk7XHJcbiAgICAgICAgfSBmaW5hbGx5IHtcclxuICAgICAgICAgICAgdGhpcy5yb2xsQnV0dG9uLmRpc2FibGVkID0gZmFsc2U7XHJcbiAgICAgICAgICAgIHRoaXMucm9sbEJ1dHRvbi50ZXh0Q29udGVudCA9ICdSb2xsIERpY2UnO1xyXG4gICAgICAgICAgICB0aGlzLnVwZGF0ZURpY2VEaXNwbGF5KCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYXN5bmMgbG9hZE1lc3NhZ2VzKCkge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5hcGlDbGllbnQuZ2V0TWVzc2FnZXMoNTAsIDApO1xyXG4gICAgICAgICAgICB0aGlzLmRpc3BsYXlNZXNzYWdlcyhyZXNwb25zZS5tZXNzYWdlcyk7XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGxvYWQgbWVzc2FnZXM6JywgZXJyb3IpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRpc3BsYXlNZXNzYWdlcyhtZXNzYWdlczogQ2hhdE1lc3NhZ2VbXSkge1xyXG4gICAgICAgIHRoaXMuY2hhdENvbnRhaW5lci5lbXB0eSgpO1xyXG5cclxuICAgICAgICBtZXNzYWdlcy5mb3JFYWNoKG1lc3NhZ2UgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBtZXNzYWdlRWwgPSB0aGlzLmNoYXRDb250YWluZXIuY3JlYXRlRGl2KHsgY2xzOiAnZGljZS1jaGF0LW1lc3NhZ2UnIH0pO1xyXG5cclxuICAgICAgICAgICAgLy8gQ2hlY2sgaWYgdGhpcyBpcyBhIGRpY2UgcmVxdWVzdFxyXG4gICAgICAgICAgICBjb25zdCBkaWNlUmVxdWVzdCA9IHRoaXMuYXBpQ2xpZW50LnBhcnNlRGljZVJlcXVlc3QobWVzc2FnZS5jb250ZW50KTtcclxuICAgICAgICAgICAgY29uc3QgaXNEaWNlUmVzdWx0ID0gbWVzc2FnZS5jb250ZW50LmluY2x1ZGVzKCfwn46vICoqUm9sbGVkJyk7XHJcblxyXG4gICAgICAgICAgICBpZiAoZGljZVJlcXVlc3QpIHtcclxuICAgICAgICAgICAgICAgIG1lc3NhZ2VFbC5hZGRDbGFzcygnZGljZS1yZXF1ZXN0LW1lc3NhZ2UnKTtcclxuICAgICAgICAgICAgICAgIG1lc3NhZ2VFbC5zdHlsZS5jc3NUZXh0ID0gJ2JvcmRlcjogMnB4IHNvbGlkIHZhcigtLWludGVyYWN0aXZlLWFjY2VudCk7IGN1cnNvcjogcG9pbnRlcjsgcGFkZGluZzogMTBweDsgbWFyZ2luLWJvdHRvbTogMTBweDsgYm9yZGVyLXJhZGl1czogNXB4OyBiYWNrZ3JvdW5kOiB2YXIoLS1iYWNrZ3JvdW5kLXNlY29uZGFyeSk7JztcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBNYWtlIGl0IGNsaWNrYWJsZSBmb3IgcGxheWVyc1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMudXNlclJvbGUgPT09ICdwbGF5ZXInICYmIGRpY2VSZXF1ZXN0LnJlcXVlc3RlciAhPT0gdGhpcy51c2VybmFtZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2VFbC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wb3B1bGF0ZURpY2VGcm9tUmVxdWVzdChkaWNlUmVxdWVzdCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoaXNEaWNlUmVzdWx0KSB7XHJcbiAgICAgICAgICAgICAgICBtZXNzYWdlRWwuYWRkQ2xhc3MoJ2RpY2UtcmVzdWx0LW1lc3NhZ2UnKTtcclxuICAgICAgICAgICAgICAgIG1lc3NhZ2VFbC5zdHlsZS5jc3NUZXh0ID0gJ2JvcmRlci1sZWZ0OiA0cHggc29saWQgdmFyKC0tY29sb3ItZ3JlZW4pOyBwYWRkaW5nOiAxMHB4OyBtYXJnaW4tYm90dG9tOiAxMHB4OyBiYWNrZ3JvdW5kOiB2YXIoLS1iYWNrZ3JvdW5kLXNlY29uZGFyeSk7JztcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIG1lc3NhZ2VFbC5zdHlsZS5jc3NUZXh0ID0gJ3BhZGRpbmc6IDhweDsgbWFyZ2luLWJvdHRvbTogOHB4OyBib3JkZXItYm90dG9tOiAxcHggc29saWQgdmFyKC0tYmFja2dyb3VuZC1tb2RpZmllci1ib3JkZXIpOyc7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIC8vIEhlYWRlciB3aXRoIHVzZXJuYW1lIGFuZCByb2xlXHJcbiAgICAgICAgICAgIGNvbnN0IGhlYWRlciA9IG1lc3NhZ2VFbC5jcmVhdGVEaXYoeyBjbHM6ICdtZXNzYWdlLWhlYWRlcicgfSk7XHJcbiAgICAgICAgICAgIGhlYWRlci5zdHlsZS5jc3NUZXh0ID0gJ2ZvbnQtd2VpZ2h0OiBib2xkOyBtYXJnaW4tYm90dG9tOiA1cHg7IGNvbG9yOiB2YXIoLS10ZXh0LWFjY2VudCk7JztcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHJvbGVDb2xvciA9IG1lc3NhZ2UudXNlcl9yb2xlID09PSAnZG0nID8gJ3ZhcigtLWNvbG9yLW9yYW5nZSknIDogJ3ZhcigtLWNvbG9yLWJsdWUpJztcclxuICAgICAgICAgICAgaGVhZGVyLmlubmVySFRNTCA9IGA8c3BhbiBzdHlsZT1cImNvbG9yOiAke3JvbGVDb2xvcn07XCI+JHttZXNzYWdlLnVzZXJuYW1lfSAoJHttZXNzYWdlLnVzZXJfcm9sZS50b1VwcGVyQ2FzZSgpfSk8L3NwYW4+YDtcclxuXHJcbiAgICAgICAgICAgIC8vIENvbnRlbnRcclxuICAgICAgICAgICAgY29uc3QgY29udGVudEVsID0gbWVzc2FnZUVsLmNyZWF0ZURpdih7IGNsczogJ21lc3NhZ2UtY29udGVudCcgfSk7XHJcbiAgICAgICAgICAgIGNvbnRlbnRFbC5pbm5lckhUTUwgPSBtZXNzYWdlLmNvbnRlbnQucmVwbGFjZSgvXFxuL2csICc8YnI+Jyk7XHJcblxyXG4gICAgICAgICAgICAvLyBUaW1lc3RhbXBcclxuICAgICAgICAgICAgaWYgKG1lc3NhZ2UudGltZXN0YW1wKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCB0aW1lc3RhbXBFbCA9IG1lc3NhZ2VFbC5jcmVhdGVEaXYoeyBjbHM6ICdtZXNzYWdlLXRpbWVzdGFtcCcgfSk7XHJcbiAgICAgICAgICAgICAgICB0aW1lc3RhbXBFbC5zdHlsZS5jc3NUZXh0ID0gJ2ZvbnQtc2l6ZTogMTFweDsgY29sb3I6IHZhcigtLXRleHQtbXV0ZWQpOyBtYXJnaW4tdG9wOiA1cHg7JztcclxuICAgICAgICAgICAgICAgIHRpbWVzdGFtcEVsLnRleHRDb250ZW50ID0gbmV3IERhdGUobWVzc2FnZS50aW1lc3RhbXApLnRvTG9jYWxlVGltZVN0cmluZygpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIFNjcm9sbCB0byBib3R0b21cclxuICAgICAgICB0aGlzLmNoYXRDb250YWluZXIuc2Nyb2xsVG9wID0gdGhpcy5jaGF0Q29udGFpbmVyLnNjcm9sbEhlaWdodDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHBvcHVsYXRlRGljZUZyb21SZXF1ZXN0KHJlcXVlc3Q6IERpY2VSZXF1ZXN0KSB7XHJcbiAgICAgICAgLy8gUGFyc2UgdGhlIGRpY2UgZXhwcmVzc2lvbiBhbmQgcG9wdWxhdGUgdGhlIGRpY2Ugc2VsZWN0aW9uXHJcbiAgICAgICAgdGhpcy5jbGVhckRpY2UoKTtcclxuXHJcbiAgICAgICAgY29uc3QgZXhwcmVzc2lvbiA9IHJlcXVlc3QuZXhwcmVzc2lvbjtcclxuXHJcbiAgICAgICAgLy8gU2ltcGxlIHBhcnNlciBmb3IgZXhwcmVzc2lvbnMgbGlrZSBcIjJkNisxZDIwKzNcIlxyXG4gICAgICAgIGNvbnN0IGRpY2VNYXRjaGVzID0gZXhwcmVzc2lvbi5tYXRjaCgvKFxcZCspP2QoXFxkKykvZyk7XHJcbiAgICAgICAgY29uc3QgbW9kaWZpZXJNYXRjaCA9IGV4cHJlc3Npb24ubWF0Y2goLyhbKy1dXFxkKykoPyFbZFxcZF0pLyk7XHJcblxyXG4gICAgICAgIGlmIChkaWNlTWF0Y2hlcykge1xyXG4gICAgICAgICAgICBkaWNlTWF0Y2hlcy5mb3JFYWNoKG1hdGNoID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGRpY2VNYXRjaCA9IG1hdGNoLm1hdGNoKC8oXFxkKyk/ZChcXGQrKS8pO1xyXG4gICAgICAgICAgICAgICAgaWYgKGRpY2VNYXRjaCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvdW50ID0gcGFyc2VJbnQoZGljZU1hdGNoWzFdKSB8fCAxO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHNpZGVzID0gZGljZU1hdGNoWzJdO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGRpY2VUeXBlID0gYGQke3NpZGVzfWA7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmRpY2VDb3VudHMuaGFzT3duUHJvcGVydHkoZGljZVR5cGUpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGljZUNvdW50c1tkaWNlVHlwZV0gKz0gY291bnQ7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChtb2RpZmllck1hdGNoKSB7XHJcbiAgICAgICAgICAgIHRoaXMubW9kaWZpZXIgPSBwYXJzZUludChtb2RpZmllck1hdGNoWzFdKTtcclxuICAgICAgICAgICAgY29uc3QgbW9kaWZpZXJJbnB1dCA9IHRoaXMuY29udGVudEVsLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0W3R5cGU9XCJudW1iZXJcIl0nKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xyXG4gICAgICAgICAgICBpZiAobW9kaWZpZXJJbnB1dCkge1xyXG4gICAgICAgICAgICAgICAgbW9kaWZpZXJJbnB1dC52YWx1ZSA9IHRoaXMubW9kaWZpZXIudG9TdHJpbmcoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy51cGRhdGVEaWNlRGlzcGxheSgpO1xyXG4gICAgICAgIG5ldyBOb3RpY2UoYERpY2UgbG9hZGVkIGZyb20gcmVxdWVzdDogJHtyZXF1ZXN0LmV4cHJlc3Npb259YCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzdGFydFBvbGxpbmcoKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuaXNQb2xsaW5nKSByZXR1cm47XHJcblxyXG4gICAgICAgIHRoaXMuaXNQb2xsaW5nID0gdHJ1ZTtcclxuICAgICAgICBjb25zdCBwb2xsID0gYXN5bmMgKCkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoIXRoaXMuaXNQb2xsaW5nKSByZXR1cm47XHJcblxyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5sb2FkTWVzc2FnZXMoKTtcclxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ1BvbGxpbmcgZXJyb3I6JywgZXJyb3IpO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICB0aGlzLnBvbGxUaW1lb3V0ID0gc2V0VGltZW91dChwb2xsLCAzMDAwKTsgLy8gUG9sbCBldmVyeSAzIHNlY29uZHNcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICBwb2xsKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzdG9wUG9sbGluZygpIHtcclxuICAgICAgICB0aGlzLmlzUG9sbGluZyA9IGZhbHNlO1xyXG4gICAgICAgIGlmICh0aGlzLnBvbGxUaW1lb3V0KSB7XHJcbiAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aGlzLnBvbGxUaW1lb3V0KTtcclxuICAgICAgICAgICAgdGhpcy5wb2xsVGltZW91dCA9IG51bGw7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIG9uQ2xvc2UoKSB7XHJcbiAgICAgICAgdGhpcy5zdG9wUG9sbGluZygpO1xyXG4gICAgICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xyXG4gICAgICAgIGNvbnRlbnRFbC5lbXB0eSgpO1xyXG4gICAgfVxyXG59Il19