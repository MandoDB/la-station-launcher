import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import { PatchManager } from './patchManager';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

// ─── Types ──────────────────────────────────────────────────────────────────
export type SessionStatus =
    | 'idle'
    | 'patching'
    | 'launching'
    | 'running'
    | 'restoring'
    | 'done'
    | 'error';

export interface SessionState {
    status: SessionStatus;
    gamePath: string | null;
    startTime: number | null;
    error?: string;
}

export type SessionEventCallback = (event: string, data: any) => void;

// ─── Constantes ─────────────────────────────────────────────────────────────
const PZ_PROCESS_NAME = 'ProjectZomboid64.exe';
const PZ_STEAM_URI = 'steam://rungameid/108600';
const LAUNCH_TIMEOUT_MS = 60_000;   // 60 secondes pour démarrer
const POLL_INTERVAL_MS = 2_000;     // Vérification toutes les 2 secondes

// ─── SessionManager ──────────────────────────────────────────────────────────
export class SessionManager {
    private state: SessionState = {
        status: 'idle',
        gamePath: null,
        startTime: null,
    };
    private sendToRenderer: SessionEventCallback;
    private pollTimer: NodeJS.Timeout | null = null;

    constructor(sendToRenderer: SessionEventCallback) {
        this.sendToRenderer = sendToRenderer;
    }

    // ── Vérification si le processus PZ est actif ─────────────────────────────
    private async isPZRunning(): Promise<boolean> {
        try {
            const { stdout } = await execAsync(
                `tasklist /FI "IMAGENAME eq ${PZ_PROCESS_NAME}" /FO CSV /NH`
            );
            return stdout.toLowerCase().includes(PZ_PROCESS_NAME.toLowerCase());
        } catch {
            return false;
        }
    }

    // ── Fermeture forcée de PZ ────────────────────────────────────────────────
    async killPZ(): Promise<void> {
        try {
            await execAsync(`taskkill /IM "${PZ_PROCESS_NAME}" /F`);
            this.log('Project Zomboid terminé de force.');
        } catch {
            // Processus déjà fermé ou introuvable — pas d'erreur bloquante
        }
    }

    // ── Lancement de PZ via Steam ─────────────────────────────────────────────
    private async launchPZ(): Promise<void> {
        this.log('Lancement de Project Zomboid via Steam...');
        try {
            // Sur Windows, on utilise start "" pour lancer l'URI Steam
            await execAsync(`start "" "${PZ_STEAM_URI}"`);
        } catch (err: any) {
            throw new Error(`Impossible de lancer Steam: ${err.message}`);
        }
    }

    // ── Attente du démarrage du processus ─────────────────────────────────────
    private async waitForProcessStart(): Promise<boolean> {
        const startTime = Date.now();
        this.log(`Attente du processus ${PZ_PROCESS_NAME}...`);

        while (Date.now() - startTime < LAUNCH_TIMEOUT_MS) {
            await this.sleep(1000);
            if (await this.isPZRunning()) {
                this.log(`${PZ_PROCESS_NAME} détecté !`);
                return true;
            }
        }

        this.log(`Timeout: ${PZ_PROCESS_NAME} n'a pas démarré en 60s`);
        return false;
    }

    // ── Surveillance du processus jusqu'à fermeture ───────────────────────────
    private startProcessMonitoring(gamePath: string, patchManager: PatchManager): void {
        this.pollTimer = setInterval(async () => {
            const running = await this.isPZRunning();

            if (!running) {
                // PZ s'est fermé
                clearInterval(this.pollTimer!);
                this.pollTimer = null;
                await this.handleGameExit(gamePath, patchManager);
            } else {
                // Mettre à jour le timer de session
                const elapsed = this.state.startTime
                    ? Math.floor((Date.now() - this.state.startTime) / 1000)
                    : 0;
                this.sendToRenderer('session:update', {
                    status: 'running',
                    elapsedSeconds: elapsed,
                });
            }
        }, POLL_INTERVAL_MS);
    }

