import { Client } from 'discord-rpc';
import * as https from 'https';
import * as http from 'http';

// ─── Config ───────────────────────────────────────────────────────────────────
const CLIENT_ID = '1466233932285739018';
const DISCORD_INVITE_URL = 'https://discord.gg/wwXz9zyzrH';  // ← Lien d'invitation Discord
const WEBSITE_URL = 'https://la-station.org';               // ← Site internet

// Boutons affichés sur le Rich Presence (max 2)
const RPC_BUTTONS = [
    { label: 'Rejoindre le Discord', url: DISCORD_INVITE_URL },
    { label: 'Site Internet', url: WEBSITE_URL },
];

// ─── Types ────────────────────────────────────────────────────────────────────
export interface DiscordUser {
    id: string;
    username: string;
    discriminator: string;
    avatar: string | null;
    avatarUrl: string | null; // data:image/png;base64,... (résolu côté backend)
}

export type PresenceState = 'idle' | 'patching' | 'lobby' | 'connecting' | 'playing';
export type DiscordEventCallback = (event: string, data: any) => void;

// ─── DiscordManager ───────────────────────────────────────────────────────────
export class DiscordManager {
    private client: Client | null = null;
    private user: DiscordUser | null = null;
    private ready = false;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private sendToRenderer: DiscordEventCallback;
    private sessionStartTime: number | null = null;
    private disabled = false; // true quand l'utilisateur désactive le RPC

    constructor(sendToRenderer: DiscordEventCallback) {
        this.sendToRenderer = sendToRenderer;
    }

