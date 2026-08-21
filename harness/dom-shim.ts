/**
 * Obsidian adds a handful of helpers to HTMLElement.prototype. The plugin uses
 * them everywhere, so the harness has to provide them before any plugin code
 * runs. Semantics copied from Obsidian's documented behaviour.
 */

interface DomElementInfo {
    cls?: string | string[];
    text?: string;
    attr?: Record<string, string | number | boolean | null>;
    title?: string;
    href?: string;
    type?: string;
    value?: string;
    placeholder?: string;
}

function applyInfo(el: HTMLElement, info?: string | DomElementInfo): void {
    if (info === undefined) return;

    // The string shorthand means "class", which is how the plugin calls
    // createDiv('dice-floating-overlay').
    if (typeof info === 'string') {
        if (info) el.className = info;
        return;
    }

    if (info.cls) {
        const classes = Array.isArray(info.cls) ? info.cls : info.cls.split(/\s+/);
        el.classList.add(...classes.filter(Boolean));
    }
    if (info.text !== undefined) el.textContent = info.text;
    if (info.title !== undefined) el.title = info.title;
    if (info.href !== undefined) (el as HTMLAnchorElement).href = info.href;
    if (info.type !== undefined) (el as HTMLInputElement).type = info.type;
    if (info.value !== undefined) (el as HTMLInputElement).value = info.value;
    if (info.placeholder !== undefined) (el as HTMLInputElement).placeholder = info.placeholder;
    if (info.attr) {
        for (const [key, value] of Object.entries(info.attr)) {
            if (value === null) el.removeAttribute(key);
            else el.setAttribute(key, String(value));
        }
    }
}

function define(name: string, value: unknown): void {
    for (const proto of [HTMLElement.prototype, DocumentFragment.prototype, Document.prototype]) {
        if (name in proto) continue;
        Object.defineProperty(proto, name, {
            value,
            writable: true,
            configurable: true,
            enumerable: false
        });
    }
}

export function installDomShim(): void {
    define('createEl', function (this: HTMLElement, tag: string, info?: string | DomElementInfo) {
        const el = document.createElement(tag);
        applyInfo(el, info);
        this.appendChild(el);
        return el;
    });

    define('createDiv', function (this: HTMLElement, info?: string | DomElementInfo) {
        return (this as any).createEl('div', info);
    });

    define('createSpan', function (this: HTMLElement, info?: string | DomElementInfo) {
        return (this as any).createEl('span', info);
    });

    define('empty', function (this: HTMLElement) {
        while (this.firstChild) this.removeChild(this.firstChild);
        return this;
    });

    define('detach', function (this: HTMLElement) {
        this.remove();
    });

    define('setText', function (this: HTMLElement, text: string) {
        this.textContent = text;
        return this;
    });

    define('appendText', function (this: HTMLElement, text: string) {
        this.appendChild(document.createTextNode(text));
        return this;
    });

    define('addClass', function (this: HTMLElement, ...classes: string[]) {
        this.classList.add(...classes);
    });

    define('removeClass', function (this: HTMLElement, ...classes: string[]) {
        this.classList.remove(...classes);
    });

    define('toggleClass', function (this: HTMLElement, classes: string | string[], value: boolean) {
        const list = Array.isArray(classes) ? classes : [classes];
        for (const cls of list) this.classList.toggle(cls, value);
    });

    define('hasClass', function (this: HTMLElement, cls: string) {
        return this.classList.contains(cls);
    });

    define('setAttr', function (this: HTMLElement, key: string, value: string | number | boolean | null) {
        if (value === null) this.removeAttribute(key);
        else this.setAttribute(key, String(value));
    });

    // Obsidian's show/hide toggle an `is-hidden` class; the observable effect is
    // display:none, which is what the plugin relies on.
    define('hide', function (this: HTMLElement) {
        this.style.display = 'none';
    });

    define('show', function (this: HTMLElement) {
        this.style.display = '';
    });

    define('isShown', function (this: HTMLElement) {
        return this.style.display !== 'none' && this.isConnected;
    });
}
