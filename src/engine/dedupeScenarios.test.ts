import { describe, it, expect } from 'vitest';
import { generateTeams } from './generateTeams';
import { buildMinimalPool, buildBalancedPool } from './testFixtures';

describe('generateTeams — filtra cenários com escalação idêntica', () => {
  it('elenco totalmente "travado" (uma opção por vaga) sempre produz o mesmo cenário — resultado tem só 1 item mesmo pedindo muitas simulações', () => {
    // buildMinimalPool(1) gera exatamente 1 goleiro nativo + 1 Defensor + 4 Meias +
    // 1 Atacante — bate exatamente com as vagas da formação EQUILIBRADA (1-4-1), sem
    // nenhuma folga. Não existe nenhuma alternativa de escalação possível: é sempre
    // o mesmo time (mesmo que a ordem interna das vagas de Meia mude entre simulações).
    const pool = buildMinimalPool(1);
    const results = generateTeams(pool, 'EQUILIBRADA', 1, 300, false, true);
    expect(results.length).toBe(1);
  });

  it('nunca há duas escalações com a mesma assinatura (mesmos jogadores nas mesmas funções e no banco) entre os resultados', () => {
    const pool = buildBalancedPool(2);
    const results = generateTeams(pool, 'OFENSIVA', 2, 500, true, true);
    expect(results.length).toBeGreaterThan(0);

    const seen = new Set<string>();
    for (const result of results) {
      const signature = result.teams
        .map(t => {
          const byRole = ['GK', 'DEF', 'MEI', 'ATA']
            .map(role => `${role}:${t.players.filter(tp => tp.roleShort === role).map(tp => tp.player.id).sort().join(',')}`)
            .join(';');
          return `${byRole}|B:${t.bench.map(tp => tp.player.id).sort().join(',')}`;
        })
        .join('||');
      expect(seen.has(signature)).toBe(false);
      seen.add(signature);
    }
  });
});
