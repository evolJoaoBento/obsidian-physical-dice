import { App, PluginSettingTab, Setting } from 'obsidian';
import D20DicePlugin from './main';

export interface DiceSettings {
    // Camera window border
    showWindowBorder: boolean;
    windowBorderColor: string;
    windowBorderOpacity: number;
    windowBorderWidth: number;

    // Surface background
    showSurface: boolean;
    surfaceColor: string;
    surfaceOpacity: number;
    surfaceBorderColor: string;
    surfaceBorderOpacity: number;
    surfaceBorderWidth: number;
    trayWidth: number;
    trayLength: number;

    // Dice configuration
    diceType: 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20'; // Legacy - will be removed
    diceSize: number;
    diceColor: string;

    // Multi-dice counts (how many of each type)
    diceCounts: {
        d4: number;
        d6: number;
        d8: number;
        d10: number;
        d12: number;
        d20: number;
    };

    // Individual dice scaling per type
    diceScales: {
        d4: number;
        d6: number;
        d8: number;
        d10: number;
        d12: number;
        d20: number;
    };

    // Material properties
    diceShininess: number;
    diceSpecular: string;
    diceTransparent: boolean;
    diceOpacity: number;

    // Shadow settings
    enableShadows: boolean;
    diceCastShadow: boolean;
    diceReceiveShadow: boolean;
    surfaceReceiveShadow: boolean;

    // Lighting settings
    ambientLightIntensity: number;
    ambientLightColor: string;
    directionalLightIntensity: number;
    directionalLightColor: string;
    directionalLightPositionX: number;
    directionalLightPositionY: number;
    directionalLightPositionZ: number;

    // Per-dice-type textures
    diceTextures: {
        d4: string;
        d6: string;
        d8: string;
        d10: string;
        d12: string;
        d20: string;
    };

    // Per-dice-type normal maps
    diceNormalMaps: {
        d4: string;
        d6: string;
        d8: string;
        d10: string;
        d12: string;
        d20: string;
    };

    // Animation settings
    enableResultAnimation: boolean;

    // Motion detection settings
    motionThreshold: number;

    // Face detection settings
    faceDetectionTolerance: number;

    // Highlight settings
    completedDiceHighlightColor: string;

    // Debug settings
    enableMotionDebug: boolean;

    // Face calibration mapping
    faceMapping: { [faceIndex: number]: number };

    // API Integration settings
    apiEnabled: boolean;
    apiEndpoint: string;

}

export const DEFAULT_SETTINGS: DiceSettings = {
    // Camera window border defaults
    showWindowBorder: false,
    windowBorderColor: '#ffffff',
    windowBorderOpacity: 0.3,
    windowBorderWidth: 2,

    // Surface background defaults
    showSurface: false,
    surfaceColor: '#8B4513',
    surfaceOpacity: 0.1,
    surfaceBorderColor: '#654321',
    surfaceBorderOpacity: 0.3,
    surfaceBorderWidth: 2,
    trayWidth: 1.0,
    trayLength: 1.0,

    // Dice defaults
    diceType: 'd20', // Legacy - will be removed
    diceSize: 0.8,
    diceColor: '#ff4444',

    // Multi-dice counts defaults (start with no dice)
    diceCounts: {
        d4: 0,
        d6: 0,
        d8: 0,
        d10: 0,
        d12: 0,
        d20: 0
    },

    // Individual dice scaling defaults
    diceScales: {
        d4: 1.0,
        d6: 1.0,
        d8: 1.0,
        d10: 1.0,
        d12: 1.0,
        d20: 1.0
    },

    // Material defaults
    diceShininess: 100,
    diceSpecular: '#222222',
    diceTransparent: false,
    diceOpacity: 1.0,

    // Shadow defaults
    enableShadows: false,
    diceCastShadow: true,
    diceReceiveShadow: false,
    surfaceReceiveShadow: true,

    // Lighting defaults
    ambientLightIntensity: 1.2,
    ambientLightColor: '#ffffff',
    directionalLightIntensity: 0.8,
    directionalLightColor: '#ffffff',
    directionalLightPositionX: 0,
    directionalLightPositionY: 35,
    directionalLightPositionZ: 0,

    // Per-dice-type texture defaults
    diceTextures: {
        d4: '',
        d6: '',
        d8: '',
        d10: '',
        d12: '',
        d20: ''
    },

    // Per-dice-type normal map defaults
    diceNormalMaps: {
        d4: '',
        d6: '',
        d8: '',
        d10: '',
        d12: '',
        d20: ''
    },

    // Animation defaults
    enableResultAnimation: true,

    // Motion detection defaults
    motionThreshold: 2.0,

    // Face detection defaults
    faceDetectionTolerance: 0.3,

    // Highlight defaults
    completedDiceHighlightColor: '#00ff00',

    // Debug defaults
    enableMotionDebug: false,

    // Face mapping defaults (1:1 mapping initially)
    faceMapping: {
        0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8, 8: 9, 9: 10,
        10: 11, 11: 12, 12: 13, 13: 14, 14: 15, 15: 16, 16: 17, 17: 18, 18: 19, 19: 20
    },

    // API Integration defaults
    apiEnabled: false,
    apiEndpoint: 'http://localhost:5000'

};

