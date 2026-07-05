import { describe, it, expect } from 'vitest';
import { generateTeams } from './generateTeams';
import { makePlayer } from './testFixtures';

describe('generateTeams — reserva de goleiro na defesa (GK_BACKUP_BONUS)', () => {
  it('um jogador nunca é escalado como goleiro e como defensor ao mesmo tempo', () => {
    // Pool simples com 1 goleiro nativo — ele deve aparecer OU como Goleiro OU
    // como jogador de linha em cada cenário, nunca as duas coisas na mesma escalação.
    const gk = makePlayer('DEFENSOR', 4, { isGoalkeeper: true, name: 'GK Titular' });
    const defensores = [makePlayer('DEFENSOR', 3), makePlayer('DEFENSOR', 3)];
    const meias = [makePlayer('MEIA', 3), makePlayer('MEIA', 3), makePlayer('MEIA', 3)];
    const atacante = makePlayer('ATACANTE', 3);
    const pool = [gk, ...defensores, ...meias, atacante];

    const results = generateTeams(pool, 'DEFENSIVA', 1, 300);
    expect(results.length).toBeGreaterThan(0);

    for (const result of results) {
      const team = result.teams[0];
      const appearances = team.players.filter(tp => tp.player.id === gk.id);
      // Ele só pode aparecer uma vez na escalação: ou como Goleiro, ou como Defensor — nunca os dois.
      expect(appearances.length).toBeLessThanOrEqual(1);
    }
  });

  it('quando o time não tem goleiro dedicado, prioriza um jogador isGoalkeeper na defesa se houver um disponível', () => {
    // 1 time só, sem goleiro nativo nenhum no pool (time nunca terá goleiro titular).
    // 3 candidatos a Defensor com nível igual: 1 deles também sabe jogar no gol.
    // Só 2 vagas de Defensor (formação DEFENSIVA) — o motor deve, na prática, quase
    // sempre garantir que o candidato "também goleiro" fique numa das duas vagas,
    // pra esse time ter alguém que cubra o gol se precisar.
    const backupGk = makePlayer('DEFENSOR', 4, { isGoalkeeper: true, name: 'Defensor-Goleiro' });
    const defA = makePlayer('DEFENSOR', 4, { name: 'Defensor A' });
    const defB = makePlayer('DEFENSOR', 4, { name: 'Defensor B' });
    const meias = [makePlayer('MEIA', 3), makePlayer('MEIA', 3), makePlayer('MEIA', 3)];
    const atacante = makePlayer('ATACANTE', 3);
    const pool = [backupGk, defA, defB, ...meias, atacante];

    const numSimulations = 1500;
    const results = generateTeams(pool, 'DEFENSIVA', 1, numSimulations, true, true);
    expect(results.length).toBeGreaterThan(0);

    let withBackupCoverage = 0;
    for (const result of results) {
      const team = result.teams[0];
      const hasDedicatedGk = team.players.some(tp => tp.assignedRole === 'Goleiro');
      expect(hasDedicatedGk).toBe(false); // não há goleiro nativo no pool, nunca deveria ter um titular
      const hasBackupOnLine = team.players.some(tp => tp.player.isGoalkeeper);
      if (hasBackupOnLine) withBackupCoverage += 1;
    }

    const coverageShare = withBackupCoverage / results.length;
    // Sem o bônus, a chance do "Defensor-Goleiro" pegar uma das 2 vagas entre 3
    // candidatos equivalentes seria de ~2/3. Com o bônus, deve ficar bem acima disso.
    expect(coverageShare).toBeGreaterThan(0.8);
  });
});
