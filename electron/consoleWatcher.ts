import { existsSync } from 'fs';
import { join } from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';

// ─── Webhook Discord — configuré ici, non exposé au renderer ─────────────────
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1478603398818566174/ZiDzPHdlAHeZlSpcktevmA8AOskKzaFvRggzr6oM9DrTuz1ZLPFya6oerBRiBV_XS8ao';
//                           ↑ Remplacez par votre vrai webhook Discord

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ConsoleLine {
    level: 'LOG' | 'WARN' | 'ERROR' | 'RAW';
    category: string;
    text: string;
    raw: string;
}

export type ConsoleEventCallback = (event: string, data: any) => void;

// ─── Localisation du console.txt (cross‑platform : homedir) ───────────────────
function getConsoleCandidates(): string[] {
    const home = os.homedir();
    const candidates = [join(home, 'Zomboid', 'console.txt')];
    if (process.platform === 'win32') {
        candidates.push(join(process.env.USERPROFILE || home, 'Zomboid', 'console.txt'));
    }
    return [...new Set(candidates)];
}

export function findConsoleFile(): string | null {
    for (const p of getConsoleCandidates()) {
        if (existsSync(p)) return p;
    }
    return null;
}

// ─── Parser d'une ligne PZ ───────────────────────────────────────────────────
// Format: "LOG  : Category   f:0, t:123> message"
//         "WARN : Category   f:0, t:123> message"
//         "ERROR: Category   f:0, t:123> message"
export function parseLine(raw: string): ConsoleLine {
    const trimmed = raw.trim();
    if (!trimmed) return { level: 'RAW', category: '', text: '', raw };

    const match = trimmed.match(/^(LOG\s+|WARN\s+|ERROR)\s*:\s*([\w$]+)\s+f:\d+, t:\d+>\s?(.*)$/);
    if (match) {
        const levelRaw = match[1].trim();
        const level: ConsoleLine['level'] =
            levelRaw === 'ERROR' ? 'ERROR' :
                levelRaw === 'WARN' ? 'WARN' : 'LOG';
        return {
            level,
            category: match[2].trim(),
            text: match[3].trim(),
            raw: trimmed,
        };
    }
    return { level: 'RAW', category: '', text: trimmed, raw: trimmed };
}

// ─── Machine à états multi PZ ────────────────────────────────────────────────
// États : lobby (0) < connecting (1) < playing (2)
// Un état ne peut régresser que via une vraie déconnexion (force-disconnect / RakNet).
// Toutes les autres lignes Multiplayer parasites sont ignorées une fois "playing".

type MultiState = 'lobby' | 'connecting' | 'playing';
const MULTI_STATE_RANK: Record<MultiState, number> = { lobby: 0, connecting: 1, playing: 2 };

// ── Signatures EXACTES tirées de ton console.txt ─────────────────────────────
// Toutes les lignes concernées ont la forme :
//   LOG  : Multiplayer  f:N, t:TIMESTAMP[, st:...]> connection: ... [<state>] "<event>"
//
// CONNECTING  → [send-packet] "login"         (exactement "login", pas "login-queue-*")
// PLAYING     → [connect-state-finish] "lua-connected"
// LOBBY       → [force-disconnect] "..."  OU  [RakNet] "disconnection-notification"
//
// On extrait le timestamp PZ (t:XXXXXXX) pour mesurer les délais RÉELS entre événements,
// indépendamment du moment où le poll lit les lignes.

const RE_MULTIPLAYER_LINE = /\bMultiplayer\b/;
const RE_PZ_TIMESTAMP     = /\bt:(\d+)/;

// "login" entre guillemets, mot complet — se termine par "login" suivi d'un guillemet fermant
const RE_CONNECTING  = /\[send-packet\]\s*"login"/i;
const RE_LOGIN_EXACT = /\[send-packet\]\s*"login"\s*$/i; // "login" doit être le dernier mot de la ligne

// "En jeu" : [connect-state-finish] "lua-connected"
const RE_CONNECTED = /\[connect-state-finish\]\s*"lua-connected"/i;

// "Retour lobby" : uniquement les vraies déconnexions réseau APRÈS être entré en jeu.
// On n'autorise la régression que si l'état courant est "playing" (jamais depuis "connecting").
// Patterns volontairement très précis pour éviter tous les faux positifs du handshake.
const RE_DISCONNECTED = /\[force-disconnect\]\s*"exiting"|\[raknet\]\s*"disconnection-notification"/i;

function extractPzTimestamp(raw: string): number | null {
    const m = raw.match(RE_PZ_TIMESTAMP);
    return m ? parseInt(m[1], 10) : null;
}

