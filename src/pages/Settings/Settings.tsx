import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLauncher } from '../../context/LauncherContext';
import styles from './Settings.module.css';

export const MENTIONS_LEGALES_URL = 'https://wiki.la-station.org/s/mentions-legales';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ModEntry {
    id: string;
    name: string;
    require?: string | null;
}

interface SettingsProps {
    onClose: () => void;
}

// ─── RAM config ───────────────────────────────────────────────────────────────

const RAM_STEPS = [1024, 2048, 3072, 4096, 6144, 8192];
const RAM_LABELS: Record<number, string> = {
    1024: '1 Go', 2048: '2 Go', 3072: '3 Go',
    4096: '4 Go', 6144: '6 Go', 8192: '8 Go',
};

function snapToStep(mb: number): number {
    return RAM_STEPS.reduce((prev, cur) =>
        Math.abs(cur - mb) < Math.abs(prev - mb) ? cur : prev
    );
}

// ─── Catégories ───────────────────────────────────────────────────────────────

type Category = 'jeu' | 'mods' | 'perf' | 'discord' | 'captures' | 'legal';

const CATEGORIES: { id: Category; label: string; icon: React.ReactNode }[] = [
    {
        id: 'jeu',
        label: 'Jeu',
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" width="15" height="15">
                <rect x="2" y="6" width="20" height="14" rx="3"/>
                <path strokeLinecap="round" d="M8 12h4m-2-2v4M16 12h.01M18 10h.01"/>
            </svg>
        ),
    },
    {
        id: 'mods',
        label: 'Mods',
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" width="15" height="15">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
        ),
    },
    {
        id: 'perf',
        label: 'Performances',
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" width="15" height="15">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
        ),
    },
    {
        id: 'discord',
        label: 'Discord',
        icon: (
            <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
        ),
    },
    {
        id: 'captures',
        label: 'Média & Rec',
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" width="15" height="15">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
            </svg>
        ),
    },
    {
        id: 'legal',
        label: 'Légal',
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" width="15" height="15">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/>
            </svg>
        ),
    },
];

// ─── Composant Toggle ─────────────────────────────────────────────────────────

interface ToggleRowProps {
    label: React.ReactNode;
    desc?: React.ReactNode;
    checked: boolean;
    onChange: () => void;
    disabled?: boolean;
}

const ToggleRow: React.FC<ToggleRowProps> = ({ label, desc, checked, onChange, disabled }) => (
    <div className={styles.toggleRow}>
        <div className={styles.toggleInfo}>
            <span className={styles.toggleLabel}>{label}</span>
            {desc && <span className={styles.toggleDesc}>{desc}</span>}
        </div>
        <button
            className={`${styles.toggle} ${checked ? styles.toggleOn : ''}`}
            onClick={onChange}
            disabled={disabled}
            aria-pressed={checked}
        >
            <span className={styles.toggleThumb} />
        </button>
    </div>
);

// ─── Composant principal ──────────────────────────────────────────────────────

