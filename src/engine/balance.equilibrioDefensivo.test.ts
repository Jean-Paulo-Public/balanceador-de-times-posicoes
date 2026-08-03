// Calibragem do peso da defesa no custo do balanceador (Fase 7) — usa o
// ELENCO REAL do dono (agosto/2026, 12 ativos) pra travar o sintoma relatado:
// um dos times saiu com Tony, Guto, Jean e Torres juntos (quatro jogadores
// que voltam pouco pra marcar e são ruins defensivamente), enquanto os 4
// defensores bons do elenco (Jon, Jezzel, Rodrigo, Kleber) não foram
// distribuídos 2-2. Ver testFixtures.ts (`buildElencoRealAgosto2026`) pra
// cópia fiel do elenco.
//
// NOTA IMPORTANTE sobre os limites usados abaixo: este elenco de 12 tem
// exatamente 4 defensores realmente bons (Jon, Jezzel, Rodrigo, Kleber) e 5
// jogadores claramente ruins na defesa (Torres, Jean, Tony, Celso, Nishi) —
// Bruno (35 DEF / 35 RCD) fica fora dos dois grupos: é mediano, não bom nem
// tão ruim quanto os outros 5, e é o "coringa" (BOX_TO_BOX) que junto com
// Beto (VOLANTE habilitado) é o candidato plausível a "terceiro nome"
// defensivo de cada time. Com 12 jogadores / 2 times = 6 de linha cada, TODOS
// jogam (sem banco, sem goleiro reservado do elenco — "goleiro emprestado"
// sai de graça: 12 = 2×6 não sobra ninguém pra reservar).
//
// Consequência matemática dessa composição: os 5 jogadores "ruins" NÃO cabem
// com no máximo 2 por time (2+2=4 < 5) — pelo menos um time terá 3. O critério
// abaixo usa por isso o teto MATEMATICAMENTE ACHÁVEL (3 por time, nunca 4 ou
// 5), que já elimina o sintoma relatado (Tony+Jean+Torres+Guto = 4 juntos).
import { describe, it, expect } from 'vitest';
import { balanceTeams } from './balance';
import { buildElencoRealAgosto2026 } from './testFixtures';

const GOOD_DEFENDERS = ['Jon', 'Jezzel', 'Rodrigo', 'Kleber'];
/** Defensivamente ruins e claramente piores que o resto (Bruno fica de fora — é o "mediano"). */
const BAD_DEFENDERS = ['Torres', 'Jean', 'Tony', 'Celso', 'Nishi'];
const DEFENSIVE_SLOTS = ['FIXO', 'LATERAL', 'VOLANTE'];

describe('balanceTeams — equilíbrio defensivo (elenco real, agosto/2026)', () => {
  it('distribui os 4 defensores bons 2-2 entre os times (nunca 3+1 nem 4+0)', () => {
    const players = buildElencoRealAgosto2026();
    const res = balanceTeams(players, 2)!;
    expect(res).not.toBeNull();

    const counts = res.teams.map((t) =>
      t.slots.filter((s) => GOOD_DEFENDERS.includes(s.player.name)).length,
    );
    expect(counts.sort()).toEqual([2, 2]);
  });

  it('nenhum time concentra mais de 3 dos defensivamente ruins (Torres/Jean/Tony/Celso/Nishi) — teto matematicamente possível', () => {
    const players = buildElencoRealAgosto2026();
    const res = balanceTeams(players, 2)!;

    // São 5 jogadores "ruins" pra 2 times: por contagem, pelo menos um time
    // fica com 3 (2+2=4 < 5). O teto de 3 já corta o sintoma relatado (o time
    // problemático tinha 4: Tony+Jean+Torres+Guto).
    const counts = res.teams.map((t) => t.slots.filter((s) => BAD_DEFENDERS.includes(s.player.name)).length);
    for (const c of counts) expect(c).toBeLessThanOrEqual(3);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it('cada time recebe um "terceiro nome" defensivo (Beto ou Bruno) e escala pelo menos 2 em vagas defensivas — um dos times chega a 3', () => {
    const players = buildElencoRealAgosto2026();
    const res = balanceTeams(players, 2)!;

    // O ELENCO só tem 2 candidatos plausíveis a "terceiro nome" defensivo além
    // dos 4 bons: Beto (VOLANTE habilitado, DEF 35/RCD 75) e Bruno (coringa
    // BOX_TO_BOX, DEF 35/RCD 35). O SINTOMA relatado era os dois caírem no
    // MESMO time (o outro ficava sem nenhum reforço defensivo, só os 2 bons +
    // 4 jogadores ofensivos). O critério real de aceitação é esse: cada time
    // fica com EXATAMENTE UM dos dois.
    const thirdNameOf = (names: string[]): 'Beto' | 'Bruno' | null =>
      names.includes('Beto') ? 'Beto' : names.includes('Bruno') ? 'Bruno' : null;
    const thirdNames = res.teams.map((t) => thirdNameOf(t.slots.map((s) => s.player.name)));
    expect(thirdNames.sort()).toEqual(['Beto', 'Bruno']);

    // Quantos desses "terceiros nomes" (e demais aptos) acabam de fato ESCALADOS
    // em vaga defensiva (FIXO/LATERAL/VOLANTE) depende do encaixe do resto do
    // time: Jon, por exemplo, tem ALA como sua PRIMEIRA preferência cadastrada
    // (à frente de VOLANTE/LATERAL/FIXO) — o balanceador tem que respeitar essa
    // ordem (é escolha do dono), então o time que leva Jon estruturalmente não
    // força ele pra uma vaga defensiva só pra "completar 3". Por isso o piso
    // aqui é 2 por time (sempre alcançável: o outro bom defensor + o terceiro
    // nome), com pelo menos UM time alcançando 3 (mostrando que o mecanismo do
    // terceiro nome está de fato entrando em campo, e não só de reserva).
    const defensiveCounts = res.teams.map((t) => t.slots.filter((s) => DEFENSIVE_SLOTS.includes(s.role)).length);
    for (const c of defensiveCounts) expect(c).toBeGreaterThanOrEqual(2);
    expect(Math.max(...defensiveCounts)).toBeGreaterThanOrEqual(3);

    // Fit (0–100) de quem ocupa vaga defensiva tem que ser um encaixe real
    // (aceito na lista do jogador), não uma improvisação forçada — o pior fit
    // observado neste elenco entre os candidatos plausíveis (Bruno, coringa
    // sem preferência cadastrada) fica perto de ~38; o limiar abaixo dá folga.
    for (const t of res.teams) {
      const defensiveSlots = t.slots.filter((s) => DEFENSIVE_SLOTS.includes(s.role));
      expect(defensiveSlots.every((s) => s.fit >= 35)).toBe(true);
    }
  });

  it('o desequilíbrio exibido (gaps.def e gaps.geral) fica dentro de um limite razoável', () => {
    const players = buildElencoRealAgosto2026();
    const res = balanceTeams(players, 2)!;

    // Limites calibrados sobre a escala 0–100 dos OVRs: um gap de até ~12
    // pontos em `def` e ~10 em `geral` ainda lê como "times equilibrados" pro
    // usuário (a UI já arredonda pro inteiro mais próximo); acima disso, o
    // desequilíbrio fica visível demais no resumo exibido.
    expect(res.gaps.def).toBeLessThanOrEqual(12);
    expect(res.gaps.geral).toBeLessThanOrEqual(10);
  });
});
