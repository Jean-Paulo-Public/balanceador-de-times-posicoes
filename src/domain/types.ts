// Modelo de domínio do Balanceador de Times.
//
// Modelo v3 (única fonte de verdade, escala ÚNICA 0–100): cada jogador tem uma
// posição de origem (Defensor/Meia/Atacante) e 10 atributos 0–100 (FIN/CRI/DRI/
// DEF/VEL/RCD/INT/MOV/FIS/OFE — ver src/domain/attributes.ts) que alimentam o
// balanceador (funções, OVRs contextuais, formação inferida). Não existe mais
// nenhuma escala de estrela (0–5): o Overall (0–100, ver `overallOf` em
// src/engine/playerModel.ts) é o único número de nota exibido/comparado.
// Traços como "pivô nato" ou "veloz" não são flags manuais: são inferidos dos
// atributos (ver isPivot/isFast/hasGoodBuildUp/hasLowRecovery em
// src/engine/playerModel.ts).

import type { AttrVector } from './attributes';
import type { LinePosition, PositionPreferenceEntry } from './positions';

export type Position = 'DEFENSOR' | 'MEIA' | 'ATACANTE';

export const posToLabel = (pos: Position): string => {
  switch (pos) {
    case 'DEFENSOR': return 'Defensor';
    case 'MEIA': return 'Meia';
    case 'ATACANTE': return 'Atacante';
    default: return 'Jogador';
  }
};

/**
 * Exceções de atributo por posição de linha (modelo v3.1) — mapa ESPARSO nos
 * dois eixos: só as posições com exceção aparecem, e dentro delas só os
 * atributos que diferem da base. Valores são ABSOLUTOS (0–100), NÃO delta —
 * ex.: jogador com FIN=60 na base mas FIN=80 quando joga de pivô (melhor
 * finalizador perto do gol):
 *   { PIVO: { FIN: 80 } }
 * Ausente/vazio = sem exceções (caso comum). Ver `attributesForPosition` /
 * `effectiveAttributes` em src/engine/playerModel.ts para a ORDEM de
 * aplicação (base → sobrescrita da posição → handicap de lesão).
 */
export type AttributeOverrides = Partial<Record<LinePosition, Partial<AttrVector>>>;

export interface Player {
  id: string;
  name: string;
  active: boolean;
  /** Consegue jogar no gol (emergência). Um goleiro por time pode ser reservado. */
  isGoalkeeper: boolean;
  position: Position;
  /** Atributos 0–100 do modelo v2. Fonte de verdade do balanceador. */
  attributes: AttrVector;
  /** Nota de goleiro 0–100 (null se não joga no gol). */
  gk: number | null;
  /** Redução temporária (%) em todos os atributos — ex.: lesão. 0/ausente = sem redução. */
  handicapPct?: number;
  /**
   * Lista ORDENADA de posições de linha aceitas, cada uma com um toggle
   * `enabled` (modelo v3 + v3.2). Índice 0 = preferência máxima. A ordem é
   * preservada mesmo para entradas desabilitadas (reabilitar não recadastra
   * a ordem). `BOX_TO_BOX` = "joga em qualquer posição, o sistema decide" —
   * é o default de migração (v7) pra todo jogador já cadastrado. Nunca vazia,
   * e sempre tem PELO MENOS uma entrada habilitada (ver normalização em
   * src/store/migration.ts).
   */
  acceptedPositions: PositionPreferenceEntry[];
  /** Exceções de atributo por posição de linha (modelo v3.1). Ver `AttributeOverrides`. */
  positionOverrides?: AttributeOverrides;
  /**
   * "Tanto faz a ordem" — zera a PENALIDADE de profundidade da lista
   * `acceptedPositions`, sem afrouxar a CAPACIDADE (a restrição hard continua
   * sendo exatamente essa lista). Não confundir com `BOX_TO_BOX`:
   *
   *  - `acceptedPositions` (sem esta flag) = lista ORDENADA: as posições
   *    habilitadas são as únicas jogáveis (capacidade) E a ordem entre elas
   *    custa caro sair (preferência) — é o comportamento default.
   *  - `positionOrderIndifferent: true` = a MESMA capacidade (só as posições
   *    habilitadas na lista são jogáveis — uma posição fora da lista, ou
   *    desabilitada, continua proibitiva) mas a ORDEM deixa de custar: o
   *    solver escolhe livremente entre as habilitadas sem penalizar quem não
   *    está no topo.
   *  - `BOX_TO_BOX` = joga em QUALQUER posição do jogo — libera a própria
   *    capacidade (não é isto).
   *
   * Ausente/`false` = comportamento atual (penalidade por profundidade nas
   * habilitadas). Ver `identityCost` em engine/formationModel.ts.
   */
  positionOrderIndifferent?: boolean;
  /**
   * "Os mais velhos do racha" — marcação manual e cosmética (mesmo padrão de
   * `positionOrderIndifferent`: campo booleano opcional, sem afetar
   * atributos/OVR/capacidade de posição). Alimenta só a REGRA DE DISTRIBUIÇÃO
   * DE VETERANOS (hard, ver `veteranDistributionBroken` em engine/balance.ts):
   * com `V` veteranos ativos e `T` times, cada divisão candidata só é aceita
   * se cada time ficar com entre `floor(V/T)` e `ceil(V/T)` veteranos — uma
   * divisão que concentra veteranos num só time é EXCLUÍDA dos resultados,
   * nunca só penalizada no custo. Ausente/`false` = comportamento atual (sem
   * nenhuma restrição de veterano).
   */
  veteran?: boolean;
  /**
   * "Sabe marcar bem" — marcação manual e cosmética, MESMO PADRÃO de `veteran`
   * (campo booleano opcional, sem afetar atributos/OVR/capacidade de posição;
   * não confundir com o atributo DEF, que é nota numérica e entra no custo).
   * Alimenta duas regras HARD (ambas em engine/balance.ts):
   *
   *  1. DISTRIBUIÇÃO (`goodMarkerDistributionBroken`), idêntica à de veteranos
   *     mas SEM a exceção do pivô-only (marcar não tem relação com posição):
   *     com `M` marcadores ativos e `T` times, cada divisão candidata só é
   *     aceita se cada time ficar com entre `floor(M/T)` e `ceil(M/T)`.
   *  2. NÃO-ACÚMULO com veteranos (`markerVeteranStackingBroken`): quando a
   *     divisão de marcadores não fecha exata, o time que fica com marcador A
   *     MENOS não pode ser também um time com veterano A MAIS (contagem BRUTA
   *     de veteranos, INCLUINDO os pivô-only). Ou seja: os dois ônus nunca
   *     caem no mesmo time.
   *
   * Ausente/`false` = jogador não entra em nenhuma das duas contas.
   */
  goodMarker?: boolean;
  /**
   * "Não pode jogar com" — lista de IDS de outros jogadores do CADASTRO com
   * quem este jogador NÃO pode ficar no mesmo time (pedido literal do dono).
   * MESMO PADRÃO estrutural de `veteran`/`goodMarker` (campo opcional que não
   * mexe em atributo/OVR/capacidade de posição) mas guarda uma lista de ids,
   * não um booleano.
   *
   * SIMÉTRICO POR DERIVAÇÃO, não por gravação: cadastrar a exclusão só NESTE
   * jogador já vale nos dois sentidos (se A exclui B, B também não joga com
   * A) — mas isso é resolvido pelo MOTOR (`derivedExclusionPairs` em
   * engine/balance.ts), lendo o elenco ativo inteiro, nunca gravando o id
   * espelhado no outro jogador. Gravar nos dois lados criaria dado duplicado
   * que pode dessincronizar (ex.: remover de um lado e esquecer do outro);
   * derivar no motor elimina esse risco por construção.
   *
   * Regra HARD no balanceador (ver `exclusionPairBroken` em engine/balance.ts)
   * — bem diferente de `separatePairs` (config da tela de Simular Partidas,
   * "Manter separados"): aquela é SOFT (só penaliza o custo, o par pode ainda
   * assim acabar junto) e configurada na hora, pela pelada da semana; esta é
   * HARD (uma divisão que junta o par é EXCLUÍDA das candidatas) e vem do
   * CADASTRO do jogador, pensada pra incompatibilidades permanentes.
   *
   * FALLBACK AUTOMÁTICO (pedido explícito do dono): se, com esta lista
   * valendo, NENHUMA divisão sobrar, o balanceador desliga a regra SOZINHO e
   * refaz a busca sem ela — nunca bloqueia a simulação com uma mensagem de
   * inviabilidade por causa disso (ver `BalanceRunReport.exclusionsIgnored`/
   * `BalanceResult.excludedPairsViolations`).
   *
   * Um id que aponta pra jogador removido/inativo simplesmente não conta.
   * Ausente/lista vazia = sem restrição (comportamento de hoje).
   */
  excludedTeammateIds?: string[];
}

