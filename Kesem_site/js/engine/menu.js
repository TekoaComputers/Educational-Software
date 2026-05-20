function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (k === "class") node.className = v;
        else if (k === "dataset") Object.assign(node.dataset, v);
        else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
        else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v);
    }
    for (const c of children) {
        if (c == null) continue;
        node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return node;
}

function applyTheme(node, theme) {
    if (!theme) return;
    for (const [k, v] of Object.entries(theme)) node.style.setProperty(k, v);
}

function headerBlock(config) {
    return el("div", { class: "screen-header" }, [
        config.icon ? el("img", { class: "screen-hero", src: config.icon, alt: "" }) : null,
        el("h2", { class: "screen-title" }, [config.title]),
        config.subtitle ? el("p", { class: "screen-subtitle" }, [config.subtitle]) : null,
    ]);
}

function renderGrid6(config, onAction) {
    const tiles = config.buttons.map(b =>
        el("button", {
            class: "tile tile-game",
            dataset: { action: b.action },
            onclick: () => onAction(b.action),
        }, [b.label])
    );

    const actions = config.actions.map(a =>
        el("button", {
            class: `pill pill-${a.id}`,
            dataset: { action: a.action },
            onclick: () => onAction(a.action),
        }, [a.label])
    );

    return el("div", { class: "screen screen-grid6", dataset: { app: config.id } }, [
        headerBlock(config),
        el("div", { class: "tile-grid" }, tiles),
        el("div", { class: "action-bar" }, actions),
    ]);
}

function renderChooser3(config, onAction) {
    const tiles = config.buttons.map(b =>
        el("button", {
            class: `chooser-tile chooser-${b.id}`,
            dataset: { action: b.action },
            onclick: () => onAction(b.action),
        }, [b.label])
    );

    return el("div", { class: "screen screen-chooser3", dataset: { app: config.id } }, [
        headerBlock(config),
        el("div", { class: "chooser-row" }, tiles),
    ]);
}

const layouts = {
    grid6: renderGrid6,
    chooser3: renderChooser3,
};

export function renderMainScreen(config, root, onAction) {
    root.innerHTML = "";
    const layout = layouts[config.layout];
    if (!layout) throw new Error(`Unknown layout: ${config.layout}`);
    const view = layout(config, onAction);
    applyTheme(view, config.theme);
    root.appendChild(view);
}
