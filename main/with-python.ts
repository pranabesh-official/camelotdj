import childProcess from "child_process";
import crossSpawn from "cross-spawn";
import { app, dialog, ipcMain, IpcMainEvent } from "electron"; // tslint:disable-line
import fs from "fs";
import getPort from "get-port";
import * as path from "path";
import superagent from "superagent";
import uuid from "uuid";

const PY_DIST_FOLDER = "pythondist";
const PY_FOLDER = "python";
const PY_MODULE = "api"; // without .py suffix

const isDev = (process.env.NODE_ENV === "development");

let pyProc = null as any;

const apiDetails = {
    port:0,
    signingKey:"",
};

// Function to get Python source path (unpacked in packaged mode)
const getPythonSourcePath = () => {
    if (app.isPackaged) {
        // In packaged mode, Python source is unpacked
        return path.join(process.resourcesPath, "app.asar.unpacked", PY_FOLDER, PY_MODULE + ".py");
    } else {
        // In development mode, use local source
        return path.join(__dirname, "..", PY_FOLDER, PY_MODULE + ".py");
    }
};

const initializeApi = async () => {
    console.log("🚀 Initializing Python backend...");
    console.log("📁 Current directory:", __dirname);
    console.log("🔧 Is packaged:", app.isPackaged);
    console.log("🖥️ Platform:", process.platform);
    
    // dialog.showErrorBox("success", "initializeApi");
    const availablePort = await getPort();
    apiDetails.port = isDev ? 5002 : availablePort;
    const key = isDev ? "devkey" : uuid.v4();
    apiDetails.signingKey = key;
    const srcPath = path.join(__dirname, "..", PY_FOLDER, PY_MODULE + ".py");
    // Support both onefile (api) and onedir (api/api) PyInstaller outputs on macOS
    const exePath = (process.platform === "win32")
        ? path.join(__dirname, "..", PY_DIST_FOLDER, PY_MODULE + ".exe")
        : (() => {
            const oneFile = path.join(__dirname, "..", PY_DIST_FOLDER, PY_MODULE);
            const oneDir = path.join(__dirname, "..", PY_DIST_FOLDER, PY_MODULE, PY_MODULE);
            return fs.existsSync(oneDir) ? oneDir : oneFile;
        })();
    // For packaged apps, the Python source is in the app.asar
    const packagedSrcPath = app.isPackaged 
        ? path.join(process.resourcesPath, "app.asar", PY_FOLDER, PY_MODULE + ".py")
        : srcPath;
    
    // For packaged apps, the PyInstaller executable is unpacked
    const packagedExePath = app.isPackaged
        ? path.join(process.resourcesPath, "app.asar.unpacked", PY_DIST_FOLDER, PY_MODULE, PY_MODULE)
        : exePath;
    // In packaged apps, use unpacked Python source
    if (app.isPackaged) {
        console.log("📦 Running in packaged mode");
        
        const pythonSourcePath = getPythonSourcePath();
        console.log("🔍 Python source path:", pythonSourcePath);
        
        if (fs.existsSync(pythonSourcePath)) {
            console.log("✅ Using unpacked Python source:", pythonSourcePath);
            const logDir = app.getPath("userData");
            try { fs.mkdirSync(logDir, { recursive: true }); } catch { /* noop */ }
            const logPath = path.join(logDir, "python.log");
            const logStream = fs.createWriteStream(logPath, { flags: "a" });
            logStream.write(`\n==== Starting Python backend (unpacked) @ ${new Date().toISOString()} port=${apiDetails.port} ====\n`);
            
            console.log("🎯 Spawning Python script:", pythonSourcePath);
            console.log("🔑 Port:", apiDetails.port);
            console.log("🔑 Signing key:", apiDetails.signingKey);
            
            pyProc = crossSpawn("python3", [pythonSourcePath, "--apiport", String(apiDetails.port), "--signingkey", apiDetails.signingKey]);
            
            (pyProc as any).stdout && (pyProc as any).stdout.on("data", (data: Buffer) => {
                const output = data.toString();
                logStream.write(output);
                console.log("🐍 Python stdout:", output.trim());
            });
            (pyProc as any).stderr && (pyProc as any).stderr.on("data", (data: Buffer) => {
                const output = data.toString();
                logStream.write(output);
                console.error("🐍 Python stderr:", output.trim());
            });
            (pyProc as any).on && (pyProc as any).on("error", (err: Error) => {
                const errorMsg = `\n[error] ${err.stack || String(err)}\n`;
                logStream.write(errorMsg);
                console.error("🐍 Python process error:", err);
            });
            
            console.log("✅ Python process spawned successfully (packaged mode)");
        } else {
            const error = `Python source not found at: ${pythonSourcePath}`;
            console.error("❌", error);
            dialog.showErrorBox("Error", error);
        }
    } else {
        console.log("🔧 Running in development mode");
        // dialog.showErrorBox("info", "unpackaged");
        const pythonSourcePath = getPythonSourcePath();
        if (fs.existsSync(pythonSourcePath)) {
            const logDir = app.getPath("userData");
            try { fs.mkdirSync(logDir, { recursive: true }); } catch { /* noop */ }
            const logPath = path.join(logDir, "python-dev.log");
            const logStream = fs.createWriteStream(logPath, { flags: "a" });
            logStream.write(`\n==== Starting Python backend (dev) @ ${new Date().toISOString()} port=${apiDetails.port} ====\n`);
            
            console.log("🎯 Spawning Python script:", pythonSourcePath);
            pyProc = crossSpawn("python3", [pythonSourcePath, "--apiport", String(apiDetails.port), "--signingkey", apiDetails.signingKey]);
            (pyProc as any).stdout && (pyProc as any).stdout.on("data", (data: Buffer) => {
                const output = data.toString();
                logStream.write(output);
                console.log("🐍 Python stdout:", output.trim());
            });
            (pyProc as any).stderr && (pyProc as any).stderr.on("data", (data: Buffer) => {
                const output = data.toString();
                logStream.write(output);
                console.error("🐍 Python stderr:", output.trim());
            });
        } else {
            const error = `Python source not found at: ${pythonSourcePath}`;
            console.error("❌", error);
            dialog.showErrorBox("Error", error);
        }
    }
    if (pyProc === null || pyProc === undefined) {
        dialog.showErrorBox("Error", "unable to start python server");
    } else if (isDev) {
        console.log("Server running at http://127.0.0.1:" + apiDetails.port);
    }
    if (isDev) {
        console.log("leaving initializeApi()");
    }
};

