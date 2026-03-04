import { autoUpdater } from 'electron-updater';
import { app } from 'electron';

export type UpdaterEventCallback = (event: string, data?: any) => void;

// ─── UpdaterManager ───────────────────────────────────────────────────────────
export class UpdaterManager {
    private sendToRenderer: UpdaterEventCallback;
    private updateDownloaded = false;

    constructor(sendToRenderer: UpdaterEventCallback) {
        this.sendToRenderer = sendToRenderer;
    }

    init(): void {
        // En dev, autoUpdater ne sert à rien — on l'active uniquement en prod
        if (!app.isPackaged) {
            console.log('[Updater] Mode dev — vérification désactivée.');
            return;
        }

        // Pas de boîte de dialogue native — on gère tout dans le renderer
        autoUpdater.autoDownload = true;
        autoUpdater.autoInstallOnAppQuit = true;

        // ── Événements ───────────────────────────────────────────────────────

        autoUpdater.on('checking-for-update', () => {
            console.log('[Updater] Vérification des mises à jour...');
        });

        autoUpdater.on('update-available', (info) => {
            console.log(`[Updater] Mise à jour disponible : v${info.version}`);
            // On ne notifie pas encore — on attend que le téléchargement soit prêt
        });

        autoUpdater.on('update-not-available', () => {
            console.log('[Updater] Launcher à jour.');
        });

        autoUpdater.on('download-progress', (progress) => {
            console.log(`[Updater] Téléchargement : ${Math.round(progress.percent)}%`);
            this.sendToRenderer('updater:progress', {
                percent: Math.round(progress.percent),
                bytesPerSecond: progress.bytesPerSecond,
            });
        });

        autoUpdater.on('update-downloaded', (info) => {
            console.log(`[Updater] Mise à jour v${info.version} prête.`);
            this.updateDownloaded = true;
            // ★ C'est ici qu'on notifie le renderer → toast + bouton "Redémarrer"
            this.sendToRenderer('updater:downloaded', {
                version: info.version,
                releaseNotes: info.releaseNotes ?? null,
            });
        });

        autoUpdater.on('error', (err) => {
            // Silencieux pour l'utilisateur — on log seulement
            console.error('[Updater] Erreur :', err.message);
        });

        // ── Vérification initiale silencieuse ────────────────────────────────
        // Délai de 5s après le démarrage pour ne pas bloquer le chargement
        setTimeout(() => {
            autoUpdater.checkForUpdates().catch((e) => {
                console.error('[Updater] checkForUpdates error:', e.message);
            });
        }, 5000);
    }

    // Appelé par l'IPC quand l'utilisateur clique "Redémarrer pour mettre à jour"
    quitAndInstall(): void {
        if (this.updateDownloaded) {
            autoUpdater.quitAndInstall(false, true); // isSilent=false, isForceRunAfter=true
        }
    }

    isUpdateReady(): boolean {
        return this.updateDownloaded;
    }
}
