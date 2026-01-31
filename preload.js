const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    send: (channel, data) => {
        ipcRenderer.send(channel, data);
    },
    on: (channel, func) => {
        ipcRenderer.on(channel, (event, ...args) => func(...args));
    },
    invoke: (channel, data) => {
        return ipcRenderer.invoke(channel, data);
    },
    getShortcuts: () => ipcRenderer.invoke("get-shortcuts"),
    getDefaultShortcuts: () => ipcRenderer.invoke("get-default-shortcuts"),
    setShortcuts: (data) => ipcRenderer.invoke("set-shortcuts", data),
    resetShortcuts: () => ipcRenderer.invoke("reset-shortcuts"),
    getLanguage: () => ipcRenderer.invoke("get-language"),
    setLanguage: (lang) => ipcRenderer.invoke("set-language", lang),
    onLanguageChanged: (cb) => ipcRenderer.on("language-changed", (_e, lang) => cb(lang)),
    // Open external links in the default browser
    openExternal: (url) => ipcRenderer.invoke("open-external", url),
});
