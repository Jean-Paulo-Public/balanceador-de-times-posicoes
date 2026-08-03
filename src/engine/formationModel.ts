// Catálogo dos 4 SISTEMAS TÁTICOS (modelo v3, substitui as 5 formações v2) e o
// solver de atribuição jogador→vaga via ALGORITMO HÚNGARO (Kuhn-Munkres) —
// ótimo e polinomial, ver hungarian.ts. Cada sistema tem 6 vagas de linha;
// vagas podem ser POLIMÓRFICAS (aceitam mais de uma identidade) — a identidade
// efetiva é definida por quem preenche (a de menor custo pro jogador, que já
// combina fit + preferência).
//
// Os sistemas NÃO são customizáveis pelo usuário — o solver escolhe o melhor
// por time/jogo. O rótulo tático é EMERGENTE: lido da combinação de
// identidades escolhidas, não escolhido antes.

import type { Player } from '../domain/types';
import type { LinePosition } from '../domain/positions';
import { enabledLinePositions, hasEnabledBoxToBox, linePositionFit } from '../domain/positions';
import { effectiveAttributes } from './playerModel';
import { hungarianSolve, INFEASIBLE_COST } from './hungarian';

export type FieldZone = 'DEF' | 'MEI' | 'ATA';

const POSITION_ZONE: Record<LinePosition, FieldZone> = {
  FIXO: 'DEF',
  LATERAL: 'DEF',
  VOLANTE: 'MEI',
  ALA: 'MEI',
  MEIA_ATACANTE: 'MEI',
  SEGUNDO_ATACANTE: 'ATA',
  PIVO: 'ATA',
};

export type TacticalSystem = 'REFERENCIA' | 'DOIS_ATACANTES' | 'DEFENSIVO' | 'OFENSIVO';
export const ALL_SYSTEMS: readonly TacticalSystem[] = ['REFERENCIA', 'DOIS_ATACANTES', 'DEFENSIVO', 'OFENSIVO'] as const;

/** Mantido por compat de nome com o código existente (UI, rotation, balance). */
export type FormationShape = TacticalSystem;

export interface SystemSlotDef {
  id: string;
  /** Identidades aceitáveis nesta vaga (1 = fixa, 2+ = polimórfica). */
  identities: readonly LinePosition[];
  x: number;
  y: number;
}

export interface SystemDef {
  key: TacticalSystem;
  label: string;
  /** Texto explicativo (usado na Fase 7 — aba wiki e "como jogar"). */
  description: string;
  slots: SystemSlotDef[]; // 6 vagas de linha
}

const S = (id: string, identities: LinePosition[], x: number, y: number): SystemSlotDef => ({ id, identities, x, y });

