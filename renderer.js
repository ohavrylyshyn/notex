// renderer.js (Notex)

let isPinned = false;

// Main UI
const noteText = document.getElementById('noteText');
const pinBtn = document.getElementById('pinBtn');
const minBtn = document.getElementById('minBtn');
const closeBtn = document.getElementById('closeBtn');
const unlockHint = document.getElementById('unlockHint');

let systemMsgTimer = null;

function showSystemMessage(text, type = "info", ms = 2500) {
    if (!unlockHint) return;

    // type: info | error | success
    unlockHint.classList.add("system");
    unlockHint.classList.remove("is-error", "is-success", "is-info");
    unlockHint.classList.add(
        type === "error" ? "is-error" :
            type === "success" ? "is-success" : "is-info"
    );

    unlockHint.textContent = text || "";
    unlockHint.classList.add("visible");

    clearTimeout(systemMsgTimer);

    systemMsgTimer = setTimeout(() => {
        if (!unlockHint) return;

        // Always restore default hint text
        unlockHint.textContent =
            defaultUnlockHintText || currentDict.unlock_hint || unlockHint.textContent;

        // Remove system message styles
        unlockHint.classList.remove("system", "is-error", "is-success", "is-info");

        // If pinned - show it, if not - hide it (but do not delete the text)
        if (isPinned) unlockHint.classList.add("visible");
        else unlockHint.classList.remove("visible");

    }, ms);
}

// Toolbar buttons
const boldBtn = document.getElementById('boldBtn');
const italicBtn = document.getElementById('italicBtn');
const underlineBtn = document.getElementById('underlineBtn');
const strikeBtn = document.getElementById('strikeBtn');
const listBtn = document.getElementById('listBtn');

// Optional: top language buttons
const langUkBtn = document.getElementById('langUkBtn');
const langEnBtn = document.getElementById('langEnBtn');

// Settings view
const settingsBtn = document.getElementById('settingsBtn');
const settingsView = document.getElementById('settingsView');
const settingsBackBtn = document.getElementById('settingsBackBtn');
const aboutBtn = document.getElementById('aboutBtn');
const aboutView = document.getElementById('aboutView');
const aboutBackBtn = document.getElementById('aboutBackBtn');

// Hotkeys UI (Pin/Unpin)
const lockInput = document.getElementById("lockShortcut");
const unlockInput = document.getElementById("unlockShortcut");
const lockBadge = document.getElementById("lockBadge");
const unlockBadge = document.getElementById("unlockBadge");
const resetShortcutsBtn = document.getElementById("resetShortcutsBtn");

let isSettingsOpen = false;
let isAboutOpen = false;

// -----------------------
// Helpers: safe window.api
// -----------------------
function apiSend(channel, ...args) {
    try {
        window.api?.send?.(channel, ...args);
    } catch (e) {
        console.warn('apiSend failed:', channel, e?.message);
    }
}

function apiOn(channel, cb) {
    try {
        window.api?.on?.(channel, cb);
    } catch (e) {
        console.warn('apiOn failed:', channel, e?.message);
    }
}

// -----------------------
// Settings view toggle
// -----------------------
function applyViewState() {
    const anyOpen = isSettingsOpen || isAboutOpen;

    if (noteText) noteText.classList.toggle('hidden', anyOpen);
    if (settingsView) settingsView.classList.toggle('hidden', !isSettingsOpen);
    if (aboutView) aboutView.classList.toggle('hidden', !isAboutOpen);

    // Disable formatting while in Settings/About
    const fmtButtons = [boldBtn, italicBtn, underlineBtn, strikeBtn, listBtn].filter(Boolean);
    fmtButtons.forEach((btn) => {
        btn.disabled = anyOpen;
        btn.style.opacity = anyOpen ? '0.35' : '';
        btn.style.pointerEvents = anyOpen ? 'none' : '';
    });

    if (!anyOpen && noteText) noteText.focus();
}

function setSettingsOpen(open) {
    isSettingsOpen = open;
    if (open) isAboutOpen = false;
    applyViewState();
}

function setAboutOpen(open) {
    isAboutOpen = open;
    if (open) isSettingsOpen = false;
    applyViewState();
}

