import { Plugin, Notice, WorkspaceLeaf, debounce, normalizePath } from 'obsidian';
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

    // Everything the overlay registers, so hideDiceOverlay can undo all of it.
    private overlayCleanups: Array<() => void> = [];
    private statusInterval: number | null = null;

    // The face textures are base64 PNGs and dominate the settings blob. They
    // live in their own file so an ordinary settings change does not rewrite
    // them; this flag says whether that file is known good.
    private texturesInSidecar = false;

    // Settings changes arrive one per slider tick. Coalesce them.
    private readonly queueSave = debounce(() => { void this.writeSettings(); }, 500, true);

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

        // Initialize API integration. Detaching leaves during onload would undo
        // the workspace's own restore, so only the ribbon icon is set up here.
        this.refreshApiIntegration(false);

        this.addSettingTab(new DiceSettingTab(this.app, this));
    }

    async onunload() {
        this.hideDiceOverlay();
        // Write straight through: a queued debounce would never fire.
        this.queueSave.cancel();
        await this.writeSettings();
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
        dragHandle.setText('⋮⋮⋮');

        // Roll button
        const rollButton = this.controlsPanel.createEl('button', {
            text: 'Roll All Dice',
            cls: 'mod-cta dice-roll-button'
        });

        // Result display
        const resultElement = this.controlsPanel.createDiv({ cls: 'dice-result-overlay' });

        // Dice status display
        const statusElement = this.controlsPanel.createDiv({ cls: 'dice-status-display' });

        // Reroll caught dice button
        const rerollButton = this.controlsPanel.createEl('button', {
            text: 'Reroll Caught Dice',
            cls: 'dice-reroll-button'
        });
        rerollButton.hide();
        rerollButton.disabled = true;

        // Update roll button text based on dice type
        const updateRollButtonText = (diceType: string) => {
            rollButton.textContent = `Roll All Dice`;
        };
        updateRollButtonText('d20');

        // Dice Management Section
        const diceManagementSection = this.controlsPanel.createDiv('dice-section');

        const diceCountDisplay = diceManagementSection.createEl('div', { cls: 'dice-count-display' });

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
        const diceButtonsContainer = diceManagementSection.createDiv('dice-type-grid');

        const diceTypes = [
            { key: 'd4', name: 'D4' },
            { key: 'd6', name: 'D6' },
            { key: 'd8', name: 'D8' },
            { key: 'd10', name: 'D10' },
            { key: 'd12', name: 'D12' },
            { key: 'd20', name: 'D20' }
        ];

        diceTypes.forEach(dice => {
            const button = diceButtonsContainer.createEl('button', {
                text: `+${dice.name}`,
                cls: 'dice-type-button'
            });

            button.addEventListener('click', async () => {
                const totalDice = Object.values(this.settings.diceCounts).reduce((sum, count) => sum + count, 0);
                if (totalDice >= 50) {
                    button.textContent = 'Max 50!';
                    button.addClass('is-at-limit');
                    setTimeout(() => {
                        button.textContent = `+${dice.name}`;
                        button.removeClass('is-at-limit');
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
        const clearButton = diceManagementSection.createEl('button', {
            text: 'Clear All Dice',
            cls: 'dice-clear-button'
        });

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
        const clickthroughSection = this.controlsPanel.createDiv('dice-section');

        const clickthroughButton = clickthroughSection.createEl('button', {
            text: 'Clickthrough: ON',
            cls: 'dice-clickthrough-button'
        });

        const updateClickthrough = (enabled: boolean) => {
            this.clickthroughState = enabled;
            if (this.dice) {
                // Pass the clickthrough state to the dice component
                this.dice.setClickthroughMode(enabled);
            }
            clickthroughButton.textContent = enabled ? 'Clickthrough: ON' : 'Clickthrough: OFF';
            clickthroughButton.toggleClass('is-active', enabled);
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

        // Set up dice status monitoring. The handle lives on the plugin so that
        // closing the overlay mid-roll stops the poll.
        const startStatusMonitoring = () => {
            if (this.statusInterval !== null) return;
            this.statusInterval = window.setInterval(() => {
                if (this.dice) {
                    const status = this.dice.getDiceStatus();
                    this.updateDiceStatusDisplay(status, statusElement, rerollButton);
                }
            }, 500);
        };

        const stopStatusMonitoring = () => {
            if (this.statusInterval !== null) {
                window.clearInterval(this.statusInterval);
                this.statusInterval = null;
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
                rerollButton.hide();

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
        const resizeHandler = debounce(() => this.updateOverlaySize(), 100, true);
        window.addEventListener('resize', resizeHandler);
        this.overlayCleanups.push(() => {
            resizeHandler.cancel();
            window.removeEventListener('resize', resizeHandler);
        });

        // Also listen for Obsidian layout changes
        const layoutRef = this.app.workspace.on('layout-change', () => {
            window.setTimeout(() => this.updateOverlaySize(), 100);
        });
        this.overlayCleanups.push(() => this.app.workspace.offref(layoutRef));

        // Dragging a sidebar edge or changing the zoom resizes the workspace
        // without resizing the window, and without firing layout-change either.
        // Watching the element itself is the only thing that catches those.
        const observed = this.overlayRegion().el;
        if (observed && typeof ResizeObserver !== 'undefined') {
            // Same debounce as the window path: a drag fires this per frame,
            // and each call reallocates the renderer's framebuffer.
            const observer = new ResizeObserver(resizeHandler);
            observer.observe(observed);
            this.overlayCleanups.push(() => observer.disconnect());
        }

        // Initial sizing
        window.setTimeout(() => this.updateOverlaySize(), 50);
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

        // These sit on document, so they outlive the overlay unless removed —
        // reopening it used to stack another pair every time.
        const onMove = (e: MouseEvent) => {
            if (this.isDraggingControls && this.controlsPanel) {
                const x = e.clientX - this.controlsDragOffset.x;
                const y = e.clientY - this.controlsDragOffset.y;

                // Keep panel within window bounds
                const maxX = window.innerWidth - this.controlsPanel.offsetWidth;
                const maxY = window.innerHeight - this.controlsPanel.offsetHeight;

                this.controlsPanel.style.left = `${Math.max(0, Math.min(x, maxX))}px`;
                this.controlsPanel.style.top = `${Math.max(44, Math.min(y, maxY))}px`; // 44px for ribbon
            }
        };

        const onUp = () => {
            if (this.isDraggingControls) {
                this.isDraggingControls = false;
                dragHandle.style.cursor = 'grab';
            }
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        this.overlayCleanups.push(() => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        });
    }

    private showResult(result: number | string, resultElement: HTMLElement) {
        const copyableText = typeof result === 'string' ? result : `1${this.settings.diceType}=${result}`;
        resultElement.textContent = copyableText;
        resultElement.className = 'dice-result-overlay show';
        resultElement.title = 'Click to copy result';

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

    /**
     * Where the dice are allowed to be, measured rather than guessed.
     *
     * This used to be the window minus a hardcoded 44px for the header. That
     * number is only right on a desktop Obsidian at 100% zoom with the default
     * frame: the zoom setting scales the header, the hidden-frame and native
     * -titlebar settings change it again, and nothing ever subtracted the
     * status bar, so dice rolled underneath it and vanished.
     *
     * `.workspace` spans exactly the region wanted — below the titlebar and tab
     * header, above the status bar, ribbon and sidebars included. The fallback
     * chain keeps this working in the harness, and in any Obsidian that renames
     * things, rather than sizing to nothing.
     */
    private overlayRegion(): { el: HTMLElement | null; rect: DOMRect } {
        let el: HTMLElement | null = null;
        let rect = new DOMRect(0, 0, window.innerWidth, window.innerHeight);

        for (const selector of ['.workspace', '.app-container']) {
            const candidate = document.querySelector(selector) as HTMLElement | null;
            if (!candidate) continue;
            const candidateRect = candidate.getBoundingClientRect();
            if (candidateRect.width <= 0 || candidateRect.height <= 0) continue;
            el = candidate;
            rect = candidateRect;
            break;
        }

        // `.workspace` reaches the top of the window on desktop Obsidian: the
        // titlebar and its tabs are drawn over it rather than above it. Left
        // alone, dice roll across the tab bar and under the window buttons.
        // Measured at 39px here where the old constant guessed 44 — and it is
        // a different number at a different zoom, which is the whole reason
        // this is measured. Clamping rather than subtracting keeps it correct
        // on a build where `.workspace` already starts below the titlebar.
        const titlebar = document.querySelector('.titlebar') as HTMLElement | null;
        if (titlebar) {
            const bar = titlebar.getBoundingClientRect();
            const top = Math.max(rect.top, bar.bottom);
            if (top > rect.top) {
                rect = new DOMRect(rect.left, top, rect.width, rect.bottom - top);
            }
        }

        return { el, rect };
    }

    private updateOverlaySize() {
        if (!this.diceOverlay || !this.dice) return;

        const { rect } = this.overlayRegion();

        // The overlay is position: fixed, so viewport coordinates go in as they
        // come out of getBoundingClientRect().
        this.diceOverlay.style.left = `${rect.left}px`;
        this.diceOverlay.style.top = `${rect.top}px`;
        this.diceOverlay.style.width = `${rect.width}px`;
        this.diceOverlay.style.height = `${rect.height}px`;

        this.dice.updateSize(rect.width, rect.height);
    }

    private hideDiceOverlay() {
        for (const cleanup of this.overlayCleanups) cleanup();
        this.overlayCleanups = [];

        if (this.statusInterval !== null) {
            window.clearInterval(this.statusInterval);
            this.statusInterval = null;
        }

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
    }

    private get texturePath(): string {
        return normalizePath(`${this.manifest.dir}/textures.json`);
    }

    async loadSettings() {
        const stored = (await this.loadData()) ?? {};
        // Object.assign is shallow, so without cloning the nested objects a
        // fresh vault ends up mutating DEFAULT_SETTINGS itself — dice counts and
        // textures are written in place all over the plugin.
        // Shadow-map settings that no longer exist. Dropping them here stops
        // them being carried straight back out to data.json on the next save.
        delete stored.diceCastShadow;
        delete stored.diceReceiveShadow;
        delete stored.surfaceReceiveShadow;

        this.settings = Object.assign({}, DEFAULT_SETTINGS, stored, {
            diceCounts: Object.assign({}, DEFAULT_SETTINGS.diceCounts, stored.diceCounts),
            diceScales: Object.assign({}, DEFAULT_SETTINGS.diceScales, stored.diceScales),
            diceTextures: Object.assign({}, DEFAULT_SETTINGS.diceTextures, stored.diceTextures),
            diceNormalMaps: Object.assign({}, DEFAULT_SETTINGS.diceNormalMaps, stored.diceNormalMaps),
            faceMapping: Object.assign({}, DEFAULT_SETTINGS.faceMapping, stored.faceMapping)
        });

        const sidecar = await this.readTextures();
        if (sidecar) {
            this.texturesInSidecar = true;
            Object.assign(this.settings.diceTextures, sidecar.diceTextures ?? {});
            Object.assign(this.settings.diceNormalMaps, sidecar.diceNormalMaps ?? {});
        } else if (this.hasTextureData()) {
            // First run after the split: move what is already in data.json out.
            await this.saveTextures();
        }
    }

    private hasTextureData(): boolean {
        const all = [
            ...Object.values(this.settings.diceTextures ?? {}),
            ...Object.values(this.settings.diceNormalMaps ?? {})
        ];
        return all.some((value) => typeof value === 'string' && value.length > 0);
    }

    private async readTextures(): Promise<{ diceTextures?: any; diceNormalMaps?: any } | null> {
        try {
            if (!(await this.app.vault.adapter.exists(this.texturePath))) return null;
            return JSON.parse(await this.app.vault.adapter.read(this.texturePath));
        } catch (error) {
            console.error('Dice: could not read textures.json, falling back to data.json', error);
            return null;
        }
    }

    /**
     * Write the face textures to their own file. Only once that has succeeded
     * are they dropped from data.json, so a failure here costs nothing.
     */
    async saveTextures(): Promise<void> {
        try {
            await this.app.vault.adapter.write(this.texturePath, JSON.stringify({
                diceTextures: this.settings.diceTextures,
                diceNormalMaps: this.settings.diceNormalMaps
            }));
            this.texturesInSidecar = await this.app.vault.adapter.exists(this.texturePath);
        } catch (error) {
            console.error('Dice: could not write textures.json, keeping textures in data.json', error);
            this.texturesInSidecar = false;
        }
        await this.writeSettings();
    }

    private async writeSettings(): Promise<void> {
        if (!this.settings) return;
        const payload: Record<string, unknown> = Object.assign({}, this.settings) as unknown as Record<string, unknown>;
        if (this.texturesInSidecar) {
            delete payload.diceTextures;
            delete payload.diceNormalMaps;
        }
        await this.saveData(payload);
    }

    /**
     * Settings changes arrive one per slider tick and the payload used to carry
     * a megabyte of base64, so writes are coalesced. Use saveTextures() when the
     * texture data itself changed.
     */
    async saveSettings() {
        this.queueSave();
    }

    /**
     * Every settings control calls this, and updateSettings() rebuilds the tray
     * and the lights. Dragging one slider used to do that forty times a second;
     * a short trailing debounce is imperceptible and does it once.
     */
    refreshDiceView = debounce(() => {
        if (this.dice) {
            this.dice.updateSettings(this.settings);
        }

        // Update floating controls if they exist
        if (this.updateRollButtonTextCallback) {
            this.updateRollButtonTextCallback('d20');
        }
    }, 100, true);

    toggleClickthrough() {
        if (this.isVisible && this.updateClickthroughCallback) {
            const newState = !this.clickthroughState;
            this.updateClickthroughCallback(newState);
        }
    }

    refreshApiIntegration(closeExistingViews = true) {
        // Remove existing chat ribbon icon if it exists
        if (this.chatRibbonIcon) {
            this.chatRibbonIcon.remove();
            this.chatRibbonIcon = null;
        }

        // Close any open chat views
        if (closeExistingViews) {
            this.app.workspace.detachLeavesOfType(CHAT_VIEW_TYPE);
        }

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
            rerollButton.hide();
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
            rerollButton.show();
            rerollButton.disabled = false;
            rerollButton.textContent = `Reroll ${caught} Caught Dice`;
        } else {
            rerollButton.hide();
        }
    }
}