const { app, BrowserWindow } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const http = require("http");

const isDev = process.env.NODE_ENV !== "production" && !app.isPackaged;
const rootDir = path.join(__dirname, "..");
let serverProcess = null;

function waitForServer() {
  return new Promise((resolve) => {
    const check = () => {
      const req = http.get("http://localhost:3000", () => resolve());
      req.on("error", () => setTimeout(check, 200));
    };
    setTimeout(check, 500);
  });
}

function startServer() {
  return new Promise((resolve) => {
    if (serverProcess) return waitForServer().then(resolve);
    const script = isDev ? "server.ts" : "server.js";
    const exec = isDev ? "npx" : "node";
    const args = isDev ? ["tsx", script] : [script];
    serverProcess = spawn(exec, args, {
      cwd: rootDir,
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: isDev ? "development" : "production" },
    });
    serverProcess.on("error", (err) => console.error("Server spawn error", err));
    waitForServer().then(resolve);
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
    title: "kyn",
  });
  win.loadURL("http://localhost:3000");
  if (isDev) win.webContents.openDevTools();
}

app.whenReady().then(() => {
  startServer().then(createWindow);
});

app.on("window-all-closed", () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
  app.quit();
});
