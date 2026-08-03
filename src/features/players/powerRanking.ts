// Lógica PURA do "Power Ranking" — agrupamento dos jogadores ATIVOS em faixas
// de nível, uma lista por atributo (+ uma de nota de goleiro). Sem canvas, sem
// React: só dados, pra poder testar isoladamente (ver powerRanking.test.ts).
//
// VALORES USADOS: os MESMOS que a listagem de jogadores (PlayerCard) exibe —
// `effectiveAttributesBase(player)` pros 9 atributos de linha (base já com
// desconto de lesão, sem contexto de posição — é o que os chips OVR/RCD/INT
// mostram) e `effectiveGk(player)` pra nota de goleiro (idem, com lesão já
// aplicada). Isso garante que o power ranking NUNCA contradiga o número que o
// dono já vê no card do jogador.
//
// FAIXAS: derivadas de `ATTR_PRESETS` (src/domain/attributes.ts) — são os
// botões de nível que o dono usa pra preencher os atributos no cadastro. Regra
// de fronteira: como o modo manual aceita qualquer inteiro 0–100 (não só os
// valores exatos dos presets), cada faixa é um INTERVALO cuja fronteira fica
// no PONTO MÉDIO entre dois presets vizinhos. Isso garante que um jogador
// setado com o botão "Alta" (75) sempre cai na faixa "alta", mesmo que outro
// jogador tenha sido digitado manualmente com 73 ou 78 (ainda mais perto de
// 75 que de qualquer outro preset).
//
// Presets atuais (ATTR_PRESETS): Nenhum=0, Muito baixa=20, Baixa=35, Média=50,
// Alta=75, Muito alta=85, Máx=100. Fronteiras (pontos médios): 10 / 27,5 / 42,5
// / 62,5 / 80 / 92,5. Faixas resultantes:
//   nenhum:      [0, 10)
//   muito_baixo: [10, 27.5)
//   baixo:       [27.5, 42.5)
//   medio:       [42.5, 62.5)
//   alta:        [62.5, 80)
//   muito_alta:  [80, 92.5)
//   max:         [92.5, 100]
// (nomes das faixas pedidas — "nenhum/muito baixo/baixo/médio/alta/muito
// alta/max" — casam 1:1 com os 7 presets, então não há remapeamento.)

import type { Player } from '../../domain/types';
import { ATTR_PRESETS, ATTRIBUTE_META, type AttributeKey } from '../../domain/attributes';
import { effectiveAttributesBase, effectiveGk } from '../../engine';

export interface PowerRankingBand {
  /** Rótulo da faixa, igual ao label do preset (ex.: "Alta"). */
  label: string;
  /** Valor do preset-âncora desta faixa (referência, não é limite). */
  presetValue: number;
  players: { name: string; value: number }[];
}

export interface PowerRankingData {
  /** Chave do atributo ('FIN'...'FIS'), ou 'GK' pro ranking de goleiro. */
  key: AttributeKey | 'GK';
  /** Título legível pra imagem/UI. */
  title: string;
  /** Só as faixas com pelo menos 1 jogador, na ordem dos presets. */
  bands: PowerRankingBand[];
}

/**
 * Fronteiras (pontos médios) derivadas de ATTR_PRESETS, em ordem crescente de
 * valor. `boundaries[i]` é o limite entre a faixa i e a faixa i+1.
 */
const presetsAsc = [...ATTR_PRESETS].sort((a, b) => a.value - b.value);
const BAND_BOUNDARIES: number[] = presetsAsc.slice(0, -1).map((p, i) => (p.value + presetsAsc[i + 1].value) / 2);

/** Índice da faixa (0..presetsAsc.length-1) em que um valor 0–100 cai. */
export const bandIndexForValue = (value: number): number => {
  let idx = 0;
  for (const boundary of BAND_BOUNDARIES) {
    if (value >= boundary) idx++;
    else break;
  }
  return idx;
};

/** Ordena de forma estável e previsível: valor decrescente, empate por nome (A→Z). */
const sortPlayers = (a: { name: string; value: number }, b: { name: string; value: number }): number =>
  b.value !== a.value ? b.value - a.value : a.name.localeCompare(b.name, 'pt-BR');

/**
 * Agrupa uma lista de { name, value } nas faixas dos presets, omitindo faixas
 * vazias. Função genérica reaproveitada tanto pros 9 atributos quanto pra nota
 * de goleiro.
 */
const groupIntoBands = (entries: { name: string; value: number }[]): PowerRankingBand[] => {
  const buckets: { name: string; value: number }[][] = presetsAsc.map(() => []);
  for (const entry of entries) {
    buckets[bandIndexForValue(entry.value)].push(entry);
  }
  return presetsAsc
    .map((preset, i) => ({ label: preset.label, presetValue: preset.value, players: [...buckets[i]].sort(sortPlayers) }))
    .filter((band) => band.players.length > 0);
};

/** Jogadores elegíveis ao power ranking em geral: só os ATIVOS. */
export const activePlayersForRanking = (players: Player[]): Player[] => players.filter((p) => p.active);

/**
 * Constrói o power ranking de um atributo de linha (FIN/CRI/DRI/DEF/VEL/RCD/
 * INT/MOV/FIS), a partir dos jogadores ATIVOS. Usa o mesmo valor exibido no
 * card (`effectiveAttributesBase`).
 */
export const buildAttributePowerRanking = (players: Player[], key: AttributeKey): PowerRankingData => {
  const entries = activePlayersForRanking(players).map((p) => ({ name: p.name, value: effectiveAttributesBase(p)[key] }));
  return { key, title: ATTRIBUTE_META[key].label, bands: groupIntoBands(entries) };
};

/**
 * Constrói o power ranking de nota de GOLEIRO, só com jogadores ATIVOS e
 * aptos ao gol (`gk != null` — via `effectiveGk`, mesmo valor do card).
 */
export const buildGoalkeeperPowerRanking = (players: Player[]): PowerRankingData => {
  const entries = activePlayersForRanking(players)
    .map((p) => ({ name: p.name, value: effectiveGk(p) }))
    .filter((e): e is { name: string; value: number } => e.value != null);
  return { key: 'GK', title: 'Nota de Goleiro (Power Ranking)', bands: groupIntoBands(entries) };
};

/** Há pelo menos um jogador ativo apto ao gol (pra decidir se oferece o ranking de GK na UI). */
export const hasEligibleGoalkeepers = (players: Player[]): boolean =>
  activePlayersForRanking(players).some((p) => effectiveGk(p) != null);
