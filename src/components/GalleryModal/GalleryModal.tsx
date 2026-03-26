import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './GalleryModal.module.css';
import { useLauncher } from '../../context/LauncherContext';
import { ScreenshotMetadata } from '../../types/electron';

interface GalleryModalProps {
    onClose: () => void;
}

export const GalleryModal: React.FC<GalleryModalProps> = ({ onClose }) => {
    const { addToast } = useLauncher();
    const [mode, setMode] = useState<'screenshots' | 'clips'>('screenshots');
    const [items, setItems] = useState<any[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [title, setTitle] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [viewingPath, setViewingPath] = useState<string | null>(null);

    const loadItems = async () => {
        setIsLoading(true);
        try {
            const list = mode === 'screenshots' 
                ? await window.electronAPI.screenshotList(50)
                : await window.electronAPI.recorderList(50);
            setItems(list);
        } catch (e) {
            console.error('Failed to load items', e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadItems();
    }, [mode]);

    const toggleSelect = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const handleDelete = async (e: React.MouseEvent, path: string, id: string) => {
        e.stopPropagation();
        if (!confirm('Supprimer cette capture définitivement ?')) return;
        if (mode === 'screenshots') await window.electronAPI.screenshotDelete(path);
        else await window.electronAPI.recorderDelete(path);
        setItems(prev => prev.filter(s => s.id !== id));
        const newSet = new Set(selectedIds);
        newSet.delete(id);
        setSelectedIds(newSet);
    };

    const handleView = (e: React.MouseEvent, path: string) => {
        e.stopPropagation();
        setViewingPath(path);
    };

    const handleDeleteSelected = async () => {
        if (selectedIds.size === 0) return;
        if (!confirm(`Supprimer ces ${selectedIds.size} éléments définitivement ?`)) return;

        setIsSending(true);
        const toDelete = items.filter(s => selectedIds.has(s.id));
        
        try {
            for (const s of toDelete) {
                if (mode === 'screenshots') await window.electronAPI.screenshotDelete(s.path);
                else await window.electronAPI.recorderDelete(s.path);
            }
            setItems(prev => prev.filter(s => !selectedIds.has(s.id)));
            setSelectedIds(new Set());
            addToast({ type: 'success', title: 'Supprimé !', message: 'Les fichiers ont été retirés du disque.' });
        } catch (e: any) {
            addToast({ type: 'error', title: 'Erreur', message: e.message });
        } finally {
            setIsSending(false);
        }
    };

    const handleSend = async () => {
        if (selectedIds.size === 0) return;
        if (mode === 'clips') {
            addToast({ type: 'warning', title: 'Indisponible', message: 'Le partage de clips sur Discord arrive bientôt !' });
            return;
        }
        
        setIsSending(true);
        const selectedPaths = items
            .filter(s => selectedIds.has(s.id))
            .map(s => s.path);

        try {
            const user = await window.electronAPI.discordGetUser();
            const res = await window.electronAPI.screenshotSendDiscord(selectedPaths, title || undefined, user?.id);
            if (res.success) {
                addToast({ type: 'success', title: 'Envoyé !', message: `${selectedIds.size} capture(s) partagée(s) sur Discord.` });
                onClose();
            } else {
                addToast({ type: 'error', title: 'Erreur Discord', message: res.error || 'Erreur inconnue' });
            }
        } catch (e: any) {
            addToast({ type: 'error', title: 'Erreur', message: e.message });
        } finally {
            setIsSending(false);
        }
    };

    return (
        <motion.div 
            className={styles.overlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
        >
            <motion.div 
                className={styles.modal}
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
            >
                <div className={styles.header}>
                    <div className={styles.titleInfo}>
                        <div className={styles.modalModeSwitch}>
                            <button 
                                className={mode === 'screenshots' ? styles.activeMode : ''} 
                                onClick={() => { setMode('screenshots'); setSelectedIds(new Set()); }}
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                    <circle cx="8.5" cy="8.5" r="1.5" />
                                    <polyline points="21 15 16 10 5 21" />
                                </svg>
                                Screenshots
                            </button>
                            <button 
                                className={mode === 'clips' ? styles.activeMode : ''} 
                                onClick={() => { setMode('clips'); setSelectedIds(new Set()); }}
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                                    <polygon points="23 7 16 12 23 17 23 7" />
                                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                                </svg>
                                Clips (Video)
                            </button>
                        </div>
                        <p>{items.length} {mode === 'screenshots' ? 'images' : 'vidéos'} trouvées • {selectedIds.size} sélectionnée(s)</p>
                    </div>
                    <div className={styles.headerActions}>
                        <button className={styles.folderBtn} onClick={() => mode === 'screenshots' ? window.electronAPI.screenshotOpenFolder() : window.electronAPI.recorderOpenFolder()}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                            </svg>
                            Ouvrir le dossier
                        </button>
                        <button className={styles.closeBtn} onClick={onClose}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="20" height="20">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    </div>
                </div>

                <div className={styles.content}>
                    {isLoading ? (
                        <div className={styles.empty}>Chargement...</div>
                    ) : items.length === 0 ? (
                        <div className={styles.empty}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48">
                                {mode === 'screenshots' ? (
                                    <>
                                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                        <circle cx="8.5" cy="8.5" r="1.5" />
                                        <polyline points="21 15 16 10 5 21" />
                                    </>
                                ) : (
                                    <>
                                        <polygon points="23 7 16 12 23 17 23 7" />
                                        <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                                    </>
                                )}
                            </svg>
                            <p>Aucun {mode === 'screenshots' ? "capture d'écran" : "clip vidéo"} pour le moment.</p>
                            <small>Utilisez {mode === 'screenshots' ? 'F10' : 'F8'} en jeu pour capturer vos moments !</small>
                        </div>
                    ) : (
                        <div className={styles.grid}>
                            {items.map((s) => (
                                <div 
                                    key={s.id} 
                                    className={`${styles.card} ${selectedIds.has(s.id) ? styles.selected : ''} ${mode === 'clips' ? styles.videoCard : ''}`}
                                    onClick={() => toggleSelect(s.id)}
                                >
                                    {mode === 'screenshots' ? (
                                        <img src={`local-img:///${s.path}`} alt={s.filename} className={styles.thumb} />
                                    ) : (
                                        <div className={styles.videoThumb}>
                                            <video 
                                                src={`local-img:///${s.path}#t=0.5`} 
                                                className={styles.videoPreview} 
                                                muted 
                                                playsInline 
                                                onMouseOver={e => e.currentTarget.play()}
                                                onMouseOut={e => { e.currentTarget.pause(); e.currentTarget.currentTime = 0.5; }}
                                            />
                                            <div className={styles.playIcon}>
                                                <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                                                    <polygon points="5 3 19 12 5 21 5 3" />
                                                </svg>
                                            </div>
                                            <span className={styles.videoMeta}>{s.filename}</span>
                                        </div>
                                    )}
                                    <div className={styles.cardOverlay}>
                                        <div className={styles.check}>
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" width="12" height="12">
                                                <polyline points="20 6 9 17 4 12" />
                                            </svg>
                                        </div>

                                        <div className={styles.cardActions}>
                                            <button 
                                                className={styles.viewBtn} 
                                                onClick={(e) => handleView(e, s.path)}
                                                title="Voir en grand"
                                            >
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14">
                                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                                    <circle cx="12" cy="12" r="3" />
                                                </svg>
                                            </button>
                                            <button 
                                                className={styles.delBtn} 
                                                onClick={(e) => handleDelete(e, s.path, s.id)}
                                                title="Supprimer"
                                            >
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                                                    <polyline points="3 6 5 6 21 6" />
                                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className={styles.footer}>
                    {selectedIds.size > 0 && (
                        <div className={styles.selectionCount}>
                            <strong>{selectedIds.size}</strong> sélectionné(s)
                            <button className={styles.bulkDelBtn} onClick={handleDeleteSelected} disabled={isSending}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14">
                                    <polyline points="3 6 5 6 21 6" />
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                                Supprimer
                            </button>
                        </div>
                    )}

                    <div className={styles.inputHost}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                        <input 
                            type="text" 
                            placeholder="Ajouter un titre (optionnel)..." 
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            disabled={isSending || selectedIds.size === 0}
                        />
                    </div>
                    
                    <button 
                        className={styles.sendBtn}
                        onClick={handleSend}
                        disabled={isSending || selectedIds.size === 0}
                    >
                        {isSending ? (
                            <>
                                <div className={styles.spinner} />
                                Envoi...
                            </>
                        ) : (
                            <>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
                                    <line x1="22" y1="2" x2="11" y2="13" />
                                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                                </svg>
                                Partager {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
                            </>
                        )}
                    </button>
                </div>
            </motion.div>

            <AnimatePresence>
                {viewingPath && (
                    <motion.div 
                        className={styles.lightbox}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setViewingPath(null)}
                    >
                        {viewingPath.toLowerCase().endsWith('.webm') ? (
                            <motion.video 
                                src={`local-img:///${viewingPath}`} 
                                className={styles.player} 
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.8, opacity: 0 }}
                                controls 
                                autoPlay 
                                onClick={(e) => e.stopPropagation()} 
                            />
                        ) : (
                            <motion.img 
                                src={`local-img:///${viewingPath}`} 
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.8, opacity: 0 }}
                                onClick={(e) => e.stopPropagation()}
                            />
                        )}
                        <button className={styles.lightboxClose} onClick={() => setViewingPath(null)}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" width="24" height="24">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};
