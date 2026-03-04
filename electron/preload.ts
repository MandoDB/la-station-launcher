import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Fenêtre ────────────────────────────────────────────────────────────────
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  closeWindowConfirmed: () => ipcRenderer.send('window:close-confirmed'),
  onConfirmClose: (cb: () => void) => ipcRenderer.on('window:confirm-close', () => cb()),
  killPZ: () => ipcRenderer.invoke('session:kill-pz'),

  // ── Jeu ───────────────────────────────────────────────────────────────────
  detectGame: () => ipcRenderer.invoke('game:detect'),
  selectGameFolder: () => ipcRenderer.invoke('game:select-folder'),

  // ── Patch ─────────────────────────────────────────────────────────────────
  checkPatch: () => ipcRenderer.invoke('patch:check'),
  applyPatch: (p: string) => ipcRenderer.invoke('patch:apply', p),
  restorePatch: (p: string) => ipcRenderer.invoke('patch:restore', p),
  getLocalVersion: () => ipcRenderer.invoke('patch:get-local-version'),
  downloadUpdate: () => ipcRenderer.invoke('patch:download-update'),

  // ── Session ───────────────────────────────────────────────────────────────
  startSession: (p: string) => ipcRenderer.invoke('session:start', p),
  getSessionStatus: () => ipcRenderer.invoke('session:status'),

  // ── Console PZ ────────────────────────────────────────────────────────────
  consoleLocate: () => ipcRenderer.invoke('console:locate'),
  consoleSetPath: () => ipcRenderer.invoke('console:set-path'),
  consoleReadAll: () => ipcRenderer.invoke('console:read-all'),
  consoleStartWatch: () => ipcRenderer.invoke('console:start-watch'),
  consoleStopWatch: () => ipcRenderer.invoke('console:stop-watch'),
  consoleGetPath: () => ipcRenderer.invoke('console:get-path'),
  consoleSendDiscord: (options?: { includeUserId?: boolean }) => ipcRenderer.invoke('console:send-discord', options),

  // ── Discord IPC ───────────────────────────────────────────────────────────
  discordGetUser: () => ipcRenderer.invoke('discord:get-user'),
  discordIsReady: () => ipcRenderer.invoke('discord:is-ready'),
  discordSetPresence: (state: string, ts?: number) => ipcRenderer.invoke('discord:set-presence', state, ts),

  // ── Settings ─────────────────────────────────────────────────────────────
  settingsGet: () => ipcRenderer.invoke('settings:get'),
  settingsSet: (patch: Record<string, unknown>) => ipcRenderer.invoke('settings:set', patch),

  // ── Updater ───────────────────────────────────────────────────────────────
  updaterQuitAndInstall: () => ipcRenderer.invoke('updater:quit-and-install'),
  updaterIsReady: () => ipcRenderer.invoke('updater:is-ready'),

  // ── Utilitaires ───────────────────────────────────────────────────────────

  openExternal: (url: string) => ipcRenderer.send('shell:open-external', url),

  // ── Serveur PZ ────────────────────────────────────────────────────────────
  serverQuery: () => ipcRenderer.invoke('server:query'),

  // ── Événements (main → renderer) ──────────────────────────────────────────
  onPatchProgress: (cb: (d: any) => void) => ipcRenderer.on('patch:progress', (_e, d) => cb(d)),
  onSessionUpdate: (cb: (d: any) => void) => ipcRenderer.on('session:update', (_e, d) => cb(d)),
  onForceRestoreStart: (cb: () => void) => ipcRenderer.on('session:force-restore-start', () => cb()),
  onLog: (cb: (s: string) => void) => ipcRenderer.on('log:entry', (_e, d) => cb(d)),
  onConsoleLines: (cb: (l: any[]) => void) => ipcRenderer.on('console:lines', (_e, d) => cb(d)),
  onDiscordUser: (cb: (u: any) => void) => ipcRenderer.on('discord:user-ready', (_e, d) => cb(d)),
  onDiscordConnecting: (cb: (v: boolean) => void) => ipcRenderer.on('discord:connecting', (_e, d) => cb(d)),
  onServerPlayers: (cb: (info: any) => void) => ipcRenderer.on('server:players', (_e, d) => cb(d)),
  onAutoRestoreDone: (cb: (d: any) => void) => ipcRenderer.on('session:auto-restore-done', (_e, d) => cb(d)),
  onPatchAutoCheck: (cb: (d: any) => void) => ipcRenderer.on('patch:auto-check', (_e, d) => cb(d)),
  onUpdaterDownloaded: (cb: (d: any) => void) => ipcRenderer.on('updater:downloaded', (_e, d) => cb(d)),




  // ── Nettoyage ─────────────────────────────────────────────────────────────
  removeAllListeners: (ch: string) => ipcRenderer.removeAllListeners(ch),
});
