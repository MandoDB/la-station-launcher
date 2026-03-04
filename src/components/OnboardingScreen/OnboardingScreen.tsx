import React from 'react';
import { motion } from 'framer-motion';
import { useLauncher } from '../../context/LauncherContext';
import styles from './OnboardingScreen.module.css';

/**
 * Écran d'onboarding affiché quand PZ n'est pas détecté automatiquement.
 * Animation d'entrée fluide, invitation à sélectionner manuellement le dossier.
 */
export const OnboardingScreen: React.FC = () => {
    const { handleSelectFolder, handleDetectGame } = useLauncher();

    return (
        <motion.div
            className={styles.container}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
        >
            {/* Fond atmosphérique animé */}
            <div className={styles.bgGlow} />

            <motion.div
                className={styles.card}
                initial={{ opacity: 0, y: 40, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.2, duration: 0.5, ease: 'easeOut' }}
            >
                {/* Icône */}
                <div className={styles.iconWrapper}>
                    <motion.div
                        className={styles.iconRing}
                        animate={{ rotate: 360 }}
                        transition={{ duration: 20, ease: 'linear', repeat: Infinity }}
                    />
                    <div className={styles.icon}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="36" height="36">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.5 12.5 19.79 19.79 0 0 1 1.07 3.8 2 2 0 0 1 3 1.61h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 16.92z" />
                        </svg>
                    </div>
                </div>

                {/* Texte */}
                <motion.div
                    className={styles.textBlock}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4, duration: 0.4 }}
                >
                    <h2 className={styles.title}>Jeu introuvable</h2>
                    <p className={styles.description}>
                        Project Zomboid n'a pas été détecté automatiquement sur les lecteurs C à M.
                        <br />
                        Sélectionnez manuellement le dossier d'installation.
                    </p>
                </motion.div>

                {/* Actions */}
                <motion.div
                    className={styles.actions}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5, duration: 0.4 }}
                >
                    <motion.button
                        className={styles.primaryBtn}
                        onClick={handleSelectFolder}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                        </svg>
                        Sélectionner le dossier
                    </motion.button>

                    <motion.button
                        className={styles.secondaryBtn}
                        onClick={handleDetectGame}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                            <polyline points="23 4 23 10 17 10" />
                            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                        </svg>
                        Re-scanner
                    </motion.button>
                </motion.div>

                {/* Chemin attendu */}
                <motion.div
                    className={styles.hint}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.7 }}
                >
                    <span className={styles.hintLabel}>Emplacement typique :</span>
                    <code className={styles.hintCode}>
                        C:\Program Files (x86)\Steam\steamapps\common\ProjectZomboid
                    </code>
                </motion.div>
            </motion.div>
        </motion.div>
    );
};
