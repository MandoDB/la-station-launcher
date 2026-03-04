// ─── Types globaux de l'API Electron ─────────────────────────────────────────

export interface PatchFile {
    name: string;   // ex: "StatePacket.class"
    path: string;   // ex: "zombie/network/packets/actions/StatePacket.class"
    url: string;    // URL de téléchargement directe
}

export interface VersionInfo {
    version: string;
    pzVersion?: string;
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
    step: 'check' | 'download' | 'inject' | 'ready';
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

// ─── Extension de Window pour l'API Electron ──────────────────────────────────

declare global {
    interface Window {
        electronAPI: {
            // Fenêtre
            minimizeWindow: () => void;
            maximizeWindow: () => void;
            closeWindow: () => void;
            closeWindowConfirmed: () => void;
            onConfirmClose: (callback: () => void) => void;
            killPZ: () => Promise<void>;

            // Jeu
            detectGame: () => Promise<DetectionResult>;
            selectGameFolder: () => Promise<string | null>;

            // Patch
            checkPatch: () => Promise<PatchCheckResult>;
            applyPatch: (gamePath: string) => Promise<{ success: boolean; error?: string }>;
            restorePatch: (gamePath: string) => Promise<{ success: boolean; error?: string }>;
            getLocalVersion: () => Promise<VersionInfo | null>;
            downloadUpdate: () => Promise<{ success: boolean; error?: string }>;

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

            // Discord IPC
            discordGetUser: () => Promise<DiscordUser | null>;
            discordIsReady: () => Promise<boolean>;
            discordSetPresence: (state: 'idle' | 'patching' | 'playing', startTimestamp?: number) => Promise<void>;

            // Settings
            settingsGet: () => Promise<{ hasAcceptedGDPR?: boolean; discordRpcEnabled?: boolean }>;
            settingsSet: (patch: { discordRpcEnabled?: boolean }) => Promise<{ hasAcceptedGDPR?: boolean; discordRpcEnabled?: boolean }>;

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