export const Settings: React.FC<SettingsProps> = ({ onClose }) => {
    const { state, addToast } = useLauncher();
    const gamePath = state.gamePath;

    const [activeTab, setActiveTab] = useState<Category>('jeu');

    // Settings
    const [rpcEnabled, setRpcEnabled]     = useState(true);
    const [debugMode, setDebugMode]       = useState(false);
    const [modsEnabled, setModsEnabled]   = useState(true);
    const [disabledMods, setDisabledMods] = useState<string[]>([]);
    const [saving, setSaving]             = useState(false);

    // Mods
    const [modsList, setModsList]       = useState<ModEntry[]>([]);
    const [modsLoading, setModsLoading] = useState(true);
    const [restoringJar, setRestoringJar] = useState(false);

    // RAM
    const [ramMb, setRamMb]         = useState<number>(3072);
    const [ramSaving, setRamSaving] = useState(false);
    const [ramSaved, setRamSaved]   = useState(false);
    const [ramError, setRamError]   = useState<string | null>(null);
    const [ramLoaded, setRamLoaded] = useState(false);

    // Screenshots & Clips
    const [screenshotDir, setScreenshotDir] = useState('');
    const [recorderDir, setRecorderDir] = useState('');
    const [screenshotKey, setScreenshotKey] = useState('F10');
    const [snippetKey, setSnippetKey] = useState('F9');
    const [recorderKey, setRecorderKey] = useState('F8');
    const [recorderIndicatorEnabled, setRecorderIndicatorEnabled] = useState(true);
    const [recorderPreviewShown, setRecorderPreviewShown] = useState(false);
    const [recorderResolution, setRecorderResolution] = useState<'480p' | '720p' | '1080p' | 'native'>('1080p');
    const [recorderFps, setRecorderFps] = useState<15 | 30 | 60>(60);
    const [recordingShot, setRecordingShot] = useState(false);
    const [recordingSnippet, setRecordingSnippet] = useState(false);
    const [recordingRec, setRecordingRec] = useState(false);


    // ── Chargement initial ────────────────────────────────────────────────────

    useEffect(() => {
        window.electronAPI.settingsGet().then((s) => {
            setRpcEnabled(s.discordRpcEnabled !== false);
            setDebugMode(s.debugMode === true);
            setModsEnabled(s.modsEnabled !== false);
            setDisabledMods(s.disabledMods ?? []);
            setScreenshotKey(s.screenshotKey || 'F10');
            setSnippetKey(s.screenshotSnippetKey || 'F9');
            setRecorderKey(s.recorderKey || 'F8');
            setRecorderIndicatorEnabled(s.recorderIndicatorEnabled !== false);
            setRecorderResolution(s.recorderResolution || '1080p');
            setRecorderFps(s.recorderFps || 60);
        }).catch(() => {});

        window.electronAPI.screenshotGetDir().then(setScreenshotDir).catch(() => {});
        window.electronAPI.recorderGetDir().then(setRecorderDir).catch(() => {});

        window.electronAPI.modsList()
            .then((mods) => setModsList(mods ?? []))
            .catch(() => setModsList([]))
            .finally(() => setModsLoading(false));
    }, []);

    useEffect(() => {
        if (!gamePath) return;
        window.electronAPI.ramGet(gamePath).then((mb) => {
            if (mb !== null) setRamMb(snapToStep(mb));
            setRamLoaded(true);
        }).catch(() => setRamLoaded(true));
    }, [gamePath]);

    // ── Handlers ──────────────────────────────────────────────────────────────

    const set = async (patch: Parameters<typeof window.electronAPI.settingsSet>[0]) => {
        setSaving(true);
        try { await window.electronAPI.settingsSet(patch); }
        finally { setSaving(false); }
    };

    const handleRamChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setRamMb(RAM_STEPS[parseInt(e.target.value, 10)]);
        setRamSaved(false);
        setRamError(null);
    }, []);

    const handleRamSave = useCallback(async () => {
        if (!gamePath) return;
        setRamSaving(true);
        setRamError(null);
        try {
            const result = await window.electronAPI.ramSet(gamePath, ramMb);
            if (result.success) {
                setRamSaved(true);
                setTimeout(() => setRamSaved(false), 2500);
            } else {
                setRamError(result.error ?? 'Erreur inconnue');
            }
        } catch (e: any) {
            setRamError(e.message);
        } finally {
            setRamSaving(false);
        }
    }, [gamePath, ramMb]);

    const handleModToggle = async (id: string) => {
        const next = disabledMods.includes(id)
            ? disabledMods.filter(d => d !== id)
            : [...disabledMods, id];
        setDisabledMods(next);
        await set({ disabledMods: next });
    };

    const isModEffectivelyEnabled = (mod: ModEntry): boolean => {
        if (disabledMods.includes(mod.id)) return false;
        if (!mod.require) return true;
        const dep = modsList.find(m => m.id === mod.require);
        if (!dep) return false;
        return isModEffectivelyEnabled(dep);
    };

    const requiredBy = (id: string): string[] =>
        modsList.filter(m => m.require === id).map(m => m.name);

    const handleRestoreJar = async () => {
        if (!gamePath || !window.confirm('Voulez-vous vraiment restaurer le fichier JAR original ? Cela annulera le patch actuel.')) return;
        
        setRestoringJar(true);
        try {
            const resp = await window.electronAPI.restoreOriginBackup(gamePath);
            if (resp.success) {
                alert('JAR restauré avec succès. Relancez le launcher pour réinitialiser le statut.');
            } else {
                alert(`Erreur: ${resp.error || 'Impossible de restaurer.'}`);
            }
        } catch (e: any) {
            alert(`Erreur lors de la restauration : ${e.message}`);
        } finally {
            setRestoringJar(false);
        }
    };


    // ── Rendu des onglets ─────────────────────────────────────────────────────

    const renderContent = () => {
        switch (activeTab) {

            // ── JEU ──────────────────────────────────────────────────────────
            case 'jeu':
                return (
                    <div className={styles.tabContent}>
                        <p className={styles.tabDesc}>Options de lancement de Project Zomboid.</p>

                        <ToggleRow
                            label={<>Mode debug <span className={styles.badge}>-debug</span></>}
                            desc={<>Lance le jeu avec l'argument <code className={styles.code}>-debug</code>. Réservé aux administrateurs.</>}
                            checked={debugMode}
                            onChange={() => { setDebugMode(v => !v); set({ debugMode: !debugMode }); }}
                            disabled={saving}
                        />

                        <div className={styles.divider} />

                        <div className={styles.settingsRow}>
                            <div className={styles.toggleInfo}>
                                <span className={styles.toggleLabel}>Restaurer le JAR original</span>
                                <span className={styles.toggleDesc}>
                                    Télécharge et remplace le fichier .jar actuel par la version originale (vanilla) depuis notre dépôt. Utile en cas de corruption ou d'erreur de lancement persistante.
                                </span>
                            </div>
                            <button 
                                className={styles.secondaryBtn}
                                onClick={handleRestoreJar}
                                disabled={restoringJar || !gamePath}
                            >
                                {restoringJar ? 'Restauration...' : 'Restaurer'}
                            </button>
                        </div>
                    </div>
                );

            // ── MODS ─────────────────────────────────────────────────────────
            case 'mods':
                return (
                    <div className={styles.tabContent}>
                        <p className={styles.tabDesc}>Gestion des mods serveur injectés automatiquement au lancement.</p>
                        <ToggleRow
                            label="Mods serveur"
                            desc={<>Active les mods dans <code className={styles.code}>default.txt</code> au lancement et les restaure à la fermeture.</>}
                            checked={modsEnabled}
                            onChange={() => { setModsEnabled(v => !v); set({ modsEnabled: !modsEnabled }); }}
                            disabled={saving}
                        />

                        {modsEnabled && (
                            <div className={styles.modsList}>
                                {modsLoading && (
                                    <div className={styles.modsLoading}>
                                        <span className={styles.dot} /><span className={styles.dot} /><span className={styles.dot} />
                                        <span className={styles.modsLoadingText}>Chargement des mods…</span>
                                    </div>
                                )}
                                {!modsLoading && modsList.length === 0 && (
                                    <p className={styles.modsEmpty}>Aucun mod serveur défini dans le dépôt.</p>
                                )}
                                {!modsLoading && modsList.map((mod) => {
                                    const effectiveOn    = isModEffectivelyEnabled(mod);
                                    const depEntry       = mod.require ? modsList.find(m => m.id === mod.require) : null;
                                    const depName        = depEntry?.name ?? mod.require ?? null;
                                    const depDisabled    = depEntry ? !isModEffectivelyEnabled(depEntry) : false;
                                    const requiredByList = requiredBy(mod.id);
                                    return (
                                        <div key={mod.id} className={`${styles.modRow} ${depDisabled ? styles.modRowFaded : ''}`}>
                                            <div className={styles.modInfo}>
                                                <div className={styles.modNameRow}>
                                                    <span className={styles.modName}>{mod.name}</span>
                                                    {requiredByList.length > 0 && (
                                                        <span className={styles.modBadge} title={`Requis par : ${requiredByList.join(', ')}`}>requis</span>
                                                    )}
                                                </div>
                                                <span className={styles.modId}>{mod.id}</span>
                                                {depName && (
                                                    <span className={`${styles.modDep} ${depDisabled ? styles.modDepWarn : ''}`}>
                                                        {depDisabled ? '⚠ ' : '↳ '}Nécessite <strong>{depName}</strong>{depDisabled && ' (désactivé)'}
                                                    </span>
                                                )}
                                            </div>
                                            <button
                                                className={`${styles.toggle} ${effectiveOn ? styles.toggleOn : ''}`}
                                                onClick={() => handleModToggle(mod.id)}
                                                disabled={saving || depDisabled}
                                                title={depDisabled ? `Désactivé car "${depName}" est désactivé` : undefined}
                                            >
                                                <span className={styles.toggleThumb} />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );

            // ── PERFORMANCES ─────────────────────────────────────────────────
            case 'perf':
                return (
                    <div className={styles.tabContent}>
                        <p className={styles.tabDesc}>Mémoire allouée à la JVM de Project Zomboid.</p>
                        {!gamePath ? (
                            <div className={styles.emptyState}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" width="28" height="28">
                                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                                </svg>
                                <span>Jeu non détecté — lancez la détection depuis l'écran principal.</span>
                            </div>
                        ) : (
                            <div className={styles.ramBox}>
                                <div className={styles.ramTopRow}>
                                    <span className={styles.ramLabel}>RAM allouée</span>
                                    <span className={styles.ramValue}>{RAM_LABELS[ramMb] ?? `${ramMb} Mo`}</span>
                                </div>
                                <input
                                    type="range"
                                    min={0} max={RAM_STEPS.length - 1} step={1}
                                    value={RAM_STEPS.indexOf(ramMb) >= 0 ? RAM_STEPS.indexOf(ramMb) : 2}
                                    onChange={handleRamChange}
                                    disabled={!ramLoaded || ramSaving}
                                    className={styles.ramSlider}
                                />
                                <div className={styles.ramTicks}>
                                    {RAM_STEPS.map((mb) => (
                                        <span key={mb} className={`${styles.ramTick} ${mb === ramMb ? styles.ramTickOn : ''}`}>
                                            {RAM_LABELS[mb]}
                                        </span>
                                    ))}
                                </div>
                                {ramMb < 2048 && <p className={styles.ramWarn}>⚠ En dessous de 2 Go, le jeu peut crasher.</p>}
                                {ramError && <p className={styles.ramError}>{ramError}</p>}
                                <motion.button
                                    className={`${styles.applyBtn} ${ramSaved ? styles.applyBtnSaved : ''}`}
                                    onClick={handleRamSave}
                                    disabled={ramSaving || !ramLoaded}
                                    whileHover={!ramSaving ? { scale: 1.02 } : {}}
                                    whileTap={!ramSaving ? { scale: 0.97 } : {}}
                                >
                                    {ramSaving ? 'Application…' : ramSaved ? '✓ Appliqué' : 'Appliquer'}
                                </motion.button>
                            </div>
                        )}
                    </div>
                );

            // ── DISCORD ──────────────────────────────────────────────────────
            case 'discord':
                return (
                    <div className={styles.tabContent}>
                        <p className={styles.tabDesc}>Intégration Discord du launcher.</p>
                        <ToggleRow
                            label="Rich Presence"
                            desc="Affiche ton statut de jeu sur ton profil Discord."
                            checked={rpcEnabled}
                            onChange={() => { setRpcEnabled(v => !v); set({ discordRpcEnabled: !rpcEnabled }); }}
                            disabled={saving}
                        />
                    </div>
                );
            // ── CAPTURES ────────────────────────────────────────────────────
            case 'captures':
                return (
                    <div className={styles.tabContent}>
                        <p className={styles.tabDesc}>Gestion des captures d'écran et vidéos en jeu.</p>
                        
                        <div className={styles.settingsRow}>
                            <div className={styles.toggleInfo}>
                                <span className={styles.toggleLabel}>Dossier d'enregistrement</span>
                                <span className={styles.toggleDesc}>{screenshotDir}</span>
                            </div>
                            <div className={styles.btnRow}>
                                <button 
                                    className={styles.secondaryBtn}
                                    onClick={() => window.electronAPI.screenshotOpenFolder()}
                                >
                                    Ouvrir
                                </button>
                                <button 
                                    className={styles.secondaryBtn}
                                    onClick={async () => {
                                        const path = await window.electronAPI.selectGameFolder();
                                        if (path) {
                                            const ok = await window.electronAPI.screenshotSetDir(path);
                                            if (ok) {
                                                setScreenshotDir(path);
                                            } else {
                                                addToast({
                                                    type: 'error',
                                                    title: 'Accès refusé',
                                                    message: 'Le launcher n\'a pas les permissions d\'écriture dans ce dossier. Choisissez un autre emplacement.'
                                                });
                                            }
                                        }
                                    }}
                                >
                                    Modifier
                                </button>
                            </div>
                        </div>

                        <div className={styles.divider} />

                        <div className={styles.settingsRow}>
                            <div className={styles.toggleInfo}>
                                <span className={styles.toggleLabel}>Capture plein écran</span>
                                <span className={styles.toggleDesc}>Touche pour prendre un screenshot immédiat.</span>
                            </div>
                            <button 
                                className={`${styles.keyInput} ${recordingShot ? styles.recording : ''}`}
                                onClick={() => setRecordingShot(true)}
                                onKeyDown={(e) => {
                                    if (!recordingShot) return;
                                    e.preventDefault();
                                    const k = e.key === ' ' ? 'Space' : e.key;
                                    if (k === 'Escape') { setRecordingShot(false); return; }
                                    const displayKey = k.length === 1 ? k.toUpperCase() : k;
                                    setScreenshotKey(displayKey);
                                    set({ screenshotKey: displayKey });
                                    setRecordingShot(false);
                                }}
                                onBlur={() => setRecordingShot(false)}
                            >
                                {recordingShot ? '...' : screenshotKey}
                            </button>
                        </div>

                        <div className={styles.settingsRow}>
                            <div className={styles.toggleInfo}>
                                <span className={styles.toggleLabel}>Capture zone (Snippet)</span>
                                <span className={styles.toggleDesc}>Touche pour sélectionner une zone de l'écran.</span>
                            </div>
                            <button 
                                className={`${styles.keyInput} ${recordingSnippet ? styles.recording : ''}`}
                                onClick={() => setRecordingSnippet(true)}
                                onKeyDown={(e) => {
                                    if (!recordingSnippet) return;
                                    e.preventDefault();
                                    const k = e.key === ' ' ? 'Space' : e.key;
                                    if (k === 'Escape') { setRecordingSnippet(false); return; }
                                    const displayKey = k.length === 1 ? k.toUpperCase() : k;
                                    setSnippetKey(displayKey);
                                    set({ screenshotSnippetKey: displayKey });
                                    setRecordingSnippet(false);
                                }}
                                onBlur={() => setRecordingSnippet(false)}
                            >
                                {recordingSnippet ? '...' : snippetKey}
                            </button>
                        </div>

                        <div className={styles.settingsRow}>
                            <div className={styles.toggleInfo}>
                                <span className={styles.toggleLabel}>Clip Vidéo (Record)</span>
                                <span className={styles.toggleDesc}>Démarrer ou arrêter un enregistrement vidéo.</span>
                            </div>
                            <button 
                                className={`${styles.keyInput} ${recordingRec ? styles.recording : ''}`}
                                onClick={() => setRecordingRec(true)}
                                onKeyDown={(e) => {
                                    if (!recordingRec) return;
                                    e.preventDefault();
                                    const k = e.key === ' ' ? 'Space' : e.key;
                                    if (k === 'Escape') { setRecordingRec(false); return; }
                                    const displayKey = k.length === 1 ? k.toUpperCase() : k;
                                    setRecorderKey(displayKey);
                                    set({ recorderKey: displayKey });
                                    setRecordingRec(false);
                                }}
                                onBlur={() => setRecordingRec(false)}
                            >
                                {recordingRec ? '...' : recorderKey}
                            </button>
                        </div>

                        <div className={styles.infoBox}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                                <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
                            </svg>
                            <span>Prendre un screenshot : <strong>{screenshotKey}</strong> (ou <strong>F9</strong> pour une zone).</span>
                        </div>

                        <div className={styles.divider} />

                        <p className={styles.tabDesc}>Options d'enregistrement vidéo (Clips).</p>
                        <ToggleRow
                            label="Indicateur d'enregistrement"
                            desc="Affiche 'REC' à l'écran quand un enregistrement est en cours."
                            checked={recorderIndicatorEnabled}
                            onChange={() => {
                                const next = !recorderIndicatorEnabled;
                                setRecorderIndicatorEnabled(next);
                                set({ recorderIndicatorEnabled: next });
                            }}
                            disabled={saving}
                        />

                        {recorderIndicatorEnabled && (
                            <div className={styles.settingsRow}>
                                <div className={styles.toggleInfo}>
                                    <span className={styles.toggleLabel}>Position de l'indicateur</span>
                                    <span className={styles.toggleDesc}>
                                        {recorderPreviewShown 
                                            ? "Faites glisser l'indicateur à l'endroit désiré." 
                                            : "Affichez l'indicateur pour le déplacer."}
                                    </span>
                                </div>
                                <button 
                                    className={`${styles.secondaryBtn} ${recorderPreviewShown ? styles.activeBtn : ''}`}
                                    onClick={() => {
                                        const next = !recorderPreviewShown;
                                        setRecorderPreviewShown(next);
                                        window.electronAPI.recorderIndicatorPreview(next);
                                    }}
                                >
                                    {recorderPreviewShown ? 'Masquer' : 'Repositionner'}
                                </button>
                            </div>
                        )}

                        <div className={styles.settingsRow}>
                            <div className={styles.toggleInfo}>
                                <span className={styles.toggleLabel}>Résolution vidéo</span>
                                <span className={styles.toggleDesc}>Qualité de l'image pour les clips enregistrés.</span>
                            </div>
                            <select 
                                className={styles.selectInput}
                                value={recorderResolution}
                                onChange={(e) => {
                                    const val = e.target.value as any;
                                    setRecorderResolution(val);
                                    set({ recorderResolution: val });
                                }}
                            >
                                <option value="480p">480p (SD)</option>
                                <option value="720p">720p (HD)</option>
                                <option value="1080p">1080p (Full HD)</option>
                                <option value="native">Natif (Source)</option>
                            </select>
                        </div>

                        <div className={styles.settingsRow}>
                            <div className={styles.toggleInfo}>
                                <span className={styles.toggleLabel}>Fréquence d'images</span>
                                <span className={styles.toggleDesc}>Fluidité de la vidéo (60 FPS recommandé pour le jeu).</span>
                            </div>
                            <select 
                                className={styles.selectInput}
                                value={recorderFps}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value, 10) as any;
                                    setRecorderFps(val);
                                    set({ recorderFps: val });
                                }}
                            >
                                <option value="15">15 FPS (Basse)</option>
                                <option value="30">30 FPS</option>
                                <option value="60">60 FPS</option>
                            </select>
                        </div>

                        <div className={styles.infoBox}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                                <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
                            </svg>
                            <span>Démarrer / Arrêter un clip : <strong>{recorderKey}</strong></span>
                        </div>

                        <div className={styles.settingsRow}>
                            <div className={styles.toggleInfo}>
                                <span className={styles.toggleLabel}>Dossier des clips</span>
                                <span className={styles.toggleDesc}>{recorderDir}</span>
                            </div>
                            <div className={styles.btnRow}>
                                <button 
                                    className={styles.secondaryBtn}
                                    onClick={() => window.electronAPI.recorderOpenFolder()}
                                >
                                    Ouvrir
                                </button>
                                <button 
                                    className={styles.secondaryBtn}
                                    onClick={async () => {
                                        const path = await window.electronAPI.selectGameFolder();
                                        if (path) {
                                            const ok = await window.electronAPI.recorderSetDir(path);
                                            if (ok) {
                                                setRecorderDir(path);
                                            } else {
                                                addToast({
                                                    type: 'error',
                                                    title: 'Accès refusé',
                                                    message: 'Le launcher n\'a pas les permissions d\'écriture dans ce dossier (ex: Program Files). Choisissez un autre emplacement.'
                                                });
                                            }
                                        }
                                    }}
                                >
                                    Modifier
                                </button>
                            </div>
                        </div>
                    </div>
                );

            // ── LÉGAL ────────────────────────────────────────────────────────
            case 'legal':
                return (
                    <div className={styles.tabContent}>
                        <p className={styles.tabDesc}>Politique de confidentialité et mentions légales.</p>
                        <a
                            href={MENTIONS_LEGALES_URL}
                            className={styles.linkBtn}
                            onClick={(e) => { e.preventDefault(); window.electronAPI.openExternal(MENTIONS_LEGALES_URL); }}
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="15" height="15">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                                <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                            </svg>
                            Voir les mentions légales
                        </a>
                    </div>
                );
        }
    };

    // ── JSX principal ─────────────────────────────────────────────────────────

    return (
        <motion.div
            className={styles.overlay}
            initial={{ opacity: 0, pointerEvents: 'none' as const }}
            animate={{ opacity: 1, pointerEvents: 'auto' as const }}
            exit={{ opacity: 0, pointerEvents: 'none' as const }}
            onClick={onClose}
        >
            <motion.div
                className={styles.panel}
                initial={{ opacity: 0, y: 16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.22 }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* ── Header ── */}
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16" style={{ color: 'rgba(255,255,255,0.45)' }}>
                            <circle cx="12" cy="12" r="3"/>
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                        </svg>
                        <span className={styles.headerTitle}>PARAMÈTRES</span>
                    </div>
                    <button className={styles.closeBtn} onClick={onClose} title="Fermer">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>

                {/* ── Body : sidebar + contenu ── */}
                <div className={styles.body}>

                    {/* Sidebar */}
                    <nav className={styles.sidebar}>
                        {CATEGORIES.map((cat) => (
                            <button
                                key={cat.id}
                                className={`${styles.navItem} ${activeTab === cat.id ? styles.navItemActive : ''}`}
                                onClick={() => setActiveTab(cat.id)}
                            >
                                <span className={styles.navIcon}>{cat.icon}</span>
                                <span className={styles.navLabel}>{cat.label}</span>
                                {activeTab === cat.id && (
                                    <motion.span
                                        className={styles.navIndicator}
                                        layoutId="nav-indicator"
                                        transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                                    />
                                )}
                            </button>
                        ))}
                    </nav>

                    {/* Contenu */}
                    <div className={styles.content}>
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activeTab}
                                initial={{ opacity: 0, x: 8 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -8 }}
                                transition={{ duration: 0.15 }}
                                style={{ height: '100%' }}
                            >
                                {renderContent()}
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
};