// -----------------------
// Toolbar formatting
// -----------------------
function updateToolbarState() {
    if (!noteText) return;
    if (isSettingsOpen || isAboutOpen) return;

    boldBtn?.classList.toggle('active', document.queryCommandState('bold'));
    italicBtn?.classList.toggle('active', document.queryCommandState('italic'));
    underlineBtn?.classList.toggle('active', document.queryCommandState('underline'));
    strikeBtn?.classList.toggle('active', document.queryCommandState('strikethrough'));
    listBtn?.classList.toggle('active', document.queryCommandState('insertUnorderedList'));
}

boldBtn?.addEventListener('click', () => {
    document.execCommand('bold', false, null);
    noteText?.focus();
    updateToolbarState();
});

italicBtn?.addEventListener('click', () => {
    document.execCommand('italic', false, null);
    noteText?.focus();
    updateToolbarState();
});

underlineBtn?.addEventListener('click', () => {
    document.execCommand('underline', false, null);
    noteText?.focus();
    updateToolbarState();
});

strikeBtn?.addEventListener('click', () => {
    document.execCommand('strikethrough', false, null);
    noteText?.focus();
    updateToolbarState();
});

listBtn?.addEventListener('click', () => {
    document.execCommand('insertUnorderedList', false, null);
    noteText?.focus();
    updateToolbarState();
});

noteText?.addEventListener('mouseup', updateToolbarState);
noteText?.addEventListener('keyup', updateToolbarState);
noteText?.addEventListener('focus', updateToolbarState);

// -----------------------
// Pin / Minimize / Close
// -----------------------
apiOn('update-pin-state', (newState) => {
    isPinned = !!newState;

    if (isPinned) {
        pinBtn?.classList.add('pinned');

        if (unlockHint && !unlockHint.textContent) {
            unlockHint.textContent = defaultUnlockHintText || currentDict.unlock_hint || "";
        }

        unlockHint?.classList.add('visible');
    } else {
        pinBtn?.classList.remove('pinned');
        unlockHint?.classList.remove('visible');
    }
});

pinBtn?.addEventListener('click', () => {
    isPinned = !isPinned;
    pinBtn?.classList.toggle('pinned', isPinned);

    if (isPinned) unlockHint?.classList.add('visible');
    else unlockHint?.classList.remove('visible');

    apiSend('toggle-pin', isPinned);
});

minBtn?.addEventListener('click', () => {
    apiSend('minimize-window');
});

closeBtn?.addEventListener('click', () => {
    apiSend('close-window');
});

// -----------------------
// Save/load note
// -----------------------
if (noteText) {
    noteText.addEventListener('input', () => {
        if (isSettingsOpen || isAboutOpen) return;

        clearTimeout(noteText.saveTimeout);
        noteText.saveTimeout = setTimeout(() => {
            apiSend('save-note', noteText.innerHTML);
        }, 1000);
    });
}

apiOn('load-note-response', (data) => {
    if (!noteText) return;
    if (data?.content) noteText.innerHTML = data.content;
    noteText.focus();
});

window.addEventListener('load', () => {
    apiSend('load-note');
});

// Ctrl+S => save
document.addEventListener('keydown', (e) => {
    if (isSettingsOpen || isAboutOpen) return;

    if (e.ctrlKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        if (noteText) apiSend('save-note', noteText.innerHTML);
    }

    setTimeout(updateToolbarState, 0);
});

// Open external links in default browser
function tryOpenExternalLink(link, e) {
    if (!link || !link.href) return false;

    const href = link.href;
    const isExternal =
        /^https?:\/\//i.test(href) ||
        /^mailto:/i.test(href) ||
        /^tel:/i.test(href);

    if (!isExternal) return false;

    e?.preventDefault?.();

    if (typeof window.api?.openExternal === "function") {
        window.api.openExternal(href);
        return true;
    }

    return false;
}

document.addEventListener('click', (e) => {
    const link = e.target.closest("a");
    tryOpenExternalLink(link, e);
}, true);

// -----------------------
// i18n (languages)
// -----------------------
let currentLang = 'uk';
let currentDict = {};
let defaultUnlockHintText = "";

/**
 * Renders a list from i18n dictionary data.
 * @param {string} listId - ID of the target <ul> or <ol> element
 * @param {string} dictKey - Key in currentDict that contains an array of strings
 */
