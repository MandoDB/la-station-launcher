import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef } from 'react';
import type {
    SessionStatus,
    PatchCheckResult,
    VersionInfo,
    PatchProgressData,
    SessionUpdateData,
} from '../types/electron.d';

// ─── Types du contexte ───────────────────────────────────────────────────────
interface LauncherState {
    // Jeu
    gamePath: string | null;
    gameDetected: boolean;

    // Patch
    patchCheck: PatchCheckResult | null;
    localVersion: VersionInfo | null;
    patchProgress: PatchProgressData | null;

    // Session
    sessionStatus: SessionStatus;
    sessionElapsed: number;
    sessionError: string | null;
    sessionCritical: boolean;

    // Logs
    logs: string[];

    // UI
    isLoading: boolean;
    showOnboarding: boolean;
    toasts: Toast[];
}

export interface Toast {
    id: string;
    type: 'success' | 'warning' | 'error' | 'info';
    title: string;
    message?: string;
    duration?: number;
    /** Bouton d'action optionnel dans le toast */
    action?: {
        label: string;
        onClick: () => void;
    };
}

type Action =
    | { type: 'SET_GAME_PATH'; payload: string | null }
    | { type: 'SET_GAME_DETECTED'; payload: boolean }
    | { type: 'SET_PATCH_CHECK'; payload: PatchCheckResult | null }
    | { type: 'SET_LOCAL_VERSION'; payload: VersionInfo | null }
    | { type: 'SET_PATCH_PROGRESS'; payload: PatchProgressData | null }
    | { type: 'SET_SESSION_STATUS'; payload: SessionStatus }
    | { type: 'SET_SESSION_ELAPSED'; payload: number }
    | { type: 'SET_SESSION_ERROR'; payload: { error: string | null; critical?: boolean } }
    | { type: 'ADD_LOG'; payload: string }
    | { type: 'SET_LOADING'; payload: boolean }
    | { type: 'SET_SHOW_ONBOARDING'; payload: boolean }
    | { type: 'ADD_TOAST'; payload: Toast }
    | { type: 'REMOVE_TOAST'; payload: string };

// ─── Reducer ─────────────────────────────────────────────────────────────────
function reducer(state: LauncherState, action: Action): LauncherState {
    switch (action.type) {
        case 'SET_GAME_PATH':
            return { ...state, gamePath: action.payload };
        case 'SET_GAME_DETECTED':
            return { ...state, gameDetected: action.payload };
        case 'SET_PATCH_CHECK':
            return { ...state, patchCheck: action.payload };
        case 'SET_LOCAL_VERSION':
            return { ...state, localVersion: action.payload };
        case 'SET_PATCH_PROGRESS':
            return { ...state, patchProgress: action.payload };
        case 'SET_SESSION_STATUS':
            return { ...state, sessionStatus: action.payload };
        case 'SET_SESSION_ELAPSED':
            return { ...state, sessionElapsed: action.payload };
        case 'SET_SESSION_ERROR':
            return {
                ...state,
                sessionError: action.payload.error,
                sessionCritical: action.payload.critical ?? false,
            };
        case 'ADD_LOG':
            return { ...state, logs: [...state.logs.slice(-199), action.payload] };
        case 'SET_LOADING':
            return { ...state, isLoading: action.payload };
        case 'SET_SHOW_ONBOARDING':
            return { ...state, showOnboarding: action.payload };
        case 'ADD_TOAST':
            return { ...state, toasts: [...state.toasts, action.payload] };
        case 'REMOVE_TOAST':
            return { ...state, toasts: state.toasts.filter((t) => t.id !== action.payload) };
        default:
            return state;
    }
}

const initialState: LauncherState = {
    gamePath: null,
    gameDetected: false,
    patchCheck: null,
    localVersion: null,
    patchProgress: null,
    sessionStatus: 'idle',
    sessionElapsed: 0,
    sessionError: null,
    sessionCritical: false,
    logs: [],
    isLoading: true,
    showOnboarding: false,
    toasts: [],
};

// ─── Contexte ─────────────────────────────────────────────────────────────────
interface LauncherContextType {
    state: LauncherState;
    dispatch: React.Dispatch<Action>;
    addToast: (toast: Omit<Toast, 'id'>) => void;
    handlePlay: () => Promise<void>;
    handleQuitSession: () => Promise<void>;
    handleDetectGame: () => Promise<void>;
    handleSelectFolder: () => Promise<void>;
    handleCheckPatch: () => Promise<void>;
    handleDownloadUpdate: () => Promise<void>;
}

