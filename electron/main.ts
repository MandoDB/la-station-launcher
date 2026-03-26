import {
    app,
    BrowserWindow,
    Tray,
    nativeImage,
    ipcMain,
    dialog,
    shell,
    nativeTheme,
    Menu,
    globalShortcut,
    protocol,
    net,
} from 'electron';
// Token injecté au build par Vite (vite.config.ts → define.__GITHUB_TOKEN__)
// Fallback sur process.env pour les rares cas où la variable ne serait pas injectée
declare const __GITHUB_TOKEN__: string;
const GITHUB_TOKEN: string = (typeof __GITHUB_TOKEN__ !== 'undefined' ? __GITHUB_TOKEN__ : '') || process.env.GITHUB_TOKEN || '';
import { join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { pathToFileURL } from 'url';
import { autoUpdater } from 'electron-updater';
import { PatchManager } from './patchManager';
import { GameDetector } from './gameDetector';
import { SessionManager } from './sessionManager';
import { ConsoleWatcher } from './consoleWatcher';

protocol.registerSchemesAsPrivileged([
    { scheme: 'local-img', privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);
import { DiscordManager } from './discordManager';
import { ScreenshotManager, ScreenshotMetadata } from './screenshotManager';
import { RecorderManager } from './recorderManager';
import { queryServer, ServerInfo } from './serverQuery';
import { fetchRemoteMods, applyServerMods, restoreServerMods, resolveActiveMods, ModEntry } from './modManager';

nativeTheme.themeSource = 'dark';

// ─── Config serveur ──────────────────────────────────────────────────────────
const SERVER_HOST = 'play.la-station.org';
const SERVER_QUERY_PORT = 16261;
const SERVER_POLL_INTERVAL_MS = 30_000;

// ─── Config patch auto-check ─────────────────────────────────────────────────
// 5 minutes pour rester sous le rate limit GitHub anonyme (60 req/h = 1/min max)
const PATCH_CHECK_INTERVAL_MS = 5 * 60_000;
let patchCheckTimer: NodeJS.Timeout | null = null;

// ─── Settings ────────────────────────────────────────────────────────────────
interface AppSettings {
    hasAcceptedGDPR?: boolean;
    discordRpcEnabled?: boolean;
    debugMode?: boolean;
    modsEnabled?: boolean;
    /** IDs des mods serveur explicitement désactivés par l'utilisateur */
    disabledMods?: string[];
    screenshotDir?: string;
    screenshotKey?: string;
    screenshotSnippetKey?: string;
    recorderDir?: string;
    recorderKey?: string;
    recorderIndicatorEnabled?: boolean;
    recorderIndicatorPos?: { x: number, y: number };
    recorderResolution?: '480p' | '720p' | '1080p' | 'native';
    recorderFps?: 15 | 30 | 60;
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
let tray: Tray | null = null;
let patchManager: PatchManager | null = null;
let sessionManager: SessionManager | null = null;
let consoleWatcher: ConsoleWatcher | null = null;
let discordManager: DiscordManager | null = null;
let screenshotManager: ScreenshotManager | null = null;
let recorderManager: RecorderManager | null = null;
let notificationWindow: BrowserWindow | null = null;
let snippetWindow: BrowserWindow | null = null;
let shareWindow: BrowserWindow | null = null;
let recordingIndicatorWindow: BrowserWindow | null = null;
let recordingNotificationWindow: BrowserWindow | null = null;
let recordingSavedNotificationWindow: BrowserWindow | null = null;

// Chemin du backup mods (initialisé dans initManagers)
let modsBackupPath = '';

// Dernier résultat connu de la query serveur
let lastServerInfo: ServerInfo = { online: false, players: 0, maxPlayers: 0 };
let serverPollTimer: NodeJS.Timeout | null = null;

// État Discord courant (pour pouvoir rafraîchir le playerCount sans changer d'état)
let currentPresenceState: import('./discordManager').PresenceState = 'idle';
let currentPresenceTs: number | undefined = undefined;

// Icône fenêtre/tray : Windows → .ico, Linux/macOS → .png si présent, sinon .ico
function getAppIconPath(): string {
    const assetsDir = join(__dirname, '../assets');
    if (process.platform === 'win32') return join(assetsDir, 'icon.ico');
    const png = join(assetsDir, 'icon.png');
    return existsSync(png) ? png : join(assetsDir, 'icon.ico');
}

function createWindow(): void {
    const iconPath = getAppIconPath();
    mainWindow = new BrowserWindow({
        width: 1280, height: 760, minWidth: 1000, minHeight: 620,
        frame: false, transparent: false, backgroundColor: '#000000',
        resizable: true, title: 'LA STATION Launcher',
        icon: iconPath,
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
    mainWindow.on('closed', () => {
        if (tray) {
            tray.destroy();
            tray = null;
        }
        mainWindow = null;
    });

    // Tray (icône en bas à droite) : réduire = masquer dans le tray
    const trayIcon = nativeImage.createFromPath(iconPath);
    if (!trayIcon.isEmpty()) {
        tray = new Tray(trayIcon);
        tray.setToolTip('LA STATION Launcher');
        tray.on('click', () => {
            mainWindow?.show();
            mainWindow?.focus();
        });
        tray.setContextMenu(Menu.buildFromTemplate([
            { label: 'Ouvrir LA STATION', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
            { type: 'separator' },
            { label: 'Quitter', click: () => app.quit() },
        ]));
    }

    // Démarrer la connexion Discord + polling patch après chargement
    // + vérifier session.lock (crash au lancement précédent)
    mainWindow.webContents.once('did-finish-load', () => {
        if (isRpcEnabled()) setTimeout(() => discordManager?.connect(), 2000);
        startPatchPolling();
        checkOrphanMods();
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

// ── Restauration automatique des mods au démarrage ────────────────────────────
function checkOrphanMods(): void {
    if (!modsBackupPath) return;
    try {
        restoreServerMods(modsBackupPath);
        mainWindow?.webContents.send('log:entry', '[Démarrage] Mods orphelins restaurés (crash précédent détecté).');
    } catch { /* ignore si pas de backup */ }
}

// ── Restauration automatique au démarrage (session.lock orphelin) ─────────────
async function checkOrphanSession(): Promise<void> {
    if (!patchManager) return;
    const lock = patchManager.readLock();
    if (!lock) return; // Pas de lock → tout est propre

    const { gamePath, timestamp } = lock;
    const age = Math.round((Date.now() - timestamp) / 1000 / 60); // en minutes
    console.log(`[Main] session.lock détecté (${age} min) → gamePath: ${gamePath}`);

    // Log uniquement — on n'envoie PAS session:update { status: 'restoring' } ici car
    // cela ferait clignoter/masquer le versionBadge et le bouton JAR dans le renderer
    // (arrivé avant que React ait fini son init). On utilise uniquement session:auto-restore-done.
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

    // Pas besoin de renvoyer session:update { status: 'idle' } : le sessionStatus
    // est déjà 'idle' au démarrage (état initial du renderer).
}

function initManagers(): void {
    const userDataPath = app.getPath('userData');
    const appDataPath = join(userDataPath, 'patch'); // On garde 'patch' pour ne pas d'incohérence avec l'ancien nom si possible
    if (!existsSync(appDataPath)) mkdirSync(appDataPath, { recursive: true });
    
    console.log(`[Main] App Data Path: ${appDataPath}`);
    settingsPath = join(appDataPath, 'settings.json');
    modsBackupPath = join(appDataPath, 'mods.backup.json');

    // Helper pour envoyer au renderer de façon sécurisée avec logs terminal
    const sendToUI = (event: string, data: any) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(event, data);
        } else {
            console.warn(`[Main] Tentative d'envoi IPC (${event}) alors que la fenêtre est absente/détruite.`);
        }
    };

    patchManager = new PatchManager(appDataPath, sendToUI, GITHUB_TOKEN);
    discordManager = new DiscordManager(sendToUI);
    // Screenshot : capturer
    screenshotManager = new ScreenshotManager(appDataPath, (event, data) => {
        sendToUI(event, data);
        if (event === 'screenshot:captured') {
            createCaptureNotification(data);
        }
    });

    // Recorder : enregistrer
    recorderManager = new RecorderManager(appDataPath, (isRecording) => {
        sendToUI('recorder:status-update', isRecording);
        if (isRecording) {
            const s = loadSettings();
            if (s.recorderIndicatorEnabled !== false) {
                createRecordingIndicatorWindow();
            }
            createRecordingNotification();
        } else {
            if (recordingIndicatorWindow) {
                recordingIndicatorWindow.close();
                recordingIndicatorWindow = null;
            }
        }
    }, (metadata) => {
        sendToUI('log:entry', `[Recorder] Vidéo sauvegardée : ${metadata.filename}`);
        sendToUI('recorder:saved', metadata);
        createRecordingSavedNotification(metadata);
    });

    const s = loadSettings();
    if (s.screenshotDir) screenshotManager.setDirectory(s.screenshotDir);
    if (s.recorderDir) recorderManager.setVideosDir(s.recorderDir);

    // Session : envoyer au renderer ET mettre à jour la présence Discord côté main
    let lastSessionStatus: string | null = null;
    sessionManager = new SessionManager((event, data) => {
        sendToUI(event, data);
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
                // Restaurer les mods dès que le jeu se ferme (done) ou que la session revient à idle
                try {
                    restoreServerMods(modsBackupPath);
                    mainWindow?.webContents.send('log:entry', '[Mods] Mods restaurés à leur état d\'origine.');
                } catch (e: any) {
                    mainWindow?.webContents.send('log:entry', `[Mods] Erreur restauration mods : ${e.message}`);
                }
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
        if (event === 'console:server-connected') setDiscordPresence('playing', data?.startTime ?? Date.now());
        if (event === 'console:server-disconnected') setDiscordPresence('lobby', data?.startTime ?? Date.now());
    });

    consoleWatcher.locate();
}

// ── Fenêtre ──────────────────────────────────────────────────────────────────
// Réduire = fenêtre dans la barre des tâches
ipcMain.on('window:minimize', () => mainWindow?.minimize());
// Réduire dans la barre système = masquer dans le tray (icône en bas à droite)
ipcMain.on('window:minimize-to-tray', () => mainWindow?.hide());
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

// ── RAM (ProjectZomboid64.json) ────────────────────────────────────────────────
const PZ_JSON_FILENAME = 'ProjectZomboid64.json';

function getPzJsonPath(gamePath: string): string {
    return join(gamePath, PZ_JSON_FILENAME);
}

/** Lit le -Xmx courant en Mo depuis ProjectZomboid64.json. Retourne null si illisible. */
function readPzRamMb(gamePath: string): number | null {
    try {
        const p = getPzJsonPath(gamePath);
        if (!existsSync(p)) return null;
        const json = JSON.parse(readFileSync(p, 'utf8'));
        const vmArgs: string[] = json.vmArgs ?? [];
        const xmx = vmArgs.find((a: string) => /^-Xmx\d+[mMgG]$/.test(a));
        if (!xmx) return null;
        const match = xmx.match(/^-Xmx(\d+)([mMgG])$/);
        if (!match) return null;
        const value = parseInt(match[1], 10);
        const unit = match[2].toLowerCase();
        return unit === 'g' ? value * 1024 : value;
    } catch { return null; }
}

/** Écrit la valeur -Xmx en Mo dans ProjectZomboid64.json. */
function writePzRamMb(gamePath: string, mb: number): { success: boolean; error?: string } {
    try {
        const p = getPzJsonPath(gamePath);
        if (!existsSync(p)) return { success: false, error: `${PZ_JSON_FILENAME} introuvable dans ${gamePath}` };
        const json = JSON.parse(readFileSync(p, 'utf8'));
        const vmArgs: string[] = json.vmArgs ?? [];
        const idx = vmArgs.findIndex((a: string) => /^-Xmx/.test(a));
        const newArg = mb % 1024 === 0 ? `-Xmx${mb / 1024}g` : `-Xmx${mb}m`;
        if (idx >= 0) vmArgs[idx] = newArg;
        else vmArgs.push(newArg);
        json.vmArgs = vmArgs;
        writeFileSync(p, JSON.stringify(json, null, '\t'), 'utf8');
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

ipcMain.handle('ram:get', (_e, gamePath: string) => readPzRamMb(gamePath));
ipcMain.handle('ram:set', (_e, gamePath: string, mb: number) => writePzRamMb(gamePath, mb));

// ── Patch ─────────────────────────────────────────────────────────────────────
ipcMain.handle('patch:check', async () => patchManager!.checkForUpdates());
ipcMain.handle('patch:apply', async (_e, p: string) => patchManager!.applyPatch(p));
ipcMain.handle('patch:restore', async (_e, p: string) => patchManager!.restoreBackup(p));
ipcMain.handle('patch:restore-origin', async (_e, p: string) => patchManager!.restoreOriginBackup(p));
ipcMain.handle('patch:get-local-version', async () => patchManager!.getLocalVersion());
ipcMain.handle('patch:download-update', async () => patchManager!.downloadUpdate());

// ── Session ───────────────────────────────────────────────────────────────────
ipcMain.handle('session:start', async (_e, p: string) => {
    setDiscordPresence('patching');
    const settings = loadSettings();
    const debugMode = settings.debugMode === true;

    // Mods serveur (activé par défaut)
    if (settings.modsEnabled !== false) {
        const fetched = await fetchRemoteMods(GITHUB_TOKEN);
        if (fetched && fetched.length > 0) {
            const disabledMods = settings.disabledMods ?? [];
            const toActivate = resolveActiveMods(fetched, disabledMods);
            try {
                applyServerMods(toActivate, modsBackupPath);
                const skipped = fetched.length - toActivate.length;
                const msg = skipped > 0
                    ? `[Mods] ${toActivate.length} mod(s) activé(s), ${skipped} ignoré(s) (désactivés ou dépendance manquante).`
                    : `[Mods] ${toActivate.length} mod(s) serveur activé(s) dans default.txt.`;
                mainWindow?.webContents.send('log:entry', msg);
            } catch (e: any) {
                mainWindow?.webContents.send('log:entry', `[Mods] Erreur activation mods : ${e.message}`);
            }
        } else {
            mainWindow?.webContents.send('log:entry', '[Mods] Aucun mod serveur à activer (mods.json indisponible ou vide).');
        }
    }

    const result = await sessionManager!.startSession(p, patchManager!, debugMode);
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

// ── Mods serveur ──────────────────────────────────────────────────────────────
ipcMain.handle('mods:list', async () => {
    return fetchRemoteMods(GITHUB_TOKEN);
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

    // Rafraîchir les raccourcis si besoin
    if ('screenshotKey' in patch || 'screenshotSnippetKey' in patch || 'recorderKey' in patch) {
        registerHotkeys();
    }

    if ('recorderDir' in patch && patch.recorderDir) {
        recorderManager?.setVideosDir(patch.recorderDir);
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

    // Token injecté au build → évite le rate limit anonyme (60 req/h → 5000 req/h)
    if (GITHUB_TOKEN) {
        autoUpdater.addAuthHeader(`Bearer ${GITHUB_TOKEN}`);
    }

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
        finally {
            // Toujours restaurer les mods avant de quitter
            try { restoreServerMods(modsBackupPath); } catch { /* ignore */ }
            app.exit(0);
        }
    } else {
        // Pas de session active mais peut-être un backup mods résiduel (crash précédent)
        try { restoreServerMods(modsBackupPath); } catch { /* ignore */ }
    }
});

// ── Screenshot ─────────────────────────────────────────────────────────────
ipcMain.handle('screenshot:capture', async () => screenshotManager?.capture());
ipcMain.handle('screenshot:list', async (_e, limit?: number) => screenshotManager?.getRecent(limit));
ipcMain.handle('screenshot:delete', async (_e, p: string) => screenshotManager?.delete(p));
ipcMain.handle('recorder:list', async (_e, limit?: number) => recorderManager?.getVideos(limit));
ipcMain.handle('recorder:delete', async (_e, p: string) => recorderManager?.deleteVideo(p));
ipcMain.on('screenshot:open-folder', () => screenshotManager?.openFolder());
ipcMain.on('recorder:open-folder', () => recorderManager?.openFolder());
ipcMain.handle('recorder:get-dir', () => recorderManager?.getVideosDir());
ipcMain.handle('recorder:set-dir', async (_e, path: string) => {
    const ok = recorderManager?.setVideosDir(path);
    if (ok) saveSettings({ recorderDir: path });
    return ok;
});
ipcMain.on('window:open-external', (_e, url: string) => {
    shell.openExternal(url).catch(err => console.error('[Main] Failed to open external:', err));
});
ipcMain.handle('screenshot:send-discord', async (_e, p: string, title?: string, userId?: string) => 
    screenshotManager?.sendToDiscord(p, title, userId));
ipcMain.handle('screenshot:get-dir', () => screenshotManager?.getDirectory());
ipcMain.handle('screenshot:set-dir', async (_e, p: string) => {
    if (screenshotManager?.setDirectory(p)) {
        saveSettings({ screenshotDir: p });
        return true;
    }
    return false;
});

ipcMain.on('recorder:indicator-preview', (_e, show: boolean) => {
    if (show) {
        createRecordingIndicatorWindow();
    } else {
        // Ne fermer que si on n'est pas en train d'enregistrer
        if (recordingIndicatorWindow && !recorderManager?.isRecordingNow()) {
            recordingIndicatorWindow.close();
            recordingIndicatorWindow = null;
        }
    }
});
ipcMain.on('screenshot:open-modal', (_e, path: string) => {
    if (notificationWindow) {
        notificationWindow.close();
        notificationWindow = null;
    }
    createShareWindow(path);
});

ipcMain.on('screenshot:snippet-ready', (_e, rect: { x: number, y: number, width: number, height: number }) => {
    if (snippetWindow) {
        snippetWindow.destroy();
        snippetWindow = null;
    }
    screenshotManager?.capture(rect);
});

ipcMain.on('screenshot:snippet-cancel', () => {
    if (snippetWindow) {
        snippetWindow.destroy();
        snippetWindow = null;
    }
});

function registerHotkeys() {
    const s = loadSettings();
    const key = s.screenshotKey || 'F10';
    const snippetKey = s.screenshotSnippetKey || 'F9';
    const recKey = s.recorderKey || 'F8';

    try {
        globalShortcut.unregisterAll();
        
        // Screenshot plein écran
        globalShortcut.register(key, () => {
            screenshotManager?.capture();
        });

        // Screenshot zone
        globalShortcut.register(snippetKey, () => {
            createSnippetWindow();
        });

        // Recorder Toggle
        globalShortcut.register(recKey, () => {
            recorderManager?.toggleRecording();
        });

        console.log(`[Main] Hotkeys registered: ${key} (Full), ${snippetKey} (Snippet), ${recKey} (Record)`);
    } catch (e) {
        console.error('[Main] Failed to register hotkeys:', e);
    }
}

function createSnippetWindow() {
    if (snippetWindow) return;

    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.bounds;

    snippetWindow = new BrowserWindow({
        width,
        height,
        x: primaryDisplay.bounds.x,
        y: primaryDisplay.bounds.y,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        focusable: true, // Nécessaire pour capturer echap
        webPreferences: {
            preload: join(__dirname, 'preload.js'),
        },
    });

    // Niveau max pour passer au dessus de tout
    snippetWindow.setAlwaysOnTop(true, 'screen-saver');

    if (process.env.VITE_DEV_SERVER_URL) {
        snippetWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}#snippet-tool`);
    } else {
        snippetWindow.loadFile(join(__dirname, '../dist/index.html'), {
            hash: 'snippet-tool'
        });
    }

    snippetWindow.on('closed', () => {
        snippetWindow = null;
    });
}

function createCaptureNotification(metadata: ScreenshotMetadata) {
    if (notificationWindow) {
        notificationWindow.destroy();
    }

    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;

    notificationWindow = new BrowserWindow({
        width: 320,
        height: 100,
        x: width - 330,
        y: height - 110,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        focusable: false,
        type: 'toolbar', // Parfois nécessaire pour l'overlay
        webPreferences: {
            preload: join(__dirname, 'preload.js'),
        },
    });

    // Forcer au-dessus de tout (y compris certains plein écrans)
    notificationWindow.setAlwaysOnTop(true, 'screen-saver');

    if (process.env.VITE_DEV_SERVER_URL) {
        notificationWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}#capture-notification?path=${encodeURIComponent(metadata.path)}`);
    } else {
        notificationWindow.loadFile(join(__dirname, '../dist/index.html'), {
            hash: `capture-notification?path=${encodeURIComponent(metadata.path)}`
        });
    }

    // Auto-fermeture après 5s
    setTimeout(() => {
        if (notificationWindow && !notificationWindow.isDestroyed()) {
            notificationWindow.close();
        }
    }, 5000);
}

function createRecordingIndicatorWindow() {
    if (recordingIndicatorWindow) return;

    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const settings = loadSettings();
    
    // Position par défaut : en haut à gauche avec marge
    const defaultX = 20;
    const defaultY = 20;

    const x = settings.recorderIndicatorPos?.x ?? defaultX;
    const y = settings.recorderIndicatorPos?.y ?? defaultY;

    recordingIndicatorWindow = new BrowserWindow({
        width: 70,
        height: 32,
        x,
        y,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        focusable: false,
        type: 'toolbar',
        webPreferences: {
            preload: join(__dirname, 'preload.js'),
        },
    });

    recordingIndicatorWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    recordingIndicatorWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    
    // S'assurer qu'il est dans l'écran visible s'il a été déplacé/oublié
    const bounds = primaryDisplay.workArea;
    if (x < bounds.x || x > bounds.x + bounds.width - 70 || 
        y < bounds.y || y > bounds.y + bounds.height - 32) {
        recordingIndicatorWindow.setPosition(bounds.x + 20, bounds.y + 20);
    }

    if (process.env.VITE_DEV_SERVER_URL) {
        recordingIndicatorWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}#recording-indicator`);
    } else {
        recordingIndicatorWindow.loadFile(join(__dirname, '../dist/index.html'), {
            hash: 'recording-indicator'
        });
    }

    // Sauvegarder la position quand on le déplace
    recordingIndicatorWindow.on('moved', () => {
        if (recordingIndicatorWindow) {
            const [nx, ny] = recordingIndicatorWindow.getPosition();
            saveSettings({ recorderIndicatorPos: { x: nx, y: ny } });
        }
    });

    recordingIndicatorWindow.on('closed', () => {
        recordingIndicatorWindow = null;
    });
}

function createRecordingNotification() {
    if (recordingNotificationWindow) {
        recordingNotificationWindow.destroy();
    }

    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;

    recordingNotificationWindow = new BrowserWindow({
        width: 320,
        height: 100,
        x: width - 330,
        y: height - 110,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        focusable: false,
        type: 'toolbar',
        webPreferences: {
            preload: join(__dirname, 'preload.js'),
        },
    });

    recordingNotificationWindow.setAlwaysOnTop(true, 'screen-saver');

    if (process.env.VITE_DEV_SERVER_URL) {
        recordingNotificationWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}#recording-notification`);
    } else {
        recordingNotificationWindow.loadFile(join(__dirname, '../dist/index.html'), {
            hash: 'recording-notification'
        });
    }

    // Auto-fermeture après 5s
    setTimeout(() => {
        if (recordingNotificationWindow && !recordingNotificationWindow.isDestroyed()) {
            recordingNotificationWindow.close();
            recordingNotificationWindow = null;
        }
    }, 5000);
}

function createRecordingSavedNotification(metadata: any) {
    if (recordingSavedNotificationWindow) {
        recordingSavedNotificationWindow.destroy();
    }

    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;

    recordingSavedNotificationWindow = new BrowserWindow({
        width: 320,
        height: 100,
        x: width - 330,
        y: height - 110,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        focusable: false,
        type: 'toolbar',
        webPreferences: {
            preload: join(__dirname, 'preload.js'),
        },
    });

    recordingSavedNotificationWindow.setAlwaysOnTop(true, 'screen-saver');

    const url = `recording-saved-notification?path=${encodeURIComponent(metadata.path)}`;
    if (process.env.VITE_DEV_SERVER_URL) {
        recordingSavedNotificationWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}#${url}`);
    } else {
        recordingSavedNotificationWindow.loadFile(join(__dirname, '../dist/index.html'), {
            hash: url
        });
    }

    // Auto-fermeture après 5s
    setTimeout(() => {
        if (recordingSavedNotificationWindow && !recordingSavedNotificationWindow.isDestroyed()) {
            recordingSavedNotificationWindow.close();
            recordingSavedNotificationWindow = null;
        }
    }, 5000);
}

function createShareWindow(path: string) {
    if (shareWindow) {
        shareWindow.destroy();
    }

    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.bounds;

    shareWindow = new BrowserWindow({
        width,
        height,
        x: primaryDisplay.bounds.x,
        y: primaryDisplay.bounds.y,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        focusable: true,
        webPreferences: {
            preload: join(__dirname, 'preload.js'),
        },
    });

    shareWindow.setAlwaysOnTop(true, 'screen-saver');
    shareWindow.setVisibleOnAllWorkspaces(true); // Pour les multi-écrans/espaces

    const urlParams = `?path=${encodeURIComponent(path)}`;
    if (process.env.VITE_DEV_SERVER_URL) {
        shareWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}#share-screenshot${urlParams}`);
    } else {
        shareWindow.loadFile(join(__dirname, '../dist/index.html'), {
            hash: `share-screenshot${urlParams}`
        });
    }

    shareWindow.on('closed', () => {
        shareWindow = null;
    });
}

ipcMain.on('screenshot:share-done', () => {
    if (shareWindow) {
        shareWindow.close();
    }
});

ipcMain.on('screenshot:share-cancel', () => {
    if (shareWindow) {
        shareWindow.close();
    }
});

// ── Protocoles ──────────────────────────────────────────────────────────────
app.whenReady().then(() => {
    protocol.handle('local-img', (request) => {
        try {
            // Extraction brute pour éviter les parsers qui mangent les colons
            let path = request.url.replace('local-img://', '');
            if (path.startsWith('/')) path = path.slice(1);
            
            let decodedPath = decodeURIComponent(path);
            
            // Correction Windows (si c/Users -> C:/Users)
            if (process.platform === 'win32') {
                if (decodedPath.match(/^[a-zA-Z][\\\/]/)) {
                    decodedPath = decodedPath[0].toUpperCase() + ':' + decodedPath.slice(1);
                }
                decodedPath = decodedPath.replace(/\//g, '\\');
            }

            const extension = decodedPath.split('.').pop()?.toLowerCase();
            const contentType = extension === 'webm' ? 'video/webm' : 'image/png';

            if (!existsSync(decodedPath)) {
                console.warn(`[Main] File not found: ${decodedPath}`);
                return new Response('Not Found', { status: 404 });
            }

            const data = readFileSync(decodedPath);
            return new Response(data, {
                headers: { 'content-type': contentType }
            });
        } catch (e) {
            console.error('[Main] Protocol local protocol error:', e);
            return new Response('Error', { status: 500 });
        }
    });
});

app.whenReady().then(() => {
    initManagers();
    registerHotkeys();
    createWindow();
    initAutoUpdater();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
