import { Lightbulb } from 'lucide-react';
import styles from './TipsPanel.module.css';

export default function TipsPanel({ tip }) {
  if (!tip) return null;

  return (
    <div className={styles.panel}>
      <Lightbulb size={18} className={styles.icon} />
      <span className={styles.text}>
        {tip.text}
        {tip.link && (
          <a
            href={tip.link}
            className={styles.link}
            target="_blank"
            rel="noopener noreferrer"
          >
            Learn more &rarr;
          </a>
        )}
      </span>
    </div>
  );
}
