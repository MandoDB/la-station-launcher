import { desktopCapturer, shell, nativeImage, app, clipboard } from 'electron';
import { existsSync, mkdirSync, writeFileSync, readdirSync, statSync, unlinkSync, readFileSync } from 'fs';
import { join } from 'path';
import * as https from 'https';
import * as http from 'http';

// ─── Webhook Discord — configuré ici ──────────────────────────────────────────
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1486543079560446164/9aGk_VZ8cD2oAhyTRdmD20TAKzV2B_IMXrjmsgluYE2Ggwn6nPyU2GMrSbmnb6IShPVg';

export interface ScreenshotMetadata {
    id: string;
    path: string;
    timestamp: number;
    filename: string;
}

export type ScreenshotEventCallback = (event: string, data: any) => void;

export class ScreenshotManager {
    private screenshotsDir: string;
    private sendToRenderer: ScreenshotEventCallback;

    constructor(appDataPath: string, sendToRenderer: ScreenshotEventCallback) {
        this.sendToRenderer = sendToRenderer;
        // Dossier par défaut dans Documents/LA STATION/Screenshots
        const defaultDir = join(app.getPath('documents'), 'LA STATION', 'Screenshots');
        this.screenshotsDir = defaultDir;
        this.ensureDir(this.screenshotsDir);
    }

    private ensureDir(path: string) {
        if (!existsSync(path)) {
            mkdirSync(path, { recursive: true });
        }
    }

    setDirectory(path: string): boolean {
        try {
            this.ensureDir(path);
            this.screenshotsDir = path;
            return true;
        } catch {
            return false;
        }
    }

    getDirectory(): string {
        return this.screenshotsDir;
    }

    // ── Capture d'écran ──────────────────────────────────────────────────────
    async capture(rect?: { x: number, y: number, width: number, height: number }): Promise<ScreenshotMetadata | null> {
        try {
            // Récupérer les sources (écrans)
            const sources = await desktopCapturer.getSources({
                types: ['screen'],
                thumbnailSize: { width: 3840, height: 2160 } // On prend large pour la qualité
            });

            if (sources.length === 0) return null;

            // On prend le premier écran (principal)
            const primarySource = sources[0];
            let image = primarySource.thumbnail; // C'est un NativeImage

            // Si un rectangle est fourni, on crop
            if (rect && rect.width > 0 && rect.height > 0) {
                const { screen } = require('electron');
                const primaryDisplay = screen.getPrimaryDisplay();
                const { width: screenW, height: screenH } = primaryDisplay.bounds;
                
                const imageSize = image.getSize();
                
                // Calcul du ratio car DesktopCapturer peut avoir une résolution différente
                // de la résolution d'affichage (surtout avec le High DPI / Scaling Windows)
                const scaleX = imageSize.width / screenW;
                const scaleY = imageSize.height / screenH;

                const cropRect = {
                    x: Math.round(rect.x * scaleX),
                    y: Math.round(rect.y * scaleY),
                    width: Math.round(rect.width * scaleX),
                    height: Math.round(rect.height * scaleY)
                };

                // Sécurité pour ne pas sortir de l'image
                cropRect.x = Math.max(0, Math.min(cropRect.x, imageSize.width - 1));
                cropRect.y = Math.max(0, Math.min(cropRect.y, imageSize.height - 1));
                cropRect.width = Math.max(1, Math.min(cropRect.width, imageSize.width - cropRect.x));
                cropRect.height = Math.max(1, Math.min(cropRect.height, imageSize.height - cropRect.y));

                image = image.crop(cropRect);
            }

            const timestamp = Date.now();
            const filename = `screenshot_${timestamp}.png`;
            const fullPath = join(this.screenshotsDir, filename);

            writeFileSync(fullPath, image.toPNG());
            
            // Copier dans le presse-papier pour un CTRL+V immédiat
            clipboard.writeImage(image);

            const metadata: ScreenshotMetadata = {
                id: timestamp.toString(),
                path: fullPath,
                timestamp,
                filename
            };

            this.sendToRenderer('screenshot:captured', metadata);
            return metadata;
        } catch (e) {
            console.error('[ScreenshotManager] Capture failed:', e);
            return null;
        }
    }

