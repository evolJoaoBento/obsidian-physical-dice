/**
 * Die glyphs for the controls panel, the same outlines Atlas VTT draws on its
 * dice buttons (atlas-vtt src/app/react/components/DiceIcons.tsx), so the two
 * panels read as one tool. Drawn on a 24px grid in currentColor.
 */
const DICE_ICON_PATHS: Record<string, string> = {
    d4: `
        <path d="M12 2L3 20h18L12 2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        <path d="M12 2v18" stroke="currentColor" stroke-width="1" opacity="0.5"/>`,
    d6: `
        <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" stroke-width="2"/>
        <circle cx="12" cy="12" r="2" fill="currentColor"/>`,
    d8: `
        <path d="M12 2L20 8v8l-8 6-8-6V8l8-6Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        <path d="M12 2v20" stroke="currentColor" stroke-width="1" opacity="0.5"/>
        <path d="M4 8l8 6 8-6" stroke="currentColor" stroke-width="1" opacity="0.5"/>`,
    d10: `
        <path d="M12 2L18 6v4l-6 10-6-10V6l6-4Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        <path d="M6 6l6 14 6-14" stroke="currentColor" stroke-width="1" opacity="0.5"/>`,
    d12: `
        <path d="M12 2L19 7v10l-7 5-7-5V7l7-5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        <polygon points="12,2 19,7 15,12 12,10 9,12 5,7" stroke="currentColor" stroke-width="1" opacity="0.5"/>`,
    d20: `
        <path d="M12 2L21 8.5L17 19H7L3 8.5L12 2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        <path d="M12 2v17" stroke="currentColor" stroke-width="1" opacity="0.5"/>
        <path d="M3 8.5L12 19L21 8.5" stroke="currentColor" stroke-width="1" opacity="0.5"/>`,
    d100: `
        <path d="M12 2L18 6v4l-6 10-6-10V6l6-4Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        <text x="12" y="13" text-anchor="middle" font-size="6" font-weight="bold" fill="currentColor">%</text>`,
};

/** Appends the glyph for a die type (`d20`) to `parent`, `size` px square. */
export function appendDiceIcon(parent: HTMLElement, type: string, size = 18): void {
    const paths = DICE_ICON_PATHS[type];
    if (!paths) return;
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none">${paths}</svg>`;
    // Parsed as SVG rather than set through innerHTML: the markup is our own,
    // but a parser keeps it out of the HTML sink Obsidian's review flags.
    const svg = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
    parent.appendChild(parent.ownerDocument.importNode(svg, true));
}
