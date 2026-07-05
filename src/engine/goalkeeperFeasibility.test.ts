import { describe, it, expect } from 'vitest';
import { generateTeams } from './generateTeams';
import { makePlayer, makeGoalkeeper } from './testFixtures';

describe('generateTeams — reservar goleiro nativo nunca pode inviabilizar a escalação', () => {
  it('elenco justo (sem sobra) com goleiro nativo ainda gera times, mesmo sem "nunca escalar goleiros"', () => {
    // Bug relatado: com um elenco exatamente do tamanho mínimo (numTeams*6, sem
    // ninguém de sobra), reservar um goleiro nativo pra cada time tirava gente
    // demais do pool de linha e invalidava TODAS as simulações — a tela mostrava
    // "nenhuma combinação viável", mas marcando "nunca escalar goleiros" funcionava
    // normalmente. A regra de "goleiro dedicado por time" deve ceder quando não há
    // sobra suficiente no elenco, em vez de travar a escalação inteira.
    const numTeams = 2;
    const gk = makeGoalkeeper(4, { position: 'DEFENSOR', name: 'Goleiro Único' });
    const defensores = [makePlayer('DEFENSOR', 3), makePlayer('DEFENSOR', 3), makePlayer('DEFENSOR', 3)];
    const meias = [
      makePlayer('MEIA', 3), makePlayer('MEIA', 3), makePlayer('MEIA', 3),
      makePlayer('MEIA', 3), makePlayer('MEIA', 3),
    ];
    const atacantes = [makePlayer('ATACANTE', 3), makePlayer('ATACANTE', 3), makePlayer('ATACANTE', 3)];
    // 1 + 3 + 5 + 3 = 12 = numTeams * 6, exatamente no limite, sem sobra nenhuma.
    const pool = [gk, ...defensores, ...meias, ...atacantes];

    const withGkScaling = generateTeams(pool, 'EQUILIBRADA', numTeams, 300, false, false);
    expect(withGkScaling.length).toBeGreaterThan(0);

    // Como não há sobra, nenhum time deveria ter conseguido reservar um goleiro
    // dedicado (isso exigiria tirar gente da linha, o que não é viável aqui) — o
    // goleiro nativo deve ter jogado normalmente na posição de origem dele.
    for (const result of withGkScaling) {
      const teamsWithDedicatedGk = result.teams.filter(t => t.players.some(tp => tp.assignedRole === 'Goleiro'));
      expect(teamsWithDedicatedGk.length).toBe(0);
    }
  });

  it('elenco com folga suficiente ainda reserva goleiro(s) nativo(s) normalmente', () => {
    // Com sobra no elenco, a reserva de goleiro deve continuar funcionando como antes.
    const numTeams = 2;
    const goleiros = [makeGoalkeeper(4, { position: 'DEFENSOR' }), makeGoalkeeper(4, { position: 'DEFENSOR' })];
    const defensores = [makePlayer('DEFENSOR', 3), makePlayer('DEFENSOR', 3), makePlayer('DEFENSOR', 3), makePlayer('DEFENSOR', 3)];
    const meias = [
      makePlayer('MEIA', 3), makePlayer('MEIA', 3), makePlayer('MEIA', 3),
      makePlayer('MEIA', 3), makePlayer('MEIA', 3), makePlayer('MEIA', 3),
    ];
    const atacantes = [makePlayer('ATACANTE', 3), makePlayer('ATACANTE', 3), makePlayer('ATACANTE', 3), makePlayer('ATACANTE', 3)];
    // 2 + 4 + 6 + 4 = 16, numTeams*6 = 12, sobra de 4 — dá pra reservar os 2 goleiros.
    const pool = [...goleiros, ...defensores, ...meias, ...atacantes];

    const results = generateTeams(pool, 'EQUILIBRADA', numTeams, 300, false, false);
    expect(results.length).toBeGreaterThan(0);

    const anyResultWithBothGks = results.some(
      result => result.teams.every(t => t.players.some(tp => tp.assignedRole === 'Goleiro'))
    );
    expect(anyResultWithBothGks).toBe(true);
  });
});
