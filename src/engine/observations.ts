import type { Team, TeamSlotPlayer } from '../domain/types';

/**
 * "Observações do Time": uma lista curta de pontos de atenção sobre o time já
 * montado, pensada pra chamar atenção pra riscos que a média/overall sozinha
 * não deixa óbvio (um craque que não recompõe, uma defesa abaixo da média dos
 * outros times, um time sem goleiro dedicado, etc.).
 *
 * Isso é só um resumo em texto — não influencia o algoritmo de balanceamento
 * em si (isso já acontece em generateTeams.ts / scoring.ts). Aqui é puramente
 * diagnóstico, pra ajudar quem vai jogar a se preparar.
 */

const RECOMPOSICAO_ALERTA = 2; // <= 2 estrelas (escala 1-6) é considerado baixo
const DEFENSIVE_GAP_ALERTA = 6; // pontos de overall defensivo abaixo da média dos outros times
const ATTACK_VS_DEFENSE_GAP = 10; // pontos de diferença entre nota de ataque e de defesa
const BENCH_STRONGER_GAP = 8; // pontos de overall que o banco precisa superar o titular
const MANY_IMPROV_THRESHOLD = 2; // quantidade de improvisados na linha que já vale observação

const lineOf = (team: Team): TeamSlotPlayer[] => team.players.filter(tp => tp.assignedRole !== 'Goleiro');

const roleAvg = (line: TeamSlotPlayer[], roleShort: string): number | null => {
  const filtered = line.filter(tp => tp.roleShort === roleShort);
  if (filtered.length === 0) return null;
  return filtered.reduce((s, tp) => s + tp.roleScore, 0) / filtered.length;
};

export const generateTeamObservations = (team: Team, allTeams: Team[]): string[] => {
  const observations: string[] = [];
  const line = lineOf(team);

  // 1) Jogadores titulares com recomposição defensiva baixa.
  const lowRecomposicao = line
    .filter(tp => (tp.player.stats.geral_recomposicaoDefensiva ?? 3) <= RECOMPOSICAO_ALERTA)
    .map(tp => tp.player.name);
  if (lowRecomposicao.length === 1) {
    observations.push(`${lowRecomposicao[0]} recompõe pouco — fique de olho nas transições defensivas quando ele perder a bola.`);
  } else if (lowRecomposicao.length > 1) {
    observations.push(`${lowRecomposicao.join(', ')} recompõem pouco — o time pode sofrer em transições defensivas rápidas.`);
  }

  // 2) Defesa abaixo da média dos outros times (risco de ser o time mais goleável).
  const others = allTeams.filter(t => t.id !== team.id);
  if (others.length > 0) {
    const avgOthersDef = others.reduce((s, t) => s + t.defensiveOverall, 0) / others.length;
    if (avgOthersDef - team.defensiveOverall >= DEFENSIVE_GAP_ALERTA) {
      observations.push('Defesa deste time está visivelmente abaixo da média dos outros — maior risco de sofrer gols, reforce a marcação.');
    }
  }

  // 3) Time sem goleiro dedicado (ninguém entrou como Goleiro nativo).
  const hasGoalkeeper = team.players.some(tp => tp.assignedRole === 'Goleiro');
  if (!hasGoalkeeper) {
    observations.push('Time sem goleiro dedicado — combinem antes quem cobre o gol.');
  }

  // 4) Muitos jogadores improvisados na linha (pode afetar entrosamento tático).
  const improvisedCount = line.filter(tp => tp.improvisationPenalty > 0).length;
  if (improvisedCount >= MANY_IMPROV_THRESHOLD) {
    const names = line.filter(tp => tp.improvisationPenalty > 0).map(tp => tp.player.name);
    observations.push(`${improvisedCount} jogadores fora da posição de origem (${names.join(', ')}) — pode faltar entrosamento tático no início.`);
  }

  // 5) Jogador(es) atuando como pivô (Meia com facilidade em ser pivô, improvisado de Atacante).
  const pivots = line.filter(tp => tp.player.pivotFriendly && tp.roleLabel?.includes('pivô')).map(tp => tp.player.name);
  if (pivots.length > 0) {
    observations.push(`${pivots.join(', ')} ${pivots.length > 1 ? 'estão' : 'está'} de pivô — priorizem bola no chão e apoio de curta distância pra ele(s) segurar.`);
  }

  // 6) Ataque nitidamente mais fraco que a defesa (pode ter dificuldade de fazer gols).
  const atkScore = roleAvg(line, 'ATA');
  const defScore = roleAvg(line, 'DEF');
  if (atkScore !== null && defScore !== null) {
    const atkOverall = Math.round((atkScore / 6) * 100);
    const defOverall = Math.round((defScore / 6) * 100);
    if (defOverall - atkOverall >= ATTACK_VS_DEFENSE_GAP) {
      observations.push('Ataque mais fraco que a defesa — o time tende a criar menos chances de gol, capriche na bola parada e nos contra-ataques.');
    }
  }

  // 7) Banco visivelmente mais forte que o time titular.
  if (team.benchOverall !== undefined && team.benchOverall - team.overall >= BENCH_STRONGER_GAP) {
    observations.push('Banco de reservas está mais forte que o time titular — vale considerar um rodízio ao longo da partida.');
  }

  return observations;
};