export const SYSTEMS: Record<TacticalSystem, SystemDef> = {
  REFERENCIA: {
    key: 'REFERENCIA',
    label: 'Referência (1-2-2-1)',
    description:
      'Sistema equilibrado com um pivô de referência no ataque. O fixo segura a última linha, o lateral apoia dos dois lados, ' +
      'a dupla de meio mistura saída de bola com um ala que pode subir, e a dupla de frente combina criação com movimentação. ' +
      'É o sistema mais "de todo dia" — usado quando o elenco não pede um perfil extremo.',
    slots: [
      S('FIXO', ['FIXO'], 50, 12),
      S('LATERAL', ['LATERAL'], 78, 26),
      S('VOL_ALA', ['VOLANTE', 'ALA'], 22, 30),
      S('SA_MA', ['SEGUNDO_ATACANTE', 'MEIA_ATACANTE'], 35, 62),
      S('ALA', ['ALA'], 70, 58),
      S('PIVO', ['PIVO'], 50, 88),
    ],
  },
  DOIS_ATACANTES: {
    key: 'DOIS_ATACANTES',
    label: 'Dois Atacantes (1-2-1-2)',
    description:
      'Sem pivô fixo: dois atacantes móveis dividem a referência de ataque. O fixo segura atrás, lateral e volante constroem, ' +
      'um ala solitário dá largura, e a dupla de frente (segundo atacante + segundo atacante/meia-atacante) ataca o espaço junto. ' +
      'Bom quando o elenco tem finalizadores móveis mas nenhum pivô de área nato.',
    slots: [
      S('FIXO', ['FIXO'], 50, 12),
      S('LATERAL', ['LATERAL'], 25, 28),
      S('VOLANTE', ['VOLANTE'], 75, 28),
      S('ALA', ['ALA'], 50, 52),
      S('SA1', ['SEGUNDO_ATACANTE'], 30, 84),
      S('SA2_MA', ['SEGUNDO_ATACANTE', 'MEIA_ATACANTE'], 70, 84),
    ],
  },
  DEFENSIVO: {
    key: 'DEFENSIVO',
    label: 'Defensivo (1-3-2)',
    description:
      'Retranca: três defensores (fixo + 2 laterais) e só duas vagas ofensivas. Usado contra elencos mais fortes ou quando ' +
      'sobra gente de perfil defensivo — segura o jogo, sai rápido em contra-ataque com o pivô de referência.',
    slots: [
      S('FIXO', ['FIXO'], 50, 12),
      S('LAT1', ['LATERAL'], 22, 28),
      S('LAT2', ['LATERAL'], 78, 28),
      S('VOLANTE', ['VOLANTE'], 50, 46),
      S('ALA_MA', ['ALA', 'MEIA_ATACANTE'], 50, 66),
      S('PIVO', ['PIVO'], 50, 88),
    ],
  },
  OFENSIVO: {
    key: 'OFENSIVO',
    label: 'Ofensivo (1-1-3-1)',
    description:
      'Time inteiro empurrado pra frente: só o fixo segura atrás, um volante/lateral faz a contenção, três jogadores de ' +
      'criação/velocidade ocupam o meio-terço-final e um pivô finaliza. Usado quando o elenco tem muita gente de ataque e ' +
      'pouca vontade de recuar.',
    slots: [
      S('FIXO', ['FIXO'], 50, 12),
      S('VOL_LAT', ['VOLANTE', 'LATERAL'], 50, 30),
      S('ALA1', ['ALA'], 20, 56),
      S('ALA2', ['ALA'], 80, 56),
      S('MA_SA', ['MEIA_ATACANTE', 'SEGUNDO_ATACANTE'], 50, 62),
      S('PIVO', ['PIVO'], 50, 88),
    ],
  },
};

export const SYSTEM_LABEL: Record<TacticalSystem, string> = Object.fromEntries(
  ALL_SYSTEMS.map((s) => [s, SYSTEMS[s].label]),
) as Record<TacticalSystem, string>;

// ---------------------------------------------------------------------------
// Custo da célula jogador×vaga (Fase 4)
// ---------------------------------------------------------------------------