export class DiceSettingTab extends PluginSettingTab {
    plugin: D20DicePlugin;

    constructor(app: App, plugin: D20DicePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    private createCollapsibleSection(containerEl: HTMLElement, title: string, key: string): HTMLElement {
        const sectionContainer = containerEl.createDiv({ cls: 'dice-settings-section' });

        // Create header with collapse toggle
        const header = sectionContainer.createDiv({ cls: 'dice-settings-header' });
        header.style.cssText = 'cursor: pointer; padding: 10px; background: var(--background-modifier-hover); border-radius: 5px; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between;';

        const title_el = header.createEl('h3', { text: title });
        title_el.style.margin = '0';

        const arrow = header.createSpan({ text: '▼' });
        arrow.style.cssText = 'transition: transform 0.2s;';

        const content = sectionContainer.createDiv({ cls: 'dice-settings-content' });

        // Load collapsed state from localStorage (default to collapsed)
        const isCollapsed = localStorage.getItem(`dice-settings-${key}`) !== 'false';
        if (isCollapsed) {
            content.style.display = 'none';
            arrow.style.transform = 'rotate(-90deg)';
        }

        header.addEventListener('click', () => {
            const collapsed = content.style.display === 'none';
            content.style.display = collapsed ? 'block' : 'none';
            arrow.style.transform = collapsed ? 'rotate(0deg)' : 'rotate(-90deg)';
            localStorage.setItem(`dice-settings-${key}`, (!collapsed).toString());
        });

        return content;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        containerEl.createEl('h2', { text: 'D20 Dice Roller Settings' });

        // Camera Window Border Section
        const windowBorderSection = this.createCollapsibleSection(containerEl, 'Camera Window Border', 'window-border');

        new Setting(windowBorderSection)
            .setName('Show window border')
            .setDesc('Display a border around the 3D view window')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showWindowBorder)
                .onChange(async (value) => {
                    this.plugin.settings.showWindowBorder = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshDiceView();
                }));

        new Setting(windowBorderSection)
            .setName('Border color')
            .setDesc('Color of the window border')
            .addColorPicker(color => color
                .setValue(this.plugin.settings.windowBorderColor)
                .onChange(async (value) => {
                    this.plugin.settings.windowBorderColor = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshDiceView();
                }));

