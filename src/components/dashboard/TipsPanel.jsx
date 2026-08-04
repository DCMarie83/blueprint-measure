import { Lightbulb } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import styles from './TipsPanel.module.css';

export default function TipsPanel({ tip }) {
  const { t } = useTranslation();
  if (!tip) return null;

  return (
    <section>
      <h3 className={styles.heading}>{t('dashboard:tips.title')}</h3>
      <div className={styles.panel}>
        <Lightbulb size={18} className={styles.icon} />
        <span className={styles.text}>
          {t(tip.text)}
          {tip.link && (
            <a
              href={tip.link}
              className={styles.link}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('dashboard:tips.learnMore')}
            </a>
          )}
        </span>
      </div>
    </section>
  );
}
