// Checagem de FACTIBILIDADE por posição (Fase 5) — roda ANTES de tentar montar
// os times. A regra do pivô (nenhum time pode ter mais de um) já sai de graça
// do modelo v3 (cada sistema tem exatamente 1 vaga que aceita PIVO — Fase 4),
// mas isso não impede um cenário travado: se há MAIS jogadores que só jogam de
// pivô do que TIMES, é matematicamente impossível formar as equipes (alguém
// ficaria sem vaga de pivô em algum time). Generaliza pra qualquer posição
// onde a demanda de "especialistas únicos" exceda a oferta de vagas.
//
// Nunca falha em silêncio nem relaxa a regra sozinho: trava e devolve um erro
// que NOMEIA os jogadores envolvidos.

import type { Player } from '../domain/types';
import { ALL_LINE_POSITIONS, LINE_POSITIONS, enabledLinePositions, hasEnabledBoxToBox, type LinePosition } from '../domain/positions';
import { ALL_SYSTEMS, SYSTEMS } from './formationModel';

/** Máximo de vagas que ACEITAM `pos` num mesmo time, considerando os 4 sistemas
 * (o solver escolhe o melhor sistema por time — usamos o mais generoso). */
const maxSlotsPerTeamFor = (pos: LinePosition): number =>
  Math.max(...ALL_SYSTEMS.map((sys) => SYSTEMS[sys].slots.filter((s) => s.identities.includes(pos)).length));

const MAX_SLOTS_PER_TEAM: Record<LinePosition, number> = Object.fromEntries(
  ALL_LINE_POSITIONS.map((pos) => [pos, maxSlotsPerTeamFor(pos)]),
) as Record<LinePosition, number>;

export interface FeasibilityViolation {
  position: LinePosition;
  /** Quantos jogadores só aceitam ESSA posição (lista singleton, sem BOX_TO_BOX). */
  count: number;
  /** Quantas vagas dessa posição cabem no total, dado o nº de times. */
  maxAllowed: number;
  playerNames: string[];
}

export interface FeasibilityResult {
  feasible: boolean;
  violations: FeasibilityViolation[];
  /** Mensagem pronta pra exibir na UI, nomeando os jogadores — null se factível. */
  message: string | null;
}

/** "A, B e C" (português, sem vírgula antes do "e" final). */
const joinNames = (names: string[]): string => {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
};

const onlyPlaysPosition = (p: Player, pos: LinePosition): boolean => {
  if (hasEnabledBoxToBox(p.acceptedPositions)) return false;
  const enabled = enabledLinePositions(p.acceptedPositions);
  return enabled.length === 1 && enabled[0] === pos;
};

/**
 * Checa, pra cada uma das 7 posições, se o nº de jogadores que SÓ jogam
 * naquela posição excede o nº de vagas disponíveis (maxSlotsPerTeam × times).
 * Devolve TODAS as violações encontradas (não só a primeira) — a mensagem
 * final concatena todas, nomeando os jogadores de cada uma.
 */
export const checkPositionFeasibility = (players: Player[], numTeams: number): FeasibilityResult => {
  const violations: FeasibilityViolation[] = [];
  for (const pos of ALL_LINE_POSITIONS) {
    const holders = players.filter((p) => onlyPlaysPosition(p, pos));
    const maxAllowed = MAX_SLOTS_PER_TEAM[pos] * numTeams;
    if (holders.length > maxAllowed) {
      violations.push({ position: pos, count: holders.length, maxAllowed, playerNames: holders.map((p) => p.name) });
    }
  }
  if (violations.length === 0) return { feasible: true, violations: [], message: null };

  const parts = violations.map((v) => {
    const label = LINE_POSITIONS[v.position].label.toLowerCase();
    const vagaWord = v.maxAllowed === 1 ? 'vaga' : 'vagas';
    return `${joinNames(v.playerNames)} só ${v.playerNames.length === 1 ? 'joga' : 'jogam'} de ${label}, e há só ${v.maxAllowed} ${vagaWord} de ${label} no total (${numTeams} ${numTeams === 1 ? 'time' : 'times'})`;
  });
  const message = `Impossível formar times: ${parts.join('; ')}. Cadastre uma posição secundária para um deles.`;
  return { feasible: false, violations, message };
};
