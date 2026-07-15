import { Star, StarHalf } from 'lucide-react';
import styles from './StarRating.module.css';

interface StarRatingProps {
  label: string;
  value: number;
  onChange?: (value: number) => void;
  readOnly?: boolean;
  /** Tamanho do ícone da estrela (px). Padrão 24. */
  size?: number;
}

/** Escala de 0 a 5 estrelas, em passos de meia estrela. */
const STARS = [1, 2, 3, 4, 5];

export function StarRating({ label, value, onChange, readOnly = false, size = 24 }: StarRatingProps) {
  return (
    <div className={styles.wrapper}>
      {label && (
        <div className={styles.header}>
          <label className={styles.label}>{label}</label>
          <span className={styles.value}>{value}/5</span>
        </div>
      )}
      <div className={styles.stars}>
        {STARS.map((star) => {
          const isFull = value >= star;
          const isHalf = value === star - 0.5;
          const isActive = value >= star - 0.5;

          return (
            <div key={star} className={styles.starSlot}>
              <div className={styles.starIcon}>
                {isHalf ? (
                  <StarHalf size={size} fill="var(--color-accent)" color="var(--color-accent)" />
                ) : (
                  <Star
                    size={size}
                    fill={isFull ? 'var(--color-accent)' : 'transparent'}
                    color={isActive ? 'var(--color-accent)' : 'var(--star-inactive)'}
                  />
                )}
              </div>

              {!readOnly && (
                <div className={styles.clickZones}>
                  <div
                    className={styles.clickZone}
                    onClick={() => onChange?.(star === 1 && value === 0.5 ? 0 : star - 0.5)}
                  />
                  <div
                    className={styles.clickZone}
                    onClick={() => onChange?.(star)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!readOnly && (
        <div className={styles.hint}>
          Toque no lado esquerdo da estrela para meia (0,5), ou no lado direito para inteira.
        </div>
      )}
    </div>
  );
}