    // ── Téléchargement avatar → base64 (évite les restrictions CSP Electron) ──
    private fetchAvatarBase64(url: string): Promise<string | null> {
        return new Promise((resolve) => {
            const lib = url.startsWith('https') ? https : http;
            lib.get(url, (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (c: Buffer) => chunks.push(c));
                res.on('end', () => {
                    const buf = Buffer.concat(chunks);
                    const mime = (res.headers['content-type'] as string) || 'image/png';
                    resolve(`data:${mime};base64,${buf.toString('base64')}`);
                });
            }).on('error', () => resolve(null));
        });
    }

    // ── Connexion au client Discord local ────────────────────────────────────
    async connect(): Promise<boolean> {
        if (this.disabled) return false;
        if (!CLIENT_ID) {
            console.warn('[Discord] CLIENT_ID manquant — Rich Presence désactivé.');
            this.sendToRenderer('discord:user-ready', null);
            return false;
        }

        // Signaler "connexion en cours" au renderer
        this.sendToRenderer('discord:connecting', true);

        try {
            this.client = new Client({ transport: 'ipc' });

            this.client.on('ready', async () => {
                this.ready = true;
                const u = this.client!.user as any;
                console.log(`[Discord] Connecté — User: ${u?.username}`);

                if (u) {
                    // URL CDN
                    const cdnUrl = u.avatar
                        ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64`
                        : `https://cdn.discordapp.com/embed/avatars/${(parseInt(u.discriminator ?? '0') || 0) % 5}.png`;

                    // Télécharger l'avatar côté Node → base64 pour éviter CSP
                    const avatarBase64 = await this.fetchAvatarBase64(cdnUrl);

                    this.user = {
                        id: u.id,
                        username: u.global_name ?? u.username, // display name > identifiant
                        discriminator: u.discriminator ?? '0',
                        avatar: u.avatar ?? null,
                        avatarUrl: avatarBase64,
                    };

                }

                this.sendToRenderer('discord:connecting', false);
                this.sendToRenderer('discord:user-ready', this.user);
                await this.setPresence('idle');
            });

            this.client.on('disconnected', () => {
                console.log('[Discord] Déconnecté. Reconnexion dans 15s...');
                this.ready = false;
                this.user = null;
                this.sendToRenderer('discord:connecting', false);
                this.sendToRenderer('discord:user-ready', null);
                this.scheduleReconnect();
            });

            await this.client.login({ clientId: CLIENT_ID });
            return true;
        } catch (err: any) {
            console.log(`[Discord] Connexion impossible (Discord fermé ?) : ${err.message}`);
            this.sendToRenderer('discord:connecting', false);
            this.scheduleReconnect();
            return false;
        }
    }

    // ── Reconnexion automatique ───────────────────────────────────────────────
    private scheduleReconnect(): void {
        if (this.disabled) return; // Ne pas reconnecter si désactivé par l'utilisateur
        if (this.reconnectTimer) return;
        this.reconnectTimer = setTimeout(async () => {
            this.reconnectTimer = null;
            await this.connect();
        }, 15_000);
    }

    // ── Rich Presence ─────────────────────────────────────────────────────────
    // Les images (largeImageKey/smallImageKey) ne s'affichent que si des "Art Assets"
    // sont uploadés dans le Discord Developer Portal pour cette application (CLIENT_ID).
    // Sans assets, seuls details + state s'affichent (texte sous le profil).
    //
    // playerCount : si fourni, est affiché dans le state pour lobby/connecting/playing.
    async setPresence(state: PresenceState, startTimestamp?: number, playerCount?: { current: number; max: number }): Promise<void> {
        if (!this.client || !this.ready) return;

        const playersLabel = playerCount ? ` — ${playerCount.current}/${playerCount.max} joueurs` : '';

        const presets: Record<PresenceState, any> = {
            idle: {
                details: 'Sur le launcher',
                state: 'En attente...',
                instance: false,
                buttons: RPC_BUTTONS,
                largeImageKey: 'logo',
                smallImageKey: 'idle',
            },
            patching: {
                details: 'Application du patch',
                state: 'Préparation du serveur...',
                startTimestamp: Date.now(),
                instance: false,
                buttons: RPC_BUTTONS,
                largeImageKey: 'logo',
                smallImageKey: 'patch',
            },
            lobby: {
                details: 'Project Zomboid',
                state: `Dans le lobby${playersLabel}`,
                startTimestamp: startTimestamp ?? Date.now(),
                instance: true,
                buttons: RPC_BUTTONS,
                largeImageKey: 'logo',
                smallImageKey: 'idle',
            },
            connecting: {
                details: 'Project Zomboid',
                state: `En cours de connexion${playersLabel}`,
                startTimestamp: startTimestamp ?? Date.now(),
                instance: true,
                buttons: RPC_BUTTONS,
                largeImageKey: 'logo',
                smallImageKey: 'patch',
            },
            playing: {
                details: 'En jeu — Project Zomboid',
                state: `LA STATION B42${playersLabel}`,
                startTimestamp: startTimestamp ?? Date.now(),
                instance: true,
                buttons: RPC_BUTTONS,
                largeImageKey: 'logo',
                smallImageKey: 'playing',
            },
        };

        try {
            await this.client.setActivity(presets[state]);
            if (state === 'playing') this.sessionStartTime = startTimestamp ?? Date.now();
            if (state === 'idle') this.sessionStartTime = null;
            console.log('[Discord] setActivity success:', presets[state]);
        } catch (err: any) {
            console.error('[Discord] setActivity failed:', err?.message ?? err);
        }
    }

    async clearPresence(): Promise<void> {
        if (!this.client || !this.ready) return;
        try { await this.client.clearActivity(); } catch { /* ignore */ }
    }

    getUser(): DiscordUser | null { return this.user; }
    isReady(): boolean { return this.ready; }

    // disable = true : désactivation volontaire (bloque la reconnexion automatique)
    // disable = false : destruction à la fermeture de l'app (reconnexion OK au prochain démarrage)
    async destroy(disablePermanently = false): Promise<void> {
        if (disablePermanently) this.disabled = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.client) {
            try { await this.clearPresence(); this.client.destroy(); } catch { /* ignore */ }
            this.client = null;
        }
        this.ready = false;
        this.user = null;
        this.sendToRenderer('discord:user-ready', null);
        this.sendToRenderer('discord:connecting', false);
    }

    enable(): void {
        this.disabled = false;
    }
}
