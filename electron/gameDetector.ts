import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Emplacements Steam standards pour Project Zomboid.
 * On scanne les lettres de lecteur C à M.
 */
const STEAM_PATHS = [
    'Program Files (x86)/Steam/steamapps/common/ProjectZomboid',
    'Program Files/Steam/steamapps/common/ProjectZomboid',
    'SteamLibrary/steamapps/common/ProjectZomboid',
    'Steam/steamapps/common/ProjectZomboid',
    'Games/Steam/steamapps/common/ProjectZomboid',
];

const DRIVE_LETTERS = ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'];

export interface DetectionResult {
    found: boolean;
    path?: string;
    method?: 'auto' | 'manual';
}

export class GameDetector {
    /**
     * Scanne les disques et les emplacements Steam connus.
     * Retourne le premier chemin valide trouvé.
     */
    async detect(): Promise<DetectionResult> {
        console.log('[GameDetector] Starting auto-detection...');

        for (const drive of DRIVE_LETTERS) {
            for (const steamPath of STEAM_PATHS) {
                const fullPath = join(`${drive}:\\`, steamPath);
                if (existsSync(fullPath)) {
                    // Vérification que c'est bien une installation PZ valide
                    const jarFile = join(fullPath, 'projectzomboid.jar');
                    if (existsSync(jarFile)) {
                        console.log(`[GameDetector] Found at: ${fullPath}`);
                        return { found: true, path: fullPath, method: 'auto' };
                    }
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
