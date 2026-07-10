import { describe, it, expect } from 'vitest';
import { generateTeams } from './generateTeams';
import { makePlayer } from './testFixtures';

describe('generateTeams — Atacante "pivô de referência" evita recuar como Meia', () => {
  it('entre Atacantes de nível equivalente, o Atacante pivô é escalado como Meia improvisado com MENOS frequência', () => {
    // Pool controlada: 1 time só, formação OFENSIVA (2 Defensor + 2 Meia + 2 Atacante).
    // 2 Defensores nativos preenchem as 2 vagas de Defensor. 1 Meia nativo garante a
    // 1ª vaga de Meia (bucket nativo sempre vence). Os 2 Atacantes "fortes" (nível 6)
    // sempre vencem as 2 vagas nativas de Atacante. Sobram 3 Atacantes de nível igual
    // (3 estrelas) — só 1 deles é "pivô de referência" — disputando a ÚLTIMA vaga de
    // Meia (a única que sobra). Sem a penalidade, cada um teria ~33% de chance.
    const defensores = [makePlayer('DEFENSOR', 3), makePlayer('DEFENSOR', 3)];
    const meiaNativo = makePlayer('MEIA', 3);
    const atacantesFortes = [
      makePlayer('ATACANTE', 6, { name: 'Atacante Forte 1' }),
      makePlayer('ATACANTE', 6, { name: 'Atacante Forte 2' }),
    ];
    const atacantePivo = makePlayer('ATACANTE', 3, { name: 'Pivo Test', pivotFriendly: true });
    const atacanteB = makePlayer('ATACANTE', 3, { name: 'Atacante B', pivotFriendly: false });
    const atacanteC = makePlayer('ATACANTE', 3, { name: 'Atacante C', pivotFriendly: false });

    const pool = [...defensores, meiaNativo, ...atacantesFortes, atacantePivo, atacanteB, atacanteC];

    const numSimulations = 3000;
    const results = generateTeams(pool, 'OFENSIVA', 1, numSimulations, true, true);
    expect(results.length).toBeGreaterThan(0);

    const counts: Record<string, number> = { 'Pivo Test': 0, 'Atacante B': 0, 'Atacante C': 0 };
    for (const result of results) {
      const team = result.teams[0];
      const improvisedMeia = team.players.find(
        tp => tp.assignedRole !== 'Goleiro' && tp.roleShort === 'MEI' && tp.player.position === 'ATACANTE'
      );
      if (improvisedMeia) counts[improvisedMeia.player.name] += 1;
    }

    const total = counts['Pivo Test'] + counts['Atacante B'] + counts['Atacante C'];
    expect(total).toBeGreaterThan(0);

    const pivotShare = counts['Pivo Test'] / total;
    // Sem penalidade, cada Atacante teria ~33% de chance. Com a penalidade, o pivô
    // deve aparecer visivelmente menos que 1/3 das vezes, e menos que cada um dos outros.
    expect(pivotShare).toBeLessThan(0.28);
    expect(counts['Atacante B']).toBeGreaterThan(counts['Pivo Test']);
    expect(counts['Atacante C']).toBeGreaterThan(counts['Pivo Test']);
  });

  it('quando o Atacante pivô é claramente melhor que a alternativa, ele ainda pode ser escalado como Meia (a preferência não sacrifica muito overall)', () => {
    // Formação OFENSIVA. Os 2 Atacantes "fortes" (nível 6) sempre vencem as 2 vagas
    // nativas de Atacante. Sobram o Pivo (nível 3) e um Atacante Fraco (nível 1)
    // disputando a última vaga de Meia — mesmo com a penalidade, a diferença de nível
    // é grande o bastante pra o pivô ainda vencer essa disputa.
    const defensores = [makePlayer('DEFENSOR', 3), makePlayer('DEFENSOR', 3)];
    const meiaNativo = makePlayer('MEIA', 3);
    const atacantesFortes = [
      makePlayer('ATACANTE', 6, { name: 'Atacante Forte 1' }),
      makePlayer('ATACANTE', 6, { name: 'Atacante Forte 2' }),
    ];
    const atacantePivo = makePlayer('ATACANTE', 3, { name: 'Pivo Bom', pivotFriendly: true });
    const atacanteFraco = makePlayer('ATACANTE', 1, { name: 'Atacante Fraco', pivotFriendly: false });

    const pool = [...defensores, meiaNativo, ...atacantesFortes, atacantePivo, atacanteFraco];

    const results = generateTeams(pool, 'OFENSIVA', 1, 300, true, true);
    expect(results.length).toBeGreaterThan(0);

    for (const result of results) {
      const team = result.teams[0];
      const improvisedMeia = team.players.find(
        tp => tp.roleShort === 'MEI' && tp.player.position === 'ATACANTE'
      );
      expect(improvisedMeia).toBeDefined();
      expect(improvisedMeia!.player.name).toBe('Pivo Bom');
    }
  });
});
