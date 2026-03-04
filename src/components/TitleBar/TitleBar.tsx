import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLauncher } from '../../context/LauncherContext';
import styles from './TitleBar.module.css';

interface TitleBarProps {
    onOpenSettings?: () => void;
}

interface DiscordUser {
    id: string;
    username: string;
    discriminator: string;
    avatarUrl: string | null; // data: URL (base64, résolu côté backend)
}

export const TitleBar: React.FC<TitleBarProps> = ({ onOpenSettings }) => {
    const { state } = useLauncher();
    const [discordUser, setDiscordUser] = useState<DiscordUser | null>(null);
    const [connecting, setConnecting] = useState(true);
    const [showCloseConfirm, setShowCloseConfirm] = useState(false);

    // ── Écouter les événements Discord ────────────────────────────────────────
    useEffect(() => {
        // Récupération initiale (si already connected)
        window.electronAPI.discordGetUser().then((u) => {
            if (u) {
                setDiscordUser(u as DiscordUser);
                setConnecting(false);
            }
        });

        // Changements de user (connexion / déconnexion)
        window.electronAPI.onDiscordUser((u) => {
            setDiscordUser(u as DiscordUser | null);
            setConnecting(false);
        });

        // Indicateur de connexion en cours
        window.electronAPI.onDiscordConnecting((v: boolean) => {
            setConnecting(v);
        });

        // Timeout de sécurité — si Discord ne répond pas en 25s, on arrête le "Connexion..."
        const safetyTimer = setTimeout(() => setConnecting(false), 25000);

        // Demande de confirmation de fermeture depuis le main process
        window.electronAPI.onConfirmClose(() => setShowCloseConfirm(true));

        return () => {
            clearTimeout(safetyTimer);
            window.electronAPI.removeAllListeners('discord:user-ready');
            window.electronAPI.removeAllListeners('discord:connecting');
            window.electronAPI.removeAllListeners('window:confirm-close');
        };
    }, []);

    const displayName = discordUser
        ? discordUser.discriminator && discordUser.discriminator !== '0'
            ? `${discordUser.username}#${discordUser.discriminator}`
            : discordUser.username
        : null;

    return (
        <>
        {/* ── Modale confirmation fermeture ──────────────────── */}
        <AnimatePresence>
            {showCloseConfirm && (
                <motion.div
                    className={styles.confirmOverlay}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                >
                    <motion.div
                        className={styles.confirmBox}
                        initial={{ scale: 0.88, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.88, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                    >
                        <svg className={styles.confirmIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        </svg>
                        <p className={styles.confirmTitle}>Quitter le launcher</p>
                        <p className={styles.confirmMsg}>Vous êtes actuellement en jeu.<br/>Fermer le launcher <strong>mettra fin à la session</strong> et fermera Project Zomboid.</p>
                        <div className={styles.confirmBtns}>
                            <motion.button
                                className={styles.confirmCancel}
                                onClick={() => setShowCloseConfirm(false)}
                                whileHover={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
                                whileTap={{ scale: 0.96 }}
                            >
                                Annuler
                            </motion.button>
                            <motion.button
                                className={styles.confirmQuit}
                                onClick={() => { setShowCloseConfirm(false); window.electronAPI.closeWindowConfirmed(); }}
                                whileHover={{ backgroundColor: 'rgba(220,60,60,0.85)' }}
                                whileTap={{ scale: 0.96 }}
                            >
                                Quitter quand même
                            </motion.button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
        <div className={styles.titleBar}>
            {/* Drag region */}
            <div className={styles.dragRegion} />

            {/* ── Gauche : Logo ─────────────────────────────────────── */}
            <div className={styles.left}>
                <div className={styles.logoMark}>
                    <span className={styles.logoIcon}>⬡</span>
                </div>
                <span className={styles.title}>LA STATION</span>
            </div>

            {/* ── Centre : EN JEU ───────────────────────────────────── */}
            <div className={styles.center}>
                {state.sessionStatus === 'running' && (
                    <motion.div
                        className={styles.statusIndicator}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                    >
                        <span className={`${styles.statusDot} ${styles.running}`} />
                        <span>EN JEU</span>
                    </motion.div>
                )}
            </div>

            {/* ── Droite : Discord + contrôles ──────────────────────── */}
            <div className={styles.rightArea}>

                <AnimatePresence mode="wait">
                    {/* ── Connexion en cours ─── */}
                    {connecting && !discordUser && (
                        <motion.div
                            key="connecting"
                            className={styles.discordConnecting}
                            initial={{ opacity: 0, x: 8 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 8 }}
                            transition={{ duration: 0.2 }}
                        >
                            <span className={styles.connectingDots}>
                                <span /><span /><span />
                            </span>
                            <span className={styles.connectingLabel}>Discord</span>
                        </motion.div>
                    )}

                    {/* ── Connecté : badge user ─── */}
                    {!connecting && discordUser && (
                        <motion.div
                            key="user"
                            className={styles.discordBadge}
                            initial={{ opacity: 0, x: 8 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 8 }}
                            transition={{ duration: 0.25 }}
                            title={`Discord: ${displayName} — ID: ${discordUser.id}`}
                        >
                            {discordUser.avatarUrl ? (
                                <img
                                    src={discordUser.avatarUrl}
                                    alt={discordUser.username}
                                    className={styles.discordAvatar}
                                />
                            ) : (
                                <div className={styles.discordAvatarPlaceholder}>
                                    {discordUser.username[0]?.toUpperCase()}
                                </div>
                            )}
                            <span className={styles.discordUsername}>{discordUser.username}</span>
                            <span className={styles.discordDot} />
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Paramètres — en haut à droite */}
                {onOpenSettings && (
                    <motion.button
                        className={styles.settingsBtn}
                        onClick={onOpenSettings}
                        whileHover={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
                        whileTap={{ scale: 0.95 }}
                        title="Paramètres"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                        </svg>
                    </motion.button>
                )}

                {/* Boutons fenêtre */}
                <div className={styles.controls}>
                    <motion.button
                        className={styles.controlBtn}
                        onClick={() => window.electronAPI.minimizeWindow()}
                        whileHover={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
                        whileTap={{ scale: 0.95 }}
                        title="Réduire"
                    >
                        <svg width="12" height="12" viewBox="0 0 12 12">
                            <rect x="1" y="5.5" width="10" height="1" fill="currentColor" />
                        </svg>
                    </motion.button>

                    <motion.button
                        className={styles.controlBtn}
                        onClick={() => window.electronAPI.maximizeWindow()}
                        whileHover={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
                        whileTap={{ scale: 0.95 }}
                        title="Agrandir"
                    >
                        <svg width="12" height="12" viewBox="0 0 12 12">
                            <rect x="1.5" y="1.5" width="9" height="9" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
                        </svg>
                    </motion.button>

                    <motion.button
                        className={`${styles.controlBtn} ${styles.closeBtn}`}
                        onClick={() => window.electronAPI.closeWindow()}
                        whileHover={{ backgroundColor: 'rgba(220, 50, 50, 0.7)' }}
                        whileTap={{ scale: 0.95 }}
                        title="Fermer"
                    >
                        <svg width="12" height="12" viewBox="0 0 12 12">
                            <line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            <line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                    </motion.button>
                </div>
            </div>
        </div>
        </>
    );
};
