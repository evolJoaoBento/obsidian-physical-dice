import { __awaiter } from "tslib";
import { PluginSettingTab, Setting } from 'obsidian';
export const DEFAULT_SETTINGS = {
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
    diceType: 'd20',
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
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    createCollapsibleSection(containerEl, title, key) {
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
    display() {
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
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.showWindowBorder = value;
            yield this.plugin.saveSettings();
            this.plugin.refreshDiceView();
        })));
        new Setting(windowBorderSection)
            .setName('Border color')
            .setDesc('Color of the window border')
            .addColorPicker(color => color
            .setValue(this.plugin.settings.windowBorderColor)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.windowBorderColor = value;
            yield this.plugin.saveSettings();
            this.plugin.refreshDiceView();
        })));
        new Setting(windowBorderSection)
            .setName('Border opacity')
            .setDesc('Transparency of the window border (0 = invisible, 1 = opaque)')
            .addSlider(slider => slider
            .setLimits(0, 1, 0.1)
            .setValue(this.plugin.settings.windowBorderOpacity)
            .setDynamicTooltip()
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.windowBorderOpacity = value;
            yield this.plugin.saveSettings();
            this.plugin.refreshDiceView();
        })));
        new Setting(windowBorderSection)
            .setName('Border width')
            .setDesc('Width of the window border in pixels')
            .addSlider(slider => slider
            .setLimits(1, 10, 1)
            .setValue(this.plugin.settings.windowBorderWidth)
            .setDynamicTooltip()
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.windowBorderWidth = value;
            yield this.plugin.saveSettings();
            this.plugin.refreshDiceView();
        })));
        // Surface Background Section
        const surfaceSection = this.createCollapsibleSection(containerEl, 'Dice Tray Surface', 'surface');
        new Setting(surfaceSection)
            .setName('Show dice tray')
            .setDesc('Display a visible surface for the dice to roll on')
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.showSurface)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.showSurface = value;
            yield this.plugin.saveSettings();
            this.plugin.refreshDiceView();
        })));
        new Setting(surfaceSection)
            .setName('Surface color')
            .setDesc('Color of the dice tray surface')
            .addColorPicker(color => color
            .setValue(this.plugin.settings.surfaceColor)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.surfaceColor = value;
            yield this.plugin.saveSettings();
            this.plugin.refreshDiceView();
        })));
        new Setting(surfaceSection)
            .setName('Surface opacity')
            .setDesc('Transparency of the surface (0 = invisible, 1 = opaque)')
            .addSlider(slider => slider
            .setLimits(0, 1, 0.1)
            .setValue(this.plugin.settings.surfaceOpacity)
            .setDynamicTooltip()
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.surfaceOpacity = value;
            yield this.plugin.saveSettings();
            this.plugin.refreshDiceView();
        })));
        new Setting(surfaceSection)
            .setName('Surface border color')
            .setDesc('Color of the surface border')
            .addColorPicker(color => color
            .setValue(this.plugin.settings.surfaceBorderColor)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.surfaceBorderColor = value;
            yield this.plugin.saveSettings();
            this.plugin.refreshDiceView();
        })));
        new Setting(surfaceSection)
            .setName('Surface border opacity')
            .setDesc('Transparency of the surface border')
            .addSlider(slider => slider
            .setLimits(0, 1, 0.1)
            .setValue(this.plugin.settings.surfaceBorderOpacity)
            .setDynamicTooltip()
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.surfaceBorderOpacity = value;
            yield this.plugin.saveSettings();
            this.plugin.refreshDiceView();
        })));
        new Setting(surfaceSection)
            .setName('Surface border width')
            .setDesc('Width of the surface border')
            .addSlider(slider => slider
            .setLimits(0, 5, 0.5)
            .setValue(this.plugin.settings.surfaceBorderWidth)
            .setDynamicTooltip()
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.surfaceBorderWidth = value;
            yield this.plugin.saveSettings();
            this.plugin.refreshDiceView();
        })));
        new Setting(surfaceSection)
            .setName('Tray width')
            .setDesc('Width of the dice tray (0.5 = narrow, 1.5 = wide)')
            .addSlider(slider => slider
            .setLimits(0.3, 2.0, 0.1)
            .setValue(this.plugin.settings.trayWidth)
            .setDynamicTooltip()
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.trayWidth = value;
            yield this.plugin.saveSettings();
            this.plugin.refreshDiceView();
        })));
        new Setting(surfaceSection)
            .setName('Tray length')
            .setDesc('Length of the dice tray (0.5 = short, 1.5 = long)')
            .addSlider(slider => slider
            .setLimits(0.3, 2.0, 0.1)
            .setValue(this.plugin.settings.trayLength)
            .setDynamicTooltip()
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.trayLength = value;
            yield this.plugin.saveSettings();
            this.plugin.refreshDiceView();
        })));
        // Dice Configuration Section
        const diceSection = this.createCollapsibleSection(containerEl, 'Dice Configuration', 'dice');
        new Setting(diceSection)
            .setName('Dice size')
            .setDesc('Size of the dice (0.5 = small, 1.5 = large)')
            .addSlider(slider => slider
            .setLimits(0.3, 2.0, 0.1)
            .setValue(this.plugin.settings.diceSize)
            .setDynamicTooltip()
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.diceSize = value;
            yield this.plugin.saveSettings();
            this.plugin.refreshDiceView();
        })));
        // Individual dice type scaling
        const diceScaleTypes = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];
        diceScaleTypes.forEach(diceType => {
            new Setting(diceSection)
                .setName(`${diceType.toUpperCase()} scale`)
                .setDesc(`Individual scaling for ${diceType.toUpperCase()} dice (0.5 = small, 2.0 = large)`)
                .addSlider(slider => slider
                .setLimits(0.3, 2.0, 0.1)
                .setValue(this.plugin.settings.diceScales[diceType])
                .setDynamicTooltip()
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.plugin.settings.diceScales[diceType] = value;
                yield this.plugin.saveSettings();
                this.plugin.refreshDiceView();
            })));
        });
        new Setting(diceSection)
            .setName('Dice color')
            .setDesc('Base color of the dice (applies as tint with textures)')
            .addColorPicker(color => color
            .setValue(this.plugin.settings.diceColor)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.diceColor = value;
            yield this.plugin.saveSettings();
            this.plugin.refreshDiceView();
        })));
        // Material Properties
        containerEl.createEl('h4', { text: 'Material Properties', cls: 'dice-settings-subheader' });
        new Setting(diceSection)
            .setName('Shininess')
            .setDesc('How shiny/reflective the dice surface appears (0 = matte, 200 = glossy)')
            .addSlider(slider => slider
            .setLimits(0, 200, 10)
            .setValue(this.plugin.settings.diceShininess)
            .setDynamicTooltip()
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.diceShininess = value;
            yield this.plugin.saveSettings();
            this.plugin.refreshDiceView();
        })));
        new Setting(diceSection)
            .setName('Specular highlight color')
            .setDesc('Color of the shiny highlights on the dice')
            .addColorPicker(color => color
            .setValue(this.plugin.settings.diceSpecular)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.diceSpecular = value;
            yield this.plugin.saveSettings();
            this.plugin.refreshDiceView();
        })));
        new Setting(diceSection)
            .setName('Enable transparency')
            .setDesc('Make the dice semi-transparent')
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.diceTransparent)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.diceTransparent = value;
            yield this.plugin.saveSettings();
            this.plugin.refreshDiceView();
        })));
        new Setting(diceSection)
            .setName('Opacity')
            .setDesc('Transparency level when transparency is enabled (0 = invisible, 1 = opaque)')
            .addSlider(slider => slider
            .setLimits(0.1, 1, 0.05)
            .setValue(this.plugin.settings.diceOpacity)
            .setDynamicTooltip()
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.diceOpacity = value;
            yield this.plugin.saveSettings();
            this.plugin.refreshDiceView();
        })));
        // Shadow Settings Section
        const shadowSection = this.createCollapsibleSection(containerEl, 'Shadow Settings', 'shadows');
        new Setting(shadowSection)
            .setName('Enable shadows')
            .setDesc('Enable realistic shadow rendering (may impact performance)')
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.enableShadows)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.enableShadows = value;
            yield this.plugin.saveSettings();
            this.plugin.refreshDiceView();
        })));
        new Setting(shadowSection)
            .setName('Dice cast shadows')
            .setDesc('Allow dice to cast shadows on surfaces')
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.diceCastShadow)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.diceCastShadow = value;
            yield this.plugin.saveSettings();
            this.plugin.refreshDiceView();
        })));
        new Setting(shadowSection)
            .setName('Dice receive shadows')
            .setDesc('Allow shadows to be cast on dice surfaces')
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.diceReceiveShadow)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.diceReceiveShadow = value;
            yield this.plugin.saveSettings();
            this.plugin.refreshDiceView();
        })));
        new Setting(shadowSection)
            .setName('Surface receive shadows')
            .setDesc('Allow shadows to be cast on the dice tray surface')
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.surfaceReceiveShadow)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.surfaceReceiveShadow = value;
            yield this.plugin.saveSettings();
            this.plugin.refreshDiceView();
        })));
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
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.ambientLightIntensity = value;
            yield this.plugin.saveSettings();
            this.plugin.refreshDiceView();
        })));
        new Setting(lightingSection)
            .setName('Ambient light color')
            .setDesc('Color of the ambient lighting')
            .addColorPicker(color => color
            .setValue(this.plugin.settings.ambientLightColor)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.ambientLightColor = value;
            yield this.plugin.saveSettings();
            this.plugin.refreshDiceView();
        })));
        lightingSection.createEl('h4', { text: 'Directional Light', cls: 'dice-settings-subheader' });
        new Setting(lightingSection)
            .setName('Directional light intensity')
            .setDesc('Strength of directional lighting (0 = no directional light, 2 = very strong)')
            .addSlider(slider => slider
            .setLimits(0, 2, 0.1)
            .setValue(this.plugin.settings.directionalLightIntensity)
            .setDynamicTooltip()
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.directionalLightIntensity = value;
            yield this.plugin.saveSettings();
            this.plugin.refreshDiceView();
        })));
        new Setting(lightingSection)
            .setName('Directional light color')
            .setDesc('Color of the directional lighting')
            .addColorPicker(color => color
            .setValue(this.plugin.settings.directionalLightColor)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.directionalLightColor = value;
            yield this.plugin.saveSettings();
            this.plugin.refreshDiceView();
        })));
        new Setting(lightingSection)
            .setName('Light position X')
            .setDesc('Horizontal position of the directional light (-50 to 50)')
            .addSlider(slider => slider
            .setLimits(-50, 50, 1)
            .setValue(this.plugin.settings.directionalLightPositionX)
            .setDynamicTooltip()
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.directionalLightPositionX = value;
            yield this.plugin.saveSettings();
            this.plugin.refreshDiceView();
        })));
        new Setting(lightingSection)
            .setName('Light position Y')
            .setDesc('Vertical position of the directional light (0 to 100)')
            .addSlider(slider => slider
            .setLimits(0, 100, 1)
            .setValue(this.plugin.settings.directionalLightPositionY)
            .setDynamicTooltip()
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.directionalLightPositionY = value;
            yield this.plugin.saveSettings();
            this.plugin.refreshDiceView();
        })));
        new Setting(lightingSection)
            .setName('Light position Z')
            .setDesc('Depth position of the directional light (-50 to 50)')
            .addSlider(slider => slider
            .setLimits(-50, 50, 1)
            .setValue(this.plugin.settings.directionalLightPositionZ)
            .setDynamicTooltip()
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.directionalLightPositionZ = value;
            yield this.plugin.saveSettings();
            this.plugin.refreshDiceView();
        })));
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
            const hasTexture = this.plugin.settings.diceTextures[dice.key] !== '';
            new Setting(textureSection)
                .setName(`${dice.name} texture`)
                .setDesc(`Custom image for ${dice.name} (uses ${dice.uvType} UV mapping)${hasTexture ? ' ✓' : ''}`)
                .addButton(button => button
                .setButtonText(hasTexture ? 'Replace Image' : 'Upload Image')
                .onClick(() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.addEventListener('change', (e) => __awaiter(this, void 0, void 0, function* () {
                    var _a;
                    const file = (_a = e.target.files) === null || _a === void 0 ? void 0 : _a[0];
                    if (file) {
                        // Check file size (limit to 5MB to prevent memory issues)
                        if (file.size > 5 * 1024 * 1024) {
                            alert('Image file too large. Please use an image smaller than 5MB.');
                            return;
                        }
                        const reader = new FileReader();
                        reader.onload = (event) => __awaiter(this, void 0, void 0, function* () {
                            var _b;
                            const base64 = (_b = event.target) === null || _b === void 0 ? void 0 : _b.result;
                            this.plugin.settings.diceTextures[dice.key] = base64;
                            yield this.plugin.saveSettings();
                            this.plugin.refreshDiceView();
                            this.display(); // Refresh to update checkmarks
                        });
                        reader.readAsDataURL(file);
                    }
                }));
                input.click();
            }))
                .addButton(button => {
                button.setButtonText('Clear')
                    .setDisabled(!hasTexture)
                    .onClick(() => __awaiter(this, void 0, void 0, function* () {
                    this.plugin.settings.diceTextures[dice.key] = '';
                    yield this.plugin.saveSettings();
                    this.plugin.refreshDiceView();
                    this.display(); // Refresh to update checkmarks
                }));
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
            const hasNormalMap = this.plugin.settings.diceNormalMaps[dice.key] !== '';
            new Setting(normalMapSection)
                .setName(`${dice.name} normal map`)
                .setDesc(`Normal map for ${dice.name} surface detail and bumps${hasNormalMap ? ' ✓' : ''}`)
                .addButton(button => button
                .setButtonText(hasNormalMap ? 'Replace Normal Map' : 'Upload Normal Map')
                .onClick(() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.addEventListener('change', (e) => __awaiter(this, void 0, void 0, function* () {
                    var _a;
                    const file = (_a = e.target.files) === null || _a === void 0 ? void 0 : _a[0];
                    if (file) {
                        // Check file size (limit to 5MB to prevent memory issues)
                        if (file.size > 5 * 1024 * 1024) {
                            alert('Normal map file too large. Please use an image smaller than 5MB.');
                            return;
                        }
                        const reader = new FileReader();
                        reader.onload = (event) => __awaiter(this, void 0, void 0, function* () {
                            var _b;
                            const base64 = (_b = event.target) === null || _b === void 0 ? void 0 : _b.result;
                            this.plugin.settings.diceNormalMaps[dice.key] = base64;
                            yield this.plugin.saveSettings();
                            this.plugin.refreshDiceView();
                            this.display(); // Refresh to update checkmarks
                        });
                        reader.readAsDataURL(file);
                    }
                }));
                input.click();
            }))
                .addButton(button => {
                button.setButtonText('Clear')
                    .setDisabled(!hasNormalMap)
                    .onClick(() => __awaiter(this, void 0, void 0, function* () {
                    this.plugin.settings.diceNormalMaps[dice.key] = '';
                    yield this.plugin.saveSettings();
                    this.plugin.refreshDiceView();
                    this.display(); // Refresh to update checkmarks
                }));
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
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            console.log('⚙️ Motion threshold changed from', this.plugin.settings.motionThreshold, 'to', value);
            this.plugin.settings.motionThreshold = value;
            yield this.plugin.saveSettings();
            this.plugin.refreshDiceView();
        })));
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
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            console.log('⚙️ Face detection tolerance changed from', this.plugin.settings.faceDetectionTolerance, 'to', value);
            this.plugin.settings.faceDetectionTolerance = value;
            yield this.plugin.saveSettings();
            this.plugin.refreshDiceView();
        })));
        // API Integration Section
        const apiSection = this.createCollapsibleSection(containerEl, 'API Integration', 'api');
        new Setting(apiSection)
            .setName('Enable online dice system')
            .setDesc('Enable integration with online dice roll API for multiplayer dice rolling')
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.apiEnabled)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.apiEnabled = value;
            yield this.plugin.saveSettings();
            // Trigger refresh to show/hide ribbon icon
            this.plugin.refreshApiIntegration();
        })));
        new Setting(apiSection)
            .setName('API endpoint')
            .setDesc('URL of the dice roll API server (e.g., http://localhost:5000 or https://your-server.com)')
            .addText(text => text
            .setPlaceholder('http://localhost:5000')
            .setValue(this.plugin.settings.apiEndpoint)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.apiEndpoint = value;
            yield this.plugin.saveSettings();
        })));
        // Debug Settings Section
        const debugSection = this.createCollapsibleSection(containerEl, 'Debug Settings', 'debug');
        new Setting(debugSection)
            .setName('Enable motion debug logging')
            .setDesc('Show detailed motion detection information in browser console. Useful for troubleshooting but can be overwhelming.')
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.enableMotionDebug)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            console.log('⚙️ Motion debug logging', value ? 'enabled' : 'disabled');
            this.plugin.settings.enableMotionDebug = value;
            yield this.plugin.saveSettings();
        })));
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2V0dGluZ3MuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJzZXR0aW5ncy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEsT0FBTyxFQUFPLGdCQUFnQixFQUFFLE9BQU8sRUFBRSxNQUFNLFVBQVUsQ0FBQztBQTJHMUQsTUFBTSxDQUFDLE1BQU0sZ0JBQWdCLEdBQWlCO0lBQzFDLGdDQUFnQztJQUNoQyxnQkFBZ0IsRUFBRSxLQUFLO0lBQ3ZCLGlCQUFpQixFQUFFLFNBQVM7SUFDNUIsbUJBQW1CLEVBQUUsR0FBRztJQUN4QixpQkFBaUIsRUFBRSxDQUFDO0lBRXBCLDhCQUE4QjtJQUM5QixXQUFXLEVBQUUsS0FBSztJQUNsQixZQUFZLEVBQUUsU0FBUztJQUN2QixjQUFjLEVBQUUsR0FBRztJQUNuQixrQkFBa0IsRUFBRSxTQUFTO0lBQzdCLG9CQUFvQixFQUFFLEdBQUc7SUFDekIsa0JBQWtCLEVBQUUsQ0FBQztJQUNyQixTQUFTLEVBQUUsR0FBRztJQUNkLFVBQVUsRUFBRSxHQUFHO0lBRWYsZ0JBQWdCO0lBQ2hCLFFBQVEsRUFBRSxLQUFLO0lBQ2YsUUFBUSxFQUFFLEdBQUc7SUFDYixTQUFTLEVBQUUsU0FBUztJQUVwQixrREFBa0Q7SUFDbEQsVUFBVSxFQUFFO1FBQ1IsRUFBRSxFQUFFLENBQUM7UUFDTCxFQUFFLEVBQUUsQ0FBQztRQUNMLEVBQUUsRUFBRSxDQUFDO1FBQ0wsR0FBRyxFQUFFLENBQUM7UUFDTixHQUFHLEVBQUUsQ0FBQztRQUNOLEdBQUcsRUFBRSxDQUFDO0tBQ1Q7SUFFRCxtQ0FBbUM7SUFDbkMsVUFBVSxFQUFFO1FBQ1IsRUFBRSxFQUFFLEdBQUc7UUFDUCxFQUFFLEVBQUUsR0FBRztRQUNQLEVBQUUsRUFBRSxHQUFHO1FBQ1AsR0FBRyxFQUFFLEdBQUc7UUFDUixHQUFHLEVBQUUsR0FBRztRQUNSLEdBQUcsRUFBRSxHQUFHO0tBQ1g7SUFFRCxvQkFBb0I7SUFDcEIsYUFBYSxFQUFFLEdBQUc7SUFDbEIsWUFB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c0NvbnRlbnQiOlsiaW1wb3J0IHsgQXBwLCBQbHVnaW5TZXR0aW5nVGFiLCBTZXR0aW5nIH0gZnJvbSAnb2JzaWRpYW4nO1xyXG5pbXBvcnQgRDIwRGljZVBsdWdpbiBmcm9tICcuL21haW4nO1xyXG5cclxuZXhwb3J0IGludGVyZmFjZSBEaWNlU2V0dGluZ3Mge1xyXG4gICAgLy8gQ2FtZXJhIHdpbmRvdyBib3JkZXJcclxuICAgIHNob3dXaW5kb3dCb3JkZXI6IGJvb2xlYW47XHJcbiAgICB3aW5kb3dCb3JkZXJDb2xvcjogc3RyaW5nO1xyXG4gICAgd2luZG93Qm9yZGVyT3BhY2l0eTogbnVtYmVyO1xyXG4gICAgd2luZG93Qm9yZGVyV2lkdGg6IG51bWJlcjtcclxuXHJcbiAgICAvLyBTdXJmYWNlIGJhY2tncm91bmRcclxuICAgIHNob3dTdXJmYWNlOiBib29sZWFuO1xyXG4gICAgc3VyZmFjZUNvbG9yOiBzdHJpbmc7XHJcbiAgICBzdXJmYWNlT3BhY2l0eTogbnVtYmVyO1xyXG4gICAgc3VyZmFjZUJvcmRlckNvbG9yOiBzdHJpbmc7XHJcbiAgICBzdXJmYWNlQm9yZGVyT3BhY2l0eTogbnVtYmVyO1xyXG4gICAgc3VyZmFjZUJvcmRlcldpZHRoOiBudW1iZXI7XHJcbiAgICB0cmF5V2lkdGg6IG51bWJlcjtcclxuICAgIHRyYXlMZW5ndGg6IG51bWJlcjtcclxuXHJcbiAgICAvLyBEaWNlIGNvbmZpZ3VyYXRpb25cclxuICAgIGRpY2VUeXBlOiAnZDQnIHwgJ2Q2JyB8ICdkOCcgfCAnZDEwJyB8ICdkMTInIHwgJ2QyMCc7IC8vIExlZ2FjeSAtIHdpbGwgYmUgcmVtb3ZlZFxyXG4gICAgZGljZVNpemU6IG51bWJlcjtcclxuICAgIGRpY2VDb2xvcjogc3RyaW5nO1xyXG5cclxuICAgIC8vIE11bHRpLWRpY2UgY291bnRzIChob3cgbWFueSBvZiBlYWNoIHR5cGUpXHJcbiAgICBkaWNlQ291bnRzOiB7XHJcbiAgICAgICAgZDQ6IG51bWJlcjtcclxuICAgICAgICBkNjogbnVtYmVyO1xyXG4gICAgICAgIGQ4OiBudW1iZXI7XHJcbiAgICAgICAgZDEwOiBudW1iZXI7XHJcbiAgICAgICAgZDEyOiBudW1iZXI7XHJcbiAgICAgICAgZDIwOiBudW1iZXI7XHJcbiAgICB9O1xyXG5cclxuICAgIC8vIEluZGl2aWR1YWwgZGljZSBzY2FsaW5nIHBlciB0eXBlXHJcbiAgICBkaWNlU2NhbGVzOiB7XHJcbiAgICAgICAgZDQ6IG51bWJlcjtcclxuICAgICAgICBkNjogbnVtYmVyO1xyXG4gICAgICAgIGQ4OiBudW1iZXI7XHJcbiAgICAgICAgZDEwOiBudW1iZXI7XHJcbiAgICAgICAgZDEyOiBudW1iZXI7XHJcbiAgICAgICAgZDIwOiBudW1iZXI7XHJcbiAgICB9O1xyXG5cclxuICAgIC8vIE1hdGVyaWFsIHByb3BlcnRpZXNcclxuICAgIGRpY2VTaGluaW5lc3M6IG51bWJlcjtcclxuICAgIGRpY2VTcGVjdWxhcjogc3RyaW5nO1xyXG4gICAgZGljZVRyYW5zcGFyZW50OiBib29sZWFuO1xyXG4gICAgZGljZU9wYWNpdHk6IG51bWJlcjtcclxuXHJcbiAgICAvLyBTaGFkb3cgc2V0dGluZ3NcclxuICAgIGVuYWJsZVNoYWRvd3M6IGJvb2xlYW47XHJcbiAgICBkaWNlQ2FzdFNoYWRvdzogYm9vbGVhbjtcclxuICAgIGRpY2VSZWNlaXZlU2hhZG93OiBib29sZWFuO1xyXG4gICAgc3VyZmFjZVJlY2VpdmVTaGFkb3c6IGJvb2xlYW47XHJcblxyXG4gICAgLy8gTGlnaHRpbmcgc2V0dGluZ3NcclxuICAgIGFtYmllbnRMaWdodEludGVuc2l0eTogbnVtYmVyO1xyXG4gICAgYW1iaWVudExpZ2h0Q29sb3I6IHN0cmluZztcclxuICAgIGRpcmVjdGlvbmFsTGlnaHRJbnRlbnNpdHk6IG51bWJlcjtcclxuICAgIGRpcmVjdGlvbmFsTGlnaHRDb2xvcjogc3RyaW5nO1xyXG4gICAgZGlyZWN0aW9uYWxMaWdodFBvc2l0aW9uWDogbnVtYmVyO1xyXG4gICAgZGlyZWN0aW9uYWxMaWdodFBvc2l0aW9uWTogbnVtYmVyO1xyXG4gICAgZGlyZWN0aW9uYWxMaWdodFBvc2l0aW9uWjogbnVtYmVyO1xyXG5cclxuICAgIC8vIFBlci1kaWNlLXR5cGUgdGV4dHVyZXNcclxuICAgIGRpY2VUZXh0dXJlczoge1xyXG4gICAgICAgIGQ0OiBzdHJpbmc7XHJcbiAgICAgICAgZDY6IHN0cmluZztcclxuICAgICAgICBkODogc3RyaW5nO1xyXG4gICAgICAgIGQxMDogc3RyaW5nO1xyXG4gICAgICAgIGQxMjogc3RyaW5nO1xyXG4gICAgICAgIGQyMDogc3RyaW5nO1xyXG4gICAgfTtcclxuXHJcbiAgICAvLyBQZXItZGljZS10eXBlIG5vcm1hbCBtYXBzXHJcbiAgICBkaWNlTm9ybWFsTWFwczoge1xyXG4gICAgICAgIGQ0OiBzdHJpbmc7XHJcbiAgICAgICAgZDY6IHN0cmluZztcclxuICAgICAgICBkODogc3RyaW5nO1xyXG4gICAgICAgIGQxMDogc3RyaW5nO1xyXG4gICAgICAgIGQxMjogc3RyaW5nO1xyXG4gICAgICAgIGQyMDogc3RyaW5nO1xyXG4gICAgfTtcclxuXHJcbiAgICAvLyBBbmltYXRpb24gc2V0dGluZ3NcclxuICAgIGVuYWJsZVJlc3VsdEFuaW1hdGlvbjogYm9vbGVhbjtcclxuXHJcbiAgICAvLyBNb3Rpb24gZGV0ZWN0aW9uIHNldHRpbmdzXHJcbiAgICBtb3Rpb25UaHJlc2hvbGQ6IG51bWJlcjtcclxuXHJcbiAgICAvLyBGYWNlIGRldGVjdGlvbiBzZXR0aW5nc1xyXG4gICAgZmFjZURldGVjdGlvblRvbGVyYW5jZTogbnVtYmVyO1xyXG5cclxuICAgIC8vIERlYnVnIHNldHRpbmdzXHJcbiAgICBlbmFibGVNb3Rpb25EZWJ1ZzogYm9vbGVhbjtcclxuXHJcbiAgICAvLyBGYWNlIGNhbGlicmF0aW9uIG1hcHBpbmdcclxuICAgIGZhY2VNYXBwaW5nOiB7IFtmYWNlSW5kZXg6IG51bWJlcl06IG51bWJlciB9O1xyXG5cclxuICAgIC8vIEFQSSBJbnRlZ3JhdGlvbiBzZXR0aW5nc1xyXG4gICAgYXBpRW5hYmxlZDogYm9vbGVhbjtcclxuICAgIGFwaUVuZHBvaW50OiBzdHJpbmc7XHJcblxyXG59XHJcblxyXG5leHBvcnQgY29uc3QgREVGQVVMVF9TRVRUSU5HUzogRGljZVNldHRpbmdzID0ge1xyXG4gICAgLy8gQ2FtZXJhIHdpbmRvdyBib3JkZXIgZGVmYXVsdHNcclxuICAgIHNob3dXaW5kb3dCb3JkZXI6IGZhbHNlLFxyXG4gICAgd2luZG93Qm9yZGVyQ29sb3I6ICcjZmZmZmZmJyxcclxuICAgIHdpbmRvd0JvcmRlck9wYWNpdHk6IDAuMyxcclxuICAgIHdpbmRvd0JvcmRlcldpZHRoOiAyLFxyXG5cclxuICAgIC8vIFN1cmZhY2UgYmFja2dyb3VuZCBkZWZhdWx0c1xyXG4gICAgc2hvd1N1cmZhY2U6IGZhbHNlLFxyXG4gICAgc3VyZmFjZUNvbG9yOiAnIzhCNDUxMycsXHJcbiAgICBzdXJmYWNlT3BhY2l0eTogMC4xLFxyXG4gICAgc3VyZmFjZUJvcmRlckNvbG9yOiAnIzY1NDMyMScsXHJcbiAgICBzdXJmYWNlQm9yZGVyT3BhY2l0eTogMC4zLFxyXG4gICAgc3VyZmFjZUJvcmRlcldpZHRoOiAyLFxyXG4gICAgdHJheVdpZHRoOiAxLjAsXHJcbiAgICB0cmF5TGVuZ3RoOiAxLjAsXHJcblxyXG4gICAgLy8gRGljZSBkZWZhdWx0c1xyXG4gICAgZGljZVR5cGU6ICdkMjAnLCAvLyBMZWdhY3kgLSB3aWxsIGJlIHJlbW92ZWRcclxuICAgIGRpY2VTaXplOiAwLjgsXHJcbiAgICBkaWNlQ29sb3I6ICcjZmY0NDQ0JyxcclxuXHJcbiAgICAvLyBNdWx0aS1kaWNlIGNvdW50cyBkZWZhdWx0cyAoc3RhcnQgd2l0aCBubyBkaWNlKVxyXG4gICAgZGljZUNvdW50czoge1xyXG4gICAgICAgIGQ0OiAwLFxyXG4gICAgICAgIGQ2OiAwLFxyXG4gICAgICAgIGQ4OiAwLFxyXG4gICAgICAgIGQxMDogMCxcclxuICAgICAgICBkMTI6IDAsXHJcbiAgICAgICAgZDIwOiAwXHJcbiAgICB9LFxyXG5cclxuICAgIC8vIEluZGl2aWR1YWwgZGljZSBzY2FsaW5nIGRlZmF1bHRzXHJcbiAgICBkaWNlU2NhbGVzOiB7XHJcbiAgICAgICAgZDQ6IDEuMCxcclxuICAgICAgICBkNjogMS4wLFxyXG4gICAgICAgIGQ4OiAxLjAsXHJcbiAgICAgICAgZDEwOiAxLjAsXHJcbiAgICAgICAgZDEyOiAxLjAsXHJcbiAgICAgICAgZDIwOiAxLjBcclxuICAgIH0sXHJcblxyXG4gICAgLy8gTWF0ZXJpYWwgZGVmYXVsdHNcclxuICAgIGRpY2VTaGluaW5lc3M6IDEwMCxcclxuICAgIGRpY2VTcGVjdWxhcjogJyMyMjIyMjInLFxyXG4gICAgZGljZVRyYW5zcGFyZW50OiBmYWxzZSxcclxuICAgIGRpY2VPcGFjaXR5OiAxLjAsXHJcblxyXG4gICAgLy8gU2hhZG93IGRlZmF1bHRzXHJcbiAgICBlbmFibGVTaGFkb3dzOiBmYWxzZSxcclxuICAgIGRpY2VDYXN0U2hhZG93OiB0cnVlLFxyXG4gICAgZGljZVJlY2VpdmVTaGFkb3c6IGZhbHNlLFxyXG4gICAgc3VyZmFjZVJlY2VpdmVTaGFkb3c6IHRydWUsXHJcblxyXG4gICAgLy8gTGlnaHRpbmcgZGVmYXVsdHNcclxuICAgIGFtYmllbnRMaWdodEludGVuc2l0eTogMS4yLFxyXG4gICAgYW1iaWVudExpZ2h0Q29sb3I6ICcjZmZmZmZmJyxcclxuICAgIGRpcmVjdGlvbmFsTGlnaHRJbnRlbnNpdHk6IDAuOCxcclxuICAgIGRpcmVjdGlvbmFsTGlnaHRDb2xvcjogJyNmZmZmZmYnLFxyXG4gICAgZGlyZWN0aW9uYWxMaWdodFBvc2l0aW9uWDogMCxcclxuICAgIGRpcmVjdGlvbmFsTGlnaHRQb3NpdGlvblk6IDM1LFxyXG4gICAgZGlyZWN0aW9uYWxMaWdodFBvc2l0aW9uWjogMCxcclxuXHJcbiAgICAvLyBQZXItZGljZS10eXBlIHRleHR1cmUgZGVmYXVsdHNcclxuICAgIGRpY2VUZXh0dXJlczoge1xyXG4gICAgICAgIGQ0OiAnJyxcclxuICAgICAgICBkNjogJycsXHJcbiAgICAgICAgZDg6ICcnLFxyXG4gICAgICAgIGQxMDogJycsXHJcbiAgICAgICAgZDEyOiAnJyxcclxuICAgICAgICBkMjA6ICcnXHJcbiAgICB9LFxyXG5cclxuICAgIC8vIFBlci1kaWNlLXR5cGUgbm9ybWFsIG1hcCBkZWZhdWx0c1xyXG4gICAgZGljZU5vcm1hbE1hcHM6IHtcclxuICAgICAgICBkNDogJycsXHJcbiAgICAgICAgZDY6ICcnLFxyXG4gICAgICAgIGQ4OiAnJyxcclxuICAgICAgICBkMTA6ICcnLFxyXG4gICAgICAgIGQxMjogJycsXHJcbiAgICAgICAgZDIwOiAnJ1xyXG4gICAgfSxcclxuXHJcbiAgICAvLyBBbmltYXRpb24gZGVmYXVsdHNcclxuICAgIGVuYWJsZVJlc3VsdEFuaW1hdGlvbjogdHJ1ZSxcclxuXHJcbiAgICAvLyBNb3Rpb24gZGV0ZWN0aW9uIGRlZmF1bHRzXHJcbiAgICBtb3Rpb25UaHJlc2hvbGQ6IDIuMCxcclxuXHJcbiAgICAvLyBGYWNlIGRldGVjdGlvbiBkZWZhdWx0c1xyXG4gICAgZmFjZURldGVjdGlvblRvbGVyYW5jZTogMC4zLFxyXG5cclxuICAgIC8vIERlYnVnIGRlZmF1bHRzXHJcbiAgICBlbmFibGVNb3Rpb25EZWJ1ZzogZmFsc2UsXHJcblxyXG4gICAgLy8gRmFjZSBtYXBwaW5nIGRlZmF1bHRzICgxOjEgbWFwcGluZyBpbml0aWFsbHkpXHJcbiAgICBmYWNlTWFwcGluZzoge1xyXG4gICAgICAgIDA6IDEsIDE6IDIsIDI6IDMsIDM6IDQsIDQ6IDUsIDU6IDYsIDY6IDcsIDc6IDgsIDg6IDksIDk6IDEwLFxyXG4gICAgICAgIDEwOiAxMSwgMTE6IDEyLCAxMjogMTMsIDEzOiAxNCwgMTQ6IDE1LCAxNTogMTYsIDE2OiAxNywgMTc6IDE4LCAxODogMTksIDE5OiAyMFxyXG4gICAgfSxcclxuXHJcbiAgICAvLyBBUEkgSW50ZWdyYXRpb24gZGVmYXVsdHNcclxuICAgIGFwaUVuYWJsZWQ6IGZhbHNlLFxyXG4gICAgYXBpRW5kcG9pbnQ6ICdodHRwOi8vbG9jYWxob3N0OjUwMDAnXHJcblxyXG59O1xyXG5cclxuZXhwb3J0IGNsYXNzIERpY2VTZXR0aW5nVGFiIGV4dGVuZHMgUGx1Z2luU2V0dGluZ1RhYiB7XHJcbiAgICBwbHVnaW46IEQyMERpY2VQbHVnaW47XHJcblxyXG4gICAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHBsdWdpbjogRDIwRGljZVBsdWdpbikge1xyXG4gICAgICAgIHN1cGVyKGFwcCwgcGx1Z2luKTtcclxuICAgICAgICB0aGlzLnBsdWdpbiA9IHBsdWdpbjtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGNyZWF0ZUNvbGxhcHNpYmxlU2VjdGlvbihjb250YWluZXJFbDogSFRNTEVsZW1lbnQsIHRpdGxlOiBzdHJpbmcsIGtleTogc3RyaW5nKTogSFRNTEVsZW1lbnQge1xyXG4gICAgICAgIGNvbnN0IHNlY3Rpb25Db250YWluZXIgPSBjb250YWluZXJFbC5jcmVhdGVEaXYoeyBjbHM6ICdkaWNlLXNldHRpbmdzLXNlY3Rpb24nIH0pO1xyXG5cclxuICAgICAgICAvLyBDcmVhdGUgaGVhZGVyIHdpdGggY29sbGFwc2UgdG9nZ2xlXHJcbiAgICAgICAgY29uc3QgaGVhZGVyID0gc2VjdGlvbkNvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6ICdkaWNlLXNldHRpbmdzLWhlYWRlcicgfSk7XHJcbiAgICAgICAgaGVhZGVyLnN0eWxlLmNzc1RleHQgPSAnY3Vyc29yOiBwb2ludGVyOyBwYWRkaW5nOiAxMHB4OyBiYWNrZ3JvdW5kOiB2YXIoLS1iYWNrZ3JvdW5kLW1vZGlmaWVyLWhvdmVyKTsgYm9yZGVyLXJhZGl1czogNXB4OyBtYXJnaW4tYm90dG9tOiAxMHB4OyBkaXNwbGF5OiBmbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBqdXN0aWZ5LWNvbnRlbnQ6IHNwYWNlLWJldHdlZW47JztcclxuXHJcbiAgICAgICAgY29uc3QgdGl0bGVfZWwgPSBoZWFkZXIuY3JlYXRlRWwoJ2gzJywgeyB0ZXh0OiB0aXRsZSB9KTtcclxuICAgICAgICB0aXRsZV9lbC5zdHlsZS5tYXJnaW4gPSAnMCc7XHJcblxyXG4gICAgICAgIGNvbnN0IGFycm93ID0gaGVhZGVyLmNyZWF0ZVNwYW4oeyB0ZXh0OiAn4pa8JyB9KTtcclxuICAgICAgICBhcnJvdy5zdHlsZS5jc3NUZXh0ID0gJ3RyYW5zaXRpb246IHRyYW5zZm9ybSAwLjJzOyc7XHJcblxyXG4gICAgICAgIGNvbnN0IGNvbnRlbnQgPSBzZWN0aW9uQ29udGFpbmVyLmNyZWF0ZURpdih7IGNsczogJ2RpY2Utc2V0dGluZ3MtY29udGVudCcgfSk7XHJcblxyXG4gICAgICAgIC8vIExvYWQgY29sbGFwc2VkIHN0YXRlIGZyb20gbG9jYWxTdG9yYWdlIChkZWZhdWx0IHRvIGNvbGxhcHNlZClcclxuICAgICAgICBjb25zdCBpc0NvbGxhcHNlZCA9IGxvY2FsU3RvcmFnZS5nZXRJdGVtKGBkaWNlLXNldHRpbmdzLSR7a2V5fWApICE9PSAnZmFsc2UnO1xyXG4gICAgICAgIGlmIChpc0NvbGxhcHNlZCkge1xyXG4gICAgICAgICAgICBjb250ZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XHJcbiAgICAgICAgICAgIGFycm93LnN0eWxlLnRyYW5zZm9ybSA9ICdyb3RhdGUoLTkwZGVnKSc7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBoZWFkZXIuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbGxhcHNlZCA9IGNvbnRlbnQuc3R5bGUuZGlzcGxheSA9PT0gJ25vbmUnO1xyXG4gICAgICAgICAgICBjb250ZW50LnN0eWxlLmRpc3BsYXkgPSBjb2xsYXBzZWQgPyAnYmxvY2snIDogJ25vbmUnO1xyXG4gICAgICAgICAgICBhcnJvdy5zdHlsZS50cmFuc2Zvcm0gPSBjb2xsYXBzZWQgPyAncm90YXRlKDBkZWcpJyA6ICdyb3RhdGUoLTkwZGVnKSc7XHJcbiAgICAgICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKGBkaWNlLXNldHRpbmdzLSR7a2V5fWAsICghY29sbGFwc2VkKS50b1N0cmluZygpKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgcmV0dXJuIGNvbnRlbnQ7XHJcbiAgICB9XHJcblxyXG4gICAgZGlzcGxheSgpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCB7IGNvbnRhaW5lckVsIH0gPSB0aGlzO1xyXG5cclxuICAgICAgICBjb250YWluZXJFbC5lbXB0eSgpO1xyXG5cclxuICAgICAgICBjb250YWluZXJFbC5jcmVhdGVFbCgnaDInLCB7IHRleHQ6ICdEMjAgRGljZSBSb2xsZXIgU2V0dGluZ3MnIH0pO1xyXG5cclxuICAgICAgICAvLyBDYW1lcmEgV2luZG93IEJvcmRlciBTZWN0aW9uXHJcbiAgICAgICAgY29uc3Qgd2luZG93Qm9yZGVyU2VjdGlvbiA9IHRoaXMuY3JlYXRlQ29sbGFwc2libGVTZWN0aW9uKGNvbnRhaW5lckVsLCAnQ2FtZXJhIFdpbmRvdyBCb3JkZXInLCAnd2luZG93LWJvcmRlcicpO1xyXG5cclxuICAgICAgICBuZXcgU2V0dGluZyh3aW5kb3dCb3JkZXJTZWN0aW9uKVxyXG4gICAgICAgICAgICAuc2V0TmFtZSgnU2hvdyB3aW5kb3cgYm9yZGVyJylcclxuICAgICAgICAgICAgLnNldERlc2MoJ0Rpc3BsYXkgYSBib3JkZXIgYXJvdW5kIHRoZSAzRCB2aWV3IHdpbmRvdycpXHJcbiAgICAgICAgICAgIC5hZGRUb2dnbGUodG9nZ2xlID0+IHRvZ2dsZVxyXG4gICAgICAgICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnNob3dXaW5kb3dCb3JkZXIpXHJcbiAgICAgICAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Muc2hvd1dpbmRvd0JvcmRlciA9IHZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnJlZnJlc2hEaWNlVmlldygpO1xyXG4gICAgICAgICAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICBuZXcgU2V0dGluZyh3aW5kb3dCb3JkZXJTZWN0aW9uKVxyXG4gICAgICAgICAgICAuc2V0TmFtZSgnQm9yZGVyIGNvbG9yJylcclxuICAgICAgICAgICAgLnNldERlc2MoJ0NvbG9yIG9mIHRoZSB3aW5kb3cgYm9yZGVyJylcclxuICAgICAgICAgICAgLmFkZENvbG9yUGlja2VyKGNvbG9yID0+IGNvbG9yXHJcbiAgICAgICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Mud2luZG93Qm9yZGVyQ29sb3IpXHJcbiAgICAgICAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Mud2luZG93Qm9yZGVyQ29sb3IgPSB2YWx1ZTtcclxuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5yZWZyZXNoRGljZVZpZXcoKTtcclxuICAgICAgICAgICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgbmV3IFNldHRpbmcod2luZG93Qm9yZGVyU2VjdGlvbilcclxuICAgICAgICAgICAgLnNldE5hbWUoJ0JvcmRlciBvcGFjaXR5JylcclxuICAgICAgICAgICAgLnNldERlc2MoJ1RyYW5zcGFyZW5jeSBvZiB0aGUgd2luZG93IGJvcmRlciAoMCA9IGludmlzaWJsZSwgMSA9IG9wYXF1ZSknKVxyXG4gICAgICAgICAgICAuYWRkU2xpZGVyKHNsaWRlciA9PiBzbGlkZXJcclxuICAgICAgICAgICAgICAgIC5zZXRMaW1pdHMoMCwgMSwgMC4xKVxyXG4gICAgICAgICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLndpbmRvd0JvcmRlck9wYWNpdHkpXHJcbiAgICAgICAgICAgICAgICAuc2V0RHluYW1pY1Rvb2x0aXAoKVxyXG4gICAgICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLndpbmRvd0JvcmRlck9wYWNpdHkgPSB2YWx1ZTtcclxuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5yZWZyZXNoRGljZVZpZXcoKTtcclxuICAgICAgICAgICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgbmV3IFNldHRpbmcod2luZG93Qm9yZGVyU2VjdGlvbilcclxuICAgICAgICAgICAgLnNldE5hbWUoJ0JvcmRlciB3aWR0aCcpXHJcbiAgICAgICAgICAgIC5zZXREZXNjKCdXaWR0aCBvZiB0aGUgd2luZG93IGJvcmRlciBpbiBwaXhlbHMnKVxyXG4gICAgICAgICAgICAuYWRkU2xpZGVyKHNsaWRlciA9PiBzbGlkZXJcclxuICAgICAgICAgICAgICAgIC5zZXRMaW1pdHMoMSwgMTAsIDEpXHJcbiAgICAgICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Mud2luZG93Qm9yZGVyV2lkdGgpXHJcbiAgICAgICAgICAgICAgICAuc2V0RHluYW1pY1Rvb2x0aXAoKVxyXG4gICAgICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLndpbmRvd0JvcmRlcldpZHRoID0gdmFsdWU7XHJcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4ucmVmcmVzaERpY2VWaWV3KCk7XHJcbiAgICAgICAgICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIC8vIFN1cmZhY2UgQmFja2dyb3VuZCBTZWN0aW9uXHJcbiAgICAgICAgY29uc3Qgc3VyZmFjZVNlY3Rpb24gPSB0aGlzLmNyZWF0ZUNvbGxhcHNpYmxlU2VjdGlvbihjb250YWluZXJFbCwgJ0RpY2UgVHJheSBTdXJmYWNlJywgJ3N1cmZhY2UnKTtcclxuXHJcbiAgICAgICAgbmV3IFNldHRpbmcoc3VyZmFjZVNlY3Rpb24pXHJcbiAgICAgICAgICAgIC5zZXROYW1lKCdTaG93IGRpY2UgdHJheScpXHJcbiAgICAgICAgICAgIC5zZXREZXNjKCdEaXNwbGF5IGEgdmlzaWJsZSBzdXJmYWNlIGZvciB0aGUgZGljZSB0byByb2xsIG9uJylcclxuICAgICAgICAgICAgLmFkZFRvZ2dsZSh0b2dnbGUgPT4gdG9nZ2xlXHJcbiAgICAgICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Muc2hvd1N1cmZhY2UpXHJcbiAgICAgICAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Muc2hvd1N1cmZhY2UgPSB2YWx1ZTtcclxuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5yZWZyZXNoRGljZVZpZXcoKTtcclxuICAgICAgICAgICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgbmV3IFNldHRpbmcoc3VyZmFjZVNlY3Rpb24pXHJcbiAgICAgICAgICAgIC5zZXROYW1lKCdTdXJmYWNlIGNvbG9yJylcclxuICAgICAgICAgICAgLnNldERlc2MoJ0NvbG9yIG9mIHRoZSBkaWNlIHRyYXkgc3VyZmFjZScpXHJcbiAgICAgICAgICAgIC5hZGRDb2xvclBpY2tlcihjb2xvciA9PiBjb2xvclxyXG4gICAgICAgICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnN1cmZhY2VDb2xvcilcclxuICAgICAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zdXJmYWNlQ29sb3IgPSB2YWx1ZTtcclxuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5yZWZyZXNoRGljZVZpZXcoKTtcclxuICAgICAgICAgICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgbmV3IFNldHRpbmcoc3VyZmFjZVNlY3Rpb24pXHJcbiAgICAgICAgICAgIC5zZXROYW1lKCdTdXJmYWNlIG9wYWNpdHknKVxyXG4gICAgICAgICAgICAuc2V0RGVzYygnVHJhbnNwYXJlbmN5IG9mIHRoZSBzdXJmYWNlICgwID0gaW52aXNpYmxlLCAxID0gb3BhcXVlKScpXHJcbiAgICAgICAgICAgIC5hZGRTbGlkZXIoc2xpZGVyID0+IHNsaWRlclxyXG4gICAgICAgICAgICAgICAgLnNldExpbWl0cygwLCAxLCAwLjEpXHJcbiAgICAgICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Muc3VyZmFjZU9wYWNpdHkpXHJcbiAgICAgICAgICAgICAgICAuc2V0RHluYW1pY1Rvb2x0aXAoKVxyXG4gICAgICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnN1cmZhY2VPcGFjaXR5ID0gdmFsdWU7XHJcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4ucmVmcmVzaERpY2VWaWV3KCk7XHJcbiAgICAgICAgICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIG5ldyBTZXR0aW5nKHN1cmZhY2VTZWN0aW9uKVxyXG4gICAgICAgICAgICAuc2V0TmFtZSgnU3VyZmFjZSBib3JkZXIgY29sb3InKVxyXG4gICAgICAgICAgICAuc2V0RGVzYygnQ29sb3Igb2YgdGhlIHN1cmZhY2UgYm9yZGVyJylcclxuICAgICAgICAgICAgLmFkZENvbG9yUGlja2VyKGNvbG9yID0+IGNvbG9yXHJcbiAgICAgICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Muc3VyZmFjZUJvcmRlckNvbG9yKVxyXG4gICAgICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnN1cmZhY2VCb3JkZXJDb2xvciA9IHZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnJlZnJlc2hEaWNlVmlldygpO1xyXG4gICAgICAgICAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICBuZXcgU2V0dGluZyhzdXJmYWNlU2VjdGlvbilcclxuICAgICAgICAgICAgLnNldE5hbWUoJ1N1cmZhY2UgYm9yZGVyIG9wYWNpdHknKVxyXG4gICAgICAgICAgICAuc2V0RGVzYygnVHJhbnNwYXJlbmN5IG9mIHRoZSBzdXJmYWNlIGJvcmRlcicpXHJcbiAgICAgICAgICAgIC5hZGRTbGlkZXIoc2xpZGVyID0+IHNsaWRlclxyXG4gICAgICAgICAgICAgICAgLnNldExpbWl0cygwLCAxLCAwLjEpXHJcbiAgICAgICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Muc3VyZmFjZUJvcmRlck9wYWNpdHkpXHJcbiAgICAgICAgICAgICAgICAuc2V0RHluYW1pY1Rvb2x0aXAoKVxyXG4gICAgICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnN1cmZhY2VCb3JkZXJPcGFjaXR5ID0gdmFsdWU7XHJcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4ucmVmcmVzaERpY2VWaWV3KCk7XHJcbiAgICAgICAgICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIG5ldyBTZXR0aW5nKHN1cmZhY2VTZWN0aW9uKVxyXG4gICAgICAgICAgICAuc2V0TmFtZSgnU3VyZmFjZSBib3JkZXIgd2lkdGgnKVxyXG4gICAgICAgICAgICAuc2V0RGVzYygnV2lkdGggb2YgdGhlIHN1cmZhY2UgYm9yZGVyJylcclxuICAgICAgICAgICAgLmFkZFNsaWRlcihzbGlkZXIgPT4gc2xpZGVyXHJcbiAgICAgICAgICAgICAgICAuc2V0TGltaXRzKDAsIDUsIDAuNSlcclxuICAgICAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5zdXJmYWNlQm9yZGVyV2lkdGgpXHJcbiAgICAgICAgICAgICAgICAuc2V0RHluYW1pY1Rvb2x0aXAoKVxyXG4gICAgICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnN1cmZhY2VCb3JkZXJXaWR0aCA9IHZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnJlZnJlc2hEaWNlVmlldygpO1xyXG4gICAgICAgICAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICBuZXcgU2V0dGluZyhzdXJmYWNlU2VjdGlvbilcclxuICAgICAgICAgICAgLnNldE5hbWUoJ1RyYXkgd2lkdGgnKVxyXG4gICAgICAgICAgICAuc2V0RGVzYygnV2lkdGggb2YgdGhlIGRpY2UgdHJheSAoMC41ID0gbmFycm93LCAxLjUgPSB3aWRlKScpXHJcbiAgICAgICAgICAgIC5hZGRTbGlkZXIoc2xpZGVyID0+IHNsaWRlclxyXG4gICAgICAgICAgICAgICAgLnNldExpbWl0cygwLjMsIDIuMCwgMC4xKVxyXG4gICAgICAgICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnRyYXlXaWR0aClcclxuICAgICAgICAgICAgICAgIC5zZXREeW5hbWljVG9vbHRpcCgpXHJcbiAgICAgICAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MudHJheVdpZHRoID0gdmFsdWU7XHJcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4ucmVmcmVzaERpY2VWaWV3KCk7XHJcbiAgICAgICAgICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIG5ldyBTZXR0aW5nKHN1cmZhY2VTZWN0aW9uKVxyXG4gICAgICAgICAgICAuc2V0TmFtZSgnVHJheSBsZW5ndGgnKVxyXG4gICAgICAgICAgICAuc2V0RGVzYygnTGVuZ3RoIG9mIHRoZSBkaWNlIHRyYXkgKDAuNSA9IHNob3J0LCAxLjUgPSBsb25nKScpXHJcbiAgICAgICAgICAgIC5hZGRTbGlkZXIoc2xpZGVyID0+IHNsaWRlclxyXG4gICAgICAgICAgICAgICAgLnNldExpbWl0cygwLjMsIDIuMCwgMC4xKVxyXG4gICAgICAgICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnRyYXlMZW5ndGgpXHJcbiAgICAgICAgICAgICAgICAuc2V0RHluYW1pY1Rvb2x0aXAoKVxyXG4gICAgICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnRyYXlMZW5ndGggPSB2YWx1ZTtcclxuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5yZWZyZXNoRGljZVZpZXcoKTtcclxuICAgICAgICAgICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgLy8gRGljZSBDb25maWd1cmF0aW9uIFNlY3Rpb25cclxuICAgICAgICBjb25zdCBkaWNlU2VjdGlvbiA9IHRoaXMuY3JlYXRlQ29sbGFwc2libGVTZWN0aW9uKGNvbnRhaW5lckVsLCAnRGljZSBDb25maWd1cmF0aW9uJywgJ2RpY2UnKTtcclxuXHJcblxyXG4gICAgICAgIG5ldyBTZXR0aW5nKGRpY2VTZWN0aW9uKVxyXG4gICAgICAgICAgICAuc2V0TmFtZSgnRGljZSBzaXplJylcclxuICAgICAgICAgICAgLnNldERlc2MoJ1NpemUgb2YgdGhlIGRpY2UgKDAuNSA9IHNtYWxsLCAxLjUgPSBsYXJnZSknKVxyXG4gICAgICAgICAgICAuYWRkU2xpZGVyKHNsaWRlciA9PiBzbGlkZXJcclxuICAgICAgICAgICAgICAgIC5zZXRMaW1pdHMoMC4zLCAyLjAsIDAuMSlcclxuICAgICAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5kaWNlU2l6ZSlcclxuICAgICAgICAgICAgICAgIC5zZXREeW5hbWljVG9vbHRpcCgpXHJcbiAgICAgICAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuZGljZVNpemUgPSB2YWx1ZTtcclxuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5yZWZyZXNoRGljZVZpZXcoKTtcclxuICAgICAgICAgICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgLy8gSW5kaXZpZHVhbCBkaWNlIHR5cGUgc2NhbGluZ1xyXG4gICAgICAgIGNvbnN0IGRpY2VTY2FsZVR5cGVzID0gWydkNCcsICdkNicsICdkOCcsICdkMTAnLCAnZDEyJywgJ2QyMCddO1xyXG4gICAgICAgIGRpY2VTY2FsZVR5cGVzLmZvckVhY2goZGljZVR5cGUgPT4ge1xyXG4gICAgICAgICAgICBuZXcgU2V0dGluZyhkaWNlU2VjdGlvbilcclxuICAgICAgICAgICAgICAgIC5zZXROYW1lKGAke2RpY2VUeXBlLnRvVXBwZXJDYXNlKCl9IHNjYWxlYClcclxuICAgICAgICAgICAgICAgIC5zZXREZXNjKGBJbmRpdmlkdWFsIHNjYWxpbmcgZm9yICR7ZGljZVR5cGUudG9VcHBlckNhc2UoKX0gZGljZSAoMC41ID0gc21hbGwsIDIuMCA9IGxhcmdlKWApXHJcbiAgICAgICAgICAgICAgICAuYWRkU2xpZGVyKHNsaWRlciA9PiBzbGlkZXJcclxuICAgICAgICAgICAgICAgICAgICAuc2V0TGltaXRzKDAuMywgMi4wLCAwLjEpXHJcbiAgICAgICAgICAgICAgICAgICAgLnNldFZhbHVlKCh0aGlzLnBsdWdpbi5zZXR0aW5ncy5kaWNlU2NhbGVzIGFzIGFueSlbZGljZVR5cGVdKVxyXG4gICAgICAgICAgICAgICAgICAgIC5zZXREeW5hbWljVG9vbHRpcCgpXHJcbiAgICAgICAgICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAodGhpcy5wbHVnaW4uc2V0dGluZ3MuZGljZVNjYWxlcyBhcyBhbnkpW2RpY2VUeXBlXSA9IHZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4ucmVmcmVzaERpY2VWaWV3KCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSkpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBuZXcgU2V0dGluZyhkaWNlU2VjdGlvbilcclxuICAgICAgICAgICAgLnNldE5hbWUoJ0RpY2UgY29sb3InKVxyXG4gICAgICAgICAgICAuc2V0RGVzYygnQmFzZSBjb2xvciBvZiB0aGUgZGljZSAoYXBwbGllcyBhcyB0aW50IHdpdGggdGV4dHVyZXMpJylcclxuICAgICAgICAgICAgLmFkZENvbG9yUGlja2VyKGNvbG9yID0+IGNvbG9yXHJcbiAgICAgICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuZGljZUNvbG9yKVxyXG4gICAgICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmRpY2VDb2xvciA9IHZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnJlZnJlc2hEaWNlVmlldygpO1xyXG4gICAgICAgICAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICAvLyBNYXRlcmlhbCBQcm9wZXJ0aWVzXHJcbiAgICAgICAgY29udGFpbmVyRWwuY3JlYXRlRWwoJ2g0JywgeyB0ZXh0OiAnTWF0ZXJpYWwgUHJvcGVydGllcycsIGNsczogJ2RpY2Utc2V0dGluZ3Mtc3ViaGVhZGVyJyB9KTtcclxuXHJcbiAgICAgICAgbmV3IFNldHRpbmcoZGljZVNlY3Rpb24pXHJcbiAgICAgICAgICAgIC5zZXROYW1lKCdTaGluaW5lc3MnKVxyXG4gICAgICAgICAgICAuc2V0RGVzYygnSG93IHNoaW55L3JlZmxlY3RpdmUgdGhlIGRpY2Ugc3VyZmFjZSBhcHBlYXJzICgwID0gbWF0dGUsIDIwMCA9IGdsb3NzeSknKVxyXG4gICAgICAgICAgICAuYWRkU2xpZGVyKHNsaWRlciA9PiBzbGlkZXJcclxuICAgICAgICAgICAgICAgIC5zZXRMaW1pdHMoMCwgMjAwLCAxMClcclxuICAgICAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5kaWNlU2hpbmluZXNzKVxyXG4gICAgICAgICAgICAgICAgLnNldER5bmFtaWNUb29sdGlwKClcclxuICAgICAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5kaWNlU2hpbmluZXNzID0gdmFsdWU7XHJcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4ucmVmcmVzaERpY2VWaWV3KCk7XHJcbiAgICAgICAgICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIG5ldyBTZXR0aW5nKGRpY2VTZWN0aW9uKVxyXG4gICAgICAgICAgICAuc2V0TmFtZSgnU3BlY3VsYXIgaGlnaGxpZ2h0IGNvbG9yJylcclxuICAgICAgICAgICAgLnNldERlc2MoJ0NvbG9yIG9mIHRoZSBzaGlueSBoaWdobGlnaHRzIG9uIHRoZSBkaWNlJylcclxuICAgICAgICAgICAgLmFkZENvbG9yUGlja2VyKGNvbG9yID0+IGNvbG9yXHJcbiAgICAgICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuZGljZVNwZWN1bGFyKVxyXG4gICAgICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmRpY2VTcGVjdWxhciA9IHZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnJlZnJlc2hEaWNlVmlldygpO1xyXG4gICAgICAgICAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICBuZXcgU2V0dGluZyhkaWNlU2VjdGlvbilcclxuICAgICAgICAgICAgLnNldE5hbWUoJ0VuYWJsZSB0cmFuc3BhcmVuY3knKVxyXG4gICAgICAgICAgICAuc2V0RGVzYygnTWFrZSB0aGUgZGljZSBzZW1pLXRyYW5zcGFyZW50JylcclxuICAgICAgICAgICAgLmFkZFRvZ2dsZSh0b2dnbGUgPT4gdG9nZ2xlXHJcbiAgICAgICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuZGljZVRyYW5zcGFyZW50KVxyXG4gICAgICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmRpY2VUcmFuc3BhcmVudCA9IHZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnJlZnJlc2hEaWNlVmlldygpO1xyXG4gICAgICAgICAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICBuZXcgU2V0dGluZyhkaWNlU2VjdGlvbilcclxuICAgICAgICAgICAgLnNldE5hbWUoJ09wYWNpdHknKVxyXG4gICAgICAgICAgICAuc2V0RGVzYygnVHJhbnNwYXJlbmN5IGxldmVsIHdoZW4gdHJhbnNwYXJlbmN5IGlzIGVuYWJsZWQgKDAgPSBpbnZpc2libGUsIDEgPSBvcGFxdWUpJylcclxuICAgICAgICAgICAgLmFkZFNsaWRlcihzbGlkZXIgPT4gc2xpZGVyXHJcbiAgICAgICAgICAgICAgICAuc2V0TGltaXRzKDAuMSwgMSwgMC4wNSlcclxuICAgICAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5kaWNlT3BhY2l0eSlcclxuICAgICAgICAgICAgICAgIC5zZXREeW5hbWljVG9vbHRpcCgpXHJcbiAgICAgICAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuZGljZU9wYWNpdHkgPSB2YWx1ZTtcclxuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5yZWZyZXNoRGljZVZpZXcoKTtcclxuICAgICAgICAgICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgLy8gU2hhZG93IFNldHRpbmdzIFNlY3Rpb25cclxuICAgICAgICBjb25zdCBzaGFkb3dTZWN0aW9uID0gdGhpcy5jcmVhdGVDb2xsYXBzaWJsZVNlY3Rpb24oY29udGFpbmVyRWwsICdTaGFkb3cgU2V0dGluZ3MnLCAnc2hhZG93cycpO1xyXG5cclxuICAgICAgICBuZXcgU2V0dGluZyhzaGFkb3dTZWN0aW9uKVxyXG4gICAgICAgICAgICAuc2V0TmFtZSgnRW5hYmxlIHNoYWRvd3MnKVxyXG4gICAgICAgICAgICAuc2V0RGVzYygnRW5hYmxlIHJlYWxpc3RpYyBzaGFkb3cgcmVuZGVyaW5nIChtYXkgaW1wYWN0IHBlcmZvcm1hbmNlKScpXHJcbiAgICAgICAgICAgIC5hZGRUb2dnbGUodG9nZ2xlID0+IHRvZ2dsZVxyXG4gICAgICAgICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmVuYWJsZVNoYWRvd3MpXHJcbiAgICAgICAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuZW5hYmxlU2hhZG93cyA9IHZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnJlZnJlc2hEaWNlVmlldygpO1xyXG4gICAgICAgICAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICBuZXcgU2V0dGluZyhzaGFkb3dTZWN0aW9uKVxyXG4gICAgICAgICAgICAuc2V0TmFtZSgnRGljZSBjYXN0IHNoYWRvd3MnKVxyXG4gICAgICAgICAgICAuc2V0RGVzYygnQWxsb3cgZGljZSB0byBjYXN0IHNoYWRvd3Mgb24gc3VyZmFjZXMnKVxyXG4gICAgICAgICAgICAuYWRkVG9nZ2xlKHRvZ2dsZSA9PiB0b2dnbGVcclxuICAgICAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5kaWNlQ2FzdFNoYWRvdylcclxuICAgICAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5kaWNlQ2FzdFNoYWRvdyA9IHZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnJlZnJlc2hEaWNlVmlldygpO1xyXG4gICAgICAgICAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICBuZXcgU2V0dGluZyhzaGFkb3dTZWN0aW9uKVxyXG4gICAgICAgICAgICAuc2V0TmFtZSgnRGljZSByZWNlaXZlIHNoYWRvd3MnKVxyXG4gICAgICAgICAgICAuc2V0RGVzYygnQWxsb3cgc2hhZG93cyB0byBiZSBjYXN0IG9uIGRpY2Ugc3VyZmFjZXMnKVxyXG4gICAgICAgICAgICAuYWRkVG9nZ2xlKHRvZ2dsZSA9PiB0b2dnbGVcclxuICAgICAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5kaWNlUmVjZWl2ZVNoYWRvdylcclxuICAgICAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5kaWNlUmVjZWl2ZVNoYWRvdyA9IHZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnJlZnJlc2hEaWNlVmlldygpO1xyXG4gICAgICAgICAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICBuZXcgU2V0dGluZyhzaGFkb3dTZWN0aW9uKVxyXG4gICAgICAgICAgICAuc2V0TmFtZSgnU3VyZmFjZSByZWNlaXZlIHNoYWRvd3MnKVxyXG4gICAgICAgICAgICAuc2V0RGVzYygnQWxsb3cgc2hhZG93cyB0byBiZSBjYXN0IG9uIHRoZSBkaWNlIHRyYXkgc3VyZmFjZScpXHJcbiAgICAgICAgICAgIC5hZGRUb2dnbGUodG9nZ2xlID0+IHRvZ2dsZVxyXG4gICAgICAgICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnN1cmZhY2VSZWNlaXZlU2hhZG93KVxyXG4gICAgICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnN1cmZhY2VSZWNlaXZlU2hhZG93ID0gdmFsdWU7XHJcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4ucmVmcmVzaERpY2VWaWV3KCk7XHJcbiAgICAgICAgICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIC8vIExpZ2h0aW5nIFNldHRpbmdzIFNlY3Rpb25cclxuICAgICAgICBjb25zdCBsaWdodGluZ1NlY3Rpb24gPSB0aGlzLmNyZWF0ZUNvbGxhcHNpYmxlU2VjdGlvbihjb250YWluZXJFbCwgJ0xpZ2h0aW5nIFNldHRpbmdzJywgJ2xpZ2h0aW5nJyk7XHJcblxyXG4gICAgICAgIGxpZ2h0aW5nU2VjdGlvbi5jcmVhdGVFbCgnaDQnLCB7IHRleHQ6ICdBbWJpZW50IExpZ2h0JywgY2xzOiAnZGljZS1zZXR0aW5ncy1zdWJoZWFkZXInIH0pO1xyXG5cclxuICAgICAgICBuZXcgU2V0dGluZyhsaWdodGluZ1NlY3Rpb24pXHJcbiAgICAgICAgICAgIC5zZXROYW1lKCdBbWJpZW50IGxpZ2h0IGludGVuc2l0eScpXHJcbiAgICAgICAgICAgIC5zZXREZXNjKCdPdmVyYWxsIGJyaWdodG5lc3Mgb2YgdGhlIHNjZW5lICgwID0gZGFyaywgMyA9IHZlcnkgYnJpZ2h0KScpXHJcbiAgICAgICAgICAgIC5hZGRTbGlkZXIoc2xpZGVyID0+IHNsaWRlclxyXG4gICAgICAgICAgICAgICAgLnNldExpbWl0cygwLCAzLCAwLjEpXHJcbiAgICAgICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuYW1iaWVudExpZ2h0SW50ZW5zaXR5KVxyXG4gICAgICAgICAgICAgICAgLnNldER5bmFtaWNUb29sdGlwKClcclxuICAgICAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5hbWJpZW50TGlnaHRJbnRlbnNpdHkgPSB2YWx1ZTtcclxuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5yZWZyZXNoRGljZVZpZXcoKTtcclxuICAgICAgICAgICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgbmV3IFNldHRpbmcobGlnaHRpbmdTZWN0aW9uKVxyXG4gICAgICAgICAgICAuc2V0TmFtZSgnQW1iaWVudCBsaWdodCBjb2xvcicpXHJcbiAgICAgICAgICAgIC5zZXREZXNjKCdDb2xvciBvZiB0aGUgYW1iaWVudCBsaWdodGluZycpXHJcbiAgICAgICAgICAgIC5hZGRDb2xvclBpY2tlcihjb2xvciA9PiBjb2xvclxyXG4gICAgICAgICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmFtYmllbnRMaWdodENvbG9yKVxyXG4gICAgICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmFtYmllbnRMaWdodENvbG9yID0gdmFsdWU7XHJcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4ucmVmcmVzaERpY2VWaWV3KCk7XHJcbiAgICAgICAgICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIGxpZ2h0aW5nU2VjdGlvbi5jcmVhdGVFbCgnaDQnLCB7IHRleHQ6ICdEaXJlY3Rpb25hbCBMaWdodCcsIGNsczogJ2RpY2Utc2V0dGluZ3Mtc3ViaGVhZGVyJyB9KTtcclxuXHJcbiAgICAgICAgbmV3IFNldHRpbmcobGlnaHRpbmdTZWN0aW9uKVxyXG4gICAgICAgICAgICAuc2V0TmFtZSgnRGlyZWN0aW9uYWwgbGlnaHQgaW50ZW5zaXR5JylcclxuICAgICAgICAgICAgLnNldERlc2MoJ1N0cmVuZ3RoIG9mIGRpcmVjdGlvbmFsIGxpZ2h0aW5nICgwID0gbm8gZGlyZWN0aW9uYWwgbGlnaHQsIDIgPSB2ZXJ5IHN0cm9uZyknKVxyXG4gICAgICAgICAgICAuYWRkU2xpZGVyKHNsaWRlciA9PiBzbGlkZXJcclxuICAgICAgICAgICAgICAgIC5zZXRMaW1pdHMoMCwgMiwgMC4xKVxyXG4gICAgICAgICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmRpcmVjdGlvbmFsTGlnaHRJbnRlbnNpdHkpXHJcbiAgICAgICAgICAgICAgICAuc2V0RHluYW1pY1Rvb2x0aXAoKVxyXG4gICAgICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmRpcmVjdGlvbmFsTGlnaHRJbnRlbnNpdHkgPSB2YWx1ZTtcclxuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5yZWZyZXNoRGljZVZpZXcoKTtcclxuICAgICAgICAgICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgbmV3IFNldHRpbmcobGlnaHRpbmdTZWN0aW9uKVxyXG4gICAgICAgICAgICAuc2V0TmFtZSgnRGlyZWN0aW9uYWwgbGlnaHQgY29sb3InKVxyXG4gICAgICAgICAgICAuc2V0RGVzYygnQ29sb3Igb2YgdGhlIGRpcmVjdGlvbmFsIGxpZ2h0aW5nJylcclxuICAgICAgICAgICAgLmFkZENvbG9yUGlja2VyKGNvbG9yID0+IGNvbG9yXHJcbiAgICAgICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuZGlyZWN0aW9uYWxMaWdodENvbG9yKVxyXG4gICAgICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmRpcmVjdGlvbmFsTGlnaHRDb2xvciA9IHZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnJlZnJlc2hEaWNlVmlldygpO1xyXG4gICAgICAgICAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICBuZXcgU2V0dGluZyhsaWdodGluZ1NlY3Rpb24pXHJcbiAgICAgICAgICAgIC5zZXROYW1lKCdMaWdodCBwb3NpdGlvbiBYJylcclxuICAgICAgICAgICAgLnNldERlc2MoJ0hvcml6b250YWwgcG9zaXRpb24gb2YgdGhlIGRpcmVjdGlvbmFsIGxpZ2h0ICgtNTAgdG8gNTApJylcclxuICAgICAgICAgICAgLmFkZFNsaWRlcihzbGlkZXIgPT4gc2xpZGVyXHJcbiAgICAgICAgICAgICAgICAuc2V0TGltaXRzKC01MCwgNTAsIDEpXHJcbiAgICAgICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuZGlyZWN0aW9uYWxMaWdodFBvc2l0aW9uWClcclxuICAgICAgICAgICAgICAgIC5zZXREeW5hbWljVG9vbHRpcCgpXHJcbiAgICAgICAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuZGlyZWN0aW9uYWxMaWdodFBvc2l0aW9uWCA9IHZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnJlZnJlc2hEaWNlVmlldygpO1xyXG4gICAgICAgICAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICBuZXcgU2V0dGluZyhsaWdodGluZ1NlY3Rpb24pXHJcbiAgICAgICAgICAgIC5zZXROYW1lKCdMaWdodCBwb3NpdGlvbiBZJylcclxuICAgICAgICAgICAgLnNldERlc2MoJ1ZlcnRpY2FsIHBvc2l0aW9uIG9mIHRoZSBkaXJlY3Rpb25hbCBsaWdodCAoMCB0byAxMDApJylcclxuICAgICAgICAgICAgLmFkZFNsaWRlcihzbGlkZXIgPT4gc2xpZGVyXHJcbiAgICAgICAgICAgICAgICAuc2V0TGltaXRzKDAsIDEwMCwgMSlcclxuICAgICAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5kaXJlY3Rpb25hbExpZ2h0UG9zaXRpb25ZKVxyXG4gICAgICAgICAgICAgICAgLnNldER5bmFtaWNUb29sdGlwKClcclxuICAgICAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5kaXJlY3Rpb25hbExpZ2h0UG9zaXRpb25ZID0gdmFsdWU7XHJcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4ucmVmcmVzaERpY2VWaWV3KCk7XHJcbiAgICAgICAgICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIG5ldyBTZXR0aW5nKGxpZ2h0aW5nU2VjdGlvbilcclxuICAgICAgICAgICAgLnNldE5hbWUoJ0xpZ2h0IHBvc2l0aW9uIFonKVxyXG4gICAgICAgICAgICAuc2V0RGVzYygnRGVwdGggcG9zaXRpb24gb2YgdGhlIGRpcmVjdGlvbmFsIGxpZ2h0ICgtNTAgdG8gNTApJylcclxuICAgICAgICAgICAgLmFkZFNsaWRlcihzbGlkZXIgPT4gc2xpZGVyXHJcbiAgICAgICAgICAgICAgICAuc2V0TGltaXRzKC01MCwgNTAsIDEpXHJcbiAgICAgICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuZGlyZWN0aW9uYWxMaWdodFBvc2l0aW9uWilcclxuICAgICAgICAgICAgICAgIC5zZXREeW5hbWljVG9vbHRpcCgpXHJcbiAgICAgICAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuZGlyZWN0aW9uYWxMaWdodFBvc2l0aW9uWiA9IHZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnJlZnJlc2hEaWNlVmlldygpO1xyXG4gICAgICAgICAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICAvLyBDdXN0b20gVGV4dHVyZXMgU2VjdGlvbiAtIGFsd2F5cyBzaG93blxyXG4gICAgICAgIGNvbnN0IHRleHR1cmVTZWN0aW9uID0gdGhpcy5jcmVhdGVDb2xsYXBzaWJsZVNlY3Rpb24oY29udGFpbmVyRWwsICdDdXN0b20gVGV4dHVyZXMnLCAndGV4dHVyZXMnKTtcclxuXHJcbiAgICAgICAgdGV4dHVyZVNlY3Rpb24uY3JlYXRlRWwoJ3AnLCB7XHJcbiAgICAgICAgICAgICAgICB0ZXh0OiAnVXBsb2FkIGN1c3RvbSBpbWFnZXMgZm9yIGVhY2ggZGljZSB0eXBlLiBJbWFnZXMgd2lsbCB1c2UgYXBwcm9wcmlhdGUgVVYgbWFwcGluZyBiYXNlZCBvbiB0aGUgZGljZSBnZW9tZXRyeS4nLFxyXG4gICAgICAgICAgICAgICAgY2xzOiAnc2V0dGluZy1pdGVtLWRlc2NyaXB0aW9uJ1xyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGRpY2VUeXBlcyA9IFtcclxuICAgICAgICAgICAgICAgIHsga2V5OiAnZDQnLCBuYW1lOiAnRDQnLCB1dlR5cGU6ICd0cmlhbmdsZXMnIH0sXHJcbiAgICAgICAgICAgICAgICB7IGtleTogJ2Q2JywgbmFtZTogJ0Q2JywgdXZUeXBlOiAnc3F1YXJlcycgfSxcclxuICAgICAgICAgICAgICAgIHsga2V5OiAnZDgnLCBuYW1lOiAnRDgnLCB1dlR5cGU6ICd0cmlhbmdsZXMnIH0sXHJcbiAgICAgICAgICAgICAgICB7IGtleTogJ2QxMCcsIG5hbWU6ICdEMTAnLCB1dlR5cGU6ICdjdXN0b20nIH0sXHJcbiAgICAgICAgICAgICAgICB7IGtleTogJ2QxMicsIG5hbWU6ICdEMTInLCB1dlR5cGU6ICdwZW50YWdvbnMnIH0sXHJcbiAgICAgICAgICAgICAgICB7IGtleTogJ2QyMCcsIG5hbWU6ICdEMjAnLCB1dlR5cGU6ICd0cmlhbmdsZXMnIH0sXHJcbiAgICAgICAgICAgIF07XHJcblxyXG4gICAgICAgICAgICBkaWNlVHlwZXMuZm9yRWFjaChkaWNlID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGhhc1RleHR1cmUgPSAodGhpcy5wbHVnaW4uc2V0dGluZ3MuZGljZVRleHR1cmVzIGFzIGFueSlbZGljZS5rZXldICE9PSAnJztcclxuXHJcbiAgICAgICAgICAgICAgICBuZXcgU2V0dGluZyh0ZXh0dXJlU2VjdGlvbilcclxuICAgICAgICAgICAgICAgICAgICAuc2V0TmFtZShgJHtkaWNlLm5hbWV9IHRleHR1cmVgKVxyXG4gICAgICAgICAgICAgICAgICAgIC5zZXREZXNjKGBDdXN0b20gaW1hZ2UgZm9yICR7ZGljZS5uYW1lfSAodXNlcyAke2RpY2UudXZUeXBlfSBVViBtYXBwaW5nKSR7aGFzVGV4dHVyZSA/ICcg4pyTJyA6ICcnfWApXHJcbiAgICAgICAgICAgICAgICAgICAgLmFkZEJ1dHRvbihidXR0b24gPT4gYnV0dG9uXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC5zZXRCdXR0b25UZXh0KGhhc1RleHR1cmUgPyAnUmVwbGFjZSBJbWFnZScgOiAnVXBsb2FkIEltYWdlJylcclxuICAgICAgICAgICAgICAgICAgICAgICAgLm9uQ2xpY2soKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgaW5wdXQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdpbnB1dCcpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaW5wdXQudHlwZSA9ICdmaWxlJztcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlucHV0LmFjY2VwdCA9ICdpbWFnZS8qJztcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIGFzeW5jIChlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZmlsZSA9IChlLnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KS5maWxlcz8uWzBdO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChmaWxlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIENoZWNrIGZpbGUgc2l6ZSAobGltaXQgdG8gNU1CIHRvIHByZXZlbnQgbWVtb3J5IGlzc3VlcylcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGZpbGUuc2l6ZSA+IDUgKiAxMDI0ICogMTAyNCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYWxlcnQoJ0ltYWdlIGZpbGUgdG9vIGxhcmdlLiBQbGVhc2UgdXNlIGFuIGltYWdlIHNtYWxsZXIgdGhhbiA1TUIuJyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlYWRlciA9IG5ldyBGaWxlUmVhZGVyKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlYWRlci5vbmxvYWQgPSBhc3luYyAoZXZlbnQpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGJhc2U2NCA9IGV2ZW50LnRhcmdldD8ucmVzdWx0IGFzIHN0cmluZztcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICh0aGlzLnBsdWdpbi5zZXR0aW5ncy5kaWNlVGV4dHVyZXMgYXMgYW55KVtkaWNlLmtleV0gPSBiYXNlNjQ7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnJlZnJlc2hEaWNlVmlldygpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kaXNwbGF5KCk7IC8vIFJlZnJlc2ggdG8gdXBkYXRlIGNoZWNrbWFya3NcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVhZGVyLnJlYWRBc0RhdGFVUkwoZmlsZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbnB1dC5jbGljaygpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9KSlcclxuICAgICAgICAgICAgICAgICAgICAuYWRkQnV0dG9uKGJ1dHRvbiA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJ1dHRvbi5zZXRCdXR0b25UZXh0KCdDbGVhcicpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAuc2V0RGlzYWJsZWQoIWhhc1RleHR1cmUpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAub25DbGljayhhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKHRoaXMucGx1Z2luLnNldHRpbmdzLmRpY2VUZXh0dXJlcyBhcyBhbnkpW2RpY2Uua2V5XSA9ICcnO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnJlZnJlc2hEaWNlVmlldygpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGlzcGxheSgpOyAvLyBSZWZyZXNoIHRvIHVwZGF0ZSBjaGVja21hcmtzXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIE9ubHkgc2V0IGNsYXNzIGlmIHdlIGhhdmUgYSB0ZXh0dXJlICh0byBzaG93IHdhcm5pbmcgd2hlbiBkaXNhYmxlZClcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFoYXNUZXh0dXJlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBidXR0b24uc2V0Q2xhc3MoJ21vZC13YXJuaW5nJyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBidXR0b247XHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBOb3JtYWwgTWFwcyBTZWN0aW9uXHJcbiAgICAgICAgY29uc3Qgbm9ybWFsTWFwU2VjdGlvbiA9IHRoaXMuY3JlYXRlQ29sbGFwc2libGVTZWN0aW9uKGNvbnRhaW5lckVsLCAnTm9ybWFsIE1hcHMnLCAnbm9ybWFsLW1hcHMnKTtcclxuXHJcbiAgICAgICAgbm9ybWFsTWFwU2VjdGlvbi5jcmVhdGVFbCgncCcsIHtcclxuICAgICAgICAgICAgdGV4dDogJ1VwbG9hZCBub3JtYWwgbWFwcyBmb3Igc3VyZmFjZSBkZXRhaWwgYW5kIGJ1bXBzLiBOb3JtYWwgbWFwcyBzaG91bGQgYmUgaW4gc3RhbmRhcmQgZm9ybWF0IChSR0IgY2hhbm5lbHMgcmVwcmVzZW50IFhZWiBub3JtYWwgdmVjdG9ycykuJyxcclxuICAgICAgICAgICAgY2xzOiAnc2V0dGluZy1pdGVtLWRlc2NyaXB0aW9uJ1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBkaWNlVHlwZXMuZm9yRWFjaChkaWNlID0+IHtcclxuICAgICAgICAgICAgY29uc3QgaGFzTm9ybWFsTWFwID0gKHRoaXMucGx1Z2luLnNldHRpbmdzLmRpY2VOb3JtYWxNYXBzIGFzIGFueSlbZGljZS5rZXldICE9PSAnJztcclxuXHJcbiAgICAgICAgICAgIG5ldyBTZXR0aW5nKG5vcm1hbE1hcFNlY3Rpb24pXHJcbiAgICAgICAgICAgICAgICAuc2V0TmFtZShgJHtkaWNlLm5hbWV9IG5vcm1hbCBtYXBgKVxyXG4gICAgICAgICAgICAgICAgLnNldERlc2MoYE5vcm1hbCBtYXAgZm9yICR7ZGljZS5uYW1lfSBzdXJmYWNlIGRldGFpbCBhbmQgYnVtcHMke2hhc05vcm1hbE1hcCA/ICcg4pyTJyA6ICcnfWApXHJcbiAgICAgICAgICAgICAgICAuYWRkQnV0dG9uKGJ1dHRvbiA9PiBidXR0b25cclxuICAgICAgICAgICAgICAgICAgICAuc2V0QnV0dG9uVGV4dChoYXNOb3JtYWxNYXAgPyAnUmVwbGFjZSBOb3JtYWwgTWFwJyA6ICdVcGxvYWQgTm9ybWFsIE1hcCcpXHJcbiAgICAgICAgICAgICAgICAgICAgLm9uQ2xpY2soKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBpbnB1dCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2lucHV0Jyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlucHV0LnR5cGUgPSAnZmlsZSc7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlucHV0LmFjY2VwdCA9ICdpbWFnZS8qJztcclxuICAgICAgICAgICAgICAgICAgICAgICAgaW5wdXQuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgYXN5bmMgKGUpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGZpbGUgPSAoZS50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkuZmlsZXM/LlswXTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChmaWxlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gQ2hlY2sgZmlsZSBzaXplIChsaW1pdCB0byA1TUIgdG8gcHJldmVudCBtZW1vcnkgaXNzdWVzKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChmaWxlLnNpemUgPiA1ICogMTAyNCAqIDEwMjQpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYWxlcnQoJ05vcm1hbCBtYXAgZmlsZSB0b28gbGFyZ2UuIFBsZWFzZSB1c2UgYW4gaW1hZ2Ugc21hbGxlciB0aGFuIDVNQi4nKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVhZGVyID0gbmV3IEZpbGVSZWFkZXIoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZWFkZXIub25sb2FkID0gYXN5bmMgKGV2ZW50KSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGJhc2U2NCA9IGV2ZW50LnRhcmdldD8ucmVzdWx0IGFzIHN0cmluZztcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKHRoaXMucGx1Z2luLnNldHRpbmdzLmRpY2VOb3JtYWxNYXBzIGFzIGFueSlbZGljZS5rZXldID0gYmFzZTY0O1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4ucmVmcmVzaERpY2VWaWV3KCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGlzcGxheSgpOyAvLyBSZWZyZXNoIHRvIHVwZGF0ZSBjaGVja21hcmtzXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZWFkZXIucmVhZEFzRGF0YVVSTChmaWxlKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlucHV0LmNsaWNrKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSkpXHJcbiAgICAgICAgICAgICAgICAuYWRkQnV0dG9uKGJ1dHRvbiA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgYnV0dG9uLnNldEJ1dHRvblRleHQoJ0NsZWFyJylcclxuICAgICAgICAgICAgICAgICAgICAgICAgLnNldERpc2FibGVkKCFoYXNOb3JtYWxNYXApXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC5vbkNsaWNrKGFzeW5jICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICh0aGlzLnBsdWdpbi5zZXR0aW5ncy5kaWNlTm9ybWFsTWFwcyBhcyBhbnkpW2RpY2Uua2V5XSA9ICcnO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5yZWZyZXNoRGljZVZpZXcoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGlzcGxheSgpOyAvLyBSZWZyZXNoIHRvIHVwZGF0ZSBjaGVja21hcmtzXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAvLyBPbmx5IHNldCBjbGFzcyBpZiB3ZSBkb24ndCBoYXZlIGEgbm9ybWFsIG1hcCAodG8gc2hvdyB3YXJuaW5nIHdoZW4gZGlzYWJsZWQpXHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFoYXNOb3JtYWxNYXApIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgYnV0dG9uLnNldENsYXNzKCdtb2Qtd2FybmluZycpO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGJ1dHRvbjtcclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBNb3Rpb24gRGV0ZWN0aW9uIFNldHRpbmdzIFNlY3Rpb25cclxuICAgICAgICBjb25zdCBtb3Rpb25TZWN0aW9uID0gdGhpcy5jcmVhdGVDb2xsYXBzaWJsZVNlY3Rpb24oY29udGFpbmVyRWwsICdNb3Rpb24gRGV0ZWN0aW9uIFNldHRpbmdzJywgJ21vdGlvbicpO1xyXG5cclxuICAgICAgICBuZXcgU2V0dGluZyhtb3Rpb25TZWN0aW9uKVxyXG4gICAgICAgICAgICAuc2V0TmFtZSgnTW90aW9uIHRocmVzaG9sZCcpXHJcbiAgICAgICAgICAgIC5zZXREZXNjKCdIb3cgc3RpbGwgdGhlIGRpY2UgbXVzdCBiZSBiZWZvcmUgZGV0ZWN0aW5nIHRoZSByZXN1bHQuIEhpZ2hlciB2YWx1ZXMgPSB3YWl0IGxvbmdlciBmb3IgY29tcGxldGUgc3RpbGxuZXNzLiBUaW1lb3V0IGV4dGVuZHMgYnkgKzEgc2Vjb25kIHBlciB1bml0LicpXHJcbiAgICAgICAgICAgIC5hZGRTbGlkZXIoc2xpZGVyID0+IHNsaWRlclxyXG4gICAgICAgICAgICAgICAgLnNldExpbWl0cygwLjEsIDEwLjAsIDAuMSlcclxuICAgICAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5tb3Rpb25UaHJlc2hvbGQpXHJcbiAgICAgICAgICAgICAgICAuc2V0RHluYW1pY1Rvb2x0aXAoKVxyXG4gICAgICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCfimpnvuI8gTW90aW9uIHRocmVzaG9sZCBjaGFuZ2VkIGZyb20nLCB0aGlzLnBsdWdpbi5zZXR0aW5ncy5tb3Rpb25UaHJlc2hvbGQsICd0bycsIHZhbHVlKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5tb3Rpb25UaHJlc2hvbGQgPSB2YWx1ZTtcclxuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5yZWZyZXNoRGljZVZpZXcoKTtcclxuICAgICAgICAgICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgLy8gQWRkIGV4cGxhbmF0b3J5IHRleHRcclxuICAgICAgICBjb25zdCBleHBsYW5hdGlvbkVsID0gbW90aW9uU2VjdGlvbi5jcmVhdGVFbCgnZGl2Jywge1xyXG4gICAgICAgICAgICBjbHM6ICdzZXR0aW5nLWl0ZW0tZGVzY3JpcHRpb24nLFxyXG4gICAgICAgICAgICB0ZXh0OiAnRXhhbXBsZXM6IDEuMCA9IG5vcm1hbCwgNS4wID0gdmVyeSBwYXRpZW50ICg5c2VjIHRpbWVvdXQpLCAxMC4wID0gZXh0cmVtZWx5IHBhdGllbnQgKDE0c2VjIHRpbWVvdXQpJ1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGV4cGxhbmF0aW9uRWwuc3R5bGUuZm9udFNpemUgPSAnMTJweCc7XHJcbiAgICAgICAgZXhwbGFuYXRpb25FbC5zdHlsZS5vcGFjaXR5ID0gJzAuOCc7XHJcbiAgICAgICAgZXhwbGFuYXRpb25FbC5zdHlsZS5tYXJnaW5Ub3AgPSAnNXB4JztcclxuXHJcbiAgICAgICAgbmV3IFNldHRpbmcobW90aW9uU2VjdGlvbilcclxuICAgICAgICAgICAgLnNldE5hbWUoJ0ZhY2UgZGV0ZWN0aW9uIHRvbGVyYW5jZScpXHJcbiAgICAgICAgICAgIC5zZXREZXNjKCdIb3cgcHJlY2lzZWx5IGEgZmFjZSBtdXN0IGJlIGFsaWduZWQgdG8gYmUgY29uc2lkZXJlZCB2YWxpZCAoMC4wNSA9IHZlcnkgc3RyaWN0LCAwLjUgPSByZWxheGVkKS4gRGljZSB0aGF0IGRvblxcJ3QgbWVldCB0aGlzIHRocmVzaG9sZCBhcmUgQ0FVR0hUIGFuZCBoaWdobGlnaHRlZCBmb3IgcmVyb2xsLicpXHJcbiAgICAgICAgICAgIC5hZGRTbGlkZXIoc2xpZGVyID0+IHNsaWRlclxyXG4gICAgICAgICAgICAgICAgLnNldExpbWl0cygwLjA1LCAwLjUsIDAuMDUpXHJcbiAgICAgICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuZmFjZURldGVjdGlvblRvbGVyYW5jZSlcclxuICAgICAgICAgICAgICAgIC5zZXREeW5hbWljVG9vbHRpcCgpXHJcbiAgICAgICAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ+Kame+4jyBGYWNlIGRldGVjdGlvbiB0b2xlcmFuY2UgY2hhbmdlZCBmcm9tJywgdGhpcy5wbHVnaW4uc2V0dGluZ3MuZmFjZURldGVjdGlvblRvbGVyYW5jZSwgJ3RvJywgdmFsdWUpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmZhY2VEZXRlY3Rpb25Ub2xlcmFuY2UgPSB2YWx1ZTtcclxuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5yZWZyZXNoRGljZVZpZXcoKTtcclxuICAgICAgICAgICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgLy8gQVBJIEludGVncmF0aW9uIFNlY3Rpb25cclxuICAgICAgICBjb25zdCBhcGlTZWN0aW9uID0gdGhpcy5jcmVhdGVDb2xsYXBzaWJsZVNlY3Rpb24oY29udGFpbmVyRWwsICdBUEkgSW50ZWdyYXRpb24nLCAnYXBpJyk7XHJcblxyXG4gICAgICAgIG5ldyBTZXR0aW5nKGFwaVNlY3Rpb24pXHJcbiAgICAgICAgICAgIC5zZXROYW1lKCdFbmFibGUgb25saW5lIGRpY2Ugc3lzdGVtJylcclxuICAgICAgICAgICAgLnNldERlc2MoJ0VuYWJsZSBpbnRlZ3JhdGlvbiB3aXRoIG9ubGluZSBkaWNlIHJvbGwgQVBJIGZvciBtdWx0aXBsYXllciBkaWNlIHJvbGxpbmcnKVxyXG4gICAgICAgICAgICAuYWRkVG9nZ2xlKHRvZ2dsZSA9PiB0b2dnbGVcclxuICAgICAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5hcGlFbmFibGVkKVxyXG4gICAgICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmFwaUVuYWJsZWQgPSB2YWx1ZTtcclxuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICAgICAgICAvLyBUcmlnZ2VyIHJlZnJlc2ggdG8gc2hvdy9oaWRlIHJpYmJvbiBpY29uXHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4ucmVmcmVzaEFwaUludGVncmF0aW9uKCk7XHJcbiAgICAgICAgICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIG5ldyBTZXR0aW5nKGFwaVNlY3Rpb24pXHJcbiAgICAgICAgICAgIC5zZXROYW1lKCdBUEkgZW5kcG9pbnQnKVxyXG4gICAgICAgICAgICAuc2V0RGVzYygnVVJMIG9mIHRoZSBkaWNlIHJvbGwgQVBJIHNlcnZlciAoZS5nLiwgaHR0cDovL2xvY2FsaG9zdDo1MDAwIG9yIGh0dHBzOi8veW91ci1zZXJ2ZXIuY29tKScpXHJcbiAgICAgICAgICAgIC5hZGRUZXh0KHRleHQgPT4gdGV4dFxyXG4gICAgICAgICAgICAgICAgLnNldFBsYWNlaG9sZGVyKCdodHRwOi8vbG9jYWxob3N0OjUwMDAnKVxyXG4gICAgICAgICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmFwaUVuZHBvaW50KVxyXG4gICAgICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmFwaUVuZHBvaW50ID0gdmFsdWU7XHJcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIC8vIERlYnVnIFNldHRpbmdzIFNlY3Rpb25cclxuICAgICAgICBjb25zdCBkZWJ1Z1NlY3Rpb24gPSB0aGlzLmNyZWF0ZUNvbGxhcHNpYmxlU2VjdGlvbihjb250YWluZXJFbCwgJ0RlYnVnIFNldHRpbmdzJywgJ2RlYnVnJyk7XHJcblxyXG4gICAgICAgIG5ldyBTZXR0aW5nKGRlYnVnU2VjdGlvbilcclxuICAgICAgICAgICAgLnNldE5hbWUoJ0VuYWJsZSBtb3Rpb24gZGVidWcgbG9nZ2luZycpXHJcbiAgICAgICAgICAgIC5zZXREZXNjKCdTaG93IGRldGFpbGVkIG1vdGlvbiBkZXRlY3Rpb24gaW5mb3JtYXRpb24gaW4gYnJvd3NlciBjb25zb2xlLiBVc2VmdWwgZm9yIHRyb3VibGVzaG9vdGluZyBidXQgY2FuIGJlIG92ZXJ3aGVsbWluZy4nKVxyXG4gICAgICAgICAgICAuYWRkVG9nZ2xlKHRvZ2dsZSA9PiB0b2dnbGVcclxuICAgICAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5lbmFibGVNb3Rpb25EZWJ1ZylcclxuICAgICAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygn4pqZ77iPIE1vdGlvbiBkZWJ1ZyBsb2dnaW5nJywgdmFsdWUgPyAnZW5hYmxlZCcgOiAnZGlzYWJsZWQnKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5lbmFibGVNb3Rpb25EZWJ1ZyA9IHZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICAgICAgfSkpO1xyXG4gICAgfVxyXG59Il19