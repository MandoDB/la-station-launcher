import React from 'react';
import { motion } from 'framer-motion';
import styles from './RecordingNotification.module.css';

export const RecordingNotification: React.FC = () => {
    return (
        <motion.div 
            className={styles.container}
            initial={{ x: 350, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 350, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 25 }}
        >
            <div className={styles.glass}>
                <div className={styles.iconBox}>
                    <div className={styles.dot} />
                </div>
                <div className={styles.content}>
                    <div className={styles.titleRow}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14">
                            <path d="M23 7l-7 5 7 5V7z" />
                            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                        </svg>
                        <span>ENREGISTREMENT DÉMARRÉ</span>
                    </div>
                    <p className={styles.sub}>F8 pour arrêter et enregistrer le clip.</p>
                </div>
                <div className={styles.glow} />
            </div>
        </motion.div>
    );
};
