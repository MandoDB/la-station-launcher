// ─── Types globaux de l'API Electron ─────────────────────────────────────────

export interface PatchFile {
    name: string;   // ex: "StatePacket.class"
    path: string;   // ex: "zombie/network/packets/actions/StatePacket.class"
    url: string;    // URL de téléchargement directe
}

export interface VersionInfo {
    version: string;
    pzVersion?: string;
    backupJar?: string;
    files: PatchFile[];
    changelog?: string;
}

export interface PatchCheckResult {
    upToDate: boolean;
    localVersion: string | null;
    remoteVersion: string | null;
    needsDownload: boolean;
}

export interface DetectionResult {
    found: boolean;
    path?: string;
    method?: 'auto' | 'manual';
}

export interface PatchProgressData {
    step: 'check' | 'download' | 'inject' | 'ready' | 'origin-backup';
    progress: number;
}

export type SessionStatus =
    | 'idle'
    | 'patching'
    | 'launching'
    | 'running'
    | 'restoring'
    | 'done'
    | 'error';

export interface SessionUpdateData {
    status: SessionStatus;
    elapsedSeconds?: number;
    startTime?: number | null;
    error?: string;
    critical?: boolean;
    manualRestorePath?: string;
    message?: string;
}

// ─── Console PZ ──────────────────────────────────────────────────────────────
export interface ConsoleLine {
    level: 'LOG' | 'WARN' | 'ERROR' | 'RAW';
    category: string;
    text: string;
    raw: string;
}

// ─── Mods ─────────────────────────────────────────────────────────────────────
export interface ModEntry {
    id: string;
    name: string;
    require?: string | null;
}

// ─── Serveur PZ ───────────────────────────────────────────────────────────────
export interface ServerInfo {
    online: boolean;
    players: number;
    maxPlayers: number;
    serverName?: string;
    map?: string;
}

// ─── Discord ─────────────────────────────────────────────────────────────────
export interface DiscordUser {
    id: string;
    username: string;
    discriminator: string;
    avatar: string | null;
    avatarUrl: string | null;
}

// ─── Screenshot ──────────────────────────────────────────────────────────────
export interface ScreenshotMetadata {
    id: string;
    path: string;
    timestamp: number;
    filename: string;
}

// ─── Extension de Window pour l'API Electron ──────────────────────────────────

declare global {
    interface Window {
        electronAPI: {
            // Fenêtre
            minimizeWindow: () => void;
            minimizeToTray: () => void;
            maximizeWindow: () => void;
            closeWindow: () => void;
            closeWindowConfirmed: () => void;
            onConfirmClose: (callback: () => void) => void;
            killPZ: () => Promise<void>;

            // Jeu
            detectGame: () => Promise<DetectionResult>;
            selectGameFolder: () => Promise<string | null>;
            ramGet: (gamePath: string) => Promise<number | null>;
            ramSet: (gamePath: string, mb: number) => Promise<{ success: boolean; error?: string }>;

            // Patch
            checkPatch: () => Promise<PatchCheckResult>;
            applyPatch: (gamePath: string) => Promise<{ success: boolean; error?: string }>;
            restorePatch: (gamePath: string) => Promise<{ success: boolean; error?: string }>;
            getLocalVersion: () => Promise<VersionInfo | null>;
            downloadUpdate: () => Promise<{ success: boolean; error?: string }>;
            restoreOriginBackup: (gamePath: string) => Promise<{ success: boolean; error?: string }>;

            // Session
            startSession: (gamePath: string) => Promise<{ success: boolean; error?: string }>;
            getSessionStatus: () => Promise<{ status: SessionStatus; gamePath: string | null; startTime: number | null }>;

            // Console PZ
            consoleLocate: () => Promise<{ found: boolean; path?: string }>;
            consoleSetPath: () => Promise<string | null>;
            consoleReadAll: () => Promise<ConsoleLine[]>;
            consoleStartWatch: () => Promise<boolean>;
            consoleStopWatch: () => Promise<void>;
            consoleGetPath: () => Promise<string | null>;
            consoleSendDiscord: (options?: { includeUserId?: boolean }) => Promise<{ success: boolean; error?: string }>;



            // Serveur PZ
            serverQuery: () => Promise<ServerInfo>;

            // Mods serveur
            modsList: () => Promise<ModEntry[] | null>;

            // Discord IPC
            discordGetUser: () => Promise<DiscordUser | null>;
            discordIsReady: () => Promise<boolean>;
            discordSetPresence: (state: 'idle' | 'patching' | 'playing', startTimestamp?: number) => Promise<void>;

            // Settings
            settingsGet: () => Promise<{ hasAcceptedGDPR?: boolean; discordRpcEnabled?: boolean; debugMode?: boolean; modsEnabled?: boolean; disabledMods?: string[]; screenshotDir?: string; screenshotKey?: string }>;
            settingsSet: (patch: { discordRpcEnabled?: boolean; debugMode?: boolean; modsEnabled?: boolean; disabledMods?: string[]; screenshotDir?: string; screenshotKey?: string }) => Promise<{ hasAcceptedGDPR?: boolean; discordRpcEnabled?: boolean; debugMode?: boolean; modsEnabled?: boolean; disabledMods?: string[]; screenshotDir?: string; screenshotKey?: string }>;

            // Screenshot
            screenshotCapture: () => Promise<ScreenshotMetadata | null>;
            screenshotList: (limit?: number) => Promise<ScreenshotMetadata[]>;
            screenshotDelete: (path: string) => Promise<void>;
            screenshotOpenFolder: () => void;
            screenshotOpenModal: (path: string) => void;
            screenshotShareDone: () => void;
            screenshotShareCancel: () => void;
            screenshotSendDiscord: (paths: string | string[], title?: string, userId?: string) => Promise<{ success: boolean; error?: string }>;
            screenshotGetDir: () => Promise<string>;
            screenshotSetDir: (path: string) => Promise<boolean>;
            screenshotSnippetReady: (rect: { x: number, y: number, width: number, height: number }) => void;
            screenshotSnippetCancel: () => void;
            onScreenshotCaptured: (callback: (metadata: ScreenshotMetadata) => void) => void;
            onShowScreenshotModal: (callback: (path: string) => void) => void;

            // Utilitaires
            openExternal: (url: string) => void;

            // Événements
            onPatchProgress: (callback: (data: PatchProgressData) => void) => void;
            onSessionUpdate: (callback: (data: SessionUpdateData) => void) => void;
            onForceRestoreStart: (callback: () => void) => void;
            onLog: (callback: (log: string) => void) => void;
            onConsoleLines: (callback: (lines: ConsoleLine[]) => void) => void;
            onDiscordUser: (callback: (user: DiscordUser | null) => void) => void;
            onDiscordConnecting: (callback: (v: boolean) => void) => void;
            onServerPlayers: (callback: (info: ServerInfo) => void) => void;
            onAutoRestoreDone: (callback: (data: { success: boolean; error?: string }) => void) => void;
            onPatchAutoCheck: (callback: (data: { check: PatchCheckResult; version: VersionInfo | null }) => void) => void;

            // Updater launcher
            updaterQuitAndInstall: () => Promise<void>;
            updaterIsReady: () => Promise<boolean>;
            onUpdaterDownloaded: (callback: (data: { version: string; releaseNotes: string | null }) => void) => void;

            removeAllListeners: (channel: string) => void;

        };
    }
}

export { };

