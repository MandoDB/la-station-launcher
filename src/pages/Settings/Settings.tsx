import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import styles from './Settings.module.css';

export const MENTIONS_LEGALES_URL = 'https://wiki.la-station.org/s/mentions-legales'; // ← Remplacer par le lien fourni

interface SettingsProps {
    onClose: () => void;
}

export const Settings: React.FC<SettingsProps> = ({ onClose }) => {
    const [rpcEnabled, setRpcEnabled] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        window.electronAPI.settingsGet().then((s) => {
            setRpcEnabled(s.discordRpcEnabled !== false);
        }).catch(() => {});
    }, []);

    const handleRpcToggle = async () => {
        const next = !rpcEnabled;
        setRpcEnabled(next);
        setSaving(true);
        try {
            await window.electronAPI.settingsSet({ discordRpcEnabled: next });
        } finally {
            setSaving(false);
        }
    };

    return (
        <motion.div
            className={styles.overlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <motion.div
                className={styles.panel}
                initial={{ opacity: 0, y: 20, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.25 }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <div className={styles.headerIcon}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
                                <circle cx="12" cy="12" r="3" />
                                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                            </svg>
                        </div>
                        <span className={styles.headerTitle}>PARAMÈTRES</span>
                    </div>
                    <button className={styles.closeBtn} onClick={onClose} title="Fermer">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                <div className={styles.content}>

                    {/* ── Discord Rich Presence ───────────────────────── */}
                    <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>Discord</h3>
                        <div className={styles.toggleRow}>
                            <div className={styles.toggleInfo}>
                                <span className={styles.toggleLabel}>Rich Presence</span>
                                <span className={styles.toggleDesc}>
                                    Affiche ton statut de jeu sur ton profil Discord
                                </span>
                            </div>
                            <button
                                className={`${styles.toggle} ${rpcEnabled ? styles.toggleOn : ''}`}
                                onClick={handleRpcToggle}
                                disabled={saving}
                                aria-label={rpcEnabled ? 'Désactiver le Rich Presence' : 'Activer le Rich Presence'}
                            >
                                <span className={styles.toggleThumb} />
                            </button>
                        </div>
                    </section>

                    <div className={styles.divider} />

                    {/* ── Mentions légales ────────────────────────────── */}
                    <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>Mentions légales & RGPD</h3>
                        <p className={styles.sectionDesc}>
                            Consultez nos mentions légales et notre politique de confidentialité.
                        </p>
                        <a
                            href={MENTIONS_LEGALES_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.linkBtn}
                            onClick={(e) => { e.preventDefault(); window.electronAPI.openExternal(MENTIONS_LEGALES_URL); }}
                        >
                            <span>Voir les mentions légales</span>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                <polyline points="15 3 21 3 21 9" />
                                <line x1="10" y1="14" x2="21" y2="3" />
                            </svg>
                        </a>
                    </section>
                </div>
            </motion.div>
        </motion.div>
    );
};
