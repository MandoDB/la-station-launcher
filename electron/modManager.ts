import { existsSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import * as https from 'https';
import * as http from 'http';
import { shell } from 'electron';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ModEntry {
    /** ID interne PZ (utilisé dans default.txt, ex: "TDS_Lsmenu") */
    id: string;
    /** Nom affiché */
    name: string;
    /**
     * ID d'un autre mod dont celui-ci dépend.
     * Si le mod requis est désactivé par l'utilisateur, ce mod sera aussi ignoré.
     * null / absent = pas de dépendance.
     */
    require?: string | null;
}

/** Format du mods.json hébergé sur GitHub */
export interface ModsJson {
    mods: ModEntry[];
}

/**
 * Résout la liste finale des mods à activer compte tenu des préférences
 * utilisateur (`disabledIds`) et des dépendances (`require`).
 *
 * Règles :
 * - Un mod désactivé n'est pas activé.
 * - Un mod dont la dépendance (`require`) est désactivée ou absente de la liste
 *   est lui aussi ignoré (même si l'utilisateur ne l'a pas explicitement désactivé).
 * - La résolution est récursive (chaîne de dépendances).
 */
export function resolveActiveMods(allMods: ModEntry[], disabledIds: string[]): ModEntry[] {
    const byId = new Map(allMods.map(m => [m.id, m]));
    const disabled = new Set(disabledIds);

    function isEnabled(id: string, seen = new Set<string>()): boolean {
        if (disabled.has(id)) return false;
        const entry = byId.get(id);
        if (!entry) return false;
        if (!entry.require) return true;
        if (seen.has(entry.require)) return false; // cycle → désactiver
        return isEnabled(entry.require, new Set([...seen, id]));
    }

    return allMods.filter(m => isEnabled(m.id));
}

// ─── URL GitHub ───────────────────────────────────────────────────────────────
// Même stratégie que version.json : API Contents pour éviter le cache CDN.
const REMOTE_MODS_URL =
    'https://api.github.com/repos/MandoDB/pz-patch/contents/mods.json';

// ─── Chemins ─────────────────────────────────────────────────────────────────

function getDefaultTxtPath(): string {
    return join(homedir(), 'Zomboid', 'mods', 'default.txt');
}

// ─── Lecture/écriture de default.txt ─────────────────────────────────────────

/**
 * Lit `default.txt` et retourne la liste des mods actifs (sans le `\` initial).
 */
export function readActiveMods(): string[] {
    const path = getDefaultTxtPath();
    if (!existsSync(path)) return [];

    const content = readFileSync(path, 'utf8');
    const modsBlock = content.match(/mods\s*\{([^}]*)\}/s);
    if (!modsBlock) return [];

    return [...modsBlock[1].matchAll(/mod\s*=\s*\\?([^\s,]+)/g)]
        .map(m => m[1].trim());
}

/**
 * Réécrit la section `mods { }` de `default.txt` avec la liste fournie.
 * Crée le fichier s'il n'existe pas.
 */
function writeActiveMods(modIds: string[]): void {
    const path = getDefaultTxtPath();
    let content = existsSync(path)
        ? readFileSync(path, 'utf8')
        : 'VERSION = 1,\n\nmods\n{\n}\n\nmaps\n{\n}\n';

    // Dédupliquer en préservant l'ordre
    const unique = [...new Set(modIds)];

    const modsBlock = unique
        .map(id => `    mod = \\${id},`)
        .join('\n');

    const replacement = unique.length > 0
        ? `mods\n{\n${modsBlock}\n}`
        : `mods\n{\n}`;

    content = content.replace(/mods\s*\{[^}]*\}/s, replacement);
    writeFileSync(path, content, 'utf8');
}

// ─── Fetch HTTP (même pattern que patchManager) ───────────────────────────────

function fetchText(url: string, githubToken: string, maxRedirects = 5): Promise<string | null> {
    return new Promise((resolve) => {
        const attempt = (u: string, redirectsLeft: number) => {
            const lib = u.startsWith('https') ? https : http;
            const headers: Record<string, string> = {
                'User-Agent': 'PZLauncher/1.0',
                'Cache-Control': 'no-cache',
            };
            if (u.includes('api.github.com') && githubToken) {
                headers['Authorization'] = `Bearer ${githubToken}`;
            }
            lib.get(u, { headers }, (res) => {
                if (res.statusCode && [301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
                    if (redirectsLeft > 0) attempt(res.headers.location, redirectsLeft - 1);
                    else resolve(null);
                    return;
                }
                if (res.statusCode === 403 || res.statusCode === 429) {
                    const reset = res.headers['x-ratelimit-reset'];
                    console.warn(`[ModManager] GitHub rate limit (${res.statusCode}). Reset: ${reset}`);
                    resolve(null);
                    return;
                }
                if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
                    resolve(null);
                    return;
                }
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => resolve(body));
            }).on('error', () => resolve(null));
        };
        attempt(url, maxRedirects);
    });
}

// ─── Fetch mods.json distant ──────────────────────────────────────────────────

/**
 * Récupère la liste des mods serveur depuis GitHub.
 * Retourne null si indisponible (réseau, rate limit…).
 */
