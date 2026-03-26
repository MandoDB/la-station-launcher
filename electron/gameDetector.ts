import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import * as os from 'os';

/** Emplacements Steam Windows (relatifs à une lettre de lecteur). */
const STEAM_PATHS_WIN = [
    'Program Files (x86)/Steam/steamapps/common/ProjectZomboid',
    'Program Files/Steam/steamapps/common/ProjectZomboid',
    'SteamLibrary/steamapps/common/ProjectZomboid',
    'Steam/steamapps/common/ProjectZomboid',
    'Games/Steam/steamapps/common/ProjectZomboid',
];

const DRIVE_LETTERS = ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'A', 'B'];

/** Racines Steam typiques sous Linux. */
const STEAM_ROOTS_LINUX = [
    join(os.homedir(), '.steam', 'steam'),
    join(os.homedir(), '.local', 'share', 'Steam'),
];

const PZ_SUBPATH = join('steamapps', 'common', 'ProjectZomboid');

export interface DetectionResult {
    found: boolean;
    path?: string;
    method?: 'auto' | 'manual';
}

function checkPZAt(fullPath: string): boolean {
    const jarFile = join(fullPath, 'projectzomboid.jar');
    return existsSync(fullPath) && existsSync(jarFile);
}

/** Sous Linux : lit libraryfolders.vdf et retourne les racines Steam. */
function getSteamLibraryRootsLinux(): string[] {
    const roots: string[] = [];
    for (const root of STEAM_ROOTS_LINUX) {
        if (existsSync(root)) roots.push(root);
    }
    const vdfPath = STEAM_ROOTS_LINUX.map(r => join(r, 'steamapps', 'libraryfolders.vdf')).find(existsSync);
    if (vdfPath) {
        try {
            const content = readFileSync(vdfPath, 'utf8');
            for (const m of content.matchAll(/"path"\s+"([^"]+)"/gi)) {
                const p = m[1].replace(/\\\\/g, '/');
                if (p && !roots.includes(p)) roots.push(p);
            }
        } catch { /* ignore */ }
    }
    return roots;
}

export class GameDetector {
    /**
     * Scanne les emplacements Steam connus (Windows : lecteurs C–M ; Linux : ~/.steam, libraryfolders).
     * Retourne le premier chemin Project Zomboid valide trouvé.
     */
    async detect(): Promise<DetectionResult> {
        console.log('[GameDetector] Starting auto-detection...');

        if (process.platform === 'win32') {
            for (const drive of DRIVE_LETTERS) {
                for (const steamPath of STEAM_PATHS_WIN) {
                    const fullPath = join(`${drive}:\\`, steamPath);
                    if (checkPZAt(fullPath)) {
                        console.log(`[GameDetector] Found at: ${fullPath}`);
                        return { found: true, path: fullPath, method: 'auto' };
                    }
                }
            }
        } else {
            const roots = getSteamLibraryRootsLinux();
            for (const root of roots) {
                const fullPath = join(root, 'steamapps', 'common', 'ProjectZomboid');
                if (checkPZAt(fullPath)) {
                    console.log(`[GameDetector] Found at: ${fullPath}`);
                    return { found: true, path: fullPath, method: 'auto' };
                }
            }
        }

        console.log('[GameDetector] Auto-detection failed, manual selection required.');
        return { found: false };
    }

    /**
     * Valide un chemin fourni manuellement.
     */
    validatePath(gamePath: string): boolean {
        const jarFile = join(gamePath, 'projectzomboid.jar');
        return existsSync(gamePath) && existsSync(jarFile);
    }
}
