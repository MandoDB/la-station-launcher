import {
    app,
    BrowserWindow,
    ipcMain,
    dialog,
    shell,
    nativeTheme,
} from 'electron';
import { config as loadDotenv } from 'dotenv';
// Charge .env depuis la racine du projet (dev) ou à côté de l'exe (prod)
loadDotenv({ path: require('path').resolve(__dirname, '..', '.env') });
import { join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { autoUpdater } from 'electron-updater';
import { PatchManager } from './patchManager';
import { GameDetector } from './gameDetector';
import { SessionManager } from './sessionManager';
import { ConsoleWatcher } from './consoleWatcher';
import { DiscordManager } from './discordManager';
import { queryServer, ServerInfo } from './serverQuery';

nativeTheme.themeSource = 'dark';

// ─── Config serveur ──────────────────────────────────────────────────────────
const SERVER_HOST = 'play.la-station.org';
const SERVER_QUERY_PORT = 16263;
const SERVER_POLL_INTERVAL_MS = 30_000;

// ─── Config patch auto-check ─────────────────────────────────────────────────
// 5 minutes pour rester sous le rate limit GitHub anonyme (60 req/h = 1/min max)
const PATCH_CHECK_INTERVAL_MS = 5 * 60_000;
let patchCheckTimer: NodeJS.Timeout | null = null;

// ─── Settings ────────────────────────────────────────────────────────────────
interface AppSettings {
    hasAcceptedGDPR?: boolean;
    discordRpcEnabled?: boolean;
}

let settingsPath = ''; // initialisé dans initManagers

function loadSettings(): AppSettings {
    try {
        if (!existsSync(settingsPath)) return {};
        return JSON.parse(readFileSync(settingsPath, 'utf-8')) as AppSettings;
    } catch { return {}; }
}

function saveSettings(patch: Partial<AppSettings>): AppSettings {
    const current = loadSettings();
    const updated = { ...current, ...patch };
    writeFileSync(settingsPath, JSON.stringify(updated, null, 2), 'utf-8');
    return updated;
}

function isRpcEnabled(): boolean {
    const s = loadSettings();
    // Activé par défaut si la clé n'est pas encore définie
    return s.discordRpcEnabled !== false;
}

let mainWindow: BrowserWindow | null = null;
let patchManager: PatchManager | null = null;
let sessionManager: SessionManager | null = null;
let consoleWatcher: ConsoleWatcher | null = null;
let discordManager: DiscordManager | null = null;

// Dernier résultat connu de la query serveur
let lastServerInfo: ServerInfo = { online: false, players: 0, maxPlayers: 0 };
let serverPollTimer: NodeJS.Timeout | null = null;

// État Discord courant (pour pouvoir rafraîchir le playerCount sans changer d'état)
let currentPresenceState: import('./discordManager').PresenceState = 'idle';
let currentPresenceTs: number | undefined = undefined;

function createWindow(): void {
    mainWindow = new BrowserWindow({
        width: 1280, height: 760, minWidth: 1000, minHeight: 620,
        frame: false, transparent: false, backgroundColor: '#000000',
        resizable: true, title: 'LA STATION Launcher',
        icon: join(__dirname, '../assets/icon.ico'),
        webPreferences: {
            preload: join(__dirname, 'preload.js'),
            contextIsolation: true, nodeIntegration: false, sandbox: false,
        },
    });
    if (process.env.NODE_ENV === 'development') {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
        mainWindow.loadFile(join(__dirname, '../dist/index.html'));
    }
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url); return { action: 'deny' };
    });
    mainWindow.on('closed', () => { mainWindow = null; });

    // Démarrer la connexion Discord + polling patch après chargement
    // + vérifier session.lock (crash au lancement précédent)
    mainWindow.webContents.once('did-finish-load', () => {
        if (isRpcEnabled()) setTimeout(() => discordManager?.connect(), 2000);
        startPatchPolling();
        checkOrphanSession();
    });
}

// ── Auto-check patch (toutes les 30s) ────────────────────────────────────────
async function pollPatchCheck(): Promise<void> {
    if (!patchManager) return;
    // Ne pas checker pendant une session active (patch en cours d'injection)
    const status = sessionManager?.getStatus().status ?? 'idle';
    if (status !== 'idle' && status !== 'done' && status !== 'error') return;

    try {
        const [check, version] = await Promise.all([
            patchManager.checkForUpdates(),
            patchManager.getLocalVersion(),
        ]);
        // Envoyer au renderer pour mettre à jour le badge sans action de l'utilisateur
        mainWindow?.webContents.send('patch:auto-check', { check, version });
    } catch { /* réseau indisponible — silencieux */ }
}

