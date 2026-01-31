const {
    app,
    BrowserWindow,
    ipcMain,
    Menu,
    Tray,
    nativeImage,
    globalShortcut,
    shell,
} = require("electron");

const appName = "Notex";
const path = require("path");
const { execSync } = require("child_process");
const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
const Store = require("electron-store");

const DEFAULT_SHORTCUTS = {
    lock: "Ctrl+Shift+P",
    unlock: "Ctrl+Shift+U",
};
const SUPPORTED_LANGS = new Set(["uk", "en"]);
const DEFAULT_LANG = "en";

function normalizeShortcut(s) {
    return (s || "").trim();
}

function getShortcuts() {
    const saved = store.get("shortcuts", DEFAULT_SHORTCUTS);
    return {
        lock: normalizeShortcut(saved.lock) || DEFAULT_SHORTCUTS.lock,
        unlock: normalizeShortcut(saved.unlock) || DEFAULT_SHORTCUTS.unlock,
    };
}

function safeRegister(accelerator, handler) {
    const acc = (accelerator || "").trim();
    if (!acc) return false;
    try {
        return globalShortcut.register(acc, handler);
    } catch (_) {
        return false;
    }
}

function safeUnregister(accelerator) {
    const acc = (accelerator || "").trim();
    if (!acc) return;
    try {
        if (globalShortcut.isRegistered(acc)) {
            globalShortcut.unregister(acc);
        }
    } catch (_) {
        // ignore
    }
}

let mainWindow;
let tray = null;
let isQuitting = false;
let isDesktopMode = false;
let currentShortcuts = { lock: null, unlock: null };
let db;
const store = new Store();
let currentLang = DEFAULT_LANG;

// Avoid cache move errors when a second instance is blocked.
app.commandLine.appendSwitch("disable-http-cache");
app.commandLine.appendSwitch("disk-cache-size", "0");
app.commandLine.appendSwitch("gpu-disk-cache-size", "0");
app.commandLine.appendSwitch("media-cache-size", "0");
app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
    process.exit(0);
}
app.on("second-instance", () => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        if (!mainWindow.isVisible()) mainWindow.show();
        mainWindow.focus();
    }
});

// Database location (WRITEABLE) - use userData (AppData)
function getDbPath() {
    // DEV: Store the database in the project folder
    if (!app.isPackaged) {
        return path.join(__dirname, 'notex.db');
    }

    // PROD: Store the database in userData (AppData / Library / .config)
    return path.join(app.getPath('userData'), 'notex.db');
}

function getBackupPath() {
    if (!app.isPackaged) {
        return path.join(__dirname, '.backup-notex.db');
    }
    return path.join(app.getPath('userData'), '.backup-notex.db');
}

function createWindow() {
    // Load the saved window size or use the default one
    const windowBounds = store.get("windowBounds", {
        width: 400,
        height: 500,
        x: undefined,
        y: undefined,
    });

    mainWindow = new BrowserWindow({
        title: appName,
        width: windowBounds.width,
        height: windowBounds.height,
        x: windowBounds.x,
        y: windowBounds.y,
        minWidth: 300,
        minHeight: 300,
        frame: false,
        transparent: false,
        skipTaskbar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, "preload.js"),
        },
        icon: path.join(__dirname, "assets", "icon.ico"),
    });

    mainWindow.loadFile("index.html");

    // Open all external links in the default browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith("http")) shell.openExternal(url);
        return { action: "deny" };
    });

    mainWindow.webContents.on("will-navigate", (e, url) => {
        // Prevent navigating the app window to external sites
        if (url.startsWith("http")) {
            e.preventDefault();
            shell.openExternal(url);
        }
    });

    // Save window size on change
    mainWindow.on("resized", () => {
        const bounds = mainWindow.getBounds();
        store.set("windowBounds", bounds);
    });

    mainWindow.on("moved", () => {
        const bounds = mainWindow.getBounds();
        store.set("windowBounds", bounds);
    });

    mainWindow.on("closed", function () {
        mainWindow = null;
    });
}

