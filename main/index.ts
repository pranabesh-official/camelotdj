import { app, BrowserWindow, dialog } from "electron"; // tslint:disable-line
import * as path from "path";
import "./with-python";

const isDev = (process.env.NODE_ENV === "development");

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("ready", () => {
    if (isDev) {
        const sourceMapSupport = require("source-map-support"); // tslint:disable-line
        sourceMapSupport.install();
    }
    createWindow();
});

function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });
    
    if (isDev) {
        // DevTools disabled on startup for cleaner user experience
        // Developers can still access DevTools manually with Cmd+Opt+I (macOS) or Ctrl+Shift+I (Windows/Linux)
        // win.webContents.openDevTools();
        win.loadURL("http://localhost:3000/");
    } else {
        win.loadURL(`file://${path.join(__dirname, "/../build/index.html")}`);
    }
}
