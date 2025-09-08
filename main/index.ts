import { app, BrowserWindow, dialog, ipcMain, shell } from "electron"; // tslint:disable-line
import * as path from "path";
import * as fs from "fs";
import "./with-python";

// Global type declaration for OAuth code verifier
declare global {
    var oauthCodeVerifier: string | undefined;
}

const isDev = (process.env.NODE_ENV === "development");

// Custom protocol for auth callbacks
const AUTH_PROTOCOL = 'camelotdj';

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

// Register custom protocol for auth callbacks
if (process.defaultApp) {
    if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient(AUTH_PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
    }
} else {
    app.setAsDefaultProtocolClient(AUTH_PROTOCOL);
}

// Handle auth callback URLs
app.on('open-url', (event, url) => {
    event.preventDefault();
    console.log('🔗 Auth callback received:', url);
    handleAuthCallback(url);
});

// Handle auth callback from command line (Windows)
app.on('second-instance', (event, commandLine, workingDirectory) => {
    const url = commandLine.find(arg => arg.startsWith(`${AUTH_PROTOCOL}://`));
    if (url) {
        console.log('🔗 Auth callback from second instance:', url);
        handleAuthCallback(url);
    }
});

function handleAuthCallback(url: string) {
    try {
        const urlObj = new URL(url);
        const code = urlObj.searchParams.get('code');
        const error = urlObj.searchParams.get('error');
        
        if (error) {
            console.error('❌ OAuth error:', error);
            // Notify renderer of error
            const windows = BrowserWindow.getAllWindows();
            if (windows.length > 0) {
                windows[0].webContents.send('oauth-error', error);
            }
            return;
        }
        
        if (code) {
            console.log('✅ OAuth code received, exchanging for tokens...');
            exchangeAuthCodeForTokens(code);
        }
    } catch (err) {
        console.error('❌ Error parsing auth callback:', err);
    }
}

async function exchangeAuthCodeForTokens(code: string) {
    try {
        const https = require('https');
        const querystring = require('querystring');
        
        // Prepare token exchange data with PKCE
        const tokenData = querystring.stringify({
            code: code,
            client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || 'YOUR_CLIENT_ID_HERE',
            client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || 'YOUR_CLIENT_SECRET_HERE',
            redirect_uri: `${AUTH_PROTOCOL}://auth-callback`,
            grant_type: 'authorization_code',
            // Include PKCE code verifier if available
            ...(global.oauthCodeVerifier && { code_verifier: global.oauthCodeVerifier })
        });
        
        const options = {
            hostname: 'oauth2.googleapis.com',
            port: 443,
            path: '/token',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(tokenData)
            }
        };
        
        const req = https.request(options, (res: any) => {
            let data = '';
            res.on('data', (chunk: any) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    const tokens = JSON.parse(data);
                    console.log('✅ Tokens received, signing into Firebase...');
                    
                    // Clean up code verifier
                    if (global.oauthCodeVerifier) {
                        delete global.oauthCodeVerifier;
                    }
                    
                    // Send tokens to renderer for Firebase sign-in
                    const windows = BrowserWindow.getAllWindows();
                    if (windows.length > 0) {
                        windows[0].webContents.send('oauth-tokens', tokens);
                    }
                } catch (err) {
                    console.error('❌ Error parsing token response:', err);
                    // Clean up code verifier on error too
                    if (global.oauthCodeVerifier) {
                        delete global.oauthCodeVerifier;
                    }
                }
            });
        });
        
        req.on('error', (err: any) => {
            console.error('❌ Error exchanging auth code:', err);
        });
        
        req.write(tokenData);
        req.end();
    } catch (err) {
        console.error('❌ Error in token exchange:', err);
    }
}

