import { ItemView, WorkspaceLeaf } from 'obsidian';
import { D20Dice } from './d20-dice';
import { DEFAULT_SETTINGS } from './settings';

export const DICE_VIEW_TYPE = 'dice-view';

export class DiceView extends ItemView {
    private dice: D20Dice | null = null;
    private diceContainer: HTMLElement | null = null;
    private resultElement: HTMLElement | null = null;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewType() {
        return DICE_VIEW_TYPE;
    }

    getDisplayText() {
        return 'D20 Dice Roller';
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass('dice-roller-view');

        const headerEl = container.createEl('div', { cls: 'dice-header' });
        headerEl.createEl('h2', { text: '🎲 D20 Dice Roller' });

        // Create main canvas container
        this.diceContainer = container.createEl('div', { cls: 'dice-container-large' });

        // Create overlay controls on top of canvas
        const overlayEl = this.diceContainer.createEl('div', { cls: 'dice-overlay' });

        const controlsEl = overlayEl.createEl('div', { cls: 'dice-controls-overlay' });
        const rollButton = controlsEl.createEl('button', {
            text: 'Roll D20',
            cls: 'mod-cta dice-roll-button'
        });

        this.resultElement = overlayEl.createEl('div', { cls: 'dice-result-overlay' });

        this.dice = new D20Dice(this.diceContainer, DEFAULT_SETTINGS);

        // Set up callback for drag-based rolls
        this.dice.onRollComplete = (result: number) => {
            this.showResult(result);
        };

        rollButton.addEventListener('click', async () => {
            rollButton.disabled = true;
            rollButton.textContent = 'Rolling...';
            this.resultElement.textContent = '';
            this.resultElement.className = 'dice-result';

            try {
                const result = await this.dice!.roll();
                this.showResult(result);
            } catch (error) {
                this.resultElement.textContent = 'Error rolling dice';
                this.resultElement.className = 'dice-result error';
            } finally {
                rollButton.disabled = false;
                rollButton.textContent = 'Roll D20';
            }
        });
    }

    private showResult(result: number | string) {
        const copyableText = typeof result === 'string' ? result : `1d20=${result}`;
        this.resultElement.textContent = copyableText;
        this.resultElement.className = 'dice-result show';
        this.resultElement.title = 'Click to copy result';
        this.resultElement.style.cursor = 'pointer';

        // Make result clickable to copy
        this.resultElement.onclick = () => {
            navigator.clipboard.writeText(copyableText).then(() => {
                const originalText = this.resultElement.textContent;
                this.resultElement.textContent = 'Copied!';
                setTimeout(() => {
                    this.resultElement.textContent = originalText;
                }, 1000);
            }).catch(() => {
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = copyableText;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);

                const originalText = this.resultElement.textContent;
                this.resultElement.textContent = 'Copied!';
                setTimeout(() => {
                    this.resultElement.textContent = originalText;
                }, 1000);
            });
        };
    }

    async onClose() {
        if (this.dice) {
            // Stop any ongoing monitoring before destroying
            this.dice.isViewActive = false;
            this.dice.destroy();
            this.dice = null;
        }
    }
}