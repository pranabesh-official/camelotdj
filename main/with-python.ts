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

const initializeApi = async () => {
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
    // In packaged apps, asar may be disabled, so use Electron's app.isPackaged
    if (app.isPackaged) {
        // dialog.showErrorBox("info", "packaged");
        if (fs.existsSync(exePath)) {
            const logDir = app.getPath("userData");
            try { fs.mkdirSync(logDir, { recursive: true }); } catch { /* noop */ }
            const logPath = path.join(logDir, "python.log");
            const logStream = fs.createWriteStream(logPath, { flags: "a" });
            logStream.write(`\n==== Starting Python backend @ ${new Date().toISOString()} port=${apiDetails.port} ====\n`);
            pyProc = childProcess.spawn(exePath, ["--apiport", String(apiDetails.port), "--signingkey", apiDetails.signingKey], { env: { ...process.env } });
            (pyProc as any).stdout && (pyProc as any).stdout.on("data", (data: Buffer) => logStream.write(data));
            (pyProc as any).stderr && (pyProc as any).stderr.on("data", (data: Buffer) => logStream.write(data));
            (pyProc as any).on && (pyProc as any).on("error", (err: Error) => logStream.write(`\n[error] ${err.stack || String(err)}\n`));
            if (pyProc === undefined) {
                dialog.showErrorBox("Error", "pyProc is undefined");
                dialog.showErrorBox("Error", exePath);
            } else if (pyProc === null) {
                dialog.showErrorBox("Error", "pyProc is null");
                dialog.showErrorBox("Error", exePath);
            }
        } else {
            dialog.showErrorBox("Error", "Packaged python app not found");
        }
    } else {
        // dialog.showErrorBox("info", "unpackaged");
        if (fs.existsSync(srcPath)) {
            const logDir = app.getPath("userData");
            try { fs.mkdirSync(logDir, { recursive: true }); } catch { /* noop */ }
            const logPath = path.join(logDir, "python-dev.log");
            const logStream = fs.createWriteStream(logPath, { flags: "a" });
            logStream.write(`\n==== Starting Python backend (dev) @ ${new Date().toISOString()} port=${apiDetails.port} ====\n`);
            pyProc = crossSpawn("python3", [srcPath, "--apiport", String(apiDetails.port), "--signingkey", apiDetails.signingKey]);
            (pyProc as any).stdout && (pyProc as any).stdout.on("data", (data: Buffer) => logStream.write(data));
            (pyProc as any).stderr && (pyProc as any).stderr.on("data", (data: Buffer) => logStream.write(data));
        } else {
            dialog.showErrorBox("Error", "Unpackaged python source not found");
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
