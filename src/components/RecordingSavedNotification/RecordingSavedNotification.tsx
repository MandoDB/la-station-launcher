import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import styles from './RecordingSavedNotification.module.css';

export const RecordingSavedNotification: React.FC = () => {
    const [path, setPath] = useState<string | null>(null);

    useEffect(() => {
        const hash = window.location.hash;
        const params = new URLSearchParams(hash.split('?')[1]);
        const videoPath = params.get('path');
        if (videoPath) setPath(decodeURIComponent(videoPath));
    }, []);

    if (!path) return null;

    return (
        <motion.div 
            className={styles.container}
            initial={{ x: 350, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 350, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 25 }}
        >
            <div className={styles.glass}>
                <div className={styles.previewBox} onClick={() => window.electronAPI.recorderOpenFolder()}>
                    <video 
                        src={`local-img:///${path}`} 
                        className={styles.preview} 
                        muted 
                        autoPlay 
                        loop
                    />
                    <div className={styles.playOverlay}>
                        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                            <path d="M8 5v14l11-7z" />
                        </svg>
                    </div>
                </div>
                <div className={styles.content}>
                    <div className={styles.titleRow}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14">
                            <path d="M23 7l-7 5 7 5V7z" />
                            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                        </svg>
                        <span>VIDÉO ENREGISTRÉE</span>
                    </div>
                    <div className={styles.actions}>
                        <button className={styles.openBtn} onClick={() => window.electronAPI.recorderOpenFolder()}>
                            Ouvrir le dossier
                        </button>
                    </div>
                </div>
                <div className={styles.glow} />
            </div>
        </motion.div>
    );
};
