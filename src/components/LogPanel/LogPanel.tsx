import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLauncher } from '../../context/LauncherContext';
import styles from './LogPanel.module.css';

/**
 * Panneau de logs dépliable pour les utilisateurs avancés.
 */
export const LogPanel: React.FC = () => {
    const { state } = useLauncher();
    const [isOpen, setIsOpen] = useState(false);
    const { logs } = state;

    return (
        <div className={styles.container}>
            {/* Header toggle */}
            <motion.button
                className={styles.toggle}
                onClick={() => setIsOpen((o) => !o)}
                whileHover={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
            >
                <div className={styles.toggleLeft}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                        <polyline points="4 17 10 11 4 5" />
                        <line x1="12" y1="19" x2="20" y2="19" />
                    </svg>
                    <span>LOGS</span>
                    {logs.length > 0 && (
                        <span className={styles.logCount}>{logs.length}</span>
                    )}
                </div>
                <motion.div
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                        <polyline points="6 9 12 15 18 9" />
                    </svg>
                </motion.div>
            </motion.button>

            {/* Panneau de logs */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        className={styles.logPanel}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 160, opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                    >
                        <div className={styles.logContent}>
                            {logs.length === 0 ? (
                                <span className={styles.empty}>Aucun log pour l'instant...</span>
                            ) : (
                                [...logs].reverse().map((log, i) => (
                                    <div key={i} className={styles.logEntry}>
                                        <span className={styles.logText}>{log}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
