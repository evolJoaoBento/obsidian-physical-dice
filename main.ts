import { Plugin, Notice, WorkspaceLeaf } from 'obsidian';
import { D20Dice } from './d20-dice';
import { DiceSettings, DEFAULT_SETTINGS, DiceSettingTab } from './settings';
import { DiceChatView, CHAT_VIEW_TYPE } from './chat-view';

export default class D20DicePlugin extends Plugin {
    settings: DiceSettings;
    private diceOverlay: HTMLElement | null = null;
    private dice: D20Dice | null = null;
    private isVisible = false;
    private controlsPanel: HTMLElement | null = null;
    private isDraggingControls = false;
    private controlsDragOffset = { x: 0, y: 0 };
    private clickthroughState = true;
    private updateClickthroughCallback: ((enabled: boolean) => void) | null = null;
    private updateRollButtonTextCallback: ((diceType: string) => void) | null = null;
    private updateDiceCountDisplayCallback: (() => void) | null = null;

    // API Integration
    private chatRibbonIcon: HTMLElement | null = null;

    async onload() {
        await this.loadSettings();

        this.addCommand({
            id: 'toggle-dice-roller',
            name: 'Toggle D20 Dice Roller',
            callback: () => {
                this.toggleDiceOverlay();
            }
        });

        this.addCommand({
            id: 'toggle-dice-clickthrough',
            name: 'Toggle Dice Clickthrough Mode',
            callback: () => {
                this.toggleClickthrough();
            }
        });

        this.addRibbonIcon('dice', 'Toggle D20 Dice Roller', (evt: MouseEvent) => {
            this.toggleDiceOverlay();
        });

        // Register chat view
        this.registerView(
            CHAT_VIEW_TYPE,
            (leaf) => new DiceChatView(leaf, this)
        );

        // Initialize API integration
        this.refreshApiIntegration();

        this.addSettingTab(new DiceSettingTab(this.app, this));
    }

    async onunload() {
        this.hideDiceOverlay();
    }

    private toggleDiceOverlay() {
        if (this.isVisible) {
            this.hideDiceOverlay();
        } else {
            this.showDiceOverlay();
        }
    }