// IPC handler for starting external OAuth flow
ipcMain.handle('start-external-oauth', async () => {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || 'YOUR_CLIENT_ID_HERE';
    
    // Generate PKCE parameters for better security (OAuth 2.0 PKCE)
    const crypto = require('crypto');
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    
    // Store code verifier for later use in token exchange
    global.oauthCodeVerifier = codeVerifier;
    
    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${clientId}&` +
        `redirect_uri=${encodeURIComponent(`${AUTH_PROTOCOL}://auth-callback`)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent('openid email profile')}&` +
        `code_challenge=${codeChallenge}&` +
        `code_challenge_method=S256&` +
        `access_type=offline&` +
        `prompt=select_account&` +
        `include_granted_scopes=true`;
    
    console.log('🌐 Opening external browser for OAuth with PKCE:', googleAuthUrl);
    await shell.openExternal(googleAuthUrl);
});

app.on("ready", async () => {
    // Set app name explicitly for better branding
    app.setName("CAMELOTDJ");
    
    if (isDev) {
        const sourceMapSupport = require("source-map-support"); // tslint:disable-line
        sourceMapSupport.install();
    }
    
    // Initialize Python backend immediately when app is ready
    try {
        // Import the initializeApi function from with-python
        const { initializeApi } = require("./with-python");
        await initializeApi();
        console.log("✅ Python backend initialized successfully");
    } catch (error) {
        console.error("❌ Failed to initialize Python backend:", error);
        dialog.showErrorBox("Backend Error", "Failed to start Python backend server. Please restart the application.");
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
        width: 1440,
        height: 900,
        icon: iconPath,
        title: "CAMELOTDJ - Music Analyzer",
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            nativeWindowOpen: true
        },
        show: false // Don't show until content is ready
    });
    
    // Show window when ready
    win.once('ready-to-show', () => {
        console.log('🖼️ Window ready to show');
        win.show();
    });
    
    // Fallback: show window after 5 seconds even if not ready
    setTimeout(() => {
        if (!win.isVisible()) {
            console.log('⏰ Timeout: Showing window anyway');
            win.show();
        }
    }, 5000);
    
    if (isDev) {
        console.log('🌐 Loading React dev server at http://localhost:3001/');
        win.loadURL("http://localhost:3001/");
        
        // Add event listeners to debug loading issues
        win.webContents.on('did-finish-load', () => {
            console.log('✅ Page loaded successfully');
        });
        
        win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
            console.error('❌ Page failed to load:', errorCode, errorDescription);
        });
        
        // Open DevTools to debug any issues
        win.webContents.openDevTools();
        return;
    }

    // In production, host the React build over HTTP on 127.0.0.1 to satisfy Firebase Auth authorized domains
    const http = require('http');
    const finalhandler = require('finalhandler');
    const serveStatic = require('serve-static');
    const getPort = require('get-port');

    // Fix the build directory path for production builds
    let buildDir = path.join(__dirname, '/../build');
    
    // Check if we're in a packaged app and adjust the path accordingly
    if (__dirname.includes('.asar')) {
        // We're in a packaged app, the build directory is in the app.asar.unpacked or resources
        buildDir = path.join(__dirname, '/../../build');
        
        // Alternative paths to try
        const possibleBuildPaths = [
            buildDir,
            path.join(__dirname, '/../build'),
            path.join(__dirname, '/../../build'),
            path.join(process.resourcesPath, 'build'),
            path.join(process.resourcesPath, 'app.asar.unpacked/build'),
            path.join(__dirname, '/../app.asar.unpacked/build')
        ];
        
        console.log('🔍 Searching for build directory in packaged app...');
        console.log('Current __dirname:', __dirname);
        console.log('Process resources path:', process.resourcesPath);
        
        // Find the first existing build directory
        for (const testPath of possibleBuildPaths) {
            console.log('Testing path:', testPath, 'exists:', fs.existsSync(testPath));
            if (fs.existsSync(testPath)) {
                buildDir = testPath;
                console.log('✅ Found build directory at:', buildDir);
                
                // List contents of the build directory
                try {
                    const buildContents = fs.readdirSync(buildDir);
                    console.log('📁 Build directory contents:', buildContents);
                    
                    // Check if index.html exists
                    const indexPath = path.join(buildDir, 'index.html');
                    if (fs.existsSync(indexPath)) {
                        console.log('✅ index.html found at:', indexPath);
                    } else {
                        console.log('❌ index.html not found in build directory');
                    }
                } catch (err) {
                    console.error('❌ Error reading build directory:', err);
                }
                break;
            }
        }
        
        if (!fs.existsSync(buildDir)) {
            console.error('❌ Build directory not found at any expected location');
            console.log('Searched paths:', possibleBuildPaths);
            dialog.showErrorBox('Build Error', 'React build directory not found. Please rebuild the application.');
            return;
        }
    } else {
        console.log('🔍 Running in development mode, using build directory:', buildDir);
        if (fs.existsSync(buildDir)) {
            const buildContents = fs.readdirSync(buildDir);
            console.log('📁 Build directory contents:', buildContents);
        } else {
            console.log('❌ Build directory not found in development mode');
        }
    }
    
    console.log('📁 Using build directory:', buildDir);
    const serve = serveStatic(buildDir, { index: ['index.html'] });

    (async () => {
        try {
            const port = await getPort({ host: '127.0.0.1', port: 3001 });
            const server = http.createServer((req: any, res: any) => {
                const done = finalhandler(req, res);
                serve(req, res, done);
            });
            server.on('error', (err: any) => {
                console.error('❌ HTTP server error:', err);
                const errorMessage = (err && typeof err === 'object' && 'message' in err) ? err.message : String(err);
                dialog.showErrorBox('UI Load Error', `Failed to start local UI server: ${errorMessage}`);
            });
            server.listen(port, '127.0.0.1', () => {
                const url = `http://127.0.0.1:${port}/`;
                console.log('Serving build from', buildDir, 'at', url);
                win.loadURL(url);
            });
        } catch (e) {
            console.error('❌ Failed to start local HTTP server:', e);
            const errorMessage = (e && typeof e === 'object' && 'message' in e) ? e.message : String(e);
            dialog.showErrorBox('UI Load Error', `Failed to start local UI server: ${errorMessage}`);
        }
    })();
}
