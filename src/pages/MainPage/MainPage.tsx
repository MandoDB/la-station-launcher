import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLauncher } from '../../context/LauncherContext';
import { HeroBackground } from '../../components/HeroBackground/HeroBackground';
import { PlayButton } from '../../components/PlayButton/PlayButton';
import { PatchStatus } from '../../components/PatchStatus/PatchStatus';
import { LogPanel } from '../../components/LogPanel/LogPanel';
import { OnboardingScreen } from '../../components/OnboardingScreen/OnboardingScreen';
import { ConsoleViewer } from '../../components/ConsoleViewer/ConsoleViewer';
import { ScreenshotModal } from '../../components/ScreenshotModal/ScreenshotModal';
import { GalleryModal } from '../../components/GalleryModal/GalleryModal';
import { ServerInfo } from '../../types/electron';
import styles from './MainPage.module.css';

const DISCORD_URL = 'https://discord.gg/WuYScmW56m'; // ← Remplacer par ton lien Discord
const WEBSITE_URL = 'https://la-station.org';      // ← Remplacer par ton lien web

// Logo depuis assets/logo.png (fourni par l'utilisateur)
let logoSrc: string | null = null;
try {
    logoSrc = new URL('/assets/logo.png', import.meta.url).href;
} catch {
    logoSrc = null;
}

