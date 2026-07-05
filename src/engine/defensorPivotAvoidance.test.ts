import { describe, it, expect } from 'vitest';
import { generateTeams } from './generateTeams';
import { makePlayer } from './testFixtures';

describe('generateTeams — evitar Meia pivô improvisado como Defensor', () => {
  it('nunca escala o Meia pivô na defesa quando há outro Meia disponível para o fallback', () => {
    // Pool sem nenhum Defensor nativo: as 2 vagas de Defensor da formação OFENSIVA
    // só podem ser preenchidas por Meias (fallback). Há 4 Meias de nível igual — só
    // 1 deles é "pivô". Como sempre sobram Meias não-pivô suficientes para as 2
    // vagas de Defensor (a fase de Defensor roda antes da de Meia, com todos os 4
    // Meias ainda disponíveis), o motor nunca deveria precisar usar o pivô ali.
    const meiaPivo = makePlayer('MEIA', 3, { name: 'Pivo Test', pivotFriendly: true });
    const meiasComuns = [
      makePlayer('MEIA', 3, { name: 'Meia B' }),
      makePlayer('MEIA', 3, { name: 'Meia C' }),
      makePlayer('MEIA', 3, { name: 'Meia D' }),
    ];
    const atacantes = [makePlayer('ATACANTE', 3), makePlayer('ATACANTE', 3)];
    const pool = [meiaPivo, ...meiasComuns, ...atacantes];

    const results = generateTeams(pool, 'OFENSIVA', 1, 300, true, true);
    expect(results.length).toBeGreaterThan(0);

    for (const result of results) {
      const team = result.teams[0];
      const pivotSlot = team.players.find(tp => tp.player.id === meiaPivo.id);
      expect(pivotSlot).toBeDefined();
      // O pivô pode estar no Meia (nativo) ou até no Atacante (bônus), mas nunca no Defensor.
      expect(pivotSlot!.roleShort).not.toBe('DEF');
    }
  });

  it('escala o Meia pivô na defesa só quando ele é a única opção restante', () => {
    // Pool sem nenhum Defensor nativo e com um único Meia no elenco inteiro (o pivô).
    // A vaga de Defensor (formação EQUILIBRADA) só pode ser preenchida por um Meia
    // (Atacante não pode improvisar de Defensor) — como não existe nenhum outro Meia,
    // o pivô é a ÚNICA opção possível e tem que ser escalado ali.
    const meiaPivo = makePlayer('MEIA', 3, { name: 'Pivo Único', pivotFriendly: true });
    // 5 jogadores de origem Atacante: 1 cobre a vaga nativa de Atacante, os outros 4
    // cobrem as 4 vagas de Meia por improviso (Atacante pode improvisar como Meia).
    const atacantes = Array.from({ length: 5 }, (_, i) => makePlayer('ATACANTE', 3, { name: `Atacante ${i + 1}` }));
    // EQUILIBRADA precisa de: 1 Defensor, 4 Meia, 1 Atacante = 6 no total.
    const pool = [meiaPivo, ...atacantes];

    const results = generateTeams(pool, 'EQUILIBRADA', 1, 300, true, true);
    expect(results.length).toBeGreaterThan(0);

    for (const result of results) {
      const team = result.teams[0];
      const pivotSlot = team.players.find(tp => tp.player.id === meiaPivo.id);
      expect(pivotSlot).toBeDefined();
      // Não existe nenhum outro Meia no elenco — tem que ser ele na defesa.
      expect(pivotSlot!.roleShort).toBe('DEF');
    }
  });
});