    // ── Liste des captures locales ───────────────────────────────────────────
    getRecent(limit: number = 10): ScreenshotMetadata[] {
        if (!existsSync(this.screenshotsDir)) return [];
        try {
            const files = readdirSync(this.screenshotsDir);
            return files
                .filter(f => f.endsWith('.png') || f.endsWith('.jpg'))
                .map(f => {
                    const p = join(this.screenshotsDir, f);
                    const s = statSync(p);
                    return {
                        id: s.mtimeMs.toString(),
                        path: p,
                        timestamp: s.mtimeMs,
                        filename: f
                    };
                })
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, limit);
        } catch {
            return [];
        }
    }

    delete(path: string): void {
        if (existsSync(path)) {
            try { unlinkSync(path); } catch { /* ignore */ }
        }
    }

    openFolder(): void {
        shell.openPath(this.screenshotsDir);
    }

    // ── Envoi Discord ────────────────────────────────────────────────────────
    async sendToDiscord(imagePaths: string | string[], title?: string, discordUserId?: string | null): Promise<{ success: boolean; error?: string }> {
        if (!DISCORD_WEBHOOK_URL || DISCORD_WEBHOOK_URL.includes('VOTRE_WEBHOOK_ICI')) {
            return { success: false, error: 'Webhook Discord non configuré.' };
        }

        const paths = Array.isArray(imagePaths) ? imagePaths : [imagePaths];
        const validPaths = paths.filter(p => existsSync(p));

        if (validPaths.length === 0) {
            return { success: false, error: 'Aucun fichier image valide trouvé.' };
        }

        try {
            const boundary = `----LASTATIONScreenshot${Date.now()}`;
            const CRLF = '\r\n';

            // ── Payload JSON ──
            let content = title ? `📸 **${title}**` : `📸 Nouvelle(s) capture(s) d'écran - ${new Date().toLocaleString('fr-FR')}`;
            if (discordUserId) {
                content += `\nEnvoyé par : <@${discordUserId}>`;
            }

            const payload = JSON.stringify({
                content,
            });

            const partJson = Buffer.from(
                `--${boundary}${CRLF}` +
                `Content-Disposition: form-data; name="payload_json"${CRLF}` +
                `Content-Type: application/json${CRLF}${CRLF}` +
                payload + CRLF,
                'utf-8'
            );

            const buffers: Buffer[] = [partJson];

            // ── Fichiers ──
            for (let i = 0; i < validPaths.length; i++) {
                const p = validPaths[i];
                const fileBuffer = readFileSync(p);
                const filename = p.split(/[\\/]/).pop() || `screenshot_${i}.png`;

                const partFileHeader = Buffer.from(
                    `--${boundary}${CRLF}` +
                    `Content-Disposition: form-data; name="files[${i}]"; filename="${filename}"${CRLF}` +
                    `Content-Type: image/png${CRLF}${CRLF}`,
                    'utf-8'
                );
                buffers.push(partFileHeader, fileBuffer, Buffer.from(CRLF, 'utf-8'));
            }

            const partClose = Buffer.from(`--${boundary}--${CRLF}`, 'utf-8');
            buffers.push(partClose);

            const body = Buffer.concat(buffers);

            return new Promise((resolve) => {
                const urlObj = new URL(DISCORD_WEBHOOK_URL);
                const lib = urlObj.protocol === 'https:' ? https : http;

                const req = lib.request({
                    hostname: urlObj.hostname,
                    path: urlObj.pathname + urlObj.search,
                    method: 'POST',
                    headers: {
                        'Content-Type': `multipart/form-data; boundary=${boundary}`,
                        'Content-Length': body.length,
                    },
                }, (res) => {
                    let data = '';
                    res.on('data', d => data += d);
                    res.on('end', () => {
                        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                            resolve({ success: true });
                        } else {
                            resolve({ success: false, error: `Discord HTTP ${res.statusCode} : ${data}` });
                        }
                    });
                });

                req.on('error', e => resolve({ success: false, error: e.message }));
                req.write(body);
                req.end();
            });
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    }
}