function renderI18nList(listId, dictKey) {
    const ul = document.getElementById(listId);
    const items = currentDict?.[dictKey];

    if (!ul || !Array.isArray(items)) return;

    ul.innerHTML = "";

    items.forEach(text => {
        const li = document.createElement("li");
        li.textContent = text;
        ul.appendChild(li);
    });
}

function t(key, fallback = "") {
    return (currentDict && currentDict[key]) ? currentDict[key] : fallback;
}

async function loadLanguage(lang = 'uk') {
    const res = await fetch(`./locales/${lang}.json`);
    currentDict = await res.json();

    document.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.dataset.i18n;
        if (currentDict[key]) el.innerText = currentDict[key];
    });

    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
        const key = el.dataset.i18nTitle;
        if (currentDict[key]) el.title = currentDict[key];
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
        const key = el.dataset.i18nPlaceholder;
        if (currentDict[key]) el.setAttribute('placeholder', currentDict[key]);
    });

    if (currentDict.window_title) document.title = currentDict.window_title;

    // Cache default unlock hint text (for restore after system messages)
    if (unlockHint) {
        defaultUnlockHintText = currentDict.unlock_hint || unlockHint.textContent || "";
    }
}

function updateTopLangButtons(lang) {
    if (!langUkBtn || !langEnBtn) return;
    langUkBtn.classList.toggle('active', lang === 'uk');
    langEnBtn.classList.toggle('active', lang === 'en');
}

async function setLanguage(lang) {
    currentLang = lang;

    try {
        if (typeof window.api?.setLanguage === 'function') {
            window.api.setLanguage(lang);
        } else {
            localStorage.setItem('notex.lang', lang);
        }
    } catch (_) {
        localStorage.setItem('notex.lang', lang);
    }

    await loadLanguage(lang);

    // Render About page features list
    renderI18nList("aboutFeatures", "about_features");

    // Populate About section with localized differences
    renderI18nList("aboutDifferences", "about_differences");

    updateTopLangButtons(lang);
}

async function getInitialLanguage() {
    try {
        if (typeof window.api?.getLanguage === 'function') {
            const lang = await window.api.getLanguage();
            if (lang) return lang;
        }
    } catch (_) { }

    const saved = localStorage.getItem('notex.lang');
    if (saved) return saved;

    return navigator.language?.toLowerCase().startsWith('uk') ? 'uk' : 'en';
}

// -----------------------
// Hotkeys (Pin/Unpin) - capture + validation + autosave + reset + i18n
// -----------------------
function normalizeShortcut(s) {
    return (s || "").trim();
}

function clearErrors() { }

function bindBadge(input, badge) {
    if (!input || !badge) return;
    input.addEventListener("focus", () => badge.classList.add("visible"));
    input.addEventListener("blur", () => badge.classList.remove("visible"));
}

bindBadge(lockInput, lockBadge);
bindBadge(unlockInput, unlockBadge);

function keyEventToShortcut(e) {
    e.preventDefault();

    const parts = [];
    if (e.ctrlKey) parts.push("Ctrl");
    if (e.shiftKey) parts.push("Shift");
    if (e.altKey) parts.push("Alt");

    const k = (e.key || "").toUpperCase();
    if (!["CONTROL", "SHIFT", "ALT"].includes(k)) {
        parts.push(k);
    }

    return parts.join("+");
}

function validateLocal(lock, unlock) {
    if (!lock) {
        showSystemMessage(t("hk_err_empty", "Shortcut can't be empty"), "error");
        return false;
    }

    if (!unlock) {
        showSystemMessage(t("hk_err_empty", "Shortcut can't be empty"), "error");
        return false;
    }

    if (lock === unlock) {
        showSystemMessage(t("hk_err_diff", "Pin and Unpin must be different"), "error");
        return false;
    }

    return true;
}

let saveTimer = null;

