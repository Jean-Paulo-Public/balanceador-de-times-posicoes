import { describe, it, expect } from 'vitest';
import {
  bandIndexForValue,
  buildAttributePowerRanking,
  buildGoalkeeperPowerRanking,
  hasEligibleGoalkeepers,
} from './powerRanking';
import { emptyAttrs } from '../../domain/attributes';
import type { Player } from '../../domain/types';

const makePlayer = (overrides: Partial<Player>): Player => ({
  id: overrides.id ?? crypto.randomUUID(),
  name: 'Jogador',
  active: true,
  isGoalkeeper: false,
  position: 'MEIA',
  attributes: emptyAttrs(50),
  gk: null,
  acceptedPositions: [{ position: 'BOX_TO_BOX', enabled: true }],
  ...overrides,
});

describe('bandIndexForValue', () => {
  it('mapeia exatamente os valores dos presets pra sua própria faixa', () => {
    // Nenhum=0, Mínimo=10, Muito baixa=20, Baixa=35, Média=50, Alta=75, Muito alta=85, Máx=100
    expect(bandIndexForValue(0)).toBe(0);
    expect(bandIndexForValue(10)).toBe(1);
    expect(bandIndexForValue(20)).toBe(2);
    expect(bandIndexForValue(35)).toBe(3);
    expect(bandIndexForValue(50)).toBe(4);
    expect(bandIndexForValue(75)).toBe(5);
    expect(bandIndexForValue(85)).toBe(6);
    expect(bandIndexForValue(100)).toBe(7);
  });

  it('valores manuais caem na faixa do preset mais próximo (fronteira no ponto médio)', () => {
    expect(bandIndexForValue(4)).toBe(0); // < 5 -> nenhum
    expect(bandIndexForValue(5)).toBe(1); // >= 5 -> mínimo
    expect(bandIndexForValue(14)).toBe(1); // < 15 -> mínimo
    expect(bandIndexForValue(15)).toBe(2); // >= 15 -> muito baixa
    expect(bandIndexForValue(27)).toBe(2); // < 27.5 -> muito baixa
    expect(bandIndexForValue(28)).toBe(3); // >= 27.5 -> baixa
    expect(bandIndexForValue(42)).toBe(3); // < 42.5 -> baixa
    expect(bandIndexForValue(43)).toBe(4); // >= 42.5 -> média
    expect(bandIndexForValue(62)).toBe(4); // < 62.5 -> média
    expect(bandIndexForValue(63)).toBe(5); // >= 62.5 -> alta
    expect(bandIndexForValue(79)).toBe(5); // < 80 -> alta
    expect(bandIndexForValue(80)).toBe(6); // >= 80 -> muito alta
    expect(bandIndexForValue(92)).toBe(6); // < 92.5 -> muito alta
    expect(bandIndexForValue(93)).toBe(7); // >= 92.5 -> máx
  });
});

describe('buildAttributePowerRanking', () => {
  it('inclui só jogadores ativos', () => {
    const players = [
      makePlayer({ name: 'Ativo', active: true, attributes: { ...emptyAttrs(50), FIN: 80 } }),
      makePlayer({ name: 'Inativo', active: false, attributes: { ...emptyAttrs(50), FIN: 80 } }),
    ];
    const result = buildAttributePowerRanking(players, 'FIN');
    const allNames = result.bands.flatMap((b) => b.players.map((p) => p.name));
    expect(allNames).toEqual(['Ativo']);
  });

  it('omite faixas sem nenhum jogador', () => {
    const players = [makePlayer({ name: 'A', attributes: { ...emptyAttrs(50), FIN: 100 } })];
    const result = buildAttributePowerRanking(players, 'FIN');
    expect(result.bands).toHaveLength(1);
    expect(result.bands[0].label).toBe('Máx');
  });

  it('ordena dentro da faixa por valor decrescente, empate por nome', () => {
    const players = [
      makePlayer({ name: 'Zeca', attributes: { ...emptyAttrs(50), FIN: 75 } }),
      makePlayer({ name: 'Bruno', attributes: { ...emptyAttrs(50), FIN: 78 } }),
      makePlayer({ name: 'Ana', attributes: { ...emptyAttrs(50), FIN: 75 } }),
    ];
    const result = buildAttributePowerRanking(players, 'FIN');
    expect(result.bands).toHaveLength(1);
    expect(result.bands[0].players.map((p) => p.name)).toEqual(['Bruno', 'Ana', 'Zeca']);
  });

  it('usa o valor efetivo (com lesão) igual ao exibido no card', () => {
    const player = makePlayer({ name: 'Machucado', attributes: { ...emptyAttrs(50), FIN: 60 }, handicapPct: 30 });
    const result = buildAttributePowerRanking([player], 'FIN');
    const entry = result.bands.flatMap((b) => b.players).find((p) => p.name === 'Machucado');
    expect(entry?.value).toBe(Math.round(60 * 0.7));
  });

  it('título usa o label legível do atributo, não a sigla', () => {
    const result = buildAttributePowerRanking([], 'CRI');
    expect(result.title).toBe('Criação');
  });

  it('agrupa na faixa "Mínimo" (preset 10) valores entre 5 e 15', () => {
    const players = [makePlayer({ name: 'A', attributes: { ...emptyAttrs(50), FIN: 10 } })];
    const result = buildAttributePowerRanking(players, 'FIN');
    expect(result.bands).toHaveLength(1);
    expect(result.bands[0].label).toBe('Mínimo');
    expect(result.bands[0].presetValue).toBe(10);
  });
});

describe('buildGoalkeeperPowerRanking', () => {
  it('inclui só ativos e aptos ao gol (gk != null)', () => {
    const players = [
      makePlayer({ name: 'Apto', active: true, gk: 70 }),
      makePlayer({ name: 'NaoApto', active: true, gk: null }),
      makePlayer({ name: 'AptoInativo', active: false, gk: 90 }),
    ];
    const result = buildGoalkeeperPowerRanking(players);
    const allNames = result.bands.flatMap((b) => b.players.map((p) => p.name));
    expect(allNames).toEqual(['Apto']);
  });

  it('respeita a lesão (nota efetiva de goleiro)', () => {
    const player = makePlayer({ name: 'G', gk: 80, handicapPct: 25 });
    const result = buildGoalkeeperPowerRanking([player]);
    const entry = result.bands.flatMap((b) => b.players)[0];
    expect(entry.value).toBe(Math.round(80 * 0.75));
  });
});

describe('hasEligibleGoalkeepers', () => {
  it('false quando ninguém ativo é apto ao gol', () => {
    const players = [makePlayer({ active: true, gk: null }), makePlayer({ active: false, gk: 80 })];
    expect(hasEligibleGoalkeepers(players)).toBe(false);
  });

  it('true quando há ao menos um ativo apto', () => {
    const players = [makePlayer({ active: true, gk: 60 })];
    expect(hasEligibleGoalkeepers(players)).toBe(true);
  });
});
