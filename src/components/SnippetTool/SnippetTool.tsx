import React, { useState, useEffect, useRef } from 'react';
import styles from './SnippetTool.module.css';

export const SnippetTool: React.FC = () => {
    const [start, setStart] = useState<{ x: number, y: number } | null>(null);
    const [current, setCurrent] = useState<{ x: number, y: number } | null>(null);
    const [isSelecting, setIsSelecting] = useState(false);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                window.electronAPI.screenshotSnippetCancel();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const onMouseDown = (e: React.MouseEvent) => {
        setStart({ x: e.clientX, y: e.clientY });
        setCurrent({ x: e.clientX, y: e.clientY });
        setIsSelecting(true);
    };

    const onMouseMove = (e: React.MouseEvent) => {
        if (!isSelecting) return;
        setCurrent({ x: e.clientX, y: e.clientY });
    };

    const onMouseUp = () => {
        if (!start || !current) return;
        
        const x = Math.min(start.x, current.x);
        const y = Math.min(start.y, current.y);
        const width = Math.abs(start.x - current.x);
        const height = Math.abs(start.y - current.y);

        if (width > 5 && height > 5) {
            window.electronAPI.screenshotSnippetReady({ x, y, width, height });
        } else {
            window.electronAPI.screenshotSnippetCancel();
        }
        
        setIsSelecting(false);
    };

    const rect = start && current ? {
        left: Math.min(start.x, current.x),
        top: Math.min(start.y, current.y),
        width: Math.abs(start.x - current.x),
        height: Math.abs(start.y - current.y)
    } : null;

    return (
        <div 
            className={styles.overlay}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
        >
            <div className={styles.hint}>
                Faites glisser pour sélectionner une zone • ECHAP pour annuler
            </div>
            {rect && (
                <div 
                    className={styles.selection}
                    style={{
                        left: rect.left,
                        top: rect.top,
                        width: rect.width,
                        height: rect.height
                    }}
                >
                    <div className={styles.sizeHelper}>
                        {Math.round(rect.width)} x {Math.round(rect.height)}
                    </div>
                </div>
            )}
        </div>
    );
};