function createTray() {
    const iconPath = path.join(__dirname, "assets", "icon.ico");
    const trayIcon = nativeImage.createFromPath(iconPath);

    tray = new Tray(trayIcon);
    updateTrayMenu();

    tray.on("click", () => {
        if (!mainWindow) return;
        if (mainWindow.isVisible()) mainWindow.hide();
        else {
            mainWindow.show();
            mainWindow.focus();
        }
    });
}

function getSystemLanguage() {
    try {
        const locale = (app.getLocale?.() || "").toLowerCase();
        if (locale.startsWith("en")) return "en";
    } catch (_) {
        // ignore
    }
    return "uk";
}

function normalizeLanguage(lang) {
    if (typeof lang !== "string") return null;
    const trimmed = lang.trim().toLowerCase();
    return SUPPORTED_LANGS.has(trimmed) ? trimmed : null;
}

function getActiveLanguage() {
    const saved = normalizeLanguage(store.get("lang"));
    return saved || DEFAULT_LANG;
}

function loadLocale(lang) {
    const normalized = normalizeLanguage(lang) || DEFAULT_LANG;
    const localePath = path.join(__dirname, "locales", `${normalized}.json`);
    try {
        const raw = fs.readFileSync(localePath, "utf8");
        return JSON.parse(raw);
    } catch (_) {
        return {};
    }
}

function t(dict, key, fallback) {
    if (dict && typeof dict[key] === "string") return dict[key];
    return fallback;
}

function updateTrayMenu() {
    if (!tray) return;

    const dict = loadLocale(currentLang);

    tray.setToolTip(t(dict, "tray_tooltip", appName));

    const menu = Menu.buildFromTemplate([
        {
            label: t(dict, "tray_open", "Open NoteX"),
            click: () => {
                if (!mainWindow) return;
                mainWindow.show();
                mainWindow.focus();
            },
        },
        {
            label: t(dict, "tray_hide", "Hide"),
            click: () => mainWindow?.hide(),
        },
        { type: "separator" },
        {
            label: t(dict, "tray_quit", "Quit"),
            click: () => {
                isQuitting = true;
                app.quit();
            },
        },
    ]);

    tray.setContextMenu(menu);
}

function registerShortcuts(shortcutsArg) {
    const shortcuts = shortcutsArg || getShortcuts();

    const nextLock = (shortcuts.lock || "").trim();
    const nextUnlock = (shortcuts.unlock || "").trim();

    const prev = { ...currentShortcuts }; // what is currently registered (our state)

    const result = {
        ok: true,
        registered: { lock: false, unlock: false },
        errors: {}, // lock/unlock -> "EMPTY" | "REGISTER_FAILED"
        rolledBack: false,
        restored: { lock: false, unlock: false }, // whether old ones were restored
    };

    // Prepare handlers
    const unlockHandler = () => {
        if (isDesktopMode && mainWindow) {
            isDesktopMode = false;
            mainWindow.setIgnoreMouseEvents(false);
            mainWindow.setAlwaysOnTop(false);
            mainWindow.webContents.send("update-pin-state", false);
        }
    };

    const lockHandler = () => {
        if (!isDesktopMode && mainWindow) {
            isDesktopMode = true;
            mainWindow.setIgnoreMouseEvents(true);
            setWindowAsDesktopBackground();
            mainWindow.webContents.send("update-pin-state", true);
        }
    };

    // Unregister ONLY our previous shortcuts
    safeUnregister(prev.lock);
    safeUnregister(prev.unlock);

    // Validate empty
    if (!nextUnlock) {
        result.ok = false;
        result.errors.unlock = "EMPTY";
    }
    if (!nextLock) {
        result.ok = false;
        result.errors.lock = "EMPTY";
    }

    // Try register new (only if not empty)
    let newUnlockOk = false;
    let newLockOk = false;

    if (nextUnlock) {
        newUnlockOk = safeRegister(nextUnlock, unlockHandler);
        result.registered.unlock = newUnlockOk;
        if (!newUnlockOk) {
            result.ok = false;
            result.errors.unlock = "REGISTER_FAILED";
        }
    }

    if (nextLock) {
        newLockOk = safeRegister(nextLock, lockHandler);
        result.registered.lock = newLockOk;
        if (!newLockOk) {
            result.ok = false;
            result.errors.lock = "REGISTER_FAILED";
        }
    }

    // If failed - rollback to previous
    if (!result.ok) {
        result.rolledBack = true;

        // Remove any newly registered shortcuts
        if (newUnlockOk) safeUnregister(nextUnlock);
        if (newLockOk) safeUnregister(nextLock);

        // Restore previous ones
        let restoredUnlock = true;
        let restoredLock = true;

        if (prev.unlock) {
            restoredUnlock = safeRegister(prev.unlock, unlockHandler);
            result.restored.unlock = restoredUnlock;
        } else {
            result.restored.unlock = true;
        }

        if (prev.lock) {
            restoredLock = safeRegister(prev.lock, lockHandler);
            result.restored.lock = restoredLock;
        } else {
            result.restored.lock = true;
        }

        // Update currentShortcuts back to previous (even if restore failed - state describes intent)
        currentShortcuts = { ...prev };

        // If restore failed (rare, but possible), expose it
        if (prev.unlock && !restoredUnlock) result.errors.unlock_restore = "RESTORE_FAILED";
        if (prev.lock && !restoredLock) result.errors.lock_restore = "RESTORE_FAILED";

        return result;
    }

    // Success - commit new
    currentShortcuts.lock = nextLock;
    currentShortcuts.unlock = nextUnlock;

    return result;
}

