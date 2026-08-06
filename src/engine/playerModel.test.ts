import { describe, it, expect } from 'vitest';
import type { Player } from '../domain/types';
import type { AttrVector } from '../domain/attributes';
import { BOX_TO_BOX, allEnabled } from '../domain/positions';
import {
  attributesForPosition, effectiveAttributes, effectiveAttributesBase,
  suggestPositions, hasNoEnabledAmongBestPositions,
} from './playerModel';

let idc = 0;
const A = (o: Partial<AttrVector> = {}): AttrVector =>
  ({ FIN: 50, CRI: 50, DRI: 50, DEF: 50, VEL: 50, RCD: 50, INT: 50, MOV: 50, FIS: 50, OFE: 50, ...o });

const makePlayer = (overrides: Partial<Player> = {}): Player => ({
  id: `p${++idc}`, name: `P${idc}`, active: true, isGoalkeeper: false, position: 'MEIA',
  attributes: A(), gk: null, acceptedPositions: allEnabled([BOX_TO_BOX]),
  ...overrides,
});

describe('exceções de atributo por posição (modelo v3.1)', () => {
  it('sem exceção, attributesForPosition devolve a base intacta em qualquer posição', () => {
    const p = makePlayer({ attributes: A({ FIN: 60 }) });
    expect(attributesForPosition(p, 'PIVO')).toEqual(A({ FIN: 60 }));
    expect(attributesForPosition(p, 'ALA')).toEqual(A({ FIN: 60 }));
  });

  it('exceção de FIN em PIVO: fit maior em PIVO, atributos INALTERADOS nas outras posições', () => {
    const p = makePlayer({ attributes: A({ FIN: 60 }), positionOverrides: { PIVO: { FIN: 80 } } });
    expect(attributesForPosition(p, 'PIVO').FIN).toBe(80);
    // resto do vetor de PIVO intacto (só FIN mudou).
    expect(attributesForPosition(p, 'PIVO')).toEqual(A({ FIN: 80 }));
    // outras posições não são afetadas pela exceção.
    expect(attributesForPosition(p, 'ALA')).toEqual(A({ FIN: 60 }));
    expect(attributesForPosition(p, 'VOLANTE')).toEqual(A({ FIN: 60 }));
  });

  it('a exceção é ABSOLUTA (não delta): FIN=80 na exceção não soma com a base', () => {
    const p = makePlayer({ attributes: A({ FIN: 95 }), positionOverrides: { PIVO: { FIN: 80 } } });
    // mesmo a base sendo mais alta (95), a exceção absoluta prevalece (80), não vira 95+80.
    expect(attributesForPosition(p, 'PIVO').FIN).toBe(80);
  });

  it('ordem de aplicação: base -> sobrescrita da posição -> lesão (lesão reduz por último)', () => {
    const p = makePlayer({
      attributes: A({ FIN: 60, FIS: 60 }),
      positionOverrides: { PIVO: { FIN: 80 } },
      handicapPct: 30, // fator 0.7
    });
    // sem posição (effectiveAttributesBase): só base × lesão, sem a exceção.
    expect(effectiveAttributesBase(p).FIN).toBe(Math.round(60 * 0.7));
    // com a posição PIVO: exceção (80) × lesão (0.7) = 56, NÃO 60×0.7=42.
    expect(effectiveAttributes(p, 'PIVO').FIN).toBe(Math.round(80 * 0.7));
    // atributo sem exceção (FIS) na mesma posição: só base × lesão, igual ao caso sem posição.
    expect(effectiveAttributes(p, 'PIVO').FIS).toBe(effectiveAttributesBase(p).FIS);
  });
});

describe('suggestPositions — mesma conta do solver (Fase 4)', () => {
  it('perfil driblador (DRI alto/CRI baixo) rankeia ALA acima de VOLANTE', () => {
    const p = makePlayer({ attributes: A({ CRI: 20, DRI: 85, VEL: 75 }) });
    const ranked = suggestPositions(p);
    const idxAla = ranked.findIndex((r) => r.position === 'ALA');
    const idxVolante = ranked.findIndex((r) => r.position === 'VOLANTE');
    expect(idxAla).toBeLessThan(idxVolante);
  });

  it('perfil passador (CRI alto/DRI baixo) rankeia VOLANTE acima de ALA', () => {
    const p = makePlayer({ attributes: A({ CRI: 85, DRI: 20, DEF: 60, RCD: 60, INT: 60 }) });
    const ranked = suggestPositions(p);
    const idxAla = ranked.findIndex((r) => r.position === 'ALA');
    const idxVolante = ranked.findIndex((r) => r.position === 'VOLANTE');
    expect(idxVolante).toBeLessThan(idxAla);
  });

  it('devolve as 7 posições ordenadas por fit decrescente', () => {
    const p = makePlayer({ attributes: A({ FIN: 90, FIS: 85 }) });
    const ranked = suggestPositions(p);
    expect(ranked).toHaveLength(7);
    for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1].fit).toBeGreaterThanOrEqual(ranked[i].fit);
  });

  it('uma exceção de atributo por posição muda o ranking (PIVO sobe quando ganha a exceção)', () => {
    const base = makePlayer({ attributes: A({ FIN: 40, FIS: 40 }) });
    const withOverride = makePlayer({ attributes: A({ FIN: 40, FIS: 40 }), positionOverrides: { PIVO: { FIN: 95, FIS: 90 } } });
    const fitPivoBase = suggestPositions(base).find((r) => r.position === 'PIVO')!.fit;
    const fitPivoOverride = suggestPositions(withOverride).find((r) => r.position === 'PIVO')!.fit;
    expect(fitPivoOverride).toBeGreaterThan(fitPivoBase);
    // e PIVO passa a ser a melhor posição sugerida pra esse jogador.
    expect(suggestPositions(withOverride)[0].position).toBe('PIVO');
  });
});

describe('hasNoEnabledAmongBestPositions — aviso de cadastro', () => {
  it('dispara quando as posições habilitadas são todas fracas (fora do top 3)', () => {
    // perfil claramente PIVO/FIXO (FIN e FIS altos, DRI baixo) mas habilitado só em ALA.
    const p = makePlayer({
      attributes: A({ FIN: 90, FIS: 85, DRI: 10, CRI: 10 }),
      acceptedPositions: [{ position: 'ALA', enabled: true }],
    });
    expect(hasNoEnabledAmongBestPositions(p, { topN: 3 })).toBe(true);
  });

  it('não dispara quando ao menos uma habilitada está entre as melhores', () => {
    const p = makePlayer({
      attributes: A({ FIN: 90, FIS: 85, DRI: 10, CRI: 10 }),
      acceptedPositions: [{ position: 'PIVO', enabled: true }, { position: 'ALA', enabled: true }],
    });
    expect(hasNoEnabledAmongBestPositions(p, { topN: 3 })).toBe(false);
  });

  it('nunca dispara pra BOX_TO_BOX (coringa aceita qualquer uma das melhores)', () => {
    const p = makePlayer({
      attributes: A({ FIN: 90, FIS: 85 }),
      acceptedPositions: allEnabled([BOX_TO_BOX]),
    });
    expect(hasNoEnabledAmongBestPositions(p)).toBe(false);
  });
});
