import React, { useEffect, useRef } from 'react';
import fixWebmDuration from 'fix-webm-duration';

export const RecorderTool: React.FC = () => {
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const startTimeRef = useRef<number>(0);

    useEffect(() => {
        const handleStart = async (event: any, sourceId: string) => {
            console.log('[Recorder] Starting for source:', sourceId);
            try {
                const settings = await window.electronAPI.settingsGet();
                const resolution = settings.recorderResolution || '1080p';
                const fps = settings.recorderFps || 60;

                let width = 1920;
                let height = 1080;
                let useNative = false;

                if (resolution === '480p') {
                    width = 854;
                    height = 480;
                } else if (resolution === '720p') {
                    width = 1280;
                    height = 720;
                } else if (resolution === 'native') {
                    useNative = true;
                }

                const constraints: any = {
                    audio: {
                        mandatory: {
                            chromeMediaSource: 'desktop'
                        }
                    },
                    video: {
                        mandatory: {
                            chromeMediaSource: 'desktop',
                            chromeMediaSourceId: sourceId,
                            minFrameRate: fps,
                            maxFrameRate: fps
                        }
                    }
                };

                if (!useNative) {
                    constraints.video.mandatory.minWidth = width;
                    constraints.video.mandatory.maxWidth = width;
                    constraints.video.mandatory.minHeight = height;
                    constraints.video.mandatory.maxHeight = height;
                } else {
                    // Pour le natif, on met des limites très hautes pour laisser faire le système
                    constraints.video.mandatory.maxWidth = 3840;
                    constraints.video.mandatory.maxHeight = 2160;
                }

                const stream = await (navigator.mediaDevices as any).getUserMedia(constraints);

                const mediaRecorder = new MediaRecorder(stream, {
                    mimeType: 'video/webm; codecs=vp9'
                });

                mediaRecorderRef.current = mediaRecorder;
                chunksRef.current = [];
                startTimeRef.current = Date.now();

                mediaRecorder.ondataavailable = (e) => {
                    if (e.data.size > 0) {
                        chunksRef.current.push(e.data);
                    }
                };

                mediaRecorder.onstop = async () => {
                    const duration = Date.now() - startTimeRef.current;
                    const rawBlob = new Blob(chunksRef.current, { type: 'video/webm; codecs=vp9' });
                    
                    // Fix the missing duration metadata so Windows Media Player & co can read it
                    const fixedBlob = await fixWebmDuration(rawBlob, duration);
                    const arrayBuffer = await fixedBlob.arrayBuffer();
                    
                    // Envoyer au main pour sauvegarde
                    const result = await window.electronAPI.recorderSave(arrayBuffer);
                    console.log('[Recorder] Saved to:', result.path);

                    // Nettoyage des tracks
                    stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
                };

                mediaRecorder.start(1000); // chunks toutes les secondes
            } catch (err) {
                console.error('[Recorder] Error:', err);
            }
        };

        const handleStop = () => {
            console.log('[Recorder] Stopping...');
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                mediaRecorderRef.current.stop();
            }
        };

        window.electronAPI.onRecorderStart(handleStart);
        window.electronAPI.onRecorderStop(handleStop);

        return () => {
            window.electronAPI.removeAllListeners('recorder:start');
            window.electronAPI.removeAllListeners('recorder:stop');
        };
    }, []);

    return null; // Cette fenêtre est invisible
};
