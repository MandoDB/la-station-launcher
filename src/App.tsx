import React, { useState, useMemo, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LauncherProvider } from './context/LauncherContext';
import { TitleBar } from './components/TitleBar/TitleBar';
import { MainPage } from './pages/MainPage/MainPage';
import { ToastContainer } from './components/ToastContainer/ToastContainer';
import { Settings } from './pages/Settings/Settings';
import { LegalNotice, hasAcceptedLegal } from './components/LegalNotice/LegalNotice';
import { CaptureNotification } from './components/CaptureNotification/CaptureNotification';
import { SnippetTool } from './components/SnippetTool/SnippetTool';
import { RecorderTool } from './components/RecorderTool/RecorderTool';
import { ScreenshotModal } from './components/ScreenshotModal/ScreenshotModal';
import { RecordingNotification } from './components/RecordingNotification/RecordingNotification';
import { RecordingIndicator } from './components/RecordingIndicator/RecordingIndicator';
import { RecordingSavedNotification } from './components/RecordingSavedNotification/RecordingSavedNotification';

const App: React.FC = () => {
    const [legalAccepted, setLegalAccepted] = useState(true); // True par défaut pour éviter le flash, on check après
    const [showSettings, setShowSettings] = useState(false);
    const [launcherUpdate, setLauncherUpdate] = useState<{ version: string } | null>(null);
    const [installing, setInstalling] = useState(false);
    const [autoScreenshot, setAutoScreenshot] = useState<string | null>(null);

    const [isNotification, setIsNotification] = useState(() => window.location.hash.includes('capture-notification'));
    const [isSnippet, setIsSnippet] = useState(() => window.location.hash.includes('snippet-tool'));
    const [isShare, setIsShare] = useState(() => window.location.hash.includes('share-screenshot'));
    const [isRecorder, setIsRecorder] = useState(() => window.location.hash.includes('recorder-tool'));
    const [isRecordingNotification, setIsRecordingNotification] = useState(() => window.location.hash.includes('recording-notification'));
    const [isRecordingIndicator, setIsRecordingIndicator] = useState(() => window.location.hash.includes('recording-indicator'));
    const [isRecordingSavedNotification, setIsRecordingSavedNotification] = useState(() => window.location.hash.includes('recording-saved-notification'));

    const showLegalNotice = useMemo(() => !legalAccepted && !isNotification && !isSnippet && !isShare && !isRecorder, [legalAccepted, isNotification, isSnippet, isShare, isRecorder]);

    useEffect(() => {
        const handleHashChange = () => {
            setIsNotification(window.location.hash.includes('capture-notification'));
            setIsSnippet(window.location.hash.includes('snippet-tool'));
            setIsShare(window.location.hash.includes('share-screenshot'));
            setIsRecorder(window.location.hash.includes('recorder-tool'));
            setIsRecordingNotification(window.location.hash.includes('recording-notification'));
            setIsRecordingIndicator(window.location.hash.includes('recording-indicator'));
            setIsRecordingSavedNotification(window.location.hash.includes('recording-saved-notification'));
        };
        window.addEventListener('hashchange', handleHashChange);
        return () => window.removeEventListener('hashchange', handleHashChange);
    }, []);

    useEffect(() => {
        // Vérifier si une mise à jour a déjà été téléchargée avant le chargement de l'UI
        window.electronAPI.updaterIsReady().then((ready) => {
            if (ready) setLauncherUpdate({ version: '' });
        }).catch(() => {});

        window.electronAPI.onUpdaterDownloaded((data) => {
            setLauncherUpdate({ version: data.version });
        });

        window.electronAPI.onShowScreenshotModal((path) => {
            setAutoScreenshot(path);
        });

        // Vérifier les mentions légales
        hasAcceptedLegal().then(setLegalAccepted);

        return () => {
            window.electronAPI.removeAllListeners('updater:downloaded');
            window.electronAPI.removeAllListeners('screenshot:open-modal');
        };
    }, []);

    if (isRecorder) {
        return (
            <RecorderTool />
        );
    }

    const handleInstall = async () => {
        setInstalling(true);
        await window.electronAPI.updaterQuitAndInstall();
    };

    if (isNotification) {
        return (
            <div className="notification-wrapper">
                <CaptureNotification />
            </div>
        );
    }

    if (isSnippet) {
        return (
            <SnippetTool />
        );
    }

    if (isRecordingNotification) {
        return (
            <div className="notification-wrapper">
                <RecordingNotification />
            </div>
        );
    }

    if (isRecordingIndicator) {
        return (
            <RecordingIndicator />
        );
    }

    if (isRecordingSavedNotification) {
        return (
            <div className="notification-wrapper">
                <RecordingSavedNotification />
            </div>
        );
    }

    if (isShare) {
        const hash = window.location.hash;
        const params = new URLSearchParams(hash.split('?')[1]);
        const sharePath = params.get('path');
        if (!sharePath) return null;

        return (
            <div className="share-wrapper">
                <ScreenshotModal 
                    screenshot={{ path: decodeURIComponent(sharePath), id: '', timestamp: 0, filename: '' }} 
                    onClose={() => window.electronAPI.screenshotShareCancel()} 
                />
            </div>
        );
    }

    return (
        <LauncherProvider>
            <div className="app-wrapper">
                <TitleBar onOpenSettings={() => setShowSettings(true)} />
                <MainPage updatePending={!!launcherUpdate} />
                <ToastContainer />

                {/* ── Modale mise à jour launcher (bloquante) ── */}
                <AnimatePresence>
                    {launcherUpdate && (
                        <>
                            {/* Fond flouté */}
                            <motion.div
                                key="update-backdrop"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                style={{
                                    position: 'fixed', inset: 0,
                                    background: 'rgba(0,0,0,0.72)',
                                    backdropFilter: 'blur(6px)',
                                    zIndex: 8000,
                                }}
                            />
                            {/* Boîte centrale */}
                            <motion.div
                                key="update-modal"
                                initial={{ opacity: 0, scale: 0.88, y: 12 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.88, y: 12 }}
                                transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                                style={{
                                    position: 'fixed',
                                    inset: 0,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    zIndex: 8001,
                                    pointerEvents: 'none',
                                }}
                            >
                                <div style={{
                                    pointerEvents: 'all',
                                    width: 380,
                                    background: '#0d0d0d',
                                    border: '1px solid rgba(245,158,11,0.3)',
                                    borderRadius: 12,
                                    boxShadow: '0 0 0 1px rgba(245,158,11,0.08), 0 32px 64px rgba(0,0,0,0.9)',
                                    padding: '28px 28px 24px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: 0,
                                    textAlign: 'center',
                                }}>
                                    {/* Icône */}
                                    <div style={{
                                        width: 48, height: 48, borderRadius: '50%',
                                        background: 'rgba(245,158,11,0.1)',
                                        border: '1px solid rgba(245,158,11,0.25)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        marginBottom: 16,
                                    }}>
                                        <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.8" width="22" height="22">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M16 10l-4-4-4 4M12 6v10"/>
                                        </svg>
                                    </div>

                                    {/* Titre */}
                                    <p style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 6, letterSpacing: '0.02em' }}>
                                        Mise à jour disponible
                                    </p>

                                    {/* Sous-titre */}
                                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 20, lineHeight: 1.5 }}>
                                        {launcherUpdate.version
                                            ? <>La version <strong style={{ color: 'rgba(255,255,255,0.7)' }}>v{launcherUpdate.version}</strong> du launcher est prête à être installée.</>
                                            : 'Une nouvelle version du launcher est prête à être installée.'
                                        }
                                        <br />
                                        Le jeu ne peut pas être lancé avant la mise à jour.
                                    </p>

                                    {/* Bouton */}
                                    <motion.button
                                        onClick={handleInstall}
                                        disabled={installing}
                                        whileHover={!installing ? { scale: 1.03, backgroundColor: 'rgba(245,158,11,0.22)' } : {}}
                                        whileTap={!installing ? { scale: 0.97 } : {}}
                                        style={{
                                            width: '100%',
                                            padding: '11px 0',
                                            borderRadius: 8,
                                            border: '1px solid rgba(245,158,11,0.4)',
                                            background: installing ? 'rgba(255,255,255,0.04)' : 'rgba(245,158,11,0.12)',
                                            color: installing ? 'rgba(255,255,255,0.3)' : '#f59e0b',
                                            fontSize: 13,
                                            fontWeight: 700,
                                            cursor: installing ? 'default' : 'pointer',
                                            letterSpacing: '0.06em',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: 8,
                                        }}
                                    >
                                        {installing ? (
                                            <>
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14" style={{ animation: 'spin 1s linear infinite' }}>
                                                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                                                </svg>
                                                Installation en cours…
                                            </>
                                        ) : (
                                            <>
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M16 10l-4-4-4 4M12 6v10"/>
                                                </svg>
                                                Installer et relancer
                                            </>
                                        )}
                                    </motion.button>
                                </div>
                            </motion.div>
                        </>
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

                <AnimatePresence>
                    {autoScreenshot && (
                        <ScreenshotModal 
                            screenshot={{ path: autoScreenshot, id: '', timestamp: 0, filename: '' }} 
                            onClose={() => setAutoScreenshot(null)} 
                        />
                    )}
                </AnimatePresence>
            </div>
        </LauncherProvider>
    );
};

export default App;