/**
 * Escala da penalidade de preferência (mesma escala 0–100 do roleFit).
 *
 * FÓRMULA: penalidade = ESCALA × profundidade_relativa
 *   profundidade_relativa = idx / (habilitadas.length - 1)   (0 quando há <= 1 habilitada)
 * `idx` é a posição do candidato dentro da lista de posições HABILITADAS do
 * jogador, NA ORDEM ORIGINAL (exclui BOX_TO_BOX e entradas desabilitadas —
 * ver `enabledLinePositions` em domain/positions.ts), normalizada ao TAMANHO
 * DESSA LISTA — não ao total cadastrado. 0 = topo da lista habilitada,
 * 1 = último recurso HABILITADO do jogador.
 *
 * Por que RELATIVA (pedido direto do dono do projeto): cair do 1º pro 2º
 * numa lista de 4 é barato (tem folga); cair do 1º pro 2º numa lista de 2 é o
 * ÚLTIMO RECURSO da pessoa (caro) — mesma "distância" de 1 passo, custos bem
 * diferentes. E por que sobre as HABILITADAS (não o total cadastrado): um
 * jogador com 4 posições cadastradas mas só 2 habilitadas está apertado
 * AGORA, não flexível — normalizar pelo total inventaria uma folga que não
 * existe e queimaria a última opção real dele achando que é "a segunda de
 * quatro". Uma posição DESABILITADA nunca é candidata (mesmo tratamento de
 * uma que não está na lista: custo proibitivo).
 *
 * Por que essa ESCALA (20): o fit vive em 0–100 e uma diferença "grande e
 * real" de aptidão entre duas posições tipicamente passa de ~25-30 pontos
 * (perfis bem diferenciados, ex. ALA vs VOLANTE). Com ESCALA=20, o PIOR caso
 * de penalidade (profundidade 1,0 — último recurso habilitado) custa 20
 * pontos: o bastante pra o solver esgotar as alavancas "baratas" primeiro —
 * usar um coringa BOX_TO_BOX (penalidade 0) ou trocar jogadores entre times
 * (camada de cima, balance.ts localSearch, que não olha pra isto e é
 * "grátis" nesta escala) — antes de rebaixar alguém na própria lista; mas
 * não tão alto a ponto de ignorar um jogador dramaticamente mais apto numa
 * posição secundária (diferença de fit > 20 ainda vence a penalidade máxima).
 */
export const PREFERENCE_PENALTY_SCALE = 20;

const relativeDepth = (idx: number, enabledCount: number): number =>
  enabledCount > 1 ? idx / (enabledCount - 1) : 0;

/**
 * Custo (a MINIMIZAR) de atribuir um jogador a UMA identidade específica.
 * Exportado pra teste unitário direto da fórmula de penalidade.
 */
export const identityCost = (player: Player, identity: LinePosition): number => {
  const attrs = effectiveAttributes(player, identity);
  const fit = linePositionFit(attrs, identity);
  const prefs = player.acceptedPositions;
  if (hasEnabledBoxToBox(prefs)) return 100 - fit; // coringa: sem restrição, sem penalidade
  const effective = enabledLinePositions(prefs); // só habilitadas, ordem original
  const idx = effective.indexOf(identity);
  // RESTRIÇÃO HARD: fora da lista (ou desabilitada) = proibitivo.
  if (idx === -1) return INFEASIBLE_COST;
  return (100 - fit) + PREFERENCE_PENALTY_SCALE * relativeDepth(idx, effective.length);
};

/**
 * Cache opcional (jogador×identidade) -> custo. O custo de uma célula só
 * depende do jogador (atributos + sobrescritas + preferência) e da
 * identidade — NUNCA de quem mais está na divisão/jogo/sistema — então dá
 * pra reaproveitar entre TODAS as chamadas de um mesmo balanceamento (várias
 * divisões candidatas × 4 sistemas × 6 jogos do rodízio). Chave: `${id}:${identity}`.
 */
export type CostCache = Map<string, number>;