    private showDiceOverlay() {
        if (this.diceOverlay) return;

        // Create floating overlay that fills the window
        this.diceOverlay = document.body.createDiv('dice-floating-overlay');

        // Create dice container
        const diceContainer = this.diceOverlay.createDiv('dice-floating-container');

        // Create draggable controls panel
        this.controlsPanel = this.diceOverlay.createDiv('dice-controls-panel');

        // Add drag handle at the top
        const dragHandle = this.controlsPanel.createDiv('dice-controls-drag-handle');
        dragHandle.innerHTML = '⋮⋮⋮';

        // Roll button
        const rollButton = this.controlsPanel.createEl('button', {
            text: 'Roll All Dice',
            cls: 'mod-cta dice-roll-button'
        });

        // Result display
        const resultElement = this.controlsPanel.createDiv({ cls: 'dice-result-overlay' });

        // Dice status display
        const statusElement = this.controlsPanel.createDiv({ cls: 'dice-status-display' });
        statusElement.style.cssText = 'margin: 5px 0; padding: 8px; background: var(--background-primary); border-radius: 4px; font-size: 12px; max-height: 150px; overflow-y: auto;';

        // Reroll caught dice button
        const rerollButton = this.controlsPanel.createEl('button', {
            text: 'Reroll Caught Dice',
            cls: 'dice-reroll-button'
        });
        rerollButton.style.cssText = 'width: 100%; padding: 6px; font-size: 12px; background: var(--color-orange); color: white; border: 1px solid var(--color-orange); border-radius: 4px; margin: 3px 0; display: none;';
        rerollButton.disabled = true;

        // Update roll button text based on dice type
        const updateRollButtonText = (diceType: string) => {
            rollButton.textContent = `Roll All Dice`;
        };
        updateRollButtonText('d20');

        // Dice Management Section
        const diceManagementSection = this.controlsPanel.createDiv();
        diceManagementSection.style.cssText = 'border-top: 1px solid var(--background-modifier-border); margin-top: 5px; padding-top: 5px;';

        const diceCountDisplay = diceManagementSection.createEl('div');
        diceCountDisplay.style.cssText = 'margin-bottom: 8px; font-size: 12px; color: var(--text-muted);';

        const updateDiceCountDisplay = () => {
            const totalDice = Object.values(this.settings.diceCounts).reduce((sum, count) => sum + count, 0);
            const countText = Object.entries(this.settings.diceCounts)
                .filter(([_, count]) => count > 0)
                .map(([type, count]) => `${count}${type}`)
                .join(' + ') || 'No dice';
            diceCountDisplay.textContent = `Total: ${totalDice}/50 dice (${countText})`;
        };
        updateDiceCountDisplay();

        // Dice type buttons grid
        const diceButtonsContainer = diceManagementSection.createDiv();
        diceButtonsContainer.style.cssText = 'display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; margin-bottom: 8px;';

        const diceTypes = [
            { key: 'd4', name: 'D4' },
            { key: 'd6', name: 'D6' },
            { key: 'd8', name: 'D8' },
            { key: 'd10', name: 'D10' },
            { key: 'd12', name: 'D12' },
            { key: 'd20', name: 'D20' }
        ];

        diceTypes.forEach(dice => {
            const button = diceButtonsContainer.createEl('button', { text: `+${dice.name}` });
            button.style.cssText = `
                padding: 6px 4px;
                font-size: 11px;
                border: 1px solid var(--background-modifier-border);
                border-radius: 4px;
                background: var(--background-primary);
                color: var(--text-normal);
                cursor: pointer;
                transition: all 0.2s ease;
            `;

            button.addEventListener('mouseover', () => {
                button.style.background = 'var(--background-modifier-hover)';
            });

            button.addEventListener('mouseout', () => {
                button.style.background = 'var(--background-primary)';
            });

            button.addEventListener('click', async () => {
                const totalDice = Object.values(this.settings.diceCounts).reduce((sum, count) => sum + count, 0);
                if (totalDice >= 50) {
                    button.textContent = 'Max 50!';
                    button.style.background = 'var(--background-modifier-error)';
                    setTimeout(() => {
                        button.textContent = `+${dice.name}`;
                        button.style.background = 'var(--background-primary)';
                    }, 1500);
                    return;
                }

                (this.settings.diceCounts as any)[dice.key]++;
                await this.saveSettings();

                // Create the actual dice in the 3D scene
                if (this.dice) {
                    this.dice.createSingleDice(dice.key);
                }

                updateDiceCountDisplay();
                this.refreshDiceView();
            });
        });

        // Clear all button
        const clearButton = diceManagementSection.createEl('button', { text: 'Clear All Dice' });
        clearButton.style.cssText = `
            width: 100%;
            padding: 6px;
            font-size: 12px;
            border: 1px solid var(--background-modifier-border);
            border-radius: 4px;
            background: var(--background-modifier-error);
            color: white;
            cursor: pointer;
            transition: all 0.2s ease;
        `;

        clearButton.addEventListener('click', async () => {
            Object.keys(this.settings.diceCounts).forEach(key => {
                (this.settings.diceCounts as any)[key] = 0;
            });
            await this.saveSettings();

            // Clear all dice from the 3D scene
            if (this.dice) {
                this.dice.clearAllDice();
            }

            updateDiceCountDisplay();
            this.refreshDiceView();
        });

        // Clickthrough button section
        const clickthroughSection = this.controlsPanel.createDiv();
        clickthroughSection.style.cssText = 'border-top: 1px solid var(--background-modifier-border); margin-top: 5px; padding-top: 5px;';

        const clickthroughButton = clickthroughSection.createEl('button', { text: 'Clickthrough: ON' });
        clickthroughButton.style.cssText = `
            width: 100%;
            padding: 12px;
            font-size: 14px;
            font-weight: bold;
            border: 2px solid var(--interactive-accent);
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s ease;
            background: var(--interactive-accent);
            color: white;
        `;

        const updateClickthrough = (enabled: boolean) => {
            this.clickthroughState = enabled;
            if (this.dice) {
                // Pass the clickthrough state to the dice component
                this.dice.setClickthroughMode(enabled);
            }
            if (enabled) {
                clickthroughButton.textContent = 'Clickthrough: ON';
                clickthroughButton.style.background = 'var(--interactive-accent)';
                clickthroughButton.style.color = 'white';
            } else {
                clickthroughButton.textContent = 'Clickthrough: OFF';
                clickthroughButton.style.background = 'var(--background-primary)';
                clickthroughButton.style.color = 'var(--text-normal)';
            }
        };

        // Store the callbacks for external access
        this.updateClickthroughCallback = updateClickthrough;
        this.updateRollButtonTextCallback = updateRollButtonText;
        this.updateDiceCountDisplayCallback = updateDiceCountDisplay;

        clickthroughButton.addEventListener('click', () => {
            this.toggleClickthrough();
        });

        // Initialize to clickthrough state
        updateClickthrough(true);


        // Close button
        const closeBtn = this.controlsPanel.createEl('button', {
            text: '×',
            cls: 'dice-floating-close-btn'
        });
        closeBtn.addEventListener('click', () => this.hideDiceOverlay());

        // Setup dragging for controls
        this.setupControlsDragging(dragHandle);

        // Position controls panel initially
        this.controlsPanel.style.left = '50px';
        this.controlsPanel.style.top = '100px';

        // Initialize dice with settings
        this.dice = new D20Dice(diceContainer, this.settings);

        // Create any dice that are already in the settings (from dice requests)
        Object.entries(this.settings.diceCounts).forEach(([diceType, count]) => {
            for (let i = 0; i < count; i++) {
                this.dice!.createSingleDice(diceType);
            }
        });

        // Set up calibration callback
        this.dice.onCalibrationChanged = () => {
            this.saveSettings();
        };

        // Set up callback for drag-based rolls (now expects string)
        this.dice.onRollComplete = (result: number | string) => {
            this.showResult(result, resultElement);
            this.handleRollComplete(result);
        };

        // Set up dice status monitoring
        let statusInterval: NodeJS.Timeout | null = null;
        const startStatusMonitoring = () => {
            if (statusInterval) return;
            statusInterval = setInterval(() => {
                if (this.dice) {
                    const status = this.dice.getDiceStatus();
                    this.updateDiceStatusDisplay(status, statusElement, rerollButton);
                }
            }, 500);
        };

        const stopStatusMonitoring = () => {
            if (statusInterval) {
                clearInterval(statusInterval);
                statusInterval = null;
            }
        };

        // Reroll button functionality
        rerollButton.addEventListener('click', () => {
            if (this.dice) {
                const success = this.dice.rerollCaughtDice();
                if (success) {
                    new Notice('Rerolling caught dice...');
                } else {
                    new Notice('No caught dice to reroll');
                }
            }
        });

        // Set up button roll
        rollButton.addEventListener('click', async () => {
            rollButton.disabled = true;
            rollButton.textContent = 'Rolling...';
            resultElement.textContent = '';
            resultElement.className = 'dice-result-overlay';
            statusElement.textContent = 'Starting roll...';

            // Start monitoring dice status during roll
            startStatusMonitoring();

            try {
                const result = await this.dice!.roll();
                this.showResult(result, resultElement);
                this.handleRollComplete(result);
                statusElement.textContent = 'Roll complete!';
                rerollButton.style.display = 'none';

                // Stop monitoring after completion
                setTimeout(() => {
                    stopStatusMonitoring();
                    statusElement.textContent = '';
                }, 3000);
            } catch (error) {
                resultElement.textContent = 'Error rolling dice';
                resultElement.className = 'dice-result-overlay error';
                statusElement.textContent = 'Roll failed';

                // Stop monitoring on error
                setTimeout(() => {
                    stopStatusMonitoring();
                }, 3000);
            } finally {
                rollButton.disabled = false;
                updateRollButtonText('d20');
            }
        });

        this.isVisible = true;

        // Handle window resize with debouncing
        let resizeTimeout: NodeJS.Timeout;
        const resizeHandler = () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                this.updateOverlaySize();
            }, 100);
        };
        window.addEventListener('resize', resizeHandler);

        // Also listen for Obsidian layout changes
        this.app.workspace.on('layout-change', () => {
            setTimeout(() => this.updateOverlaySize(), 100);
        });

        // Initial sizing
        setTimeout(() => this.updateOverlaySize(), 50);
    }

    private setupControlsDragging(dragHandle: HTMLElement) {
        dragHandle.addEventListener('mousedown', (e) => {
            this.isDraggingControls = true;
            const rect = this.controlsPanel!.getBoundingClientRect();
            this.controlsDragOffset.x = e.clientX - rect.left;
            this.controlsDragOffset.y = e.clientY - rect.top;
            dragHandle.style.cursor = 'grabbing';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (this.isDraggingControls && this.controlsPanel) {
                const x = e.clientX - this.controlsDragOffset.x;
                const y = e.clientY - this.controlsDragOffset.y;

                // Keep panel within window bounds
                const maxX = window.innerWidth - this.controlsPanel.offsetWidth;
                const maxY = window.innerHeight - this.controlsPanel.offsetHeight;

                this.controlsPanel.style.left = `${Math.max(0, Math.min(x, maxX))}px`;
                this.controlsPanel.style.top = `${Math.max(44, Math.min(y, maxY))}px`; // 44px for ribbon
            }
        });

        document.addEventListener('mouseup', () => {
            if (this.isDraggingControls) {
                this.isDraggingControls = false;
                if (dragHandle) {
                    dragHandle.style.cursor = 'grab';
                }
            }
        });
    }

    private showResult(result: number | string, resultElement: HTMLElement) {
        const copyableText = typeof result === 'string' ? result : `1${this.settings.diceType}=${result}`;
        resultElement.textContent = copyableText;
        resultElement.className = 'dice-result-overlay show';
        resultElement.title = 'Click to copy result';
        resultElement.style.cursor = 'pointer';

        // Make result clickable to copy
        resultElement.onclick = () => {
            navigator.clipboard.writeText(copyableText).then(() => {
                const originalText = resultElement.textContent;
                resultElement.textContent = 'Copied!';
                setTimeout(() => {
                    resultElement.textContent = originalText;
                }, 1000);
            }).catch(() => {
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = copyableText;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);

                const originalText = resultElement.textContent;
                resultElement.textContent = 'Copied!';
                setTimeout(() => {
                    resultElement.textContent = originalText;
                }, 1000);
            });
        };
    }

    private updateOverlaySize() {
        if (!this.diceOverlay || !this.dice) return;

        const windowHeight = window.innerHeight;
        const windowWidth = window.innerWidth;

        // Calculate available space (below ribbon)
        const ribbonHeight = 44; // Obsidian ribbon height

        const availableHeight = windowHeight - ribbonHeight;
        const availableWidth = windowWidth;

        // Update dice renderer size to fill the window
        this.dice.updateSize(availableWidth, availableHeight);

        // Update overlay to fill entire window except ribbon
        this.diceOverlay.style.width = `${availableWidth}px`;
        this.diceOverlay.style.height = `${availableHeight}px`;
        this.diceOverlay.style.left = '0';
        this.diceOverlay.style.top = `${ribbonHeight}px`;
    }

    private hideDiceOverlay() {
        if (this.diceOverlay) {
            if (this.dice) {
                // Stop all monitoring/animation loops immediately
                this.dice.isViewActive = false;
                // Clear all dice before destroying
                this.dice.clearAllDice();
                this.dice.destroy();
                this.dice = null;
            }
            this.diceOverlay.remove();
            this.diceOverlay = null;
        }

        // Reset dice counts when closing
        Object.keys(this.settings.diceCounts).forEach(key => {
            (this.settings.diceCounts as any)[key] = 0;
        });
        this.saveSettings();

        this.controlsPanel = null;
        this.isDraggingControls = false;
        this.isVisible = false;
        this.updateClickthroughCallback = null;
        this.updateRollButtonTextCallback = null;
        this.updateDiceCountDisplayCallback = null;
        window.removeEventListener('resize', () => this.updateOverlaySize());
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    refreshDiceView() {
        if (this.dice) {
            this.dice.updateSettings(this.settings);
        }

        // Update floating controls if they exist
        if (this.updateRollButtonTextCallback) {
            this.updateRollButtonTextCallback('d20');
        }
    }

    toggleClickthrough() {
        if (this.isVisible && this.updateClickthroughCallback) {
            const newState = !this.clickthroughState;
            this.updateClickthroughCallback(newState);
        }
    }

    refreshApiIntegration() {
        // Remove existing chat ribbon icon if it exists
        if (this.chatRibbonIcon) {
            this.chatRibbonIcon.remove();
            this.chatRibbonIcon = null;
        }

        // Close any open chat views
        this.app.workspace.detachLeavesOfType(CHAT_VIEW_TYPE);

        // Add chat ribbon icon if API is enabled
        if (this.settings.apiEnabled) {
            this.chatRibbonIcon = this.addRibbonIcon('messages-square', 'Open Dice Chat', (evt: MouseEvent) => {
                this.openChatView();
            });
        }
    }

    async openChatView() {
        const existing = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE);
        if (existing.length > 0) {
            // Activate existing chat view
            this.app.workspace.revealLeaf(existing[0]);
            return;
        }

        // Create new chat view in right sidebar
        const leaf = this.app.workspace.getRightLeaf(false);
        await leaf?.setViewState({
            type: CHAT_VIEW_TYPE,
            active: true
        });
    }

    // Method to handle dice requests from API when chat is not open
    handleDiceRequest(expression: string, description: string) {
        // Parse the expression and set up the dice
        this.parseDiceExpression(expression);

        // Show the dice overlay if it's not already visible
        if (!this.isVisible) {
            this.showDiceOverlay();
        }

        // Show a notice about the dice request
        new Notice(`Dice request received: ${expression} - ${description}`);
    }

    private parseDiceExpression(expression: string) {
        // Clear current dice counts and existing dice
        Object.keys(this.settings.diceCounts).forEach(key => {
            (this.settings.diceCounts as any)[key] = 0;
        });

        // Clear existing dice from the scene if dice engine exists
        if (this.dice) {
            this.dice.clearAllDice();
        }

        // Simple parser for expressions like "2d6+1d20+3"
        const diceMatches = expression.match(/(\d+)?d(\d+)/g);

        if (diceMatches) {
            diceMatches.forEach(match => {
                const diceMatch = match.match(/(\d+)?d(\d+)/);
                if (diceMatch) {
                    const count = parseInt(diceMatch[1]) || 1;
                    const sides = diceMatch[2];
                    const diceType = `d${sides}`;

                    if (this.settings.diceCounts.hasOwnProperty(diceType)) {
                        (this.settings.diceCounts as any)[diceType] += count;

                        // Create the actual dice in the 3D scene if dice engine exists
                        if (this.dice) {
                            for (let i = 0; i < count; i++) {
                                this.dice.createSingleDice(diceType);
                            }
                        }
                    }
                }
            });
        }

        this.saveSettings();

        // Update the dice count display if the overlay is open
        if (this.updateDiceCountDisplayCallback) {
            this.updateDiceCountDisplayCallback();
        }

        // Refresh the dice view to show the new dice
        this.refreshDiceView();
    }

    private async handleRollComplete(result: number | string) {
        // Only submit to API if online mode is enabled
        if (!this.settings.apiEnabled) {
            return;
        }

        try {
            // Get the connected chat view to access API client
            const chatViews = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE);
            if (chatViews.length > 0) {
                const chatView = chatViews[0].view as DiceChatView;
                if (chatView && (chatView as any).isConnected) {
                    // Determine the expression from the result
                    let expression = '';
                    if (typeof result === 'string') {
                        // Parse the result string to extract the expression
                        const match = result.match(/^(.+?)=/);
                        if (match) {
                            expression = match[1];
                        } else {
                            expression = result; // Fallback
                        }
                    } else {
                        // Simple number result, assume it's from dice counts
                        const diceParts: string[] = [];
                        Object.entries(this.settings.diceCounts).forEach(([diceType, count]) => {
                            if (count > 0) {
                                diceParts.push(count === 1 ? diceType : `${count}${diceType}`);
                            }
                        });
                        expression = diceParts.join(' + ') || 'd20';
                    }

                    // Create a mock dice roll result for API
                    const diceRollResult = {
                        id: Date.now(),
                        expression: expression,
                        raw_rolls: {},
                        modifiers: [],
                        total: typeof result === 'number' ? result : parseInt(result.split('=').pop() || '0'),
                        is_critical: false,
                        is_fumble: false,
                        breakdown: typeof result === 'string' ? result : `${expression}=${result}`
                    };

                    // Submit to chat via API
                    await (chatView as any).apiClient.sendDiceResult(diceRollResult);

                    // Show confirmation
                    new Notice(`Roll shared in chat: ${diceRollResult.breakdown}`);
                }
            }
        } catch (error) {
            console.error('Failed to submit roll to API:', error);
            new Notice('Failed to share roll in chat');
        }
    }

    private updateDiceStatusDisplay(
        status: Array<{index: number, type: string, status: string, result?: number}>,
        statusElement: HTMLElement,
        rerollButton: HTMLButtonElement
    ) {
        if (status.length === 0) {
            statusElement.textContent = '';
            rerollButton.style.display = 'none';
            return;
        }

        const rolling = status.filter(d => d.status === 'rolling').length;
        const caught = status.filter(d => d.status === 'caught').length;
        const complete = status.filter(d => d.status === 'complete').length;

        let displayText = '';

        if (rolling > 0 || caught > 0 || complete > 0) {
            const parts = [];
            if (rolling > 0) parts.push(`🎲 ${rolling} rolling`);
            if (caught > 0) parts.push(`🥅 ${caught} caught`);
            if (complete > 0) parts.push(`✅ ${complete} done`);

            displayText = parts.join(', ');

            // Show individual dice status
            const diceDetails = status.map(dice => {
                const icon = dice.status === 'complete' ? '✅' :
                           dice.status === 'caught' ? '🥅' :
                           dice.status === 'rolling' ? '🎲' : '❓';
                const result = dice.result ? `=${dice.result}` : '';
                return `${icon} ${dice.type}${result}`;
            }).join(' ');

            displayText += `\n${diceDetails}`;
        }

        statusElement.textContent = displayText;

        // Show/hide reroll button based on caught dice
        if (caught > 0) {
            rerollButton.style.display = 'block';
            rerollButton.disabled = false;
            rerollButton.textContent = `Reroll ${caught} Caught Dice`;
        } else {
            rerollButton.style.display = 'none';
        }
    }
}