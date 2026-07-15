import type { Team, TeamSlotPlayer, Player } from '../domain/types';

/**
 * "Observações do Time": pontos de atenção sobre o time já montado. É puramente
 * diagnóstico e exibido só na tela (não entra nos exports de imagem/WhatsApp).
 * Considera o modelo atual: estrela única, improvisos de atacante/zagueiro e as
 * marcações (boa saída de bola, veloz, recompõe pouco, pivô).
 */

/** Diferença de estrela (0–5) em que o banco já é considerado mais forte que os titulares. */
const BENCH_STRONGER_GAP = 0.5;
/** A partir de quantos atacantes de origem o time é considerado "muito ofensivo". */
const MANY_ATTACKERS = 4;

const lineOf = (team: Team): TeamSlotPlayer[] => team.players.filter(tp => tp.roleShort !== 'GK');

/** Alguma equipe do sorteio tem esse traço? (pra só comentar a ausência quando o traço está "em jogo".) */
const traitInPlay = (allTeams: Team[], pred: (p: Player) => boolean): boolean =>
  allTeams.some(t => [...t.players, ...t.bench].some(tp => pred(tp.player)));

const listNames = (slots: TeamSlotPlayer[]): string => slots.map(tp => tp.player.name).join(', ');

export const generateTeamObservations = (team: Team, allTeams: Team[] = [team]): string[] => {
  const observations: string[] = [];
  const line = lineOf(team);

  const attackersByPos = line.filter(tp => tp.player.position === 'ATACANTE');
  const improvisedAttackers = line.filter(tp => tp.roleShort === 'ATA' && tp.improvised);
  const improvisedDefenders = line.filter(tp => tp.roleShort === 'DEF' && tp.improvised);

  // 1) Atacante improvisado (meia empurrado pro ataque por falta de atacante de origem).
  if (improvisedAttackers.length > 0) {
    observations.push(`${listNames(improvisedAttackers)} ${improvisedAttackers.length > 1 ? 'estão improvisados' : 'está improvisado'} no ataque — o time não tem atacante de origem, priorizem quem finaliza melhor.`);
  }

  // 2) Zagueiro improvisado (meia/atacante recuado por falta de zagueiro de origem).
  if (improvisedDefenders.length > 0) {
    observations.push(`${listNames(improvisedDefenders)} ${improvisedDefenders.length > 1 ? 'recuaram' : 'recuou'} pra zaga por falta de zagueiro de origem — reforcem a marcação.`);
  }

  // 3) Muitos atacantes de origem (ataque cheio, defesa possivelmente exposta).
  if (attackersByPos.length >= MANY_ATTACKERS) {
    observations.push(`${attackersByPos.length} atacantes de origem — time ofensivo, cuidado com o espaço nas costas da defesa.`);
  }

  // 4) Jogadores que recompõem pouco na linha.
  const lazy = line.filter(tp => tp.player.recompoePouco);
  if (lazy.length === 1) {
    observations.push(`${listNames(lazy)} recompõe pouco — atenção nas transições quando ele perder a bola.`);
  } else if (lazy.length > 1) {
    observations.push(`${listNames(lazy)} recompõem pouco — o time pode sofrer em transições rápidas.`);
  }

  // 5) Sem ninguém de boa saída de bola (só comenta se o traço existe em algum time).
  if (traitInPlay(allTeams, p => p.boaSaidaDeBola) && !line.some(tp => tp.player.boaSaidaDeBola)) {
    observations.push('Ninguém com boa saída de bola — o time pode ter dificuldade pra construir a partir de trás.');
  }

  // 6) Sem ninguém veloz (só comenta se o traço existe em algum time).
  if (traitInPlay(allTeams, p => p.veloz) && !line.some(tp => tp.player.veloz)) {
    observations.push('Sem jogador veloz — pode faltar velocidade nas transições e nas costas da defesa adversária.');
  }

  // 7) Time sem goleiro dedicado. Se alguém da linha também joga no gol, citar quem pode cobrir.
  const hasGoalkeeper = team.players.some(tp => tp.roleShort === 'GK');
  if (!hasGoalkeeper) {
    const backupGks = line.filter(tp => tp.player.isGoalkeeper);
    if (backupGks.length > 0) {
      observations.push(`Sem goleiro fixo, mas ${listNames(backupGks)} também joga(m) no gol — combinem quem cobre.`);
    } else {
      observations.push('Sem goleiro dedicado e ninguém na linha que jogue no gol — combinem antes quem cobre o gol.');
    }
  }

  // 8) Banco visivelmente mais forte que o time titular.
  if (team.benchOverall !== undefined && team.benchOverall - team.overall >= BENCH_STRONGER_GAP) {
    observations.push('Banco mais forte que os titulares — vale um rodízio ao longo da partida.');
  }

  return observations;
};