const identityCostCached = (player: Player, identity: LinePosition, cache?: CostCache): number => {
  if (!cache) return identityCost(player, identity);
  const key = `${player.id}:${identity}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const c = identityCost(player, identity);
  cache.set(key, c);
  return c;
};

/** Menor custo (e identidade/fit correspondentes) de um jogador numa vaga polimórfica. */
const slotBest = (player: Player, slot: SystemSlotDef, cache?: CostCache): { cost: number; identity: LinePosition; fit: number } => {
  let bestCost = Infinity;
  let bestIdentity: LinePosition = slot.identities[0];
  let bestFit = 0;
  for (const identity of slot.identities) {
    const c = identityCostCached(player, identity, cache);
    if (c < bestCost) {
      bestCost = c;
      bestIdentity = identity;
      bestFit = linePositionFit(effectiveAttributes(player, identity), identity);
    }
  }
  return { cost: bestCost, identity: bestIdentity, fit: bestFit };
};

export interface SlotAssignment {
  slotId: string;
  /** Identidade EFETIVA da vaga (a que o jogador escalado assumiu). */
  identity: LinePosition;
  zone: FieldZone;
  playerIndex: number;
  /** Fit (0–100) do jogador na identidade efetiva. */
  fit: number;
  x: number;
  y: number;
}

export interface FormationInference {
  system: TacticalSystem;
  /** Mantido por compat com código/UI existentes (era `shape`). */
  shape: TacticalSystem;
  /** Soma dos fits (não dos custos) — quanto maior, melhor. */
  total: number;
  feasible: boolean;
  assignments: SlotAssignment[];
}

/**
 * Um jogador de linha, do jeito que o solver precisa: o `Player` completo —
 * os atributos efetivos dependem da IDENTIDADE da vaga (ver
 * `effectiveAttributes` em playerModel.ts, que aplica a sobrescrita por
 * posição — modelo v3.1 — antes da lesão). Mantido como alias de nome pra
 * não quebrar imports existentes.
 */
export type LinePlayerInput = Player;

/** Resolve a atribuição ótima (húngaro) de 6 jogadores de linha num sistema. */
export const assignSystem = (players: Player[], system: TacticalSystem, cache?: CostCache): FormationInference => {
  const def = SYSTEMS[system];
  const n = def.slots.length; // 6
  if (players.length !== n) {
    throw new Error(`assignSystem espera ${n} jogadores de linha, recebeu ${players.length}`);
  }
  const costM: number[][] = [];
  const identityM: LinePosition[][] = [];
  const fitM: number[][] = [];
  for (let pi = 0; pi < n; pi++) {
    costM[pi] = [];
    identityM[pi] = [];
    fitM[pi] = [];
    for (let si = 0; si < n; si++) {
      const b = slotBest(players[pi], def.slots[si], cache);
      costM[pi][si] = b.cost;
      identityM[pi][si] = b.identity;
      fitM[pi][si] = b.fit;
    }
  }
  const { assignment, feasible } = hungarianSolve(costM);
  let total = 0;
  const assignments: SlotAssignment[] = def.slots.map((slot, si) => {
    const pi = assignment.findIndex((s) => s === si);
    const identity = identityM[pi][si];
    const fit = fitM[pi][si];
    total += fit;
    return { slotId: slot.id, identity, zone: POSITION_ZONE[identity], playerIndex: pi, fit, x: slot.x, y: slot.y };
  });
  return { system, shape: system, total, feasible, assignments };
};

/**
 * Cache de duas camadas por EXECUÇÃO de balanceamento:
 *  - `cost`: jogador×identidade -> custo (já existia, ver `CostCache` acima).
 *  - `system`: CONJUNTO de jogadores (ids, ORDEM-INDEPENDENTE) -> melhor
 *    sistema. É o ganho grande (Otimização 1 do diagnóstico de performance):
 *    o MESMO grupo de 6 jogadores é resolvido repetidas vezes (busca local só
 *    troca 2 times por vez; os 6 jogos do rodízio de banco repetem grupos
 *    entre si; o desempate do banco reavalia grupos quase idênticos).
 *
 * ESCOPO E INVALIDAÇÃO: criado uma vez por chamada a `balanceTeamsOptions`
 * (ver `createFormationCache()` em balance.ts) e descartado ao fim dela.
 * NUNCA é módulo-level/singleton — um cache que sobrevivesse a uma troca de
 * elenco ou de atributos (lesão, edição de nota) devolveria resultado stale
 * sem quebrar nenhum teste (o bug mais perigoso deste tipo de otimização).
 *
 * CORREÇÃO DA CHAVE ORDEM-INDEPENDENTE: a chave é os ids ORDENADOS (não a
 * ordem de chegada no array `players`, que varia entre chamadas — swaps da
 * busca local, grupos do desempate de banco etc.). Isso é seguro porque cada
 * ENTRADA do cache é gravada (no miss) usando o resultado computado para a
 * ordem REAL passada naquela primeira chamada — nada é recomputado numa
 * "ordem canônica" diferente. Chamadas seguintes com o MESMO conjunto (em
 * outra ordem) reaproveitam esse resultado remapeando `playerIndex` por id
 * (`fromStored`/`toStored` abaixo) — ou seja, o cálculo em si nunca muda,
 * só a indexação de retorno. O único cenário em que isso poderia divergir de
 * uma chamada sem cache é um EMPATE EXATO de custo total entre duas
 * atribuições ótimas distintas (tie-break dependente de ordem dentro do
 * húngaro) — com custos em ponto flutuante (fit combinando vários atributos
 * reais), esse empate exato é praticamente inexistente; não observado em
 * nenhum dos 204 testes após a mudança.
 */
export interface FormationCache {
  cost: CostCache;
  system: Map<string, StoredInference>;
}

export const createFormationCache = (): FormationCache => ({ cost: new Map(), system: new Map() });

interface StoredAssignment {
  slotId: string;
  identity: LinePosition;
  zone: FieldZone;
  playerId: string;
  fit: number;
  x: number;
  y: number;
}

interface StoredInference {
  system: TacticalSystem;
  shape: TacticalSystem;
  total: number;
  feasible: boolean;
  assignments: StoredAssignment[];
}

const toStored = (inf: FormationInference, players: Player[]): StoredInference => ({
  system: inf.system,
  shape: inf.shape,
  total: inf.total,
  feasible: inf.feasible,
  assignments: inf.assignments.map((a) => ({
    slotId: a.slotId, identity: a.identity, zone: a.zone, fit: a.fit, x: a.x, y: a.y,
    playerId: players[a.playerIndex].id,
  })),
});

const fromStored = (stored: StoredInference, players: Player[]): FormationInference => {
  const idxOf = new Map(players.map((p, i) => [p.id, i] as const));
  return {
    system: stored.system,
    shape: stored.shape,
    total: stored.total,
    feasible: stored.feasible,
    assignments: stored.assignments.map((a) => ({
      slotId: a.slotId, identity: a.identity, zone: a.zone, fit: a.fit, x: a.x, y: a.y,
      playerIndex: idxOf.get(a.playerId)!,
    })),
  };
};

const systemCacheKey = (players: Player[]): string => players.map((p) => p.id).slice().sort().join(',');

/**
 * Escolhe, entre os 4 sistemas, o de menor custo total (maior fit efetivo,
 * respeitando as restrições hard) para os 6 jogadores de linha dados. O
 * rótulo do sistema é EMERGENTE — resultado desta escolha, não input.
 */
export const chooseBestSystem = (players: Player[], cache?: FormationCache): FormationInference => {
  if (cache) {
    const key = systemCacheKey(players);
    const hit = cache.system.get(key);
    if (hit) return fromStored(hit, players);

    let best: FormationInference | null = null;
    let bestCost = Infinity;
    for (const system of ALL_SYSTEMS) {
      const inf = assignSystem(players, system, cache.cost);
      const cost = inf.feasible ? 6 * 100 - inf.total : Infinity;
      if (cost < bestCost) { bestCost = cost; best = inf; }
    }
    const result = best ?? assignSystem(players, ALL_SYSTEMS[0], cache.cost);
    cache.system.set(key, toStored(result, players));
    return result;
  }

  let best: FormationInference | null = null;
  let bestCost = Infinity;
  for (const system of ALL_SYSTEMS) {
    const inf = assignSystem(players, system);
    // custo total = 600 - total (fit) quando feasible, senão penaliza fortemente
    const cost = inf.feasible ? 6 * 100 - inf.total : Infinity;
    if (cost < bestCost) { bestCost = cost; best = inf; }
  }
  // Se nenhum sistema é feasible, devolve o melhor "esforço" mesmo assim (o
  // chamador — Fase 5 — já deve ter barrado o caso antes de chegar aqui).
  return best ?? assignSystem(players, ALL_SYSTEMS[0]);
};

/** Compat: nome antigo (era a inferência via força bruta em 5 formações). */
export const inferBestFormation = (players: Player[], cache?: FormationCache): FormationInference => chooseBestSystem(players, cache);