    // ── Gestion de la fermeture du jeu ───────────────────────────────────────
    private async handleGameExit(gamePath: string, patchManager: PatchManager): Promise<void> {
        this.log('Project Zomboid fermé. Restauration du JAR...');
        this.setState({ status: 'restoring' });
        this.sendToRenderer('session:update', { status: 'restoring' });

        const result = await patchManager.restoreBackup(gamePath);

        if (!result.success) {
            const errorMsg = `CRITIQUE: Restauration échouée ! ${result.error}\nRestaurer manuellement: copier projectzomboid.jar.bak vers projectzomboid.jar`;
            this.log(errorMsg);
            this.setState({ status: 'error', error: errorMsg });
            this.sendToRenderer('session:update', {
                status: 'error',
                error: result.error,
                critical: true,
                manualRestorePath: gamePath,
            });
        } else {
            this.log('Session terminée - Patch retiré avec succès.');
            patchManager.deleteLock();
            this.setState({ status: 'done' });
            this.sendToRenderer('session:update', {
                status: 'done',
                message: 'Session terminée - Patch retiré',
            });

            // Revenir à l'état idle après 5 secondes
            setTimeout(() => {
                this.setState({ status: 'idle', startTime: null });
                this.sendToRenderer('session:update', { status: 'idle' });
            }, 5000);
        }
    }

    // ── Démarrage d'une session complète ─────────────────────────────────────
    async startSession(
        gamePath: string,
        patchManager: PatchManager
    ): Promise<{ success: boolean; error?: string }> {
        if (this.state.status !== 'idle' && this.state.status !== 'done') {
            return { success: false, error: 'Une session est déjà en cours' };
        }

        this.setState({ status: 'patching', gamePath, startTime: null });
        this.sendToRenderer('session:update', { status: 'patching' });

        try {
            // Étape 1: Créer le session.lock AVANT toute modification du JAR
            this.log('=== Début de la session ===');
            patchManager.createLock(gamePath);

            // Étape 2: Vérifier + Appliquer le patch
            const patchResult = await patchManager.applyPatch(gamePath);

            if (!patchResult.success) {
                patchManager.deleteLock(); // Patch échoué avant injection → pas de JAR modifié
                throw new Error(`Échec du patch: ${patchResult.error}`);
            }

            // Étape 3: Lancer PZ
            this.setState({ status: 'launching' });
            this.sendToRenderer('session:update', { status: 'launching' });
            await this.launchPZ();

            // Étape 4: Attendre que le processus démarre
            const started = await this.waitForProcessStart();

            if (!started) {
                // Timeout → restaurer et signaler l'erreur
                this.log('Timeout de démarrage. Restauration...');
                await patchManager.restoreBackup(gamePath);
                patchManager.deleteLock();
                this.setState({ status: 'idle' });
                this.sendToRenderer('session:update', { status: 'idle' });
                return {
                    success: false,
                    error: "Project Zomboid n'a pas démarré dans les 60 secondes. Le patch a été restauré.",
                };
            }

            // Étape 4: PZ est en cours → surveiller
            this.setState({ status: 'running', startTime: Date.now() });
            this.sendToRenderer('session:update', {
                status: 'running',
                startTime: this.state.startTime,
                elapsedSeconds: 0,
            });

            this.startProcessMonitoring(gamePath, patchManager);
            return { success: true };
        } catch (err: any) {
            this.log(`Erreur session: ${err.message}`);
            patchManager.deleteLock(); // Nettoyage en cas d'erreur inattendue
            this.setState({ status: 'error', error: err.message });
            this.sendToRenderer('session:update', { status: 'error', error: err.message });
            return { success: false, error: err.message };
        }
    }

    // ── État de la session ─────────────────────────────────────────────────────
    getStatus(): SessionState {
        return { ...this.state };
    }

    isSessionActive(): boolean {
        return this.state.status === 'running' || this.state.status === 'patching' || this.state.status === 'launching';
    }

    // ── Utilitaires ───────────────────────────────────────────────────────────
    private setState(partial: Partial<SessionState>): void {
        this.state = { ...this.state, ...partial };
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    private log(message: string): void {
        const timestamp = new Date().toLocaleTimeString('fr-FR');
        const entry = `[${timestamp}] ${message}`;
        console.log('[SessionManager]', message);
        this.sendToRenderer('log:entry', entry);
    }
}