app.whenReady().then(() => {
    app.setName(appName);
    currentLang = getActiveLanguage();
    store.set("lang", currentLang);
    createWindow();
    createTray();

    // Initialize SQLite database
    const dbPath = getDbPath();
    const backupPath = getBackupPath();

    db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
            console.error("Database connection error:", err);

            // Try to restore from backup
            if (fs.existsSync(backupPath)) {
                console.log("Attempting to restore from backup...");
                fs.copyFileSync(backupPath, dbPath);
                db = new sqlite3.Database(dbPath);
            }
            return;
        }

        console.log("Connected to SQLite database");

        // Create automatic backup
        try {
            if (fs.existsSync(dbPath)) fs.copyFileSync(dbPath, backupPath);
        } catch (e) {
            console.warn("Backup copy failed:", e.message);
        }

        db.run(`
            CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
    });

    registerShortcuts();
});

app.on("window-all-closed", (e) => {
    // If the app is running in tray mode, do NOT exit
    if (!isQuitting) {
        e.preventDefault();
        return;
    }

    if (db) db.close();
    safeUnregister(currentShortcuts.lock);
    safeUnregister(currentShortcuts.unlock);
    app.quit();
});

app.on("activate", function () {
    if (mainWindow === null) {
        createWindow();
    }
});

// Function to set window as desktop background
function setWindowAsDesktopBackground() {
    try {
        const hwnd = mainWindow.getNativeWindowHandle().readUInt32LE(0);
        // Use PowerShell to interact with Windows API
        const script = `
      Add-Type @"
      using System;
      using System.Runtime.InteropServices;
      public class WindowAPI {
        [DllImport("user32.dll", SetLastError = true)]
        public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
        [DllImport("user32.dll")]
        public static extern IntPtr GetDC(IntPtr hWnd);
        [DllImport("user32.dll")]
        public static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);
        [DllImport("user32.dll")]
        public static extern IntPtr SetParent(IntPtr hWndChild, IntPtr hWndNewParent);
        [DllImport("user32.dll")]
        public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
      }
      "@
      $desk = [WindowAPI]::FindWindow("Progman", $null)
      [WindowAPI]::SetParent([IntPtr]${hwnd}, $desk)
    `;
        execSync(`powershell -Command "${script}"`, { stdio: "pipe" });
    } catch (e) {
        console.log("Error setting desktop background:", e.message);
    }
}

// Handle pin/unpin window
ipcMain.on("toggle-pin", (event, isPinned) => {
    if (mainWindow) {
        if (isPinned) {
            // Set as desktop background
            isDesktopMode = true;
            mainWindow.setIgnoreMouseEvents(true);
            setWindowAsDesktopBackground();
        } else {
            // Restore normal window
            isDesktopMode = false;
            mainWindow.setIgnoreMouseEvents(false);
            mainWindow.setAlwaysOnTop(false);
        }
    }
});

// Handle minimize
ipcMain.on("minimize-window", () => {
    if (mainWindow && !isDesktopMode) {
        mainWindow.hide();
    }
});

// Handle close
ipcMain.on("close-window", () => {
    isQuitting = true;
    app.quit();
});

// Open external links in the user's default browser
ipcMain.handle("open-external", async (_event, url) => {
    if (typeof url !== "string") return false;

    const trimmed = url.trim();
    if (!trimmed) return false;

    const isHttp = /^https?:\/\//i.test(trimmed);
    const isMailTo = /^mailto:/i.test(trimmed);
    const isTel = /^tel:/i.test(trimmed);

    if (!isHttp && !isMailTo && !isTel) return false;

    await shell.openExternal(trimmed);
    return true;
});

// Handle save note to database
ipcMain.on("save-note", (event, content) => {
    if (db) {
        db.run(
            `INSERT OR REPLACE INTO notes (id, content, updated_at) VALUES (1, ?, CURRENT_TIMESTAMP)`,
            [content],
            (err) => {
                if (err) {
                    console.error("Error saving note:", err);
                    event.reply("save-note-response", { success: false });
                } else {
                    event.reply("save-note-response", { success: true });
                }
            },
        );
    }
});

// Handle load note from database
ipcMain.on("load-note", (event) => {
    if (db) {
        db.get(`SELECT content FROM notes WHERE id = 1`, (err, row) => {
            if (err) {
                console.error("Error loading note:", err);
                event.reply("load-note-response", { content: "" });
            } else {
                event.reply("load-note-response", {
                    content: row ? row.content : "",
                });
            }
        });
    }
});

app.on("before-quit", () => {
    isQuitting = true;
});

// IPC handlers for shortcuts
ipcMain.handle("get-shortcuts", () => {
    return getShortcuts();
});

ipcMain.handle("get-default-shortcuts", () => {
    return DEFAULT_SHORTCUTS;
});

ipcMain.handle("set-shortcuts", (e, shortcuts) => {
    const next = {
        lock: normalizeShortcut(shortcuts?.lock),
        unlock: normalizeShortcut(shortcuts?.unlock),
    };

    // Basic main-level validation
    const errors = {};
    if (!next.lock) errors.lock = "EMPTY";
    if (!next.unlock) errors.unlock = "EMPTY";
    if (next.lock && next.unlock && next.lock === next.unlock) {
        errors.lock = "SAME_AS_UNLOCK";
        errors.unlock = "SAME_AS_LOCK";
    }

    if (Object.keys(errors).length) {
        return { ok: false, errors, registered: { lock: false, unlock: false } };
    }

    // Try to register (this is the "busy/not available" check)
    const reg = registerShortcuts(next);

    if (!reg.ok) {
        // Important: do NOT save if registration failed
        return reg;
    }

    store.set("shortcuts", next);
    return reg; // ok:true
});

ipcMain.handle("reset-shortcuts", () => {
    const reg = registerShortcuts(DEFAULT_SHORTCUTS);
    if (!reg.ok) return reg;
    store.set("shortcuts", DEFAULT_SHORTCUTS);
    return reg;
});

// IPC: language sync for renderer + tray i18n
ipcMain.handle("get-language", () => {
    return currentLang;
});

ipcMain.handle("set-language", (_event, lang) => {
    const next = normalizeLanguage(lang) || DEFAULT_LANG;
    currentLang = next;
    store.set("lang", currentLang);
    updateTrayMenu();
    mainWindow?.webContents.send("language-changed", currentLang);
    return currentLang;
});
