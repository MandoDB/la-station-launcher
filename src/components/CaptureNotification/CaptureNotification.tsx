import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './CaptureNotification.module.css';

export const CaptureNotification: React.FC = () => {
    const [path, setPath] = useState<string | null>(null);

    useEffect(() => {
        // Extraire le chemin depuis l'URL (hash: #capture-notification?path=...)
        const hash = window.location.hash;
        const params = new URLSearchParams(hash.split('?')[1]);
        const imgPath = params.get('path');
        if (imgPath) setPath(decodeURIComponent(imgPath));
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
                <div className={styles.previewBox} onClick={() => window.electronAPI.screenshotOpenFolder()}>
                    <img src={`local-img:///${path}`} alt="Shot" className={styles.preview} />
                </div>
                <div className={styles.content}>
                    <div className={styles.titleRow}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14">
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                            <circle cx="12" cy="13" r="4"/>
                        </svg>
                        <span>CAPTURE ENREGISTRÉE</span>
                    </div>
                    <div className={styles.actions}>
                        <button className={styles.openBtn} onClick={() => window.electronAPI.screenshotOpenFolder()}>
                            Ouvrir le dossier
                        </button>
                        <button className={styles.shareBtn} onClick={() => window.electronAPI.screenshotOpenModal(path)}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="12" height="12">
                                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                            </svg>
                            Partager
                        </button>
                    </div>
                </div>
                
                {/* Glow décoratif */}
                <div className={styles.glow} />
            </div>
        </motion.div>
    );
};
