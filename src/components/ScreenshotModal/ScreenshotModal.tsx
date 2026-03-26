import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ScreenshotMetadata } from '../../types/electron';
import styles from './ScreenshotModal.module.css';

interface ScreenshotModalProps {
    screenshot: ScreenshotMetadata;
    onClose: () => void;
}

export const ScreenshotModal: React.FC<ScreenshotModalProps> = ({ screenshot, onClose }) => {
    const [title, setTitle] = useState('');
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSend = async () => {
        setSending(true);
        setError(null);
        try {
            // Optionnel : récupérer l'ID Discord du user si connecté
            const user = await window.electronAPI.discordGetUser();
            const result = await window.electronAPI.screenshotSendDiscord(screenshot.path, title, user?.id);
            if (result.success) {
                setSent(true);
                window.electronAPI.screenshotShareDone();
                setTimeout(onClose, 2000);
            } else {
                setError(result.error ?? 'Erreur lors de l\'envoi');
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setSending(false);
        }
    };

    return (
        <motion.div 
            className={styles.overlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
        >
            <motion.div 
                className={styles.modal}
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className={styles.header}>
                    <h3>Envoyer vers Discord</h3>
                    <button className={styles.closeBtn} onClick={onClose}>&times;</button>
                </div>

                <div className={styles.previewContainer}>
                    <img 
                        src={`local-img:///${screenshot.path}`} 
                        alt="Preview" 
                        className={styles.preview}
                    />
                </div>

                <div className={styles.body}>
                    <label>Titre / Légende (optionnel)</label>
                    <input 
                        type="text"
                        placeholder="Ex: Ma base après 2 mois de survie !"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className={styles.input}
                        disabled={sending || sent}
                        autoFocus
                    />
                    
                    {error && <p className={styles.error}>{error}</p>}
                </div>

                <div className={styles.footer}>
                    <button 
                        className={styles.cancelBtn} 
                        onClick={onClose}
                        disabled={sending}
                    >
                        Annuler
                    </button>
                    <button 
                        className={styles.sendBtn} 
                        onClick={handleSend}
                        disabled={sending || sent}
                    >
                        {sending ? 'Envoi en cours...' : sent ? '✓ Envoyé !' : 'Publier sur Discord'}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
};
