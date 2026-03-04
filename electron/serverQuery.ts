import * as dgram from 'dgram';

// ─── Protocole Valve A2S_INFO ─────────────────────────────────────────────────
// Requête standard pour les serveurs Source Engine (dont Project Zomboid).
// Doc : https://developer.valvesoftware.com/wiki/Server_queries#A2S_INFO
//
// Séquence :
//   1. Envoyer le challenge initial
//   2. Si le serveur répond avec un challenge (0x41), renvoyer avec le challenge
//   3. Parser la réponse A2S_INFO (0x49) pour extraire players / maxPlayers

const A2S_INITIAL = Buffer.from([
    0xFF, 0xFF, 0xFF, 0xFF, 0x54,
    // "Source Engine Query\0"
    0x53, 0x6F, 0x75, 0x72, 0x63, 0x65, 0x20, 0x45, 0x6E, 0x67,
    0x69, 0x6E, 0x65, 0x20, 0x51, 0x75, 0x65, 0x72, 0x79, 0x00,
    // Pad challenge (ignoré si le serveur n'envoie pas de challenge)
    0xFF, 0xFF, 0xFF, 0xFF,
]);

export interface ServerInfo {
    online: boolean;
    players: number;
    maxPlayers: number;
    serverName?: string;
    map?: string;
}

function parseA2SInfo(buf: Buffer): ServerInfo | null {
    // Header attendu : FF FF FF FF 49 (simple response)
    if (buf.length < 6) return null;
    if (buf[0] !== 0xFF || buf[1] !== 0xFF || buf[2] !== 0xFF || buf[3] !== 0xFF) return null;
    if (buf[4] !== 0x49) return null; // pas une réponse A2S_INFO

    let offset = 5;

    const readByte  = () => buf[offset++];
    const readShort = () => { const v = buf.readUInt16LE(offset); offset += 2; return v; };
    const readString = () => {
        const end = buf.indexOf(0x00, offset);
        if (end === -1) return '';
        const s = buf.toString('utf8', offset, end);
        offset = end + 1;
        return s;
    };

    readByte();               // protocol
    const serverName = readString();
    readString();             // map name (on la lit pour avancer le curseur)
    const map = readString(); // folder
    readString();             // game
    readShort();              // appID
    const players    = readByte();
    const maxPlayers = readByte();

    return { online: true, players, maxPlayers, serverName, map };
}

export function queryServer(
    host: string,
    port: number,
    timeoutMs = 3000,
): Promise<ServerInfo> {
    return new Promise((resolve) => {
        const offline: ServerInfo = { online: false, players: 0, maxPlayers: 0 };
        const socket = dgram.createSocket('udp4');
        let done = false;

        const finish = (info: ServerInfo) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            try { socket.close(); } catch { /* ignore */ }
            resolve(info);
        };

        const timer = setTimeout(() => finish(offline), timeoutMs);

        socket.on('error', () => finish(offline));

        socket.on('message', (msg) => {
            // Le serveur peut d'abord envoyer un challenge (byte 4 = 0x41)
            if (msg[4] === 0x41 && msg.length === 9) {
                // Renvoyer la requête avec le challenge reçu
                const withChallenge = Buffer.from(A2S_INITIAL);
                msg.copy(withChallenge, withChallenge.length - 4, 5, 9);
                socket.send(withChallenge, port, host);
                return;
            }

            const info = parseA2SInfo(msg);
            finish(info ?? offline);
        });

        socket.send(A2S_INITIAL, port, host);
    });
}
