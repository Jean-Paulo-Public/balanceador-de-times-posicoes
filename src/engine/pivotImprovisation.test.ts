import { describe, it, expect } from 'vitest';
import { generateTeams } from './generateTeams';
import { makePlayer } from './testFixtures';

describe('generateTeams — preferência por Meia "pivô" no improviso de Atacante', () => {
  it('entre Meias de nível equivalente, o Meia com pivotFriendly é escalado como Atacante improvisado com mais frequência', () => {
    // Pool mínima e controlada: 1 time só, formação OFENSIVA (2 Defensor + 2 Meia + 2 Atacante).
    // Só há 1 Atacante nativo, então o segundo slot de Atacante obrigatoriamente
    // precisa ser coberto por um dos 3 Meias (todos com o mesmo nível/estrelas,
    // exceto pivotFriendly, que só um deles tem).
    const defensores = [makePlayer('DEFENSOR', 3), makePlayer('DEFENSOR', 3)];
    const atacanteNativo = makePlayer('ATACANTE', 3);
    const meiaPivo = makePlayer('MEIA', 3, { name: 'Pivo Test', pivotFriendly: true });
    const meiaB = makePlayer('MEIA', 3, { name: 'Meia B', pivotFriendly: false });
    const meiaC = makePlayer('MEIA', 3, { name: 'Meia C', pivotFriendly: false });

    const pool = [...defensores, atacanteNativo, meiaPivo, meiaB, meiaC];

    const numSimulations = 3000;
    const results = generateTeams(pool, 'OFENSIVA', 1, numSimulations, true, true);
    expect(results.length).toBeGreaterThan(0);

    const counts: Record<string, number> = { 'Pivo Test': 0, 'Meia B': 0, 'Meia C': 0 };
    for (const result of results) {
      const team = result.teams[0];
      const improvisedAtacante = team.players.find(
        tp => tp.assignedRole !== 'Goleiro' && tp.roleShort === 'ATA' && tp.player.position === 'MEIA'
      );
      if (improvisedAtacante) counts[improvisedAtacante.player.name] += 1;
    }

    const total = counts['Pivo Test'] + counts['Meia B'] + counts['Meia C'];
    expect(total).toBeGreaterThan(0);

    const pivotShare = counts['Pivo Test'] / total;
    // Sem o bônus, cada Meia teria ~33% de chance. Com o bônus, o Meia pivô deve
    // aparecer visivelmente mais que 1/3 das vezes, e mais que cada um dos outros.
    expect(pivotShare).toBeGreaterThan(0.4);
    expect(counts['Pivo Test']).toBeGreaterThan(counts['Meia B']);
    expect(counts['Pivo Test']).toBeGreaterThan(counts['Meia C']);
  });

  it('rótulo do Meia pivô improvisado como Atacante é "Atacante (pivô)"', () => {
    const defensores = [makePlayer('DEFENSOR', 3), makePlayer('DEFENSOR', 3)];
    const atacanteNativo = makePlayer('ATACANTE', 6); // bem melhor, garante que fica na 1ª vaga nativa
    const meiaPivo = makePlayer('MEIA', 6, { name: 'Pivo Test', pivotFriendly: true }); // bem melhor que os outros, garante ser escolhido
    const meiaB = makePlayer('MEIA', 1, { name: 'Meia B', pivotFriendly: false });
    const meiaC = makePlayer('MEIA', 1, { name: 'Meia C', pivotFriendly: false });

    const pool = [...defensores, atacanteNativo, meiaPivo, meiaB, meiaC];
    const results = generateTeams(pool, 'OFENSIVA', 1, 200, true, true);
    expect(results.length).toBeGreaterThan(0);

    const team = results[0].teams[0];
    const pivotSlot = team.players.find(tp => tp.player.name === 'Pivo Test');
    expect(pivotSlot).toBeDefined();
    expect(pivotSlot!.roleLabel).toBe('Atacante (pivô)');
  });

  it('quando o time não tem nenhum Atacante nativo, o Meia pivô é escalado no ataque mesmo sendo claramente pior que os outros Meias (mesmo que isso derrube o overall)', () => {
    // Formação EQUILIBRADA (1 Defensor + 4 Meia + 1 Atacante). Sem nenhum Atacante
    // nativo no pool, a única vaga de Atacante tem que ser preenchida por um Meia.
    // O Meia pivô é propositalmente MUITO pior (nível 1) que os outros 4 Meias
    // (nível 6) — mesmo assim, ele deve ser o escolhido pro ataque, porque não há
    // nenhum Atacante nativo no time (regra "força" o pivô, ao contrário do bônus
    // pequeno usado quando o time já tem pelo menos um Atacante de origem).
    const defensorNativo = makePlayer('DEFENSOR', 3, { name: 'Defensor Único' });
    const meiaPivo = makePlayer('MEIA', 1, { name: 'Pivo Fraco', pivotFriendly: true });
    const meiasFortes = Array.from({ length: 4 }, (_, i) => makePlayer('MEIA', 6, { name: `Meia Forte ${i + 1}` }));
    const pool = [defensorNativo, meiaPivo, ...meiasFortes];

    const results = generateTeams(pool, 'EQUILIBRADA', 1, 300, true, true);
    expect(results.length).toBeGreaterThan(0);

    for (const result of results) {
      const team = result.teams[0];
      const pivotSlot = team.players.find(tp => tp.player.id === meiaPivo.id);
      expect(pivotSlot).toBeDefined();
      expect(pivotSlot!.roleShort).toBe('ATA');
    }
  });

  it('quando o time já tem um Atacante nativo, o Meia pivô NÃO é forçado na segunda vaga de Atacante (só ganha o bônus suave)', () => {
    // Formação OFENSIVA (2 Atacante). Com 1 Atacante nativo garantindo a primeira
    // vaga, a segunda vaga é fallback "comum" (soft bonus), não "forçado" — um Meia
    // não-pivô MUITO melhor deve vencer o Meia pivô fraco nessa segunda vaga.
    const defensores = [makePlayer('DEFENSOR', 3), makePlayer('DEFENSOR', 3)];
    const atacanteNativo = makePlayer('ATACANTE', 3);
    const meiaPivoFraco = makePlayer('MEIA', 1, { name: 'Pivo Fraco', pivotFriendly: true });
    const meiaForte = makePlayer('MEIA', 6, { name: 'Meia Forte', pivotFriendly: false });
    const meiaExtra = makePlayer('MEIA', 3, { name: 'Meia Extra', pivotFriendly: false });
    const pool = [...defensores, atacanteNativo, meiaPivoFraco, meiaForte, meiaExtra];

    const results = generateTeams(pool, 'OFENSIVA', 1, 300, true, true);
    expect(results.length).toBeGreaterThan(0);

    for (const result of results) {
      const team = result.teams[0];
      const secondAtacante = team.players.find(
        tp => tp.roleShort === 'ATA' && tp.player.position === 'MEIA'
      );
      expect(secondAtacante).toBeDefined();
      expect(secondAtacante!.player.name).toBe('Meia Forte');
    }
  });
});
