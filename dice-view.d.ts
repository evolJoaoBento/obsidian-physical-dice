import { ItemView, WorkspaceLeaf } from 'obsidian';
export declare const DICE_VIEW_TYPE = "dice-view";
export declare class DiceView extends ItemView {
    private dice;
    private diceContainer;
    private resultElement;
    constructor(leaf: WorkspaceLeaf);
    getViewType(): string;
    getDisplayText(): string;
    onOpen(): Promise<void>;
    private showResult;
    onClose(): Promise<void>;
}