function startPatchPolling(): void {
    if (patchCheckTimer) return;
    patchCheckTimer = setInterval(pollPatchCheck, PATCH_CHECK_INTERVAL_MS);
}

function stopPatchPolling(): void {
    if (patchCheckTimer) {
        clearInterval(patchCheckTimer);
        patchCheckTimer = null;
    }
}

// ── Polling serveur ───────────────────────────────────────────────────────────
async function pollServer(): Promise<void> {
    const info = await queryServer(SERVER_HOST, SERVER_QUERY_PORT);
    lastServerInfo = info;
    // Envoyer l'info au renderer
    mainWindow?.webContents.send('server:players', info);
    // Rafraîchir la présence Discord avec le nouveau compte (sans changer d'état)
    if (currentPresenceState !== 'idle' && currentPresenceState !== 'patching') {
        const pc = info.online ? { current: info.players, max: info.maxPlayers } : undefined;
        discordManager?.setPresence(currentPresenceState, currentPresenceTs, pc);
    }
}

function startServerPolling(): void {
    if (serverPollTimer) return;
    // Première requête immédiate
    pollServer();
    serverPollTimer = setInterval(pollServer, SERVER_POLL_INTERVAL_MS);
}

function stopServerPolling(): void {
    if (serverPollTimer) {
        clearInterval(serverPollTimer);
        serverPollTimer = null;
    }
}

// Helper : appeler setPresence en mémorisant l'état courant et en injectant playerCount
function setDiscordPresence(
    state: import('./discordManager').PresenceState,
    ts?: number,
): void {
    currentPresenceState = state;
    if (ts !== undefined) currentPresenceTs = ts;
    if (!isRpcEnabled()) return; // RPC désactivé dans les settings
    const pc = (state !== 'idle' && state !== 'patching' && lastServerInfo.online)
        ? { current: lastServerInfo.players, max: lastServerInfo.maxPlayers }
        : undefined;
    discordManager?.setPresence(state, ts, pc);
}

// ── Restauration automatique au démarrage (session.lock orphelin) ─────────────
async function checkOrphanSession(): Promise<void> {
    if (!patchManager) return;
    const lock = patchManager.readLock();
    if (!lock) return; // Pas de lock → tout est propre

    const { gamePath, timestamp } = lock;
    const age = Math.round((Date.now() - timestamp) / 1000 / 60); // en minutes
    console.log(`[Main] session.lock détecté (${age} min) → gamePath: ${gamePath}`);

    // Notifier le renderer qu'une restauration est en cours
    mainWindow?.webContents.send('session:update', { status: 'restoring' });
    mainWindow?.webContents.send('log:entry', `[Démarrage] Session orpheline détectée (crash il y a ~${age} min). Restauration en cours...`);

    if (existsSync(gamePath)) {
        const result = await patchManager.restoreBackup(gamePath);
        if (result.success) {
            patchManager.deleteLock();
            mainWindow?.webContents.send('log:entry', '[Démarrage] Restauration automatique réussie. JAR propre.');
            mainWindow?.webContents.send('session:auto-restore-done', { success: true });
        } else {
            mainWindow?.webContents.send('log:entry', `[Démarrage] ERREUR restauration : ${result.error}`);
            mainWindow?.webContents.send('session:auto-restore-done', { success: false, error: result.error });
        }
    } else {
        // gamePath introuvable (jeu désinstallé/déplacé) → supprimer le lock quand même
        mainWindow?.webContents.send('log:entry', `[Démarrage] Dossier jeu introuvable (${gamePath}). Lock supprimé.`);
        patchManager.deleteLock();
        mainWindow?.webContents.send('session:auto-restore-done', { success: true });
    }

    // Revenir à idle après la restauration
    mainWindow?.webContents.send('session:update', { status: 'idle' });
}

