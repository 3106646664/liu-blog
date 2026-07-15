const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("qqLoginHelper", {
  start: (token) => ipcRenderer.invoke("qq-login-start", token),
  clear: () => ipcRenderer.invoke("qq-login-clear"),
  onProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("login-progress", listener);
    return () => ipcRenderer.removeListener("login-progress", listener);
  },
});