async function autoSaveShortcuts() {
    const lock = normalizeShortcut(lockInput?.value);
    const unlock = normalizeShortcut(unlockInput?.value);

    if (!validateLocal(lock, unlock)) return;

    if (typeof window.api?.setShortcuts !== "function") {
        showSystemMessage(t("hk_api_na", "API not available"), "error");
        return;
    }

    showSystemMessage(t("hk_saving", "Saving"), "info", 800);

    let res;
    try {
        res = await window.api.setShortcuts({ lock, unlock });
    } catch {
        showSystemMessage(t("hk_not_saved", "Not saved"), "error");
        return;
    }

    if (!res?.ok) {
        showSystemMessage(t("hk_err_busy", "This shortcut is busy or can't be registered"), "error", 3500);
        return;
    }

    showSystemMessage(t("hk_saved", "Saved"), "success", 1200);
}

function scheduleAutoSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(autoSaveShortcuts, 250);
}

function bindHotkeyInput(input, which) {
    if (!input) return;

    input.addEventListener("keydown", (e) => {
        const value = keyEventToShortcut(e);
        input.value = value;

        scheduleAutoSave();
    });
}

bindHotkeyInput(lockInput, "lock");
bindHotkeyInput(unlockInput, "unlock");

async function loadShortcutsToUI() {
    try {
        if (typeof window.api?.getShortcuts !== "function") return;
        const s = await window.api.getShortcuts();

        if (lockInput) lockInput.value = s?.lock || "Ctrl+Shift+P";
        if (unlockInput) unlockInput.value = s?.unlock || "Ctrl+Shift+U";
    } catch (_) { }
}

resetShortcutsBtn?.addEventListener("click", async () => {
    // Show resetting message
    showSystemMessage(t("hk_resetting", "Resetting"), "info", 900);

    try {
        if (typeof window.api?.resetShortcuts !== "function") {
            showSystemMessage(t("hk_api_na", "API not available"), "error", 3000);
            return;
        }

        const res = await window.api.resetShortcuts();

        // Show errors if failed to reset
        if (!res?.ok) {
            // Prioritized errors from main process
            if (res?.errors?.lock === "REGISTER_FAILED") {
                showSystemMessage(
                    t("hk_err_default_pin", "Default pin shortcut can't be registered"),
                    "error",
                    4500
                );
                return;
            }

            if (res?.errors?.unlock === "REGISTER_FAILED") {
                showSystemMessage(
                    t("hk_err_default_unpin", "Default unpin shortcut can't be registered"),
                    "error",
                    4500
                );
                return;
            }

            // Fallback generic error
            showSystemMessage(t("hk_not_saved", "Not saved"), "error", 3000);
            return;
        }

        // Get default shortcuts from main process
        let defaults = null;
        try {
            defaults =
                typeof window.api?.getDefaultShortcuts === "function"
                    ? await window.api.getDefaultShortcuts()
                    : { lock: "Ctrl+Shift+P", unlock: "Ctrl+Shift+U" };
        } catch (_) {
            defaults = { lock: "Ctrl+Shift+P", unlock: "Ctrl+Shift+U" };
        }

        if (lockInput) lockInput.value = defaults.lock;
        if (unlockInput) unlockInput.value = defaults.unlock;

        // Show success message
        showSystemMessage(t("hk_reset", "Reset"), "success", 1200);
    } catch (_) {
        showSystemMessage(t("hk_not_saved", "Not saved"), "error", 3000);
    }
});

// -----------------------
// Settings + language wiring
// -----------------------
document.addEventListener('DOMContentLoaded', async () => {
    settingsBtn?.addEventListener('click', () => {
        setSettingsOpen(!isSettingsOpen);
    });
    settingsBackBtn?.addEventListener('click', () => setSettingsOpen(false));
    aboutBtn?.addEventListener('click', () => {
        setAboutOpen(!isAboutOpen);
    });
    aboutBackBtn?.addEventListener('click', () => setAboutOpen(false));

    langUkBtn?.addEventListener('click', () => setLanguage('uk'));
    langEnBtn?.addEventListener('click', () => setLanguage('en'));

    const initialLang = await getInitialLanguage();
    await setLanguage(initialLang);

    try {
        if (typeof window.api?.onLanguageChanged === 'function') {
            window.api.onLanguageChanged(async (newLang) => {
                if (!newLang || newLang === currentLang) return;
                await setLanguage(newLang);
            });
        }
    } catch (_) { }

    await loadShortcutsToUI();
});