// Convertit le Markdown basique (## titres, - listes) en JSX sans dépendance
function renderChangelog(md: string): React.ReactNode {
    return md.split('\n').map((line, i) => {
        const h2 = line.match(/^##\s+(.*)/);
        if (h2) return <p key={i} className={styles.clTitle}>{h2[1]}</p>;
        const li = line.match(/^[-*]\s+(.*)/);
        if (li) return <p key={i} className={styles.clItem}><span className={styles.clBullet}>▸</span>{li[1]}</p>;
        if (line.trim() === '') return <div key={i} className={styles.clSpacer} />;
        return <p key={i} className={styles.clText}>{line}</p>;
    });
}

interface MainPageProps {
    updatePending?: boolean;
}

export const MainPage: React.FC<MainPageProps> = ({ updatePending = false }) => {
    const { state, dispatch } = useLauncher();
    const { showOnboarding, isLoading, gamePath, localVersion, pendingScreenshot } = state;
    const [logoError, setLogoError] = useState(false);
    const [showConsole, setShowConsole] = useState(false);
    const [showGallery, setShowGallery] = useState(false);
    const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);

    // Requête initiale + abonnement aux mises à jour du main process
    useEffect(() => {
        window.electronAPI.serverQuery().then(setServerInfo).catch(() => {});
        window.electronAPI.onServerPlayers(setServerInfo);
        return () => { window.electronAPI.removeAllListeners('server:players'); };
    }, []);


    if (isLoading) {
        return (
            <div className={styles.loading}>
                <div className={styles.loadingSpinner} />
            </div>
        );
    }

    return (
        <div className={styles.page}>
            <HeroBackground />

            {/* ── Compteur joueurs (haut gauche) ────────────────── */}
            <motion.div
                className={styles.serverWidget}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3, duration: 0.4 }}
            >
                {serverInfo === null ? (
                    <span className={styles.serverLoading}>
                        <span className={styles.serverDot} />
                        Connexion...
                    </span>
                ) : serverInfo.online ? (
                    <span className={styles.serverOnline}>
                        <span className={styles.serverDotOnline} />
                        <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12" style={{ flexShrink: 0 }}>
                            <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
                        </svg>
                        <strong>{serverInfo.players}</strong>
                        <span className={styles.serverMax}>/ {serverInfo.maxPlayers}</span>
                    </span>
                ) : (
                    <span className={styles.serverOffline}>
                        <span className={styles.serverDotOffline} />
                        Hors ligne
                    </span>
                )}
            </motion.div>

            {/* ── Changelog (gauche, sous le compteur) ─────────── */}
            {localVersion?.changelog && !showOnboarding && (
                <motion.div
                    className={styles.changelogWidget}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.45, duration: 0.4 }}
                >
                    <div className={styles.clHeader}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="12" height="12">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                            <polyline points="10 9 9 9 8 9" />
                        </svg>
                        <span>Notes de patch</span>
                        {localVersion.version && (
                            <span className={styles.clVersion}>v{localVersion.version}</span>
                        )}
                    </div>
                    <div className={styles.clBody}>
                        {renderChangelog(localVersion.changelog)}
                    </div>
                </motion.div>
            )}

            <AnimatePresence>
                {showOnboarding && <OnboardingScreen key="onboarding" />}
            </AnimatePresence>

            <AnimatePresence>
                {showConsole && <ConsoleViewer key="console" onClose={() => setShowConsole(false)} />}
                {showGallery && <GalleryModal key="gallery" onClose={() => setShowGallery(false)} />}
                {pendingScreenshot && (
                    <ScreenshotModal 
                        key="screenshot" 
                        screenshot={pendingScreenshot} 
                        onClose={() => dispatch({ type: 'SET_PENDING_SCREENSHOT', payload: null })} 
                    />
                )}
            </AnimatePresence>

            {!showOnboarding && (
                <div className={styles.mainLayout}>
                    {/* ── Zone centrale ────────────────────────────── */}
                    <div className={styles.hero}>
                        {/* Logo / Titre */}
                        <motion.div
                            className={styles.gameTitle}
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.15, duration: 0.5 }}
                        >
                            {logoSrc && !logoError ? (
                                <img
                                    src={logoSrc}
                                    alt="LA STATION"
                                    className={styles.logoImg}
                                    onError={() => setLogoError(true)}
                                />
                            ) : (
                                <h1 className={styles.gameName}>LA STATION</h1>
                            )}
                        </motion.div>

                        {/* Séparateur */}
                        <motion.div
                            className={styles.separator}
                            initial={{ scaleX: 0, opacity: 0 }}
                            animate={{ scaleX: 1, opacity: 1 }}
                            transition={{ delay: 0.3, duration: 0.6 }}
                        />

                        {/* Bouton JOUER */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4, duration: 0.5 }}
                        >
                            <PlayButton updatePending={updatePending} />
                        </motion.div>

                    </div>

                    {/* ── Footer ───────────────────────────────────── */}
                    <div className={styles.footer}>
                        {/* Patch status */}
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.5, duration: 0.4 }}
                        >
                            <PatchStatus />
                        </motion.div>

                        <motion.div
                            className={styles.footerRight}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.5, duration: 0.4 }}
                        >
                            {/* Galerie */}
                            <motion.button
                                className={styles.galleryBtn}
                                onClick={() => setShowGallery(true)}
                                whileHover={{ scale: 1.04 }}
                                whileTap={{ scale: 0.96 }}
                                title="Galerie des captures d'écran"
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="14" height="14">
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                    <circle cx="8.5" cy="8.5" r="1.5" />
                                    <polyline points="21 15 16 10 5 21" />
                                </svg>
                                <span>Galerie</span>
                            </motion.button>

                            {/* Console PZ */}
                            <motion.button
                                id="btn-console"
                                className={styles.consoleBtn}
                                onClick={() => setShowConsole(true)}
                                whileHover={{ scale: 1.04 }}
                                whileTap={{ scale: 0.96 }}
                                title="Ouvrir la console du jeu"
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="14" height="14">
                                    <polyline points="4 17 10 11 4 5" />
                                    <line x1="12" y1="19" x2="20" y2="19" />
                                </svg>
                                <span>Console</span>
                            </motion.button>

                            {/* Site Internet */}
                            <motion.button
                                className={styles.websiteBtn}
                                onClick={() => window.electronAPI.openExternal(WEBSITE_URL)}
                                whileHover={{ scale: 1.04 }}
                                whileTap={{ scale: 0.96 }}
                                title="Visiter le site web"
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="14" height="14">
                                    <circle cx="12" cy="12" r="10" />
                                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                                    <path d="M2 12h20" />
                                </svg>
                                <span>Site Internet</span>
                            </motion.button>

                            {/* Discord */}
                            <motion.button
                                className={styles.discordBtn}
                                onClick={() => window.electronAPI.openExternal(DISCORD_URL)}
                                whileHover={{ scale: 1.04 }}
                                whileTap={{ scale: 0.96 }}
                                title="Rejoindre le Discord"
                            >
                                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
                                </svg>
                                <span>Rejoindre le Discord</span>
                            </motion.button>

                        </motion.div>
                    </div>
                </div>
            )}

            <motion.div
                className={styles.logsWrapper}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7 }}
            >
                <LogPanel />
            </motion.div>
        </div>
    );
};