function initManagers(): void {
    const appDataPath = join(app.getPath('appData'), 'PZLauncher');
    if (!existsSync(appDataPath)) mkdirSync(appDataPath, { recursive: true });
    settingsPath = join(appDataPath, 'settings.json');

    patchManager = new PatchManager(appDataPath, (event, data) => mainWindow?.webContents.send(event, data));
    discordManager = new DiscordManager((event, data) => mainWindow?.webContents.send(event, data));

    // Session : envoyer au renderer ET mettre à jour la présence Discord côté main
    // On garde trace du dernier statut pour éviter de rappeler setPresence à chaque tick de poll.
    let lastSessionStatus: string | null = null;
    sessionManager = new SessionManager((event, data) => {
        mainWindow?.webContents.send(event, data);
        if (event === 'session:update' && data?.status) {
            const status: string = data.status;
            if (status === 'running') {
                if (lastSessionStatus !== 'running') {
                    // Première transition vers "running" : lobby + démarrage du watcher console + polling serveur
                    setDiscordPresence('lobby', data.startTime ?? Date.now());
                    consoleWatcher?.startWatch();
                    startServerPolling();
                }
                // Les ticks de poll suivants (toutes les 2s) sont ignorés pour Discord
            } else if (status === 'idle' || status === 'done') {
                stopServerPolling();
                setDiscordPresence('idle');
            } else if (status === 'patching' || status === 'launching' || status === 'restoring') {
                setDiscordPresence('patching');
            }
            lastSessionStatus = status;
        }
    });

    // Console PZ : envoyer au renderer, et suivre les états multi pour le RPC
    consoleWatcher = new ConsoleWatcher((event, data) => {
        mainWindow?.webContents.send(event, data);
        if (event === 'console:server-connecting') setDiscordPresence('connecting', data?.startTime ?? Date.now());
        if (event === 'console:server-connected')   setDiscordPresence('playing',    data?.startTime ?? Date.now());
        if (event === 'console:server-disconnected') setDiscordPresence('lobby',     data?.startTime ?? Date.now());
    });

    consoleWatcher.locate();
}

// ── Fenêtre ──────────────────────────────────────────────────────────────────
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize());

// Fermeture : si une session est active, demander confirmation au renderer.
// Sinon fermer directement.
ipcMain.on('window:close', () => {
    if (sessionManager?.isSessionActive()) {
        // Envoyer une demande de confirmation au renderer (modale côté UI)
        mainWindow?.webContents.send('window:confirm-close');
    } else {
        mainWindow?.close();
    }
});

// Confirmation de fermeture : tuer PZ, restaurer, puis fermer
ipcMain.on('window:close-confirmed', async () => {
    await sessionManager?.killPZ();
    mainWindow?.close(); // déclenche before-quit qui restaure le JAR
});

// Tuer PZ sans fermer le launcher (bouton "Quitter la session")
ipcMain.handle('session:kill-pz', async () => {
    await sessionManager?.killPZ();
});

// ── Jeu ──────────────────────────────────────────────────────────────────────
ipcMain.handle('game:detect', async () => new GameDetector().detect());
ipcMain.handle('game:select-folder', async () => {
    if (!mainWindow) return null;
    const r = await dialog.showOpenDialog(mainWindow, {
        title: 'Sélectionner le dossier Project Zomboid', properties: ['openDirectory'], buttonLabel: 'Sélectionner',
    });
    return r.canceled ? null : r.filePaths[0] ?? null;
});

// ── Patch ─────────────────────────────────────────────────────────────────────
ipcMain.handle('patch:check', async () => patchManager!.checkForUpdates());
ipcMain.handle('patch:apply', async (_e, p: string) => patchManager!.applyPatch(p));
ipcMain.handle('patch:restore', async (_e, p: string) => patchManager!.restoreBackup(p));
ipcMain.handle('patch:get-local-version', async () => patchManager!.getLocalVersion());
ipcMain.handle('patch:download-update', async () => patchManager!.downloadUpdate());

// ── Session ───────────────────────────────────────────────────────────────────
ipcMain.handle('session:start', async (_e, p: string) => {
    setDiscordPresence('patching');
    const result = await sessionManager!.startSession(p, patchManager!);
    return result;
});
ipcMain.handle('session:status', () => sessionManager!.getStatus());

