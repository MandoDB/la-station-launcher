import React, { useState, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { LauncherProvider } from './context/LauncherContext';
import { TitleBar } from './components/TitleBar/TitleBar';
import { MainPage } from './pages/MainPage/MainPage';
import { ToastContainer } from './components/ToastContainer/ToastContainer';
import { Settings } from './pages/Settings/Settings';
import { LegalNotice, hasAcceptedLegal } from './components/LegalNotice/LegalNotice';

/**
 * Racine de l'application.
 * Structure : TitleBar (fixe) + MainPage (flex-1) + ToastContainer (overlay)
 * Premier lancement : écran mentions légales RGPD (sans refus).
 */
const App: React.FC = () => {
    const [legalAccepted, setLegalAccepted] = useState(() => hasAcceptedLegal());
    const [showSettings, setShowSettings] = useState(false);

    const showLegalNotice = useMemo(() => !legalAccepted, [legalAccepted]);

    return (
        <LauncherProvider>
            <div className="app-wrapper">
                <TitleBar onOpenSettings={() => setShowSettings(true)} />
                <MainPage />
                <ToastContainer />

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
