import { app, BrowserWindow, dialog } from "electron"; // tslint:disable-line
import * as path from "path";
import * as fs from "fs";
import "./with-python";

const isDev = (process.env.NODE_ENV === "development");

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("ready", () => {
    // Set app name explicitly for better branding
    app.setName("CAMELOTDJ");
    
    if (isDev) {
        const sourceMapSupport = require("source-map-support"); // tslint:disable-line
        sourceMapSupport.install();
    }
    createWindow();
});

function createWindow() {
    // Multiple icon path options for robust icon loading
    const possibleIconPaths = [
        // macOS prefers .icns files
        path.resolve(__dirname, "../applogo.icns"),
        path.resolve(__dirname, "../../applogo.icns"),
        path.resolve(process.cwd(), "applogo.icns"),
        // Fallback to PNG
        path.resolve(__dirname, "../applogo.png"),
        path.resolve(__dirname, "../../applogo.png"),
        path.resolve(process.cwd(), "applogo.png"),
        path.resolve(process.cwd(), "public/applogo.png")
    ];
    
    let iconPath = possibleIconPaths[0]; // Default fallback
    
    // Find the first existing icon path
    for (const testPath of possibleIconPaths) {
        if (fs.existsSync(testPath)) {
            iconPath = testPath;
            console.log('Found icon at:', iconPath);
            break;
        }
    }
    
    if (!fs.existsSync(iconPath)) {
        console.warn('Icon not found at any expected location, using default');
    }
    
    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        icon: iconPath,
        title: "CAMELOTDJ - Music Analyzer",
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        show: false // Don't show until ready to prevent icon flicker
    });
    
    // Show window once ready
    win.once('ready-to-show', () => {
        win.show();
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
