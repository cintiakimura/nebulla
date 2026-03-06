# kyn — Downloadable desktop app (Mac & Windows)

You can run kyn as a desktop app (like VS Code or Cursor) and later build installers for Mac and Windows.

---

## 1. Run the desktop app (development)

**Prerequisites:** Node 18+, and the web app working (`npm run dev`).

1. **Install dependencies** (including Electron):
   ```bash
   npm install
   ```

2. **Start the desktop app:**
   - **Option A:** In one terminal run `npm run dev` (starts the server). In a second terminal run:
     ```bash
     npx electron .
     ```
   - **Option B:** If you have `concurrently` and `wait-on` installed:
     ```bash
     npm install -D concurrently wait-on
     ```
     Then add to `package.json` scripts:
     ```json
     "electron:dev": "concurrently \"npm run dev\" \"wait-on http://localhost:3000 && electron .\""
     ```
     Run:
     ```bash
     npm run electron:dev
     ```

3. Electron will open a window pointing at `http://localhost:3000`. The same backend (and SQLite DB) is used, so projects and chat persist.

---

## 2. Build installers (Mac & Windows)

To produce a **downloadable .dmg (Mac)** or **.exe / installer (Windows)**:

### Step 1: Add electron-builder

```bash
npm install -D electron-builder
```

### Step 2: Build the web app

```bash
npm run build
```

This creates the `dist/` folder (static SPA).

### Step 3: Compile the server for production (optional but recommended)

The desktop app currently starts the server with `npx tsx server.ts` in dev. For a packaged app you typically compile the server to JavaScript so you don’t ship `tsx` and TypeScript.

1. **Compile server + db to JS** (example with esbuild):
   ```bash
   npm install -D esbuild
   ```
   Add a script in `package.json`:
   ```json
   "build:server": "node -e \"require('esbuild').buildSync({ entryPoints: ['server.ts'], bundle: true, platform: 'node', outfile: 'server.js', external: ['better-sqlite3'], format: 'esm' })\""
   ```
   Or use `tsc` with a `tsconfig` that emits `server.js` and `db.js` into a folder (e.g. `build/`) and run `node build/server.js` from Electron.

2. **Point Electron at the built server**  
   In `electron/main.js`, for production (`!isDev`) use the path to your built server (e.g. `node server.js` or `node build/server.js`) and ensure the working directory is the project root so `kyn.db` and `dist/` are found.

### Step 4: Configure electron-builder

Add to `package.json`:

```json
{
  "build": {
    "appId": "app.kyn",
    "productName": "kyn",
    "directories": { "output": "release" },
    "files": [
      "dist/**/*",
      "electron/**/*",
      "server.js",
      "db.js",
      "kyn.db"
    ],
    "mac": {
      "category": "public.app-category.developer-tools",
      "target": ["dmg", "zip"]
    },
    "win": {
      "target": ["nsis", "portable"]
    }
  }
}
```

Adjust `files` if your server build lives elsewhere (e.g. `build/**/*`).

### Step 5: Build installers

- **Mac (dmg):**
  ```bash
  npx electron-builder --mac
  ```
  Output: `release/kyn-0.1.0.dmg` (and optionally `.zip`).

- **Windows (nsis installer / portable):**
  ```bash
  npx electron-builder --win
  ```
  Output: `release/kyn Setup 0.1.0.exe` and/or portable exe.

- **Both:**
  ```bash
  npx electron-builder -mwl
  ```

### Step 6: Ship the backend with the app

The app needs the **Node server** and **SQLite DB** at runtime:

- **Option A (simplest):** Ship the compiled `server.js` (and `db.js` if separate) and `kyn.db` next to the Electron binary. In `electron/main.js`, for the packaged app, set `cwd` to the folder that contains `server.js` and `dist/`, and spawn `node server.js`. electron-builder can put these in `resources/` and you resolve paths with `process.resourcesPath`.
- **Option B:** Use electron-builder’s `extraResources` to copy `server.js`, `db.js`, and a default `kyn.db` into the app bundle so the main process can start the server from there.

---

## 3. Summary

| Goal | What to do |
|------|------------|
| **Run desktop app (dev)** | `npm run dev` in one terminal, then `npx electron .` in another. |
| **Mac .dmg** | `npm run build`, then `npx electron-builder --mac`. |
| **Windows .exe** | `npm run build`, then `npx electron-builder --win`. |
| **Server in packaged app** | Compile server to JS; in Electron main, spawn `node server.js` with the correct `cwd` so `dist/` and `kyn.db` are found (or use `extraResources` and `process.resourcesPath`). |

After building, you get a **downloadable app** that users can install on Mac or Windows like VS Code or Cursor.