// Export the initializeApi function for use in main process
export { initializeApi };

ipcMain.on("getApiDetails", (event: IpcMainEvent) => {
    if (apiDetails.signingKey !== "") {
        event.sender.send("apiDetails", JSON.stringify(apiDetails));
    } else {
        initializeApi()
            .then(() => {
                event.sender.send("apiDetails", JSON.stringify(apiDetails));
            })
            .catch(() => {
                event.sender.send("apiDetailsError", "Error initializing API");
            });
    }
});

// Handle folder dialog for download path selection
ipcMain.on("show-folder-dialog", async (event: IpcMainEvent) => {
    try {
        const result = await dialog.showOpenDialog({
            properties: ['openDirectory'],
            title: 'Select Download Folder for YouTube Music'
        });
        
        if (!result.canceled && result.filePaths.length > 0) {
            event.sender.send("folder-dialog-response", result.filePaths[0]);
        } else {
            event.sender.send("folder-dialog-response", null);
        }
    } catch (error) {
        console.error('Error showing folder dialog:', error);
        event.sender.send("folder-dialog-response", null);
    }
});

const exitPyProc = () => {
    //
    // NOTE: killing processes in node is surprisingly tricky and a simple
    //             pyProc.kill() totally isn't enough. Instead send a message to
    //             the pyProc web server telling it to exit
    //
    superagent.get("http://127.0.0.1:" + apiDetails.port + "/graphql/?query=%7Bexit(signingkey:\"" + apiDetails.signingKey + "\")%7D").then().catch();
    pyProc = null;
};

app.on("will-quit", exitPyProc);