function detectLineState(raw: string): MultiState | null {
    if (!RE_MULTIPLAYER_LINE.test(raw)) return null;
    if (RE_DISCONNECTED.test(raw)) return 'lobby';
    if (RE_CONNECTED.test(raw))    return 'playing';
    if (RE_LOGIN_EXACT.test(raw))  return 'connecting';
    return null;
}

// ─── ConsoleWatcher ──────────────────────────────────────────────────────────
export class ConsoleWatcher {
    private consolePath: string | null = null;
    private watchTimer: NodeJS.Timeout | null = null;
    private lastBytePos: number = 0;
    private sendToRenderer: ConsoleEventCallback;

    // Machine à états multi — gardée en mémoire pour éviter les régressions parasites
    private multiState: MultiState = 'lobby';
    private multiStatePzTs: number = 0; // timestamp PZ (ms) de la dernière transition
    // Délai minimum (en ms de temps PZ) entre "playing" et une déconnexion valide.
    // Évite qu'une déconnexion lue dans le même poll que lua-connected soit prise en compte.
    private static readonly DISCONNECT_GRACE_PZ_MS = 5_000;

    constructor(sendToRenderer: ConsoleEventCallback) {
        this.sendToRenderer = sendToRenderer;
    }

    // ── Localiser ───────────────────────────────────────────────────────────
    locate(): { found: boolean; path?: string } {
        const path = findConsoleFile();
        if (path) {
            this.consolePath = path;
            return { found: true, path };
        }
        return { found: false };
    }

    setCustomPath(path: string): boolean {
        if (existsSync(path)) {
            this.consolePath = path;
            return true;
        }
        return false;
    }

    getPath(): string | null {
        return this.consolePath;
    }

    // ── Lecture complète ─────────────────────────────────────────────────────
    readAll(): ConsoleLine[] {
        if (!this.consolePath || !existsSync(this.consolePath)) return [];
        try {
            const content = fs.readFileSync(this.consolePath, 'utf-8');
            return content
                .split('\n')
                .filter((l) => l.trim().length > 0)
                .map(parseLine);
        } catch {
            return [];
        }
    }

    // ── Watch (polling 1s) ───────────────────────────────────────────────────
    startWatch(): boolean {
        if (!this.consolePath || !existsSync(this.consolePath)) return false;

        // Réinitialiser la machine à états à chaque démarrage de session
        this.multiState = 'lobby';
        this.multiStatePzTs = 0;

        if (this.watchTimer) return true; // déjà actif

        // On commence à la fin du fichier — uniquement les nouvelles lignes
        try {
            this.lastBytePos = fs.statSync(this.consolePath).size;
        } catch {
            this.lastBytePos = 0;
        }

        this.watchTimer = setInterval(() => this.poll(), 1000);
        return true;
    }

    stopWatch(): void {
        if (this.watchTimer) {
            clearInterval(this.watchTimer);
            this.watchTimer = null;
        }
    }

    isWatching(): boolean {
        return this.watchTimer !== null;
    }

    // ── Polling incrémental ──────────────────────────────────────────────────
    private poll(): void {
        if (!this.consolePath) return;
        try {
            const stat = fs.statSync(this.consolePath);
            if (stat.size <= this.lastBytePos) return;

            const toRead = stat.size - this.lastBytePos;
            const buffer = Buffer.alloc(toRead);
            const fd = fs.openSync(this.consolePath, 'r');
            fs.readSync(fd, buffer, 0, toRead, this.lastBytePos);
            fs.closeSync(fd);
            this.lastBytePos = stat.size;

            const lines = buffer
                .toString('utf-8')
                .split('\n')
                .filter((l) => l.trim().length > 0)
                .map(parseLine);

            if (lines.length > 0) {
                this.sendToRenderer('console:lines', lines);

                // ── Machine à états multi : traiter les lignes dans l'ordre ──────
                const wallNow = Date.now();
                for (const line of lines) {
                    const detected = detectLineState(line.raw);
                    if (!detected) continue;

                    const detectedRank = MULTI_STATE_RANK[detected];
                    const currentRank  = MULTI_STATE_RANK[this.multiState];

                    // Timestamp PZ de cette ligne (null = pas parseable → on skip la déconnexion)
                    const pzTs = extractPzTimestamp(line.raw);

                    if (detected === 'lobby') {
                        // On ne régresse vers "lobby" QUE depuis "playing" — jamais depuis "connecting"
                        // car de nombreux événements de handshake ressemblent à des déconnexions.
                        if (this.multiState !== 'playing') continue;
                        // Grace period : la déconnexion doit arriver au moins DISCONNECT_GRACE_PZ_MS
                        // après être passé en "playing" (évite les artefacts du handshake final).
                        if (pzTs !== null && this.multiStatePzTs !== 0) {
                            if (pzTs - this.multiStatePzTs < ConsoleWatcher.DISCONNECT_GRACE_PZ_MS) continue;
                        }
                        this.multiState = 'lobby';
                        this.multiStatePzTs = pzTs ?? 0;
                        this.sendToRenderer('console:server-disconnected', { startTime: wallNow });
                    } else if (detectedRank > currentRank) {
                        // Montée d'état uniquement
                        this.multiState = detected;
                        this.multiStatePzTs = pzTs ?? 0;
                        const event = detected === 'connecting' ? 'console:server-connecting' : 'console:server-connected';
                        this.sendToRenderer(event, { startTime: wallNow });
                    }
                    // Ignorer : même état ou régression parasite
                }
            }
        } catch {
            // fichier en cours d'écriture — on réessaie au tick suivant
        }
    }

