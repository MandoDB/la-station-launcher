import { existsSync, copyFileSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';

const execFileAsync = promisify(execFile);

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
//   "files": [
//     { "name": "StatePacket.class", "path": "zombie/network/packets/actions/StatePacket.class", "url": "https://..." },
//     ...
//   ]
// }
export interface PatchFile {
    name: string;    // Nom court du fichier ex: "StatePacket.class"
    path: string;    // Chemin interne au JAR ex: "zombie/network/packets/actions/StatePacket.class"
    url: string;     // URL de téléchargement directe
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

export type PatchProgressCallback = (event: string, data: any) => void;

// ─── PatchManager ─────────────────────────────────────────────────────────────
export class PatchManager {
    private appDataPath: string;
    private versionFilePath: string;
    private classDir: string;
    private sendToRenderer: PatchProgressCallback;
    private _lastRemote: VersionInfo | null = null;

    constructor(appDataPath: string, sendToRenderer: PatchProgressCallback) {
        this.appDataPath = appDataPath;
        this.versionFilePath = join(appDataPath, 'version.json');
        this.classDir = join(appDataPath, 'classes');
        this.sendToRenderer = sendToRenderer;

        if (!existsSync(this.classDir)) {
            mkdirSync(this.classDir, { recursive: true });
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
            const options = {
                timeout: 10000,
                headers: {
                    'Cache-Control': 'no-cache, no-store',
                    'Pragma': 'no-cache',
                    'User-Agent': 'LA-STATION-Launcher',
                },
            };
            const req = lib.get(url, options, (res) => {
                if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
                    resolve(this.fetchText(res.headers.location, maxRedirects - 1));
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
            if (!parsed.version || !Array.isArray(parsed.files) || parsed.files.length === 0) {
                this.log(`version.json invalide — version="${parsed.version}", files=${JSON.stringify(parsed.files)}`);
                return null;
            }
            for (const f of parsed.files) {
                if (!f.name || !f.path || !f.url) {
                    this.log(`Entrée invalide dans files: ${JSON.stringify(f)}`);
                    return null;
                }
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
    private async downloadPatchedClasses(remoteVersion: VersionInfo): Promise<void> {
        this.log(`Téléchargement du patch v${remoteVersion.version} (${remoteVersion.files.length} fichier(s))...`);
        this.sendToRenderer('patch:progress', { step: 'download', progress: 0 });

        for (let i = 0; i < remoteVersion.files.length; i++) {
            const patchFile = remoteVersion.files[i];
            // On stocke le .class avec un nom unique (chemin→underscore) pour éviter collisions
            const storedName = patchFile.path.replace(/\//g, '_');
            const destFile = join(this.classDir, storedName);

            this.log(`Téléchargement: ${patchFile.name} depuis ${patchFile.url}`);
            await this.downloadFile(patchFile.url, destFile);

            this.sendToRenderer('patch:progress', {
                step: 'download',
                progress: Math.round(((i + 1) / remoteVersion.files.length) * 100),
            });
        }

        // Sauvegarder version locale
        writeFileSync(this.versionFilePath, JSON.stringify(remoteVersion, null, 2), 'utf-8');
        this.log('Téléchargement terminé.');
    }

    // ── Injection dans le JAR ────────────────────────────────────────────────
    private async injectIntoJar(gamePath: string, versionInfo: VersionInfo): Promise<void> {
        const jarPath = join(gamePath, 'projectzomboid.jar');

        if (!existsSync(jarPath)) {
            throw new Error(`projectzomboid.jar introuvable: ${jarPath}`);
        }

        this.log('Injection des .class dans le JAR...');
        this.sendToRenderer('patch:progress', { step: 'inject', progress: 0 });

        // Recréer l'arborescence dans un dossier tmp
        const tmpDir = join(this.appDataPath, 'tmp');
        if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

        for (let i = 0; i < versionInfo.files.length; i++) {
            const patchFile = versionInfo.files[i];
            const storedName = patchFile.path.replace(/\//g, '_');
            const srcFile = join(this.classDir, storedName);

            if (!existsSync(srcFile)) {
                throw new Error(`Fichier patch introuvable: ${srcFile} — Re-téléchargement nécessaire`);
            }

            // Recréer la structure zombie/network/packets/actions/
            const destFile = join(tmpDir, patchFile.path);
            const destDir = join(tmpDir, patchFile.path.substring(0, patchFile.path.lastIndexOf('/')));
            if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
            copyFileSync(srcFile, destFile);

            this.sendToRenderer('patch:progress', {
                step: 'inject',
                progress: Math.round(((i + 1) / versionInfo.files.length) * 50),
            });
        }

        // Trouver jar.exe — chercher d'abord dans le JRE bundlé de PZ
        const jarExecutable = this.findJarExecutable(gamePath);
        this.log(`Utilisation de jar: ${jarExecutable}`);

        const filePaths = versionInfo.files.map((f) => f.path);
        try {
            await execFileAsync(jarExecutable, ['uf', jarPath, ...filePaths], { cwd: tmpDir });
            this.log('Injection réussie.');
        } catch (err: any) {
            this.log(`Erreur jar uf: ${err.message}`);
            throw new Error(`Échec de l'injection JAR: ${err.message}`);
        }

        this.sendToRenderer('patch:progress', { step: 'inject', progress: 100 });
    }

    // ── Recherche de jar.exe ──────────────────────────────────────────────────
    private findJarExecutable(gamePath: string): string {
        // 1. JRE bundlé dans le dossier de PZ (chemin typique B42)
        const candidates = [
            join(gamePath, 'jre64', 'bin', 'jar.exe'),
            join(gamePath, 'jre', 'bin', 'jar.exe'),
            join(gamePath, 'jre64', 'bin', 'jar'),
        ];
        // 2. JAVA_HOME défini
        if (process.env.JAVA_HOME) {
            candidates.unshift(join(process.env.JAVA_HOME, 'bin', 'jar.exe'));
        }
        // 3. Chemins Java standard
        candidates.push(
            'C:\\Program Files\\Java\\jdk-21\\bin\\jar.exe',
            'C:\\Program Files\\Java\\jre1.8.0_333\\bin\\jar.exe',
            'C:\\Program Files\\Java\\jre-1.8\\bin\\jar.exe',
        );

        for (const c of candidates) {
            if (existsSync(c)) {
                this.log(`jar.exe trouvé: ${c}`);
                return c;
            }
        }

        // Fallback PATH
        this.log('jar.exe non trouvé localement — utilisation du PATH système');
        return 'jar';
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

            await this.downloadPatchedClasses(remote);
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
                await this.downloadPatchedClasses(remote);
                versionToApply = remote;
            } else {
                versionToApply = await this.getLocalVersion();
            }

            if (!versionToApply) {
                throw new Error('Aucune version de patch disponible');
            }
            if (!Array.isArray(versionToApply.files) || versionToApply.files.length === 0) {
                throw new Error(`version.json invalide — "files" vide ou absent (version: ${versionToApply.version})`);
            }

            await this.createBackup(gamePath);
            await this.injectIntoJar(gamePath, versionToApply);

            this.sendToRenderer('patch:progress', { step: 'ready', progress: 100 });
            return { success: true };
        } catch (err: any) {
            this.log(`Erreur patch: ${err.message}`);
            return { success: false, error: err.message };
        }
    }

    // ── Backup ────────────────────────────────────────────────────────────────
    async createBackup(gamePath: string): Promise<void> {
        const jarPath = join(gamePath, 'projectzomboid.jar');
        const bakPath = join(gamePath, 'projectzomboid.jar.bak');

        if (!existsSync(bakPath)) {
            this.log('Création du backup du JAR original...');
            copyFileSync(jarPath, bakPath);
            this.log('Backup créé: projectzomboid.jar.bak');
        } else {
            this.log('Backup existant conservé.');
        }
    }

    // ── Restauration ──────────────────────────────────────────────────────────
    async restoreBackup(gamePath: string): Promise<{ success: boolean; error?: string }> {
        const jarPath = join(gamePath, 'projectzomboid.jar');
        const bakPath = join(gamePath, 'projectzomboid.jar.bak');

        try {
            if (!existsSync(bakPath)) {
                this.log('Aucun backup à restaurer.');
                return { success: true };
            }
            this.log('Restauration du JAR original...');
            copyFileSync(bakPath, jarPath);
            this.log('Restauration réussie. Patch retiré.');
            return { success: true };
        } catch (err: any) {
            this.log(`Erreur de restauration: ${err.message}`);
            return { success: false, error: err.message };
        }
    }

    // ── Détection patch orphelin (crash précédent) ────────────────────────────
    async detectOrphanPatch(gamePath: string): Promise<boolean> {
        const jarPath = join(gamePath, 'projectzomboid.jar');
        const bakPath = join(gamePath, 'projectzomboid.jar.bak');
        if (existsSync(bakPath) && existsSync(jarPath)) {
            const jarStat = fs.statSync(jarPath);
            const bakStat = fs.statSync(bakPath);
            return jarStat.size !== bakStat.size || jarStat.mtimeMs > bakStat.mtimeMs;
        }
        return false;
    }

    // ── Log ───────────────────────────────────────────────────────────────────
    private log(message: string): void {
        const timestamp = new Date().toLocaleTimeString('fr-FR');
        const entry = `[${timestamp}] ${message}`;
        console.log('[PatchManager]', message);
        this.sendToRenderer('log:entry', entry);
    }
}