// ── Console PZ ────────────────────────────────────────────────────────────────
ipcMain.handle('console:locate', async () => consoleWatcher!.locate());
ipcMain.handle('console:set-path', async () => {
    if (!mainWindow) return null;
    const r = await dialog.showOpenDialog(mainWindow, {
        title: 'Sélectionner console.txt',
        filters: [{ name: 'Log files', extensions: ['txt', 'log', '*'] }],
        properties: ['openFile'],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    return consoleWatcher!.setCustomPath(r.filePaths[0]) ? r.filePaths[0] : null;
});
ipcMain.handle('console:read-all', async () => consoleWatcher!.readAll());
ipcMain.handle('console:start-watch', async () => consoleWatcher!.startWatch());
ipcMain.handle('console:stop-watch', async () => consoleWatcher!.stopWatch());
ipcMain.handle('console:get-path', async () => consoleWatcher!.getPath());
ipcMain.handle('console:send-discord', async (_e, options?: { includeUserId?: boolean }) => {
    const userId = options?.includeUserId ? discordManager?.getUser()?.id ?? null : null;
    return consoleWatcher!.sendToDiscord(userId);
});

// ── Discord IPC ───────────────────────────────────────────────────────────────
ipcMain.handle('discord:get-user', async () => discordManager!.getUser());
ipcMain.handle('discord:is-ready', async () => discordManager!.isReady());
ipcMain.handle('discord:set-presence', async (_e, state: 'idle' | 'patching' | 'playing', ts?: number) =>
    discordManager!.setPresence(state, ts));

// ── Serveur PZ ────────────────────────────────────────────────────────────────
ipcMain.handle('server:query', async () => {
    const info = await queryServer(SERVER_HOST, SERVER_QUERY_PORT);
    lastServerInfo = info;
    return info;
});

// ── Settings ──────────────────────────────────────────────────────────────────
ipcMain.handle('settings:get', () => loadSettings());
ipcMain.handle('settings:set', async (_e, patch: Partial<AppSettings>) => {
    const updated = saveSettings(patch);

    // Appliquer immédiatement le changement RPC sans redémarrer
    if ('discordRpcEnabled' in patch) {
        if (patch.discordRpcEnabled) {
            // Réactiver : lever le flag disabled puis se connecter
            discordManager?.enable();
            if (!discordManager?.isReady()) await discordManager?.connect();
            else setDiscordPresence(currentPresenceState, currentPresenceTs);
        } else {
            // Désactiver : déconnecter et bloquer toute reconnexion automatique
            await discordManager?.destroy(true);
        }
    }

    return updated;
});

// ── Utilitaires ───────────────────────────────────────────────────────────────
ipcMain.on('shell:open-external', (_e, url: string) => shell.openExternal(url));

// ── Auto-updater launcher ─────────────────────────────────────────────────────
let launcherUpdateReady = false;

function initAutoUpdater(): void {
    // En dev, electron-updater ne peut pas vérifier → on désactive silencieusement
    if (!app.isPackaged) return;

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-downloaded', (info) => {
        launcherUpdateReady = true;
        mainWindow?.webContents.send('updater:downloaded', {
            version: info.version,
            releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : null,
        });
    });

    autoUpdater.on('error', (err) => {
        console.error('[AutoUpdater]', err?.message ?? err);
    });

    // Vérification au démarrage (légère — pas de popup native)
    autoUpdater.checkForUpdates().catch((err) => {
        console.warn('[AutoUpdater] checkForUpdates failed:', err?.message ?? err);
    });
}

ipcMain.handle('updater:is-ready', () => launcherUpdateReady);
ipcMain.handle('updater:quit-and-install', () => {
    if (launcherUpdateReady) autoUpdater.quitAndInstall(false, true);
});

// ── Fermeture propre ──────────────────────────────────────────────────────────
app.on('before-quit', async (event) => {
    stopPatchPolling();
    stopServerPolling();
    consoleWatcher?.stopWatch();
    await discordManager?.destroy();
    if (sessionManager?.isSessionActive()) {
        event.preventDefault();
        mainWindow?.webContents.send('session:force-restore-start');
        try {
            const s = sessionManager.getStatus();
            if (s.gamePath) await patchManager!.restoreBackup(s.gamePath);
            patchManager!.deleteLock();
        } catch (e) { console.error('[Main] Restore failed on quit:', e); }
        finally { app.exit(0); }
    }
});

app.whenReady().then(() => {
    initManagers();
    createWindow();
    initAutoUpdater();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
