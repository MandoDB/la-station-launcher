import { existsSync, copyFileSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';

// ─── Configuration ────────────────────────────────────────────────────────────
// L'API GitHub Contents retourne toujours la version fraîche (pas de cache CDN).
// raw.githubusercontent.com a un cache CDN de 5 minutes qui ignore les cache-busters.
const REMOTE_VERSION_URL =
    'https://api.github.com/repos/MandoDB/pz-patch/contents/version.json';

// ─── Types correspondant au format réel du version.json ──────────────────────
// Format du fichier version.json hébergé :
// {
//   "version": "0.0.1",
//   "pzVersion": "42.14.1",
//   "backupJar": "https://github.com/.../projectzomboid-origin.jar",
//   "files": [ ... ]
// }
export interface PatchFile {
    name: string;    // Nom court du fichier ex: "la-station.jar"
    path: string;    // Chemin relatif au dossier du jeu ou au JAR (selon le type)
    url: string;     // URL de téléchargement directe
}

export interface VersionInfo {
    version: string;
    pzVersion?: string;
    /** URL du JAR custom à injecter via classpath */
    jarUrl?: string;
    /** URL du JAR d'origine (backup officiel) */
    backupJar?: string;
    /** Nom du fichier JAR sur le disque (ex: "la-station.jar") */
    jarName?: string;
    /** Liste des fichiers (utilisé pour compatibilité ou fichiers additionnels) */
    files?: PatchFile[];
    changelog?: string;
}

export interface PatchCheckResult {
    upToDate: boolean;
    localVersion: string | null;
    remoteVersion: string | null;
    needsDownload: boolean;
}

export type PatchProgressCallback = (event: string, data: any) => void;

const PZ_JSON_FILENAME = 'ProjectZomboid64.json';
const CUSTOM_JAR_DEFAULT_NAME = 'la-station.jar';

// ─── PatchManager ─────────────────────────────────────────────────────────────
export class PatchManager {
    private appDataPath: string;
    private versionFilePath: string;
    private lockFilePath: string;
    private classDir: string;
    private sendToRenderer: PatchProgressCallback;
    private githubToken: string;
    private _lastRemote: VersionInfo | null = null;

    constructor(appDataPath: string, sendToRenderer: PatchProgressCallback, githubToken = '') {
        this.appDataPath = appDataPath;
        this.versionFilePath = join(appDataPath, 'version.json');
        this.lockFilePath = join(appDataPath, 'session.lock');
        this.classDir = join(appDataPath, 'classes');
        this.sendToRenderer = sendToRenderer;
        this.githubToken = githubToken;

        if (!existsSync(this.classDir)) {
            mkdirSync(this.classDir, { recursive: true });
        }
    }

    // ── Session lock ──────────────────────────────────────────────────────────
    // Créé juste avant l'injection du patch, supprimé après restauration réussie.
    // Si présent au démarrage → crash détecté → restauration automatique.

    createLock(gamePath: string): void {
        try {
            writeFileSync(this.lockFilePath, JSON.stringify({
                gamePath,
                timestamp: Date.now(),
            }), 'utf-8');
            this.log('session.lock créé.');
        } catch (e: any) {
            this.log(`Impossible de créer session.lock : ${e.message}`);
        }
    }

    deleteLock(): void {
        try {
            if (existsSync(this.lockFilePath)) {
                fs.unlinkSync(this.lockFilePath);
                this.log('session.lock supprimé.');
            }
        } catch (e: any) {
            this.log(`Impossible de supprimer session.lock : ${e.message}`);
        }
    }

    // Retourne le gamePath stocké dans le lock, ou null si pas de lock
    readLock(): { gamePath: string; timestamp: number } | null {
        try {
            if (!existsSync(this.lockFilePath)) return null;
            return JSON.parse(readFileSync(this.lockFilePath, 'utf-8'));
        } catch {
            return null;
        }
    }

    // ── Version locale ────────────────────────────────────────────────────────
    async getLocalVersion(): Promise<VersionInfo | null> {
        try {
            if (!existsSync(this.versionFilePath)) return null;
            const content = readFileSync(this.versionFilePath, 'utf-8');
            const parsed = JSON.parse(content) as VersionInfo;
            return parsed;
        } catch {
            return null;
        }
    }

    // ── Fetch HTTP avec gestion des redirects ─────────────────────────────────
    private fetchText(url: string, maxRedirects = 5): Promise<string | null> {
        return new Promise((resolve) => {
            if (maxRedirects <= 0) { resolve(null); return; }
            const lib = url.startsWith('https') ? https : http;
            const headers: Record<string, string> = {
                'Cache-Control': 'no-cache, no-store',
                'Pragma': 'no-cache',
                'User-Agent': 'LA-STATION-Launcher',
            };
            // Token injecté au build pour passer de 60 req/h à 5000 req/h
            if (this.githubToken && url.includes('api.github.com')) {
                headers['Authorization'] = `Bearer ${this.githubToken}`;
            }
            const options = { timeout: 10000, headers };
            const req = lib.get(url, options, (res) => {
                if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
                    resolve(this.fetchText(res.headers.location, maxRedirects - 1));
                    return;
                }
                // Rate limit GitHub (403 avec message ou 429)
                if (res.statusCode === 403 || res.statusCode === 429) {
                    const reset = res.headers['x-ratelimit-reset'];
                    const resetDate = reset ? new Date(Number(reset) * 1000).toLocaleTimeString() : 'inconnu';
                    this.log(`GitHub rate limit atteint. Réinitialisation à ${resetDate}. Vérification ignorée.`);
                    resolve(null);
                    return;
                }
                if (res.statusCode !== 200) {
                    this.log(`HTTP ${res.statusCode} pour ${url}`);
                    resolve(null);
                    return;
                }
                let data = '';
                res.on('data', (chunk) => (data += chunk));
                res.on('end', () => resolve(data));
            });
            req.on('error', (e) => { this.log(`Erreur réseau: ${e.message}`); resolve(null); });
            req.on('timeout', () => { req.destroy(); resolve(null); });
        });
    }

    // ── Version distante ──────────────────────────────────────────────────────
    // Utilise l'API GitHub Contents qui retourne toujours la version fraîche,
    // contrairement à raw.githubusercontent.com dont le CDN cache pendant ~5 min.
    private async fetchRemoteVersion(): Promise<VersionInfo | null> {
        const raw = await this.fetchText(REMOTE_VERSION_URL);
        if (!raw) return null;
        try {
            // L'API GitHub retourne un JSON avec le contenu encodé en base64
            const apiResponse = JSON.parse(raw) as { content?: string; encoding?: string };
            let jsonText: string;

            if (apiResponse.content && apiResponse.encoding === 'base64') {
                // Décoder le base64 (GitHub ajoute des \n dans la string base64)
                jsonText = Buffer.from(apiResponse.content.replace(/\n/g, ''), 'base64').toString('utf-8');
            } else {
                // Fallback : le texte est peut-être déjà du JSON direct
                jsonText = raw;
            }

            const parsed = JSON.parse(jsonText) as VersionInfo;
            if (!parsed.version) {
                this.log(`version.json invalide — version manquante`);
                return null;
            }
            // On accepte soit jarUrl, soit une liste de fichiers
            if (!parsed.jarUrl && (!Array.isArray(parsed.files) || parsed.files.length === 0)) {
                this.log(`version.json invalide — ni jarUrl ni files`);
                return null;
            }
            return parsed;
        } catch (e) {
            this.log(`Erreur parsing version.json: ${e}`);
            return null;
        }
    }

    // ── Vérification des mises à jour ─────────────────────────────────────────
    async checkForUpdates(): Promise<PatchCheckResult> {
        this.log('Vérification de la version du patch...');
        const local = await this.getLocalVersion();
        this.log(`Version locale : ${local?.version ?? 'aucune'}`);

        const remote = await this.fetchRemoteVersion();
        this.log(`Version distante : ${remote?.version ?? 'inaccessible'}`);
        this._lastRemote = remote;

        const result: PatchCheckResult = {
            upToDate: false,
            localVersion: local?.version ?? null,
            remoteVersion: remote?.version ?? null,
            needsDownload: false,
        };

        if (!remote) {
            result.upToDate = !!local;
            this.log('Serveur inaccessible — utilisation de la version locale.');
            return result;
        }

        if (!local || local.version !== remote.version) {
            result.upToDate = false;
            result.needsDownload = true;
            this.log(`Mise à jour disponible : local=${local?.version ?? 'aucune'}, distant=${remote.version}`);
        } else {
            result.upToDate = true;
            this.log(`Patch à jour (v${local.version}).`);
        }

        return result;
    }

    // ── Téléchargement d'un fichier binaire ───────────────────────────────────
    private downloadFile(url: string, destPath: string, maxRedirects = 5): Promise<void> {
        return new Promise((resolve, reject) => {
            if (maxRedirects <= 0) { reject(new Error('Trop de redirections')); return; }
            const lib = url.startsWith('https') ? https : http;
            const req = lib.get(url, { timeout: 60000 }, (response) => {
                if ((response.statusCode === 301 || response.statusCode === 302) && response.headers.location) {
                    resolve(this.downloadFile(response.headers.location, destPath, maxRedirects - 1));
                    return;
                }
                if (response.statusCode !== 200) {
                    reject(new Error(`HTTP ${response.statusCode} pour ${url}`));
                    return;
                }
                const totalSize = parseInt(response.headers['content-length'] ?? '0', 10);
                let downloaded = 0;
                const file = fs.createWriteStream(destPath);
                response.on('data', (chunk) => {
                    downloaded += chunk.length;
                    if (totalSize > 0) {
                        this.sendToRenderer('patch:progress', {
                            step: 'download',
                            progress: Math.round((downloaded / totalSize) * 100),
                        });
                    }
                });
                response.pipe(file);
                file.on('finish', () => { file.close(); resolve(); });
                file.on('error', (e) => { file.close(); reject(e); });
            });
            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('Timeout téléchargement')); });
        });
    }

    // ── Téléchargement de tous les .class ────────────────────────────────────
    // ── Téléchargement du JAR custom ou des fichiers ─────────────────────────
    private async downloadPatchFiles(remoteVersion: VersionInfo): Promise<void> {
        this.log(`Téléchargement du patch v${remoteVersion.version}...`);
        this.sendToRenderer('patch:progress', { step: 'download', progress: 0 });

        // Cas 1: Nouveau format avec jarUrl direct
        if (remoteVersion.jarUrl) {
            const jarName = remoteVersion.jarName || CUSTOM_JAR_DEFAULT_NAME;
            const destFile = join(this.classDir, jarName);
            this.log(`Téléchargement du JAR custom: ${jarName} depuis ${remoteVersion.jarUrl}`);
            await this.downloadFile(remoteVersion.jarUrl, destFile);
        }
        // Cas 2: Ancien format avec liste de fichiers
        else if (remoteVersion.files) {
            for (let i = 0; i < remoteVersion.files.length; i++) {
                const patchFile = remoteVersion.files[i];
                const storedName = patchFile.path.replace(/\//g, '_');
                const destFile = join(this.classDir, storedName);

                this.log(`Téléchargement: ${patchFile.name} depuis ${patchFile.url}`);
                await this.downloadFile(patchFile.url, destFile);

                this.sendToRenderer('patch:progress', {
                    step: 'download',
                    progress: Math.round(((i + 1) / remoteVersion.files.length) * 100),
                });
            }
        }

        // Sauvegarder version locale
        writeFileSync(this.versionFilePath, JSON.stringify(remoteVersion, null, 2), 'utf-8');
        this.log('Téléchargement terminé.');
    }

    // ── Patch du classpath dans ProjectZomboid64.json ─────────────────────
    private async patchGameFiles(gamePath: string, versionInfo: VersionInfo): Promise<void> {
        const jarName = versionInfo.jarName || CUSTOM_JAR_DEFAULT_NAME;

        // 1. Installation du JAR custom dans le dossier du jeu
        const srcJar = join(this.classDir, jarName);
        const destJar = join(gamePath, jarName);

        if (!existsSync(srcJar)) {
            throw new Error(`Fichier JAR custom introuvable: ${srcJar}`);
        }

        this.log(`Installation de ${jarName} dans le dossier du jeu...`);
        copyFileSync(srcJar, destJar);

        // 2. Modification du classpath dans ProjectZomboid64.json
        const jsonPath = join(gamePath, PZ_JSON_FILENAME);
        if (!existsSync(jsonPath)) {
            throw new Error(`${PZ_JSON_FILENAME} introuvable dans ${gamePath}`);
        }

        this.log(`Modification de ${PZ_JSON_FILENAME} pour charger ${jarName}...`);
        try {
            const content = readFileSync(jsonPath, 'utf8');
            const json = JSON.parse(content);
            let classpath: string[] = json.classpath || [];

            // Supprimer d'anciennes versions si présentes
            classpath = classpath.filter(cp => cp !== jarName);

            // Trouver l'index de projectzomboid.jar pour insérer juste avant
            const pzIdx = classpath.indexOf('projectzomboid.jar');
            if (pzIdx >= 0) {
                classpath.splice(pzIdx, 0, jarName);
            } else {
                // Au cas où, si projectzomboid.jar n'est pas là, on le met au début
                classpath.unshift(jarName);
            }

            json.classpath = classpath;
            writeFileSync(jsonPath, JSON.stringify(json, null, '\t'), 'utf8');
            this.log('Classpath mis à jour avec succès.');
        } catch (e: any) {
            throw new Error(`Erreur modification classpath: ${e.message}`);
        }
    }

    // ── Téléchargement seul (sans injection dans le JAR) ─────────────────────
    // Utilisé par le bouton "Mettre à jour" sans lancer le jeu.
    async downloadUpdate(): Promise<{ success: boolean; error?: string }> {
        try {
            this.sendToRenderer('patch:progress', { step: 'check', progress: 0 });
            const checkResult = await this.checkForUpdates();

            if (!checkResult.needsDownload) {
                this.log('Patch déjà à jour — rien à télécharger.');
                this.sendToRenderer('patch:progress', { step: 'ready', progress: 100 });
                return { success: true };
            }

            const remote = this._lastRemote;
            if (!remote) throw new Error('Patch distant inaccessible');

            await this.downloadPatchFiles(remote);
            this.sendToRenderer('patch:progress', { step: 'ready', progress: 100 });
            this.log(`Mise à jour v${remote.version} téléchargée — prête pour le prochain lancement.`);
            return { success: true };
        } catch (err: any) {
            this.log(`Erreur téléchargement: ${err.message}`);
            return { success: false, error: err.message };
        }
    }

    // ── Application complète du patch ─────────────────────────────────────────
    async applyPatch(gamePath: string): Promise<{ success: boolean; error?: string }> {
        try {
            this.sendToRenderer('patch:progress', { step: 'check', progress: 0 });
            const checkResult = await this.checkForUpdates();

            let versionToApply: VersionInfo | null = null;

            if (checkResult.needsDownload) {
                const remote = this._lastRemote;
                if (!remote) throw new Error('Patch distant inaccessible et aucune version locale');
                await this.downloadPatchFiles(remote);
                versionToApply = remote;

                // On ne force plus la restauration du JAR d'origine si on n'injecte plus dedans,
                // mais on peut quand même créer un backup du JSON si on veut être prudent.
                await this.createBackup(gamePath);
            } else {
                versionToApply = await this.getLocalVersion();
            }

            if (!versionToApply) {
                throw new Error('Aucune version de patch disponible');
            }

            await this.patchGameFiles(gamePath, versionToApply);

            this.sendToRenderer('patch:progress', { step: 'ready', progress: 100 });
            return { success: true };
        } catch (err: any) {
            this.log(`Erreur patch: ${err.message}`);
            return { success: false, error: err.message };
        }
    }

    // ── Backup ────────────────────────────────────────────────────────────────
    async createBackup(gamePath: string): Promise<void> {
        const jsonPath = join(gamePath, PZ_JSON_FILENAME);
        const bakPath = join(gamePath, `${PZ_JSON_FILENAME}.bak`);

        if (!existsSync(bakPath)) {
            this.log(`Création du backup de ${PZ_JSON_FILENAME}...`);
            copyFileSync(jsonPath, bakPath);
        }
    }

    // ── Restauration du JAR d'origine via URL ─────────────────────────────────
    async restoreOriginBackup(gamePath: string): Promise<{ success: boolean; error?: string }> {
        try {
            this.log('Récupération de l\'URL du JAR original...');
            const remote = await this.fetchRemoteVersion();
            if (!remote || !remote.backupJar) {
                throw new Error('URL de backup (backupJar) introuvable dans version.json');
            }

            const destPath = join(gamePath, 'projectzomboid.jar');
            this.log(`Téléchargement du JAR d'origine depuis ${remote.backupJar}...`);
            this.sendToRenderer('patch:progress', { step: 'download', progress: 0 });
            
            await this.downloadFile(remote.backupJar, destPath);

            // On en profite pour restaurer aussi le JSON si possible pour nettoyer le classpath
            const jsonPath = join(gamePath, PZ_JSON_FILENAME);
            const bakPath = join(gamePath, `${PZ_JSON_FILENAME}.bak`);
            if (existsSync(bakPath)) {
                this.log('Nettoyage du fichier de configuration...');
                copyFileSync(bakPath, jsonPath);
                fs.unlinkSync(bakPath);
            }

            this.log('JAR original restauré avec succès.');
            return { success: true };
        } catch (err: any) {
            this.log(`Erreur de restauration JAR: ${err.message}`);
            return { success: false, error: err.message };
        }
    }

    // ── Restauration légère (JSON + nettoyage local) ──────────────────────────
    async restoreBackup(gamePath: string): Promise<{ success: boolean; error?: string }> {
        const jsonPath = join(gamePath, PZ_JSON_FILENAME);
        const bakPath = join(gamePath, `${PZ_JSON_FILENAME}.bak`);

        try {
            // 1. Restauration du JSON
            if (existsSync(bakPath)) {
                this.log(`Restauration de ${PZ_JSON_FILENAME} original...`);
                copyFileSync(bakPath, jsonPath);
                fs.unlinkSync(bakPath);
            }

            // 2. Suppression du JAR custom (optionnel mais propre)
            const local = await this.getLocalVersion();
            if (local) {
                const jarName = local.jarName || CUSTOM_JAR_DEFAULT_NAME;
                const destJar = join(gamePath, jarName);
                if (existsSync(destJar)) {
                    this.log('Suppression de la-station.jar...');
            try {
                fs.unlinkSync(destJar);
            } catch (e: any) {
                if (e.code === 'EBUSY') {
                    this.log('Le fichier est occupé, nouvelle tentative dans 2s...');
                    await new Promise(r => setTimeout(r, 2000));
                    try { fs.unlinkSync(destJar); } catch { /* ignore final fail */ }
                }
            }
                }
            }

            // 3. Suppression de tout ancien backup JAR résiduel
            const oldBak = join(gamePath, 'projectzomboid.jar.bak');
            if (existsSync(oldBak)) {
                try { fs.unlinkSync(oldBak); } catch { /* ignore */ }
            }

            this.log('Restauration réussie.');
            return { success: true };
        } catch (err: any) {
            this.log(`Erreur de restauration: ${err.message}`);
            return { success: false, error: err.message };
        }
    }


    // ── Log ───────────────────────────────────────────────────────────────────
    private log(message: string): void {
        const timestamp = new Date().toLocaleTimeString('fr-FR');
        const entry = `[${timestamp}] ${message}`;
        console.log('[PatchManager]', message);
        this.sendToRenderer('log:entry', entry);
    }
}
