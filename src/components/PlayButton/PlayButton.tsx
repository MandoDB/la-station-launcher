import React, { useState, useEffect, useRef } from 'react';

import { motion, AnimatePresence } from 'framer-motion';
import { useLauncher } from '../../context/LauncherContext';
import styles from './PlayButton.module.css';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const stepLabels: Record<string, string> = {
    check: 'Vérification',
    download: 'Téléchargement',
    inject: 'Injection',
    ready: 'Prêt',
};

// ─── Composant principal ──────────────────────────────────────────────────────
export const PlayButton: React.FC = () => {
    const { state, handlePlay, handleQuitSession } = useLauncher();
    const { sessionStatus, sessionElapsed, patchProgress, gamePath } = state;
    const [showQuitConfirm, setShowQuitConfirm] = useState(false);

    const isIdle = sessionStatus === 'idle' || sessionStatus === 'done';
    const isPatching = sessionStatus === 'patching';
    const isLaunching = sessionStatus === 'launching';
    const isRunning = sessionStatus === 'running';
    const isRestoring = sessionStatus === 'restoring';
    const isError = sessionStatus === 'error';

    const canPlay = !!gamePath && isIdle;

    // ── Timer local — 1 tick/s indépendant des événements IPC ───────────────
    const [localElapsed, setLocalElapsed] = useState(0);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (isRunning) {
            // Initialiser depuis la valeur backend si disponible
            setLocalElapsed(sessionElapsed);
            intervalRef.current = setInterval(() => {
                setLocalElapsed((prev) => prev + 1);
            }, 1000);
        } else {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            setLocalElapsed(0);
        }
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [isRunning]);

    // Synchroniser avec le backend si celui-ci envoie une valeur plus récente
    useEffect(() => {
        if (isRunning && sessionElapsed > localElapsed) {
            setLocalElapsed(sessionElapsed);
        }
    }, [sessionElapsed]);

    // ── Rendu selon l'état ───────────────────────────────────────────────────
    return (
        <div className={styles.container}>
            <AnimatePresence mode="wait">

                {/* ── État normal : JOUER ────────────────────────────────────────── */}
                {isIdle && (
                    <motion.div
                        key="idle"
                        className={styles.wrapper}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ duration: 0.3 }}
                    >
                        <motion.button
                            className={`${styles.playBtn} ${!canPlay ? styles.disabled : ''}`}
                            onClick={handlePlay}
                            disabled={!canPlay}
                            whileHover={canPlay ? { scale: 1.03 } : {}}
                            whileTap={canPlay ? { scale: 0.97 } : {}}
                        >
                            {/* Glow animé */}
                            <span className={styles.btnGlow} />

                            {/* Icône play */}
                            <span className={styles.playIcon}>
                                <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
                                    <path d="M8 5v14l11-7z" />
                                </svg>
                            </span>

                            <span className={styles.btnLabel}>JOUER</span>

                            {!gamePath && (
                                <span className={styles.btnSublabel}>Jeu non détecté</span>
                            )}
                        </motion.button>

                        {/* Badge version si disponible */}
                        {state.localVersion && (
                            <motion.div
                                className={styles.versionBadge}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 }}
                            >
                                Patch v{state.localVersion.version}
                            </motion.div>
                        )}
                    </motion.div>
                )}

                {/* ── Patching / Téléchargement ──────────────────────────────────── */}
                {(isPatching || isLaunching) && (
                    <motion.div
                        key="patching"
                        className={styles.progressWrapper}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.4 }}
                    >
                        {/* Étapes visuelles */}
                        <PatchSteps currentStep={patchProgress?.step ?? 'check'} isLaunching={isLaunching} />

                        {/* Barre de progression */}
                        {patchProgress && (
                            <div className={styles.progressBarWrapper}>
                                <motion.div
                                    className={styles.progressBar}
                                    initial={{ width: 0 }}
                                    animate={{ width: `${patchProgress.progress}%` }}
                                    transition={{ duration: 0.5, ease: 'easeOut' }}
                                />
                                <span className={styles.progressPercent}>
                                    {patchProgress.progress}%
                                </span>
                            </div>
                        )}

                        {/* Loader spinner si lancement */}
                        {isLaunching && (
                            <div className={styles.launchingState}>
                                <div className={styles.spinner} />
                                <span>Démarrage de Project Zomboid...</span>
                            </div>
                        )}
                    </motion.div>
                )}

                {/* ── En jeu : bouton QUITTER LA SESSION ────────────────── */}
                {isRunning && (
                    <motion.div
                        key="running"
                        className={styles.runningWrapper}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ duration: 0.35 }}
                    >
                        {/* Timer session */}
                        <div className={styles.sessionTimer}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                                <circle cx="12" cy="12" r="10" />
                                <polyline points="12 6 12 12 15 15" />
                            </svg>
                            <span>{formatTime(localElapsed)}</span>

                        </div>

                        {/* Bouton quitter */}
                        <motion.button
                            className={styles.quitBtn}
                            onClick={() => setShowQuitConfirm(true)}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.97 }}
                        >
                            {/* Scan line */}
                            <span className={styles.quitScanLine} />

                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="16" height="16">
                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                <polyline points="16 17 21 12 16 7" />
                                <line x1="21" y1="12" x2="9" y2="12" />
                            </svg>
                            <span className={styles.quitLabel}>QUITTER LA SESSION</span>
                        </motion.button>
                    </motion.div>
                )}

                {/* ── Restauration ──────────────────────────────────────────────── */}
                {isRestoring && (
                    <motion.div
                        key="restoring"
                        className={styles.restoringWrapper}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <div className={styles.spinner} />
                        <span className={styles.restoringLabel}>Restauration du patch...</span>
                    </motion.div>
                )}

            </AnimatePresence>

            {/* ── Modale confirmation quitter la session ────────────────── */}
            <AnimatePresence>
                {showQuitConfirm && (
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
                            <p className={styles.confirmTitle}>Quitter la session</p>
                            <p className={styles.confirmMsg}>
                                Vous allez quitter le jeu.<br/>
                                Project Zomboid sera <strong>fermé</strong> et le patch restauré.
                            </p>
                            <div className={styles.confirmBtns}>
                                <motion.button
                                    className={styles.confirmCancel}
                                    onClick={() => setShowQuitConfirm(false)}
                                    whileHover={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
                                    whileTap={{ scale: 0.96 }}
                                >
                                    Annuler
                                </motion.button>
                                <motion.button
                                    className={styles.confirmQuit}
                                    onClick={async () => {
                                        setShowQuitConfirm(false);
                                        await window.electronAPI.killPZ();
                                    }}
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
        </div>
    );
};

// ─── Sous-composant : étapes du patch ─────────────────────────────────────────
const STEPS = ['check', 'download', 'inject', 'ready'] as const;
type StepKey = typeof STEPS[number];

interface PatchStepsProps {
    currentStep: StepKey;
    isLaunching: boolean;
}

const PatchSteps: React.FC<PatchStepsProps> = ({ currentStep, isLaunching }) => {
    const currentIdx = isLaunching ? 4 : STEPS.indexOf(currentStep);

    return (
        <div className={styles.stepsContainer}>
            {STEPS.map((step, idx) => {
                const done = idx < currentIdx;
                const active = idx === currentIdx;
                return (
                    <React.Fragment key={step}>
                        <div
                            className={`${styles.step} ${done ? styles.stepDone : ''} ${active ? styles.stepActive : ''}`}
                        >
                            <div className={styles.stepDot}>
                                {done ? (
                                    <svg viewBox="0 0 12 12" fill="currentColor" width="10" height="10">
                                        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                                    </svg>
                                ) : active ? (
                                    <div className={styles.stepDotInner} />
                                ) : null}
                            </div>
                            <span className={styles.stepLabel}>{stepLabels[step]}</span>
                        </div>
                        {idx < STEPS.length - 1 && (
                            <div className={`${styles.stepConnector} ${done ? styles.connectorDone : ''}`} />
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );
};
