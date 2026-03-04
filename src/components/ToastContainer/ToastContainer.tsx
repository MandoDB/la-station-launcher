import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLauncher } from '../../context/LauncherContext';
import type { Toast } from '../../context/LauncherContext';
import styles from './ToastContainer.module.css';

const ICONS: Record<Toast['type'], React.ReactNode> = {
    success: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
    ),
    warning: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
    ),
    error: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
    ),
    info: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
    ),
};

// ─── Toast individuel ─────────────────────────────────────────────────────────
const ToastItem: React.FC<{ toast: Toast }> = ({ toast }) => {
    const { dispatch } = useLauncher();

    const dismiss = () => dispatch({ type: 'REMOVE_TOAST', payload: toast.id });

    const handleAction = () => {
        toast.action?.onClick();
        dismiss();
    };

    return (
        <motion.div
            className={`${styles.toast} ${styles[toast.type]}`}
            initial={{ opacity: 0, x: 60, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 60, scale: 0.95 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            layout
        >
            <div className={styles.icon}>{ICONS[toast.type]}</div>

            <div className={styles.content}>
                <p className={styles.title}>{toast.title}</p>
                {toast.message && <p className={styles.message}>{toast.message}</p>}

                {/* Bouton d'action optionnel (ex: "Redémarrer pour mettre à jour") */}
                {toast.action && (
                    <button className={styles.actionBtn} onClick={handleAction}>
                        {toast.action.label}
                    </button>
                )}
            </div>

            <button className={styles.close} onClick={dismiss} aria-label="Fermer">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
            </button>
        </motion.div>
    );
};

// ─── Conteneur global ─────────────────────────────────────────────────────────
export const ToastContainer: React.FC = () => {
    const { state } = useLauncher();

    return (
        <div className={styles.container} aria-live="polite">
            <AnimatePresence mode="popLayout">
                {state.toasts.map((toast) => (
                    <ToastItem key={toast.id} toast={toast} />
                ))}
            </AnimatePresence>
        </div>
    );
};
