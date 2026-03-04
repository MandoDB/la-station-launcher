import React, { useState, useMemo, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LauncherProvider } from './context/LauncherContext';
import { TitleBar } from './components/TitleBar/TitleBar';
import { MainPage } from './pages/MainPage/MainPage';
import { ToastContainer } from './components/ToastContainer/ToastContainer';
import { Settings } from './pages/Settings/Settings';
import { LegalNotice, hasAcceptedLegal } from './components/LegalNotice/LegalNotice';

const App: React.FC = () => {
    const [legalAccepted, setLegalAccepted] = useState(() => hasAcceptedLegal());
    const [showSettings, setShowSettings] = useState(false);
    const [launcherUpdate, setLauncherUpdate] = useState<{ version: string } | null>(null);
    const [installing, setInstalling] = useState(false);

    const showLegalNotice = useMemo(() => !legalAccepted, [legalAccepted]);

    useEffect(() => {
        // Vérifier si une mise à jour a déjà été téléchargée avant le chargement de l'UI
        window.electronAPI.updaterIsReady().then((ready) => {
            if (ready) setLauncherUpdate({ version: '' });
        }).catch(() => {});

        window.electronAPI.onUpdaterDownloaded((data) => {
            setLauncherUpdate({ version: data.version });
        });

        return () => {
            window.electronAPI.removeAllListeners('updater:downloaded');
        };
    }, []);

    const handleInstall = async () => {
        setInstalling(true);
        await window.electronAPI.updaterQuitAndInstall();
    };

    return (
        <LauncherProvider>
            <div className="app-wrapper">
                <TitleBar onOpenSettings={() => setShowSettings(true)} />
                <MainPage />
                <ToastContainer />

                {/* ── Bannière mise à jour launcher ── */}
                <AnimatePresence>
                    {launcherUpdate && (
                        <motion.div
                            key="launcher-update"
                            initial={{ y: 60, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 60, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                            style={{
                                position: 'fixed',
                                bottom: 16,
                                left: '50%',
                                transform: 'translateX(-50%)',
                                zIndex: 8000,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 14,
                                padding: '10px 20px',
                                background: '#18181b',
                                border: '1px solid rgba(255,255,255,0.12)',
                                borderRadius: 10,
                                boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                                fontSize: 13,
                                color: 'rgba(255,255,255,0.85)',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.8" width="18" height="18">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M16 10l-4-4-4 4M12 6v10"/>
                            </svg>
                            <span>
                                Mise à jour du launcher disponible
                                {launcherUpdate.version ? ` (v${launcherUpdate.version})` : ''}
                            </span>
                            <motion.button
                                onClick={handleInstall}
                                disabled={installing}
                                whileHover={!installing ? { scale: 1.04 } : {}}
                                whileTap={!installing ? { scale: 0.97 } : {}}
                                style={{
                                    padding: '6px 14px',
                                    borderRadius: 6,
                                    border: 'none',
                                    background: installing ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.12)',
                                    color: installing ? 'rgba(255,255,255,0.35)' : '#fff',
                                    fontSize: 12,
                                    fontWeight: 600,
                                    cursor: installing ? 'default' : 'pointer',
                                    letterSpacing: '0.04em',
                                }}
                            >
                                {installing ? 'Installation...' : 'Installer et relancer'}
                            </motion.button>
                            {!installing && (
                                <motion.button
                                    onClick={() => setLauncherUpdate(null)}
                                    whileHover={{ opacity: 0.7 }}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', padding: 4 }}
                                    title="Ignorer"
                                >
                                    <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.5">
                                        <line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/>
                                    </svg>
                                </motion.button>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>

                <AnimatePresence>
                    {showSettings && (
                        <Settings key="settings" onClose={() => setShowSettings(false)} />
                    )}
                </AnimatePresence>

                <AnimatePresence>
                    {showLegalNotice && (
                        <LegalNotice key="legal" onAccept={() => setLegalAccepted(true)} />
                    )}
                </AnimatePresence>
            </div>
        </LauncherProvider>
    );
};

export default App;
