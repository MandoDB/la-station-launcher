import React from 'react';
import styles from './RecordingIndicator.module.css';

export const RecordingIndicator: React.FC = () => {
    return (
        <div className={styles.container}>
            <div className={styles.dot} />
            <span className={styles.text}>REC</span>
        </div>
    );
};