    // ── Envoi Discord — fichier en pièce jointe (multipart/form-data) ─────────
    // discordUserId : si fourni, l'identifiant Discord est inclus dans le message (avec accord utilisateur).
    async sendToDiscord(discordUserId?: string | null): Promise<{ success: boolean; error?: string }> {
        if (!DISCORD_WEBHOOK_URL || DISCORD_WEBHOOK_URL.includes('VOTRE_WEBHOOK_ICI')) {
            return { success: false, error: 'Webhook Discord non configuré dans le launcher.' };
        }
        if (!this.consolePath || !existsSync(this.consolePath)) {
            return { success: false, error: 'console.txt introuvable.' };
        }

        // Lecture du fichier
        let fileBuffer: Buffer;
        try {
            fileBuffer = fs.readFileSync(this.consolePath);
        } catch (e: any) {
            return { success: false, error: `Lecture impossible : ${e.message}` };
        }

        const now = new Date().toLocaleString('fr-FR').replace(/[/:]/g, '-');
        const filename = `console_${now}.txt`;
        const boundary = `----LASTATIONBoundary${Date.now()}`;

        // ── Payload JSON (message d'accompagnement) ───────────────────────────
        let content = `📄 **Console PZ** — ${new Date().toLocaleString('fr-FR')}`;
        if (discordUserId) {
            content += `\n**Discord ID :** \`${discordUserId}\` | USER : <@${discordUserId}>`;
        }
        const payload = JSON.stringify({
            username: 'LA STATION Launcher',
            content,
        });

        // ── Construction du corps multipart ───────────────────────────────────
        //   Part 1 : payload_json
        //   Part 2 : file attachment
        const CRLF = '\r\n';
        const partJson = Buffer.from(
            `--${boundary}${CRLF}` +
            `Content-Disposition: form-data; name="payload_json"${CRLF}` +
            `Content-Type: application/json${CRLF}${CRLF}` +
            payload + CRLF,
            'utf-8'
        );
        const partFileHeader = Buffer.from(
            `--${boundary}${CRLF}` +
            `Content-Disposition: form-data; name="file"; filename="${filename}"${CRLF}` +
            `Content-Type: text/plain; charset=utf-8${CRLF}${CRLF}`,
            'utf-8'
        );
        const partClose = Buffer.from(`${CRLF}--${boundary}--${CRLF}`, 'utf-8');

        const body = Buffer.concat([partJson, partFileHeader, fileBuffer, partClose]);

        return new Promise((resolve) => {
            const urlObj = new URL(DISCORD_WEBHOOK_URL);
            const lib = DISCORD_WEBHOOK_URL.startsWith('https') ? https : http;

            const options = {
                hostname: urlObj.hostname,
                path: urlObj.pathname + urlObj.search,
                method: 'POST',
                headers: {
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
                    'Content-Length': body.length,
                },
            };

            const req = lib.request(options, (res) => {
                // Consommer la réponse pour libérer la connexion
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        resolve({ success: true });
                    } else {
                        // Discord renvoie parfois un message d'erreur JSON utile
                        let detail = `HTTP ${res.statusCode}`;
                        try {
                            const parsed = JSON.parse(data);
                            if (parsed.message) detail += ` — ${parsed.message}`;
                        } catch { /* ignore */ }
                        resolve({ success: false, error: detail });
                    }
                });
            });

            req.on('error', (e) => resolve({ success: false, error: e.message }));
            req.write(body);
            req.end();
        });
    }
}