export async function fetchRemoteMods(githubToken = ''): Promise<ModEntry[] | null> {
    try {
        const raw = await fetchText(REMOTE_MODS_URL, githubToken);
        if (!raw) return null;

        // Réponse de l'API GitHub Contents : { content: "<base64>", encoding: "base64" }
        const apiResp = JSON.parse(raw) as { content?: string; encoding?: string };
        if (!apiResp.content) return null;

        const decoded = Buffer.from(apiResp.content.replace(/\n/g, ''), 'base64').toString('utf8');
        const modsJson = JSON.parse(decoded) as ModsJson;
        return Array.isArray(modsJson.mods) ? modsJson.mods : null;
    } catch (e: any) {
        console.error('[ModManager] Impossible de charger mods.json :', e.message);
        return null;
    }
}

// ─── Apply / Restore ──────────────────────────────────────────────────────────

/**
 * Injecte les mods serveur dans default.txt.
 * Sauvegarde les mods actuels dans `backupPath` pour pouvoir restaurer.
 * Passer ici uniquement les mods déjà résolus via `resolveActiveMods()`.
 *
 * @returns liste des IDs de mods serveur effectivement ajoutés
 */
export function applyServerMods(serverMods: ModEntry[], backupPath: string): string[] {
    const current = readActiveMods();

    // Sauvegarder l'état original
    writeFileSync(backupPath, JSON.stringify(current), 'utf8');
    console.log(`[ModManager] Backup des mods actifs dans ${backupPath} (${current.length} mods)`);

    const toAdd = serverMods.filter(m => !current.includes(m.id));
    if (toAdd.length === 0) {
        console.log('[ModManager] Tous les mods serveur sont déjà actifs, rien à faire.');
        return [];
    }

    const merged = [...current, ...toAdd.map(m => m.id)];
    writeActiveMods(merged);
    console.log(`[ModManager] ${toAdd.length} mod(s) ajouté(s) : ${toAdd.map(m => m.id).join(', ')}`);
    return toAdd.map(m => m.id);
}

/**
 * Restaure default.txt à partir de la sauvegarde créée par `applyServerMods`.
 * Supprime ensuite le fichier de backup.
 */
export function restoreServerMods(backupPath: string): void {
    if (!existsSync(backupPath)) {
        console.log('[ModManager] Pas de backup mods à restaurer.');
        return;
    }

    try {
        const original: string[] = JSON.parse(readFileSync(backupPath, 'utf8'));
        writeActiveMods(original);
        console.log(`[ModManager] Mods restaurés (${original.length} mods originaux).`);
    } catch (e: any) {
        console.error('[ModManager] Erreur restauration mods :', e.message);
    }

    try {
        const { unlinkSync } = require('fs');
        unlinkSync(backupPath);
    } catch { /* ignore */ }
}

// ─── Workshop helpers (cross‑platform) ────────────────────────────────────────

function getSteamLibraryPaths(): string[] {
    const paths: string[] = [];

    if (process.platform === 'win32') {
        const steamRoots = [
            join('C:\\', 'Program Files (x86)', 'Steam'),
            join('C:\\', 'Program Files', 'Steam'),
            join('C:\\', 'Steam'),
        ];
        const vdfPath = steamRoots
            .map(r => join(r, 'steamapps', 'libraryfolders.vdf'))
            .find(existsSync);
        const steamRoot = vdfPath
            ? vdfPath.replace(/[/\\]steamapps[/\\]libraryfolders\.vdf$/i, '')
            : null;
        if (steamRoot) paths.push(steamRoot);
        if (vdfPath) {
            try {
                const content = readFileSync(vdfPath, 'utf8');
                for (const m of content.matchAll(/"path"\s+"([^"]+)"/gi)) {
                    const p = m[1].replace(/\\\\/g, '\\');
                    if (!paths.includes(p)) paths.push(p);
                }
            } catch { /* ignore */ }
        }
    } else {
        const roots = [
            join(homedir(), '.steam', 'steam'),
            join(homedir(), '.local', 'share', 'Steam'),
        ];
        for (const root of roots) {
            if (existsSync(root)) paths.push(root);
        }
        const vdfPath = roots
            .map(r => join(r, 'steamapps', 'libraryfolders.vdf'))
            .find(existsSync);
        if (vdfPath) {
            try {
                const content = readFileSync(vdfPath, 'utf8');
                for (const m of content.matchAll(/"path"\s+"([^"]+)"/gi)) {
                    const p = m[1].replace(/\\\\/g, '/');
                    if (p && !paths.includes(p)) paths.push(p);
                }
            } catch { /* ignore */ }
        }
    }

    return paths;
}

function getWorkshopModPath(workshopId: string): string {
    for (const lib of getSteamLibraryPaths()) {
        const candidate = join(lib, 'steamapps', 'workshop', 'content', '108600', workshopId);
        if (existsSync(candidate)) return candidate;
    }
    return '';
}

export function isWorkshopModInstalled(workshopId: string): boolean {
    return getWorkshopModPath(workshopId) !== '';
}

export async function subscribeWorkshopMod(workshopId: string): Promise<void> {
    const uri = `steam://url/CommunityFilePage/${workshopId}`;
    await shell.openExternal(uri);
}