export interface TeamSlotPlayer {
  player: Player;
  /** Id da vaga (ex.: "Defensor 1", "Meia 2", "Goleiro"). */
  assignedRole: string;
  /** Nota (0–100) usada para exibição/ordenação — é o Overall do jogador. */
  roleScore: number;
  roleLabel?: string;
  /** GK | DEF | MEI | ATA */
  roleShort?: string;
  /** Meia/atacante empurrado pra outra função por falta de gente de origem. */
  improvised?: boolean;
}

/**
 * "Atrasado" — jogador que chega depois do início da pelada (ex.: saiu do
 * trabalho) e por isso fica AUSENTE nos primeiros `games` jogos do rodízio.
 * Guardado FORA do objeto `Player`, no mesmo padrão de `separatePairs` (ver
 * `usePlayerStore`): é config da pelada da semana, não um traço do cadastro.
 *
 * IMPORTANTE (não confundir com "ficar no banco"): durante os `games`
 * primeiros jogos ele está fora da simulação por completo — não conta como
 * reserva, não ocupa vaga de banco, não entra na contagem de justiça do
 * rodízio de banco (ver `benchRotation.ts`/`buildTeamSchedule` em
 * engine/rotation.ts). Depois de `games` jogos ele volta ao rodízio normal, e
 * a partir daí a regra estrita do banco vale pra ele como pra qualquer um.
 *
 * `games` é validado/limitado no PONTO DE USO (ver `clampLateArrivals` em
 * engine/rotation.ts): sempre inteiro >= 1 e sempre MENOR que o total de
 * jogos do rodízio (nunca zera o jogador da pelada inteira em silêncio).
 */
export interface LateArrival {
  playerId: string;
  games: number;
}

export interface Team {
  id: number;
  name: string;
  /** Média do Overall (0–100) dos jogadores do time. */
  overall: number;
  /** Média do Overall (0–100) do banco, se houver reservas. */
  benchOverall?: number;
  players: TeamSlotPlayer[];
  bench: TeamSlotPlayer[];
}

export interface SimulationResult {
  id: string;
  /** Título da proposta (ex.: "Proposta 1"), quando exibida numa lista de propostas. */
  title?: string;
  teams: Team[];
  /** Variância das médias de Overall (0–100) entre os times — quanto menor, mais equilibrado. */
  equilibrium: number;
}
