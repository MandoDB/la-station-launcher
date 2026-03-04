import React from 'react';
import { motion } from 'framer-motion';
import { MENTIONS_LEGALES_URL } from '../../pages/Settings/Settings';
import styles from './LegalNotice.module.css';

interface LegalNoticeProps {
    onAccept: () => void;
}

const LEGAL_STORAGE_KEY = 'launcher_legal_accepted';

export function hasAcceptedLegal(): boolean {
    try {
        return localStorage.getItem(LEGAL_STORAGE_KEY) === '1';
    } catch {
        return false;
    }
}

export function setLegalAccepted(): void {
    try {
        localStorage.setItem(LEGAL_STORAGE_KEY, '1');
    } catch { /* ignore */ }
}

/**
 * Écran des mentions légales RGPD au premier lancement.
 * Affiché sans possibilité de refuser — un seul bouton "J'ai compris".
 */
export const LegalNotice: React.FC<LegalNoticeProps> = ({ onAccept }) => {
    const handleAccept = () => {
        setLegalAccepted();
        onAccept();
    };

    return (
        <motion.div
            className={styles.overlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
        >
            <motion.div
                className={styles.card}
                initial={{ opacity: 0, y: 30, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.35 }}
            >
                <div className={styles.iconWrapper}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="32" height="32">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                    </svg>
                </div>

                <h2 className={styles.title}>Mentions légales & RGPD</h2>
                <p className={styles.description}>
                    Conformément au Règlement Général sur la Protection des Données (RGPD),
                    nous vous invitons à prendre connaissance de nos mentions légales et de notre
                    politique de confidentialité avant d'utiliser le launcher.
                </p>

                <a
                    href={MENTIONS_LEGALES_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.legalLink}
                    onClick={(e) => {
                        e.preventDefault();
                        window.electronAPI.openExternal(MENTIONS_LEGALES_URL);
                    }}
                >
                    Consulter les mentions légales (nouvelle fenêtre)
                </a>

                <p className={styles.disclaimer}>
                    En poursuivant, vous confirmez avoir pris connaissance de ces informations.
                </p>

                <motion.button
                    className={styles.acceptBtn}
                    onClick={handleAccept}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                >
                    J'ai compris
                </motion.button>
            </motion.div>
        </motion.div>
    );
};
