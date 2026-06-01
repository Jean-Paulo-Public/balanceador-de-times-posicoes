import { Star, StarHalf } from 'lucide-react';

interface StarRatingProps {
  label: string;
  value: number;
  onChange?: (value: number) => void;
  readOnly?: boolean;
}

export function StarRating({ label, value, onChange, readOnly = false }: StarRatingProps) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
        <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{label}</label>
        <span style={{ fontSize: '0.875rem', fontWeight: 'bold', color: 'var(--primary)' }}>{value}/6</span>
      </div>
      <div style={{ display: 'flex', gap: '4px', position: 'relative' }}>
        {[1, 2, 3, 4, 5, 6].map((star) => {
          const isFull = value >= star;
          const isHalf = value === star - 0.5;
          const isActive = value >= star - 0.5;

          return (
            <div key={star} style={{ position: 'relative', width: '24px', height: '24px' }}>
              <div style={{ position: 'absolute', top: 0, left: 0 }}>
                {isHalf ? (
                  <StarHalf size={24} fill="var(--star-active)" color="var(--star-active)" />
                ) : (
                  <Star 
                    size={24} 
                    fill={isFull ? 'var(--star-active)' : 'transparent'} 
                    color={isActive ? 'var(--star-active)' : 'var(--star-inactive)'} 
                  />
                )}
              </div>
              
              {!readOnly && (
                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex' }}>
                  <div 
                    style={{ flex: 1, cursor: 'pointer' }} 
                    onClick={() => onChange?.(star === 1 && value === 0.5 ? 0 : star - 0.5)}
                  />
                  <div 
                    style={{ flex: 1, cursor: 'pointer' }} 
                    onClick={() => onChange?.(star)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!readOnly && (
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
          Toque no lado esquerdo da estrela para meia (0.5), ou no lado direito para inteira. Toque duplo na primeira para zerar.
        </div>
      )}
    </div>
  );
}
