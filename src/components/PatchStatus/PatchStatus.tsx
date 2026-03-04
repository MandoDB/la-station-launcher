import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useLauncher } from '../../context/LauncherContext';
import styles from './PatchStatus.module.css';

/**
 * Badge de statut du patch avec version et indicateur coloré.
 * Vert = à jour, Orange = mise à jour disponible, Rouge = erreur
 *
 * Bouton flèche :
 *  - Si "MISE À JOUR" → lance la session (téléchargement + injection du patch)
 *  - Sinon            → re-vérifie uniquement
 */
export const PatchStatus: React.FC = () => {
    const { state, handleCheckPatch, handleDownloadUpdate } = useLauncher();
    const { patchCheck, localVersion, sessionStatus, patchProgress } = state;
    const [downloading, setDownloading] = useState(false);

    // Calcul du statut
    let statusKey: 'ok' | 'update' | 'error' | 'unknown' = 'unknown';
    let statusLabel = 'Vérification...';
    let versionLabel = '—';

    if (patchCheck) {
        if (patchCheck.upToDate) {
            statusKey = 'ok';
            statusLabel = 'À JOUR';
        } else if (patchCheck.needsDownload) {
            statusKey = 'update';
            statusLabel = 'MISE À JOUR';
        } else {
            statusKey = 'error';
            statusLabel = 'ERREUR';
        }
    }

    if (localVersion) {
        versionLabel = `v${localVersion.version}`;
    } else if (patchCheck?.localVersion) {
        versionLabel = `v${patchCheck.localVersion}`;
    }

    const isSessionActive =
        sessionStatus !== 'idle' && sessionStatus !== 'done' && sessionStatus !== 'error';

    const hasUpdate = statusKey === 'update';

    // Quand une MàJ est dispo, le bouton télécharge uniquement (sans lancer le jeu).
    // Sinon il re-vérifie juste.
    const handleBtnClick = async () => {
        if (hasUpdate) {
            setDownloading(true);
            await handleDownloadUpdate();
            setDownloading(false);
        } else {
            await handleCheckPatch();
        }
    };
    const btnTitle = hasUpdate ? 'Télécharger la mise à jour' : 'Vérifier les mises à jour';
    const isDownloadingOrChecking = downloading;

    return (
        <div className={styles.container}>
            {/* Badge statut */}
            <div className={`${styles.badge} ${styles[statusKey]}`}>
                <div className={styles.dot} />
                <span className={styles.label}>{statusLabel}</span>
            </div>

            {/* Informations de version */}
            <div className={styles.versionInfo}>
                <span className={styles.versionLabel}>Patch</span>
                <span className={styles.versionValue}>{versionLabel}</span>
            </div>

            {/* Bouton action */}
            {!isSessionActive && (
                <motion.button
                    className={`${styles.refreshBtn} ${hasUpdate ? styles.refreshBtnUpdate : ''}`}
                    onClick={handleBtnClick}
                    disabled={isDownloadingOrChecking}
                    whileHover={!isDownloadingOrChecking ? (hasUpdate ? { scale: 1.15 } : { rotate: 180 }) : {}}
                    transition={{ duration: 0.3 }}
                    title={btnTitle}
                >
                    {isDownloadingOrChecking ? (
                        /* Spinner pendant le téléchargement */
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"
                            style={{ animation: 'spin 0.8s linear infinite' }}>
                            <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                            <path d="M12 2a10 10 0 0 1 10 10" />
                        </svg>
                    ) : hasUpdate ? (
                        /* Flèche téléchargement */
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                    ) : (
                        /* Flèche rafraîchir */
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                            <polyline points="23 4 23 10 17 10" />
                            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                        </svg>
                    )}
                </motion.button>
            )}

            {/* Barre progression téléchargement */}
            {downloading && patchProgress && patchProgress.step === 'download' && (
                <div className={styles.downloadProgress}>
                    <div
                        className={styles.downloadBar}
                        style={{ width: `${patchProgress.progress}%` }}
                    />
                    <span className={styles.downloadPct}>{patchProgress.progress}%</span>
                </div>
            )}

            {/* Changelog si disponible */}
            {localVersion?.changelog && (
                <div className={styles.changelog} title={localVersion.changelog}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                </div>
            )}
        </div>
    );
};
