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

  // 3) Time sem goleiro dedicado (ninguém entrou como Goleiro nativo). Se pelo menos um
  // jogador da linha também sabe jogar no gol (isGoalkeeper), citar quem pode cobrir —
  // essa priorização já acontece no motor de balanceamento (ver GK_BACKUP_BONUS).
  const hasGoalkeeper = team.players.some(tp => tp.assignedRole === 'Goleiro');
  if (!hasGoalkeeper) {
    const backupGks = line.filter(tp => tp.player.isGoalkeeper).map(tp => tp.player.name);
    if (backupGks.length > 0) {
      observations.push(`Time sem goleiro fixo, mas ${backupGks.join(', ')} também joga(m) no gol — combinem quem cobre se precisar.`);
    } else {
      observations.push('Time sem goleiro dedicado e sem ninguém na linha que jogue no gol — combinem antes quem cobre essa função.');
    }
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

  // 5b) Meia pivô escalado na defesa por falta de opção (o motor evita isso sempre que
  // possível — só acontece quando não sobra nenhum outro Meia pra fazer esse papel).
  const pivotsOnDefense = line
    .filter(tp => tp.roleShort === 'DEF' && tp.player.pivotFriendly && tp.player.position === 'MEIA')
    .map(tp => tp.player.name);
  if (pivotsOnDefense.length > 0) {
    observations.push(`${pivotsOnDefense.join(', ')} ${pivotsOnDefense.length > 1 ? 'foram escalados' : 'foi escalado'} na defesa por falta de opção — ${pivotsOnDefense.length > 1 ? 'rendem' : 'rende'} mais no ataque, então fiquem de olho na marcação.`);
  }

  // 5c) Atacante "pivô de referência" recuado pra Meia por falta de opção (o motor evita
  // isso sempre que possível — ver PIVOT_AVOID_MEIA_PENALTY em improvisation.ts — mas
  // ainda pode acontecer se não sobrar alternativa melhor pro time).
  const pivotAtacantesAsMeia = line
    .filter(tp => tp.roleShort === 'MEI' && tp.player.pivotFriendly && tp.player.position === 'ATACANTE')
    .map(tp => tp.player.name);
  if (pivotAtacantesAsMeia.length > 0) {
    observations.push(`${pivotAtacantesAsMeia.join(', ')} ${pivotAtacantesAsMeia.length > 1 ? 'recuaram' : 'recuou'} pra Meia por falta de opção — ${pivotAtacantesAsMeia.length > 1 ? 'são referência' : 'é referência'} de área, não de construção, então não esperem tanto apoio na saída de bola dele(s).`);
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
