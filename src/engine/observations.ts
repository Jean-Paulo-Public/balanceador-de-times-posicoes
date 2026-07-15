import type { Team, TeamSlotPlayer } from '../domain/types';

/**
 * "Observações do Time": pontos de atenção sobre o time já montado. É puramente
 * diagnóstico — não influencia o sorteio.
 */

/** Diferença de estrela (0–5) em que o banco já é considerado mais forte que os titulares. */
const BENCH_STRONGER_GAP = 0.5;
/** A partir de quantos atacantes de origem o time é considerado "muito ofensivo". */
const MANY_ATTACKERS = 4;

const lineOf = (team: Team): TeamSlotPlayer[] => team.players.filter(tp => tp.roleShort !== 'GK');

export const generateTeamObservations = (team: Team): string[] => {
  const observations: string[] = [];
  const line = lineOf(team);

  const attackersByPos = line.filter(tp => tp.player.position === 'ATACANTE');
  const improvisedAttackers = line.filter(tp => tp.roleShort === 'ATA' && tp.improvised).map(tp => tp.player.name);
  const improvisedDefenders = line.filter(tp => tp.roleShort === 'DEF' && tp.improvised).map(tp => tp.player.name);

  // 1) Atacante improvisado (meia empurrado pro ataque por falta de atacante de origem).
  if (improvisedAttackers.length > 0) {
    observations.push(`${improvisedAttackers.join(', ')} ${improvisedAttackers.length > 1 ? 'estão' : 'está'} improvisado(s) no ataque — o time não tem atacante de origem, então priorizem quem finaliza melhor.`);
  }

  // 2) Zagueiro improvisado (meia/atacante recuado por falta de zagueiro de origem).
  if (improvisedDefenders.length > 0) {
    observations.push(`${improvisedDefenders.join(', ')} ${improvisedDefenders.length > 1 ? 'estão' : 'está'} improvisado(s) na zaga — o time não tem zagueiro de origem sobrando, reforcem a marcação.`);
  }

  // 3) Muitos atacantes de origem (ataque cheio, defesa possivelmente exposta).
  if (attackersByPos.length >= MANY_ATTACKERS) {
    observations.push(`${attackersByPos.length} atacantes de origem — time ofensivo, cuidado com o espaço nas costas da defesa.`);
  }

  // 4) Jogadores que recompõem pouco na linha.
  const lazy = line.filter(tp => tp.player.recompoePouco).map(tp => tp.player.name);
  if (lazy.length === 1) {
    observations.push(`${lazy[0]} recompõe pouco — fique de olho nas transições defensivas quando ele perder a bola.`);
  } else if (lazy.length > 1) {
    observations.push(`${lazy.join(', ')} recompõem pouco — o time pode sofrer em transições defensivas rápidas.`);
  }

  // 5) Time sem goleiro dedicado. Se alguém da linha também joga no gol, citar quem pode cobrir.
  const hasGoalkeeper = team.players.some(tp => tp.roleShort === 'GK');
  if (!hasGoalkeeper) {
    const backupGks = line.filter(tp => tp.player.isGoalkeeper).map(tp => tp.player.name);
    if (backupGks.length > 0) {
      observations.push(`Time sem goleiro fixo, mas ${backupGks.join(', ')} também joga(m) no gol — combinem quem cobre se precisar.`);
    } else {
      observations.push('Time sem goleiro dedicado e sem ninguém na linha que jogue no gol — combinem antes quem cobre essa função.');
    }
  }

  // 6) Banco visivelmente mais forte que o time titular.
  if (team.benchOverall !== undefined && team.benchOverall - team.overall >= BENCH_STRONGER_GAP) {
    observations.push('Banco de reservas está mais forte que os titulares — vale considerar um rodízio ao longo da partida.');
  }

  return observations;
};
