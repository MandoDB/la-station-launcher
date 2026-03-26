import { app, BrowserWindow, desktopCapturer, ipcMain, shell } from 'electron';
import { existsSync, mkdirSync, writeFileSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';

export interface RecorderMetadata {
    path: string;
    timestamp: number;
    filename: string;
}

export class RecorderManager {
    private videosDir: string;
    private isRecording: boolean = false;
    private recorderWindow: BrowserWindow | null = null;
    private onStatusUpdate: (isRecording: boolean) => void;
    private onVideoSaved: (metadata: RecorderMetadata) => void;

    constructor(appDataPath: string, onStatusUpdate: (isRecording: boolean) => void, onVideoSaved: (metadata: RecorderMetadata) => void) {
        this.videosDir = join(app.getPath('documents'), 'LA STATION', 'Clips');
        if (!existsSync(this.videosDir)) mkdirSync(this.videosDir, { recursive: true });
        this.onStatusUpdate = onStatusUpdate;
        this.onVideoSaved = onVideoSaved;
        this.setupIpc();
    }

    private setupIpc() {
        ipcMain.on('recorder:chunk', (_e, buffer: Buffer) => {
            // Dans une implémentation réelle, on utiliserait un stream via fs.createWriteStream
            // Pour faire simple ici, on gère ça via RecorderWindow qui peut envoyer le blob final ou par chunks
        });

        ipcMain.handle('recorder:save', async (_e, arrayBuffer: ArrayBuffer) => {
            const timestamp = Date.now();
            const filename = `clip_${timestamp}.webm`;
            const fullPath = join(this.videosDir, filename);
            
            const metadata = { path: fullPath, timestamp, filename };
            writeFileSync(fullPath, Buffer.from(arrayBuffer));
            this.onVideoSaved(metadata);
            return metadata;
        });
    }

    public toggleRecording() {
        if (this.isRecording) {
            this.stop();
        } else {
            this.start();
        }
    }

    private async start() {
        if (this.isRecording) return;
        
        const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
        const primarySource = sources[0];
        if (!primarySource) return;

        this.isRecording = true;
        this.onStatusUpdate(true);

        if (!this.recorderWindow) {
            this.createRecorderWindow();
        }

        const win = this.recorderWindow!;
        if (win.webContents.isLoading()) {
            win.webContents.once('did-finish-load', () => {
                win.webContents.send('recorder:start', primarySource.id);
            });
        } else {
            win.webContents.send('recorder:start', primarySource.id);
        }
    }

    private stop() {
        if (!this.isRecording) return;
        this.isRecording = false;
        this.onStatusUpdate(false);
        this.recorderWindow?.webContents.send('recorder:stop');
    }

    private createRecorderWindow() {
        this.recorderWindow = new BrowserWindow({
            show: false,
            webPreferences: {
                preload: join(__dirname, 'preload.js'),
                contextIsolation: true,
                nodeIntegration: false,
            }
        });

        if (process.env.VITE_DEV_SERVER_URL) {
            this.recorderWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}#recorder-tool`);
        } else {
            this.recorderWindow.loadFile(join(__dirname, '../dist/index.html'), {
                hash: 'recorder-tool'
            });
        }
    }

    public openFolder() {
        console.log(`[Recorder] Opening folder: ${this.videosDir}`);
        shell.openPath(this.videosDir).then(err => {
            if (err) console.error(`[Recorder] Shell openPath error: ${err}`);
        }).catch(e => console.error(`[Recorder] Shell openPath rejection: ${e}`));
    }

    public getVideosDir(): string {
        return this.videosDir;
    }

    public setVideosDir(p: string) {
        if (!existsSync(p)) return false;
        this.videosDir = p;
        return true;
    }

    public getVideos(limit: number = 50): RecorderMetadata[] {
        if (!existsSync(this.videosDir)) return [];
        const files = readdirSync(this.videosDir);
        
        return files
            .filter(f => f.endsWith('.webm'))
            .map(f => {
                const p = join(this.videosDir, f);
                const stats = statSync(p);
                return {
                    id: f,
                    path: p,
                    filename: f,
                    timestamp: stats.mtimeMs
                };
            })
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit);
    }

    public deleteVideo(path: string) {
        if (existsSync(path)) {
            unlinkSync(path);
            return true;
        }
        return false;
    }

    public isRecordingNow(): boolean {
        return this.isRecording;
    }
}
