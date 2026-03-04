import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './ConsoleViewer.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────
interface ConsoleLine {
    level: 'LOG' | 'WARN' | 'ERROR' | 'RAW';
    category: string;
    text: string;
    raw: string;
}

interface ConsoleViewerProps {
    onClose: () => void;
}

// ─── Composant ────────────────────────────────────────────────────────────────
export const ConsoleViewer: React.FC<ConsoleViewerProps> = ({ onClose }) => {
    const [lines, setLines] = useState<ConsoleLine[]>([]);
    const [filter, setFilter] = useState('');
    const [levelFilter, setLevelFilter] = useState<'ALL' | 'WARN' | 'ERROR'>('ALL');
    const [consolePath, setConsolePath] = useState<string | null>(null);
    const [isWatching, setIsWatching] = useState(false);
    const [autoScroll, setAutoScroll] = useState(true);
    const [sendStatus, setSendStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');
    const [sendError, setSendError] = useState<string>('');
    const [showDiscordIdModal, setShowDiscordIdModal] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    // ── Init au mount : locate + read + démarrage automatique du Live ─────────
    useEffect(() => {
        (async () => {
            const result = await window.electronAPI.consoleLocate();
            if (result.found && result.path) {
                setConsolePath(result.path);
                // Lecture de tout l'historique
                const all = await window.electronAPI.consoleReadAll();
                setLines(all);
                // ★ Démarrage automatique du live tail
                const ok = await window.electronAPI.consoleStartWatch();
                setIsWatching(!!ok);
            }
        })();

        // Écoute des nouvelles lignes envoyées par le backend
        window.electronAPI.onConsoleLines((newLines) => {
            setLines((prev) => [...prev, ...newLines].slice(-5000));
        });

        return () => {
            window.electronAPI.removeAllListeners('console:lines');
            window.electronAPI.consoleStopWatch();
        };
    }, []);

    // ── Auto-scroll ──────────────────────────────────────────────────────────
    useEffect(() => {
        if (autoScroll && bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [lines, autoScroll]);

    const handleScroll = useCallback(() => {
        if (!scrollRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        setAutoScroll(scrollHeight - scrollTop - clientHeight < 60);
    }, []);

    // ── Toggle Live ──────────────────────────────────────────────────────────
    const toggleWatch = async () => {
        if (isWatching) {
            await window.electronAPI.consoleStopWatch();
            setIsWatching(false);
        } else {
            const ok = await window.electronAPI.consoleStartWatch();
            setIsWatching(!!ok);
        }
    };

    // ── Sélection manuelle du fichier ────────────────────────────────────────
    const pickFile = async () => {
        const path = await window.electronAPI.consoleSetPath();
        if (path) {
            setConsolePath(path);
            const all = await window.electronAPI.consoleReadAll();
            setLines(all);
            // Relancer le watch sur le nouveau fichier
            await window.electronAPI.consoleStopWatch();
            const ok = await window.electronAPI.consoleStartWatch();
            setIsWatching(!!ok);
        }
    };

    // ── Envoi Discord : d'abord demander si on transmet l'identifiant Discord ──
    const askDiscordIdThenSend = () => {
        setShowDiscordIdModal(true);
    };

    const sendDiscord = async (includeUserId: boolean) => {
        setShowDiscordIdModal(false);
        setSendStatus('sending');
        setSendError('');
        const result = await window.electronAPI.consoleSendDiscord({ includeUserId });
        if (result.success) {
            setSendStatus('ok');
        } else {
            setSendStatus('error');
            setSendError(result.error ?? 'Erreur inconnue');
        }
        setTimeout(() => { setSendStatus('idle'); setSendError(''); }, 4000);
    };


    // ── Filtrage ─────────────────────────────────────────────────────────────
    const filtered = lines.filter((l) => {
        if (levelFilter === 'WARN' && l.level !== 'WARN' && l.level !== 'ERROR') return false;
        if (levelFilter === 'ERROR' && l.level !== 'ERROR') return false;
        if (filter) return l.raw.toLowerCase().includes(filter.toLowerCase());
        return true;
    });

    const errorCount = lines.filter((l) => l.level === 'ERROR').length;
    const warnCount = lines.filter((l) => l.level === 'WARN').length;

    return (
        <motion.div
            className={styles.overlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <motion.div
                className={styles.panel}
                initial={{ opacity: 0, y: 30, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.97 }}
                transition={{ duration: 0.22 }}
            >
                {/* ── Header ──────────────────────────────────────────── */}
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <div className={styles.headerIcon}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
                                <polyline points="4 17 10 11 4 5" />
                                <line x1="12" y1="19" x2="20" y2="19" />
                            </svg>
                        </div>
                        <span className={styles.headerTitle}>CONSOLE DU JEU</span>
                        <div className={styles.headerBadges}>
                            {errorCount > 0 && <span className={`${styles.badge} ${styles.badgeError}`}>{errorCount} ERR</span>}
                            {warnCount > 0 && <span className={`${styles.badge} ${styles.badgeWarn}`}>{warnCount} WARN</span>}
                        </div>
                    </div>

                    <div className={styles.headerActions}>
                        {/* Live toggle — actif par défaut */}
                        <button
                            className={`${styles.actionBtn} ${isWatching ? styles.actionBtnActive : ''}`}
                            onClick={toggleWatch}
                            title={isWatching ? 'Pause du suivi en direct' : 'Reprendre le suivi'}
                        >
                            <span className={`${styles.liveDot} ${isWatching ? styles.liveDotOn : ''}`} />
                            LIVE
                        </button>

                        {/* Envoyer à Discord */}
                        <button
                            className={`${styles.actionBtn} ${sendStatus === 'ok' ? styles.actionBtnOk :
                                sendStatus === 'error' ? styles.actionBtnError :
                                    sendStatus === 'sending' ? styles.actionBtnLoading : ''
                                }`}
                            onClick={askDiscordIdThenSend}
                            disabled={sendStatus === 'sending'}
                            title={sendError || 'Envoyer les logs vers Discord'}
                        >
                            <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
                                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03z" />
                            </svg>
                            {sendStatus === 'sending' ? '...' : sendStatus === 'ok' ? '✓ Envoyé' : sendStatus === 'error' ? '✗ Erreur' : 'Discord'}
                        </button>

                        {/* Sélectionner fichier */}
                        <button className={styles.actionBtn} onClick={pickFile} title="Choisir console.txt manuellement">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="12" height="12">
                                <path d="M3 7h5l2-3h6l2 3h3v13H3z" />
                            </svg>
                            Fichier
                        </button>

                        {/* Fermer */}
                        <button className={`${styles.actionBtn} ${styles.closeBtn}`} onClick={onClose}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* ── Path info ────────────────────────────────────────── */}
                {consolePath && (
                    <div className={styles.pathBar}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="11" height="11">
                            <path d="M3 7h5l2-3h6l2 3h3v13H3z" />
                        </svg>
                        <span className={styles.pathText}>{consolePath}</span>
                    </div>
                )}

                {/* ── Modal "Transmettre identifiant Discord ?" ──────────────── */}
                <AnimatePresence>
                    {showDiscordIdModal && (
                        <motion.div
                            className={styles.discordIdModalOverlay}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowDiscordIdModal(false)}
                        >
                            <motion.div
                                className={styles.discordIdModal}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <p className={styles.discordIdModalTitle}>Transmettre votre identifiant Discord aux administrateurs ?</p>
                                <p className={styles.discordIdModalDesc}>Cela permettra de vous identifier plus facilement en cas de support.</p>
                                <div className={styles.discordIdModalActions}>
                                    <button className={styles.discordIdBtnYes} onClick={() => sendDiscord(true)}>
                                        Oui, transmettre
                                    </button>
                                    <button className={styles.discordIdBtnNo} onClick={() => sendDiscord(false)}>
                                        Non
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ── Message d'erreur Discord ─────────────────────────── */}
                <AnimatePresence>
                    {sendStatus === 'error' && sendError && (
                        <motion.div
                            className={styles.errorBanner}
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                        >
                            ✗ {sendError}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ── Barre de filtres ─────────────────────────────────── */}
                <div className={styles.filterBar}>
                    <div className={styles.filterInput}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="13" height="13">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <input
                            type="text"
                            placeholder="Filtrer..."
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            className={styles.filterInputField}
                        />
                        {filter && <button className={styles.clearFilter} onClick={() => setFilter('')}>✕</button>}
                    </div>

                    <div className={styles.levelFilters}>
                        {(['ALL', 'WARN', 'ERROR'] as const).map((lvl) => (
                            <button
                                key={lvl}
                                className={`${styles.levelBtn}
                                    ${levelFilter === lvl ? styles.levelBtnActive : ''}
                                    ${lvl === 'WARN' ? styles.levelWarn : lvl === 'ERROR' ? styles.levelError : ''}`}
                                onClick={() => setLevelFilter(lvl)}
                            >
                                {lvl === 'ALL' ? 'Tout' : lvl}
                            </button>
                        ))}
                    </div>

                    <span className={styles.lineCount}>{filtered.length} lg</span>
                </div>

                {/* ── Console output ───────────────────────────────────── */}
                <div className={styles.console} ref={scrollRef} onScroll={handleScroll}>
                    {!consolePath ? (
                        <div className={styles.emptyState}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" width="36" height="36" opacity="0.25">
                                <path d="M3 7h5l2-3h6l2 3h3v13H3z" />
                            </svg>
                            <p>console.txt introuvable</p>
                            <button className={styles.pickBtn} onClick={pickFile}>Sélectionner manuellement</button>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className={styles.emptyState}><p>Aucune ligne</p></div>
                    ) : (
                        filtered.map((line, i) => (
                            <div key={i} className={`${styles.line} ${styles[`line${line.level}`]}`}>
                                <span className={styles.lineLevel}>{line.level}</span>
                                {line.category && <span className={styles.lineCategory}>{line.category}</span>}
                                <span className={styles.lineText}>{line.text || line.raw}</span>
                            </div>
                        ))
                    )}
                    <div ref={bottomRef} />
                </div>

                {/* ── Footer ──────────────────────────────────────────── */}
                <div className={styles.footer}>
                    <span className={styles.footerInfo}>
                        {isWatching && <><span className={styles.liveDot2} /> Suivi en direct</>}
                    </span>
                    {!autoScroll && (
                        <button className={styles.scrollBottomBtn} onClick={() => {
                            setAutoScroll(true);
                            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
                        }}>
                            ↓ Aller en bas
                        </button>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
};