const LauncherContext = createContext<LauncherContextType | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────
export function LauncherProvider({ children }: { children: React.ReactNode }) {
    const [state, dispatch] = useReducer(reducer, initialState);
    const toastTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());

    // ── Toast ──────────────────────────────────────────────────────────────────
    const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
        const id = Math.random().toString(36).slice(2);
        dispatch({ type: 'ADD_TOAST', payload: { ...toast, id } });
        const duration = toast.duration ?? 5000;
        const timer = setTimeout(() => {
            dispatch({ type: 'REMOVE_TOAST', payload: id });
            toastTimers.current.delete(id);
        }, duration);
        toastTimers.current.set(id, timer);
    }, []);

    // ── Initialisation ────────────────────────────────────────────────────────
    useEffect(() => {
        async function init() {
            dispatch({ type: 'SET_LOADING', payload: true });

            // Écoute des événements IPC
            window.electronAPI.onPatchProgress((data) => {
                dispatch({ type: 'SET_PATCH_PROGRESS', payload: data });
            });

            window.electronAPI.onSessionUpdate((data: SessionUpdateData) => {
                dispatch({ type: 'SET_SESSION_STATUS', payload: data.status });
                if (data.elapsedSeconds !== undefined) {
                    dispatch({ type: 'SET_SESSION_ELAPSED', payload: data.elapsedSeconds });
                }
                if (data.status === 'done') {
                    addToast({
                        type: 'success',
                        title: 'Session terminée',
                        message: 'Le patch a été restauré automatiquement.',
                    });
                    dispatch({ type: 'SET_PATCH_PROGRESS', payload: null });
                    // Re-vérifier patch + version pour mettre à jour badge et changelog
                    Promise.all([
                        window.electronAPI.checkPatch(),
                        window.electronAPI.getLocalVersion(),
                    ]).then(([check, version]) => {
                        dispatch({ type: 'SET_PATCH_CHECK', payload: check });
                        dispatch({ type: 'SET_LOCAL_VERSION', payload: version });
                    }).catch(() => { });
                }
                if (data.status === 'error') {
                    dispatch({
                        type: 'SET_SESSION_ERROR',
                        payload: { error: data.error ?? null, critical: data.critical },
                    });
                    addToast({
                        type: 'error',
                        title: data.critical ? '⚠ Erreur Critique' : 'Erreur de session',
                        message: data.error,
                        duration: data.critical ? 15000 : 8000,
                    });
                }
            });

            window.electronAPI.onLog((log) => {
                dispatch({ type: 'ADD_LOG', payload: log });
            });

            // Restauration automatique au démarrage (session.lock orphelin)
            window.electronAPI.onAutoRestoreDone(({ success, error }) => {
                if (success) {
                    addToast({
                        type: 'warning',
                        title: 'Restauration automatique effectuée',
                        message: 'Une session interrompue (crash ?) a été détectée. Le JAR a été restauré.',
                        duration: 8000,
                    });
                } else {
                    addToast({
                        type: 'error',
                        title: 'Restauration automatique échouée',
                        message: error ?? 'Erreur inconnue — vérifiez les logs.',
                        duration: 12000,
                    });
                }
            });

            // Auto-check patch toutes les 30s depuis le main process
            window.electronAPI.onPatchAutoCheck(({ check, version }) => {
                dispatch({ type: 'SET_PATCH_CHECK', payload: check });
                dispatch({ type: 'SET_LOCAL_VERSION', payload: version });
            });

            window.electronAPI.onForceRestoreStart(() => {
                addToast({
                    type: 'warning',
                    title: 'Fermeture en cours',
                    message: 'Restauration du patch avant fermeture...',
                    duration: 5000,
                });
            });

            // Auto-updater launcher
            window.electronAPI.onUpdaterDownloaded(({ version }) => {
                addToast({
                    type: 'info',
                    title: '\uD83D\uDE80 Mise à jour disponible',
                    message: `Version ${version} téléchargée et prête.`,
                    duration: 0, // persistant jusqu'à action
                    action: {
                        label: 'Redémarrer pour mettre à jour',
                        onClick: () => window.electronAPI.updaterQuitAndInstall(),
                    },
                });
            });

            // Détecter le jeu
            await handleDetectGame();

            dispatch({ type: 'SET_LOADING', payload: false });
        }

        init();

        return () => {
            window.electronAPI.removeAllListeners('patch:progress');
            window.electronAPI.removeAllListeners('session:update');
            window.electronAPI.removeAllListeners('log:entry');
            window.electronAPI.removeAllListeners('session:force-restore-start');
            window.electronAPI.removeAllListeners('patch:auto-check');
            window.electronAPI.removeAllListeners('session:auto-restore-done');
            window.electronAPI.removeAllListeners('updater:downloaded');
        };
    }, []);

    // ── Détection du jeu ──────────────────────────────────────────────────────
    const handleDetectGame = useCallback(async () => {
        const result = await window.electronAPI.detectGame();
        if (result.found && result.path) {
            dispatch({ type: 'SET_GAME_PATH', payload: result.path });
            dispatch({ type: 'SET_GAME_DETECTED', payload: true });
            dispatch({ type: 'SET_SHOW_ONBOARDING', payload: false });

            // Vérification du patch après détection
            await handleCheckPatch();

            // Vérifier si patch orphelin
            const sessionStatus = await window.electronAPI.getSessionStatus();
            if (sessionStatus.status === 'idle') {
                const orphan = false; // TODO: implémenter la détection côté main
                if (orphan) {
                    addToast({
                        type: 'warning',
                        title: 'Patch actif détecté',
                        message: 'Un patch résiduel a été détecté. Restauration recommandée.',
                        duration: 10000,
                    });
                }
            }
        } else {
            dispatch({ type: 'SET_SHOW_ONBOARDING', payload: true });
        }
    }, []);

    // ── Sélection manuelle ────────────────────────────────────────────────────
    const handleSelectFolder = useCallback(async () => {
        const path = await window.electronAPI.selectGameFolder();
        if (path) {
            dispatch({ type: 'SET_GAME_PATH', payload: path });
            dispatch({ type: 'SET_GAME_DETECTED', payload: true });
            dispatch({ type: 'SET_SHOW_ONBOARDING', payload: false });
            addToast({
                type: 'success',
                title: 'Dossier sélectionné',
                message: path,
            });
            await handleCheckPatch();
        }
    }, []);

    // ── Téléchargement mise à jour (sans lancer le jeu) ──────────────────────
    const handleDownloadUpdate = useCallback(async () => {
        dispatch({ type: 'SET_PATCH_PROGRESS', payload: null });
        const result = await window.electronAPI.downloadUpdate();
        if (result.success) {
            // Re-checker pour mettre à jour le badge et la version
            const [check, version] = await Promise.all([
                window.electronAPI.checkPatch(),
                window.electronAPI.getLocalVersion(),
            ]);
            dispatch({ type: 'SET_PATCH_CHECK', payload: check });
            dispatch({ type: 'SET_LOCAL_VERSION', payload: version });
            dispatch({ type: 'SET_PATCH_PROGRESS', payload: null });
            addToast({
                type: 'success',
                title: 'Mise à jour téléchargée',
                message: `Patch v${version?.version ?? ''} prêt — lance le jeu pour l'appliquer.`,
            });
        } else {
            dispatch({ type: 'SET_PATCH_PROGRESS', payload: null });
            addToast({
                type: 'error',
                title: 'Échec du téléchargement',
                message: result.error,
                duration: 8000,
            });
        }
    }, []);

    // ── Vérification patch ────────────────────────────────────────────────────
    const handleCheckPatch = useCallback(async () => {
        try {
            const [check, version] = await Promise.all([
                window.electronAPI.checkPatch(),
                window.electronAPI.getLocalVersion(),
            ]);
            dispatch({ type: 'SET_PATCH_CHECK', payload: check });
            dispatch({ type: 'SET_LOCAL_VERSION', payload: version });
        } catch {
            dispatch({ type: 'SET_PATCH_CHECK', payload: null });
        }
    }, []);

    // ── Lancement de la session ───────────────────────────────────────────────
    const handlePlay = useCallback(async () => {
        if (!state.gamePath) {
            addToast({
                type: 'error',
                title: 'Jeu non détecté',
                message: 'Sélectionnez le dossier de Project Zomboid.',
            });
            return;
        }

        dispatch({ type: 'SET_SESSION_ERROR', payload: { error: null } });
        dispatch({ type: 'SET_PATCH_PROGRESS', payload: null });

        const result = await window.electronAPI.startSession(state.gamePath);
        if (!result.success) {
            addToast({
                type: 'error',
                title: 'Échec du lancement',
                message: result.error,
                duration: 8000,
            });
        }
    }, [state.gamePath]);

    // ── Quitter la session manuellement ───────────────────────────────────────
    const handleQuitSession = useCallback(async () => {
        if (!state.gamePath) return;
        dispatch({ type: 'SET_SESSION_STATUS', payload: 'restoring' });
        try {
            await window.electronAPI.restorePatch(state.gamePath);
            dispatch({ type: 'SET_SESSION_STATUS', payload: 'idle' });
            dispatch({ type: 'SET_SESSION_ELAPSED', payload: 0 });
            addToast({
                type: 'success',
                title: 'Session terminée',
                message: 'Le patch a été restauré correctement.',
            });
        } catch (e: any) {
            dispatch({ type: 'SET_SESSION_STATUS', payload: 'idle' });
            addToast({
                type: 'warning',
                title: 'Session arrêtée',
                message: 'Le patch a peut-être déjà été restauré.',
                duration: 7000,
            });
        }
    }, [state.gamePath]);

    return (
        <LauncherContext.Provider
            value={{
                state,
                dispatch,
                addToast,
                handlePlay,
                handleQuitSession,
                handleDetectGame,
                handleSelectFolder,
                handleCheckPatch,
                handleDownloadUpdate,
            }}
        >
            {children}
        </LauncherContext.Provider>
    );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useLauncher(): LauncherContextType {
    const ctx = useContext(LauncherContext);
    if (!ctx) throw new Error('useLauncher must be used within LauncherProvider');
    return ctx;
}
