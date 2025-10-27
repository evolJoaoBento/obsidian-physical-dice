import { App, PluginSettingTab } from 'obsidian';
import D20DicePlugin from './main';
export interface DiceSettings {
    showWindowBorder: boolean;
    windowBorderColor: string;
    windowBorderOpacity: number;
    windowBorderWidth: number;
    showSurface: boolean;
    surfaceColor: string;
    surfaceOpacity: number;
    surfaceBorderColor: string;
    surfaceBorderOpacity: number;
    surfaceBorderWidth: number;
    trayWidth: number;
    trayLength: number;
    diceType: 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20';
    diceSize: number;
    diceColor: string;
    diceCounts: {
        d4: number;
        d6: number;
        d8: number;
        d10: number;
        d12: number;
        d20: number;
    };
    diceScales: {
        d4: number;
        d6: number;
        d8: number;
        d10: number;
        d12: number;
        d20: number;
    };
    diceShininess: number;
    diceSpecular: string;
    diceTransparent: boolean;
    diceOpacity: number;
    enableShadows: boolean;
    diceCastShadow: boolean;
    diceReceiveShadow: boolean;
    surfaceReceiveShadow: boolean;
    ambientLightIntensity: number;
    ambientLightColor: string;
    directionalLightIntensity: number;
    directionalLightColor: string;
    directionalLightPositionX: number;
    directionalLightPositionY: number;
    directionalLightPositionZ: number;
    diceTextures: {
        d4: string;
        d6: string;
        d8: string;
        d10: string;
        d12: string;
        d20: string;
    };
    diceNormalMaps: {
        d4: string;
        d6: string;
        d8: string;
        d10: string;
        d12: string;
        d20: string;
    };
    enableResultAnimation: boolean;
    motionThreshold: number;
    faceDetectionTolerance: number;
    enableMotionDebug: boolean;
    faceMapping: {
        [faceIndex: number]: number;
    };
    apiEnabled: boolean;
    apiEndpoint: string;
}
export declare const DEFAULT_SETTINGS: DiceSettings;
export declare class DiceSettingTab extends PluginSettingTab {
    plugin: D20DicePlugin;
    constructor(app: App, plugin: D20DicePlugin);
    private createCollapsibleSection;
    display(): void;
}