        new Setting(windowBorderSection)
            .setName('Border opacity')
            .setDesc('Transparency of the window border (0 = invisible, 1 = opaque)')
            .addSlider(slider => slider
                .setLimits(0, 1, 0.1)
                .setValue(this.plugin.settings.windowBorderOpacity)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.windowBorderOpacity = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshDiceView();
                }));

        new Setting(windowBorderSection)
            .setName('Border width')
            .setDesc('Width of the window border in pixels')
            .addSlider(slider => slider
                .setLimits(1, 10, 1)
                .setValue(this.plugin.settings.windowBorderWidth)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.windowBorderWidth = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshDiceView();
                }));

        // Surface Background Section
        const surfaceSection = this.createCollapsibleSection(containerEl, 'Dice Tray Surface', 'surface');

        new Setting(surfaceSection)
            .setName('Show dice tray')
            .setDesc('Display a visible surface for the dice to roll on')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showSurface)
                .onChange(async (value) => {
                    this.plugin.settings.showSurface = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshDiceView();
                }));

        new Setting(surfaceSection)
            .setName('Surface color')
            .setDesc('Color of the dice tray surface')
            .addColorPicker(color => color
                .setValue(this.plugin.settings.surfaceColor)
                .onChange(async (value) => {
                    this.plugin.settings.surfaceColor = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshDiceView();
                }));

        new Setting(surfaceSection)
            .setName('Surface opacity')
            .setDesc('Transparency of the surface (0 = invisible, 1 = opaque)')
            .addSlider(slider => slider
                .setLimits(0, 1, 0.1)
                .setValue(this.plugin.settings.surfaceOpacity)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.surfaceOpacity = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshDiceView();
                }));

        new Setting(surfaceSection)
            .setName('Surface border color')
            .setDesc('Color of the surface border')
            .addColorPicker(color => color
                .setValue(this.plugin.settings.surfaceBorderColor)
                .onChange(async (value) => {
                    this.plugin.settings.surfaceBorderColor = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshDiceView();
                }));

        new Setting(surfaceSection)
            .setName('Surface border opacity')
            .setDesc('Transparency of the surface border')
            .addSlider(slider => slider
                .setLimits(0, 1, 0.1)
                .setValue(this.plugin.settings.surfaceBorderOpacity)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.surfaceBorderOpacity = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshDiceView();
                }));

        new Setting(surfaceSection)
            .setName('Surface border width')
            .setDesc('Width of the surface border')
            .addSlider(slider => slider
                .setLimits(0, 5, 0.5)
                .setValue(this.plugin.settings.surfaceBorderWidth)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.surfaceBorderWidth = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshDiceView();
                }));

        new Setting(surfaceSection)
            .setName('Tray width')
            .setDesc('Width of the dice tray (0.5 = narrow, 1.5 = wide)')
            .addSlider(slider => slider
                .setLimits(0.3, 2.0, 0.1)
                .setValue(this.plugin.settings.trayWidth)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.trayWidth = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshDiceView();
                }));

        new Setting(surfaceSection)
            .setName('Tray length')
            .setDesc('Length of the dice tray (0.5 = short, 1.5 = long)')
            .addSlider(slider => slider
                .setLimits(0.3, 2.0, 0.1)
                .setValue(this.plugin.settings.trayLength)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.trayLength = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshDiceView();
                }));

        // Dice Configuration Section
        const diceSection = this.createCollapsibleSection(containerEl, 'Dice Configuration', 'dice');


        new Setting(diceSection)
            .setName('Dice size')
            .setDesc('Size of the dice (0.5 = small, 1.5 = large)')
            .addSlider(slider => slider
                .setLimits(0.3, 2.0, 0.1)
                .setValue(this.plugin.settings.diceSize)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.diceSize = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshDiceView();
                }));

        // Individual dice type scaling
        const diceScaleTypes = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];
        diceScaleTypes.forEach(diceType => {
            new Setting(diceSection)
                .setName(`${diceType.toUpperCase()} scale`)
                .setDesc(`Individual scaling for ${diceType.toUpperCase()} dice (0.5 = small, 2.0 = large)`)
                .addSlider(slider => slider
                    .setLimits(0.3, 2.0, 0.1)
                    .setValue((this.plugin.settings.diceScales as any)[diceType])
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        (this.plugin.settings.diceScales as any)[diceType] = value;
                        await this.plugin.saveSettings();
                        this.plugin.refreshDiceView();
                    }));
        });

        new Setting(diceSection)
            .setName('Dice color')
            .setDesc('Base color of the dice (applies as tint with textures)')
            .addColorPicker(color => color
                .setValue(this.plugin.settings.diceColor)
                .onChange(async (value) => {
                    this.plugin.settings.diceColor = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshDiceView();
                }));

        // Material Properties
        containerEl.createEl('h4', { text: 'Material Properties', cls: 'dice-settings-subheader' });

        new Setting(diceSection)
            .setName('Shininess')
            .setDesc('How shiny/reflective the dice surface appears (0 = matte, 200 = glossy)')
            .addSlider(slider => slider
                .setLimits(0, 200, 10)
                .setValue(this.plugin.settings.diceShininess)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.diceShininess = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshDiceView();
                }));

        new Setting(diceSection)
            .setName('Specular highlight color')
            .setDesc('Color of the shiny highlights on the dice')
            .addColorPicker(color => color
                .setValue(this.plugin.settings.diceSpecular)
                .onChange(async (value) => {
                    this.plugin.settings.diceSpecular = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshDiceView();
                }));

        new Setting(diceSection)
            .setName('Enable transparency')
            .setDesc('Make the dice semi-transparent')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.diceTransparent)
                .onChange(async (value) => {
                    this.plugin.settings.diceTransparent = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshDiceView();
                }));

        new Setting(diceSection)
            .setName('Opacity')
            .setDesc('Transparency level when transparency is enabled (0 = invisible, 1 = opaque)')
            .addSlider(slider => slider
                .setLimits(0.1, 1, 0.05)
                .setValue(this.plugin.settings.diceOpacity)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.diceOpacity = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshDiceView();
                }));

        // Shadow Settings Section
        const shadowSection = this.createCollapsibleSection(containerEl, 'Shadow Settings', 'shadows');

        new Setting(shadowSection)
            .setName('Enable shadows')
            .setDesc('Enable realistic shadow rendering (may impact performance)')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableShadows)
                .onChange(async (value) => {
                    this.plugin.settings.enableShadows = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshDiceView();
                }));

        new Setting(shadowSection)
            .setName('Dice cast shadows')
            .setDesc('Allow dice to cast shadows on surfaces')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.diceCastShadow)
                .onChange(async (value) => {
                    this.plugin.settings.diceCastShadow = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshDiceView();
                }));

        new Setting(shadowSection)
            .setName('Dice receive shadows')
            .setDesc('Allow shadows to be cast on dice surfaces')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.diceReceiveShadow)
                .onChange(async (value) => {
                    this.plugin.settings.diceReceiveShadow = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshDiceView();
                }));

        new Setting(shadowSection)
            .setName('Surface receive shadows')
            .setDesc('Allow shadows to be cast on the dice tray surface')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.surfaceReceiveShadow)
                .onChange(async (value) => {
                    this.plugin.settings.surfaceReceiveShadow = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshDiceView();
                }));

        // Lighting Settings Section
        const lightingSection = this.createCollapsibleSection(containerEl, 'Lighting Settings', 'lighting');

        lightingSection.createEl('h4', { text: 'Ambient Light', cls: 'dice-settings-subheader' });

        new Setting(lightingSection)
            .setName('Ambient light intensity')
            .setDesc('Overall brightness of the scene (0 = dark, 3 = very bright)')
            .addSlider(slider => slider
                .setLimits(0, 3, 0.1)
                .setValue(this.plugin.settings.ambientLightIntensity)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.ambientLightIntensity = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshDiceView();
                }));

        new Setting(lightingSection)
            .setName('Ambient light color')
            .setDesc('Color of the ambient lighting')
            .addColorPicker(color => color
                .setValue(this.plugin.settings.ambientLightColor)
                .onChange(async (value) => {
                    this.plugin.settings.ambientLightColor = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshDiceView();
                }));

        lightingSection.createEl('h4', { text: 'Directional Light', cls: 'dice-settings-subheader' });

        new Setting(lightingSection)
            .setName('Directional light intensity')
            .setDesc('Strength of directional lighting (0 = no directional light, 2 = very strong)')
            .addSlider(slider => slider
                .setLimits(0, 2, 0.1)
                .setValue(this.plugin.settings.directionalLightIntensity)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.directionalLightIntensity = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshDiceView();
                }));

        new Setting(lightingSection)
            .setName('Directional light color')
            .setDesc('Color of the directional lighting')
            .addColorPicker(color => color
                .setValue(this.plugin.settings.directionalLightColor)
                .onChange(async (value) => {
                    this.plugin.settings.directionalLightColor = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshDiceView();
                }));

        new Setting(lightingSection)
            .setName('Light position X')
            .setDesc('Horizontal position of the directional light (-50 to 50)')
            .addSlider(slider => slider
                .setLimits(-50, 50, 1)
                .setValue(this.plugin.settings.directionalLightPositionX)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.directionalLightPositionX = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshDiceView();
                }));

        new Setting(lightingSection)
            .setName('Light position Y')
            .setDesc('Vertical position of the directional light (0 to 100)')
            .addSlider(slider => slider
                .setLimits(0, 100, 1)
                .setValue(this.plugin.settings.directionalLightPositionY)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.directionalLightPositionY = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshDiceView();
                }));

        new Setting(lightingSection)
            .setName('Light position Z')
            .setDesc('Depth position of the directional light (-50 to 50)')
            .addSlider(slider => slider
                .setLimits(-50, 50, 1)
                .setValue(this.plugin.settings.directionalLightPositionZ)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.directionalLightPositionZ = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshDiceView();
                }));

        // Custom Textures Section - always shown
        const textureSection = this.createCollapsibleSection(containerEl, 'Custom Textures', 'textures');

        textureSection.createEl('p', {
                text: 'Upload custom images for each dice type. Images will use appropriate UV mapping based on the dice geometry.',
                cls: 'setting-item-description'
            });

            const diceTypes = [
                { key: 'd4', name: 'D4', uvType: 'triangles' },
                { key: 'd6', name: 'D6', uvType: 'squares' },
                { key: 'd8', name: 'D8', uvType: 'triangles' },
                { key: 'd10', name: 'D10', uvType: 'custom' },
                { key: 'd12', name: 'D12', uvType: 'pentagons' },
                { key: 'd20', name: 'D20', uvType: 'triangles' },
            ];

            diceTypes.forEach(dice => {
                const hasTexture = (this.plugin.settings.diceTextures as any)[dice.key] !== '';

                new Setting(textureSection)
                    .setName(`${dice.name} texture`)
                    .setDesc(`Custom image for ${dice.name} (uses ${dice.uvType} UV mapping)${hasTexture ? ' ✓' : ''}`)
                    .addButton(button => button
                        .setButtonText(hasTexture ? 'Replace Image' : 'Upload Image')
                        .onClick(() => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = 'image/*';
                            input.addEventListener('change', async (e) => {
                                const file = (e.target as HTMLInputElement).files?.[0];
                                if (file) {
                                    // Check file size (limit to 5MB to prevent memory issues)
                                    if (file.size > 5 * 1024 * 1024) {
                                        alert('Image file too large. Please use an image smaller than 5MB.');
                                        return;
                                    }

                                    const reader = new FileReader();
                                    reader.onload = async (event) => {
                                        const base64 = event.target?.result as string;
                                        (this.plugin.settings.diceTextures as any)[dice.key] = base64;
                                        await this.plugin.saveSettings();
                                        this.plugin.refreshDiceView();
                                        this.display(); // Refresh to update checkmarks
                                    };
                                    reader.readAsDataURL(file);
                                }
                            });
                            input.click();
                        }))
                    .addButton(button => {
                        button.setButtonText('Clear')
                            .setDisabled(!hasTexture)
                            .onClick(async () => {
                                (this.plugin.settings.diceTextures as any)[dice.key] = '';
                                await this.plugin.saveSettings();
                                this.plugin.refreshDiceView();
                                this.display(); // Refresh to update checkmarks
                            });

                        // Only set class if we have a texture (to show warning when disabled)
                        if (!hasTexture) {
                            button.setClass('mod-warning');
                        }

                        return button;
                    });
            });

        // Normal Maps Section
        const normalMapSection = this.createCollapsibleSection(containerEl, 'Normal Maps', 'normal-maps');

        normalMapSection.createEl('p', {
            text: 'Upload normal maps for surface detail and bumps. Normal maps should be in standard format (RGB channels represent XYZ normal vectors).',
            cls: 'setting-item-description'
        });

        diceTypes.forEach(dice => {
            const hasNormalMap = (this.plugin.settings.diceNormalMaps as any)[dice.key] !== '';

            new Setting(normalMapSection)
                .setName(`${dice.name} normal map`)
                .setDesc(`Normal map for ${dice.name} surface detail and bumps${hasNormalMap ? ' ✓' : ''}`)
                .addButton(button => button
                    .setButtonText(hasNormalMap ? 'Replace Normal Map' : 'Upload Normal Map')
                    .onClick(() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = 'image/*';
                        input.addEventListener('change', async (e) => {
                            const file = (e.target as HTMLInputElement).files?.[0];
                            if (file) {
                                // Check file size (limit to 5MB to prevent memory issues)
                                if (file.size > 5 * 1024 * 1024) {
                                    alert('Normal map file too large. Please use an image smaller than 5MB.');
                                    return;
                                }

                                const reader = new FileReader();
                                reader.onload = async (event) => {
                                    const base64 = event.target?.result as string;
                                    (this.plugin.settings.diceNormalMaps as any)[dice.key] = base64;
                                    await this.plugin.saveSettings();
                                    this.plugin.refreshDiceView();
                                    this.display(); // Refresh to update checkmarks
                                };
                                reader.readAsDataURL(file);
                            }
                        });
                        input.click();
                    }))
                .addButton(button => {
                    button.setButtonText('Clear')
                        .setDisabled(!hasNormalMap)
                        .onClick(async () => {
                            (this.plugin.settings.diceNormalMaps as any)[dice.key] = '';
                            await this.plugin.saveSettings();
                            this.plugin.refreshDiceView();
                            this.display(); // Refresh to update checkmarks
                        });

                    // Only set class if we don't have a normal map (to show warning when disabled)
                    if (!hasNormalMap) {
                        button.setClass('mod-warning');
                    }

                    return button;
                });
        });

        // Motion Detection Settings Section
        const motionSection = this.createCollapsibleSection(containerEl, 'Motion Detection Settings', 'motion');

        new Setting(motionSection)
            .setName('Motion threshold')
            .setDesc('How still the dice must be before detecting the result. Higher values = wait longer for complete stillness. Timeout extends by +1 second per unit.')
            .addSlider(slider => slider
                .setLimits(0.1, 10.0, 0.1)
                .setValue(this.plugin.settings.motionThreshold)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    console.log('⚙️ Motion threshold changed from', this.plugin.settings.motionThreshold, 'to', value);
                    this.plugin.settings.motionThreshold = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshDiceView();
                }));

        // Add explanatory text
        const explanationEl = motionSection.createEl('div', {
            cls: 'setting-item-description',
            text: 'Examples: 1.0 = normal, 5.0 = very patient (9sec timeout), 10.0 = extremely patient (14sec timeout)'
        });
        explanationEl.style.fontSize = '12px';
        explanationEl.style.opacity = '0.8';
        explanationEl.style.marginTop = '5px';

        new Setting(motionSection)
            .setName('Face detection tolerance')
            .setDesc('How precisely a face must be aligned to be considered valid (0.05 = very strict, 0.5 = relaxed). Dice that don\'t meet this threshold are CAUGHT and highlighted for reroll.')
            .addSlider(slider => slider
                .setLimits(0.05, 0.5, 0.05)
                .setValue(this.plugin.settings.faceDetectionTolerance)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    console.log('⚙️ Face detection tolerance changed from', this.plugin.settings.faceDetectionTolerance, 'to', value);
                    this.plugin.settings.faceDetectionTolerance = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshDiceView();
                }));

        new Setting(motionSection)
            .setName('Completed dice highlight color')
            .setDesc('Color to highlight dice that have successfully settled with a valid result')
            .addColorPicker(color => color
                .setValue(this.plugin.settings.completedDiceHighlightColor)
                .onChange(async (value) => {
                    console.log('⚙️ Completed dice highlight color changed to', value);
                    this.plugin.settings.completedDiceHighlightColor = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshDiceView();
                }));

        // API Integration Section
        const apiSection = this.createCollapsibleSection(containerEl, 'API Integration', 'api');

        new Setting(apiSection)
            .setName('Enable online dice system')
            .setDesc('Enable integration with online dice roll API for multiplayer dice rolling')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.apiEnabled)
                .onChange(async (value) => {
                    this.plugin.settings.apiEnabled = value;
                    await this.plugin.saveSettings();
                    // Trigger refresh to show/hide ribbon icon
                    this.plugin.refreshApiIntegration();
                }));

        new Setting(apiSection)
            .setName('API endpoint')
            .setDesc('URL of the dice roll API server (e.g., http://localhost:5000 or https://your-server.com)')
            .addText(text => text
                .setPlaceholder('http://localhost:5000')
                .setValue(this.plugin.settings.apiEndpoint)
                .onChange(async (value) => {
                    this.plugin.settings.apiEndpoint = value;
                    await this.plugin.saveSettings();
                }));

        // Debug Settings Section
        const debugSection = this.createCollapsibleSection(containerEl, 'Debug Settings', 'debug');

        new Setting(debugSection)
            .setName('Enable motion debug logging')
            .setDesc('Show detailed motion detection information in browser console. Useful for troubleshooting but can be overwhelming.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableMotionDebug)
                .onChange(async (value) => {
                    console.log('⚙️ Motion debug logging', value ? 'enabled' : 'disabled');
                    this.plugin.settings.enableMotionDebug = value;
                    await this.plugin.saveSettings();
                }));
    }
}