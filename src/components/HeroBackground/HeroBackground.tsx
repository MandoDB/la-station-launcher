import React from 'react';
import styles from './HeroBackground.module.css';

/**
 * Fond atmosphérique du launcher :
 * - Dégradé radial sombre post-apo
 * - Lignes géométriques subtiles
 * - Particules flottantes via CSS
 */
export const HeroBackground: React.FC = () => {
    return (
        <div className={styles.bg} aria-hidden="true">
            {/* Couche de brume */}
            <div className={styles.fog1} />
            <div className={styles.fog2} />

            {/* Grille perspective */}
            <div className={styles.grid} />

            {/* Particules */}
            <div className={styles.particles}>
                {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} className={styles.particle} style={{ '--i': i } as React.CSSProperties} />
                ))}
            </div>

            {/* Ligne horizon */}
            <div className={styles.horizon} />
        </div>
    );
};
