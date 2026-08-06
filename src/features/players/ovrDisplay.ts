// Overalls contextuais exibidos no cadastro (PlayerForm) e na listagem
// (PlayerCard) — 7 números lado a lado. Módulo PURAMENTE ADITIVO e sem
// estado: só combina peças que já existiam.
//
// Mapeamento pras chaves contextuais escolhidas de OVR_WEIGHTS:
//  - Ofensivo (sigla ATA) -> 'ATA' (pesa FIN/CRI/DRI/MOV/OFE — o que ele
//    produz com bola).
//  - Defensivo (sigla DEF) -> NÃO é OVR: é o atributo DEF (marcação) PURO,
//    mostrado direto, como RCD/INT/OFE. Decisão do dono: "conte somente a DEF
//    no chip". Já foi um overall com a recomposição descontada e reescalada,
//    mas virou ruído — a recomposição tem chip próprio ao lado e o resto
//    (físico etc.) diluía o sinal de quem realmente marca.
//    CONSEQUÊNCIA: `OVR_WEIGHTS.Defesa` ficou SEM CONSUMIDOR no app.
// O "OVR de goleiro" NÃO vem de OVR_WEIGHTS: é a nota de goleiro do jogador
// (`gk`/`effectiveGk`, 0–100), separada dos 10 atributos de linha.
//
// IMPORTANTE — chips "recomposicao", "intensidade" e "ofensividade" são
// DIFERENTES dos outros: os outros 3 (geral/ofensivo/defensivo) são OVRs
// (combinação ponderada de vários atributos). Recomposição, Intensidade e
// Ofensividade NÃO são OVRs — são os atributos-base RCD, INT e OFE mostrados
// DIRETO, sem pesos. Isso corrige o bug original: o chip rotulado como
// recomposição mostrava o OVR 'Intensidade' (uma mistura de DEF/REC/VEL), que
// não era o mesmo conceito de "o jogador volta pra marcar". Ver
// `ATTRIBUTE_META.RCD`/`ATTRIBUTE_META.INT`/`ATTRIBUTE_META.OFE` em
// src/domain/attributes.ts para as definições.
//
// SIGLA — o chip de overall ofensivo usa a abreviação 'ATA' (não 'OFE'):
// existe um atributo-BASE também chamado OFE (Ofensividade), que inclusive
// entra no cálculo desse mesmo overall com peso 0,32 (ver OVR_WEIGHTS.ATA em
// src/domain/attributes.ts). Usar 'OFE' pro chip criaria duas coisas
// diferentes com a mesma sigla na mesma tela — um terço do chip "seria" o
// próprio chip. A sigla 'ATA' casa com a chave do OVR (`OvrKey.ATA`) e com o
// rótulo "Ataque" (`OVR_LABELS.ATA`). O atributo-base OFE ganhou seu PRÓPRIO
// chip, mostrado direto (sem pesos), no mesmo padrão de RCD/INT.
//
// DIVERGÊNCIA CONHECIDA (não é bug, não "conserte" isto sem reler o balanceador
// primeiro) — o chip ATA (`ovr(attrs, 'ATA')`) e o chip DEF (o atributo puro)
// são leitura INDIVIDUAL do jogador, mas o balanceador (src/engine/balance.ts +
// src/engine/scoring.ts) NÃO usa nenhum dos dois para montar os times:
//  - Eixo ofensivo do time = `potencialAtaque`: média GEOMÉTRICA de 3 fatores
//    (1/3 cada) — média dos 2 melhores FIN, MAIOR CRI, e média dos 2 melhores
//    OFE do time. Não existe "potencialAtaque de um jogador isolado": é uma
//    propriedade não-linear do TIME (top-2/máximo).
//  - Eixo defensivo do time = `estabilidadeDefensiva`: (média dos 2 melhores
//    DEF do time)^0,5 × (média das RCD do time)^0,5, mais a nota do goleiro
//    escalado valendo 1/3 do eixo. A CRIAÇÃO NÃO entra aqui — foi avaliado e
//    descartado: com peso relevante, um passador ultrapassava um marcador.
//  - Ou seja: a contribuição de cada jogador é CONDICIONAL — o DEF dele só
//    conta se estiver entre os 2 melhores marcadores do time; o RCD dele
//    sempre entra na média do time. O chip ATA/DEF é só uma leitura pessoal,
//    não uma prévia do que o balanceador vai considerar.
// Já OVR, RCD e INT casam com o balanceador (todos são médias simples do
// time): `geral` é a média de `ovr(Geral)` dos 6 de linha, `recuo` é a média
// de RCD dos 6, e o eixo `pressao` de custo (src/engine/scoring.ts) é a média
// de INT dos 6.

import type { AttrVector } from '../../domain/attributes';
import { ovr } from '../../engine';

export interface DisplayOvrs {
  geral: number;
  ofensivo: number;
  recomposicao: number;
  intensidade: number;
  ofensividade: number;
  defensivo: number;
  /** null quando o jogador não tem nota de goleiro (não joga no gol). */
  goleiro: number | null;
}

/**
 * Calcula os 7 números exibidos, a partir dos atributos de linha (base, sem
 * contexto de posição) e da nota de goleiro (já resolvida por quem chama —
 * `null` se o jogador não é apto ao gol). `recomposicao`, `intensidade` e
 * `ofensividade` NÃO são OVRs — são os valores efetivos dos atributos-base
 * RCD, INT e OFE, diretos (ver comentário no topo do arquivo).
 */

export const computeDisplayOvrs = (attrs: AttrVector, gk: number | null): DisplayOvrs => ({
  geral: Math.round(ovr(attrs, 'Geral')),
  ofensivo: Math.round(ovr(attrs, 'ATA')),
  recomposicao: Math.round(attrs.RCD),
  intensidade: Math.round(attrs.INT),
  ofensividade: Math.round(attrs.OFE),
  // O chip DEF mostra o ATRIBUTO DE MARCAÇÃO PURO (decisão do dono): "conte
  // somente a DEF no chip". Não é mais um overall combinado — nem recomposição
  // (que tem chip próprio ao lado), nem físico, nem nada. Assim os chips de
  // atributo (RCD, INT, OFE, DEF) mostram exatamente o que foi digitado no
  // cadastro, sem mistura, e a única combinação ponderada que sobra é o OVR.
  // ATENÇÃO: o balanceador NÃO usa este número — o eixo defensivo do time é
  // calculado à parte (melhores marcadores × recomposição, mais o goleiro).
  defensivo: Math.round(attrs.DEF),
  goleiro: gk == null ? null : Math.round(gk),
});

export interface OvrDisplayItem {
  key: keyof DisplayOvrs;
  /** Sigla curta (3 letras) — usada na listagem e no cadastro. */
  abbr: string;
  /** Nome completo, pro title/aria-label (acessibilidade e descoberta da sigla). */
  fullLabel: string;
}

/** Ordem e siglas fixas dos 7 números — mesma listagem e cadastro, pra nunca divergir. */
export const OVR_DISPLAY_ITEMS: OvrDisplayItem[] = [
  {
    key: 'geral', abbr: 'OVR',
    fullLabel: 'Overall geral — média do time, casa com o balanceador (é a média de OVR Geral dos 6 de linha).',
  },
  {
    key: 'ofensivo', abbr: 'ATA',
    fullLabel: 'Overall ofensivo (Ataque) — perfil INDIVIDUAL do jogador. O balanceador não usa esse número: o ataque do time é calculado à parte (melhores finalizadores + maior criador do time), não como média de perfis individuais.',
  },
  {
    key: 'recomposicao', abbr: 'RCD',
    fullLabel: 'Recomposição Defensiva (atributo direto, não é overall) — o quanto volta pra marcar. Casa com o balanceador: entra direto na média de recuo do time.',
  },
  {
    key: 'intensidade', abbr: 'INT',
    fullLabel: 'Intensidade (atributo direto, não é overall) — pressão no meio e no ataque. Casa com o balanceador: entra direto na média de pressão do time.',
  },
  {
    key: 'ofensividade', abbr: 'OFE',
    fullLabel: 'Ofensividade (atributo direto, não é overall) — ataque com inteligência situacional: reconhecer espaço, driblar quando pode, chutar quando é a melhor opção. Casa com o balanceador: entra no eixo ofensivo do time (junto com finalização e criação) e também no overall de Ataque (chip ATA).',
  },
  {
    key: 'defensivo', abbr: 'DEF',
    fullLabel: 'Defesa (atributo direto, não é overall) — marcação, desarme, antecipação e posicionamento, exatamente como foi cadastrado. Não inclui recomposição (tem chip próprio ao lado) nem físico. O balanceador não usa este número sozinho: a defesa do TIME é calculada à parte, com os melhores marcadores, a recomposição e o goleiro.',
  },
  { key: 'goleiro', abbr: 'GOL', fullLabel: 'Nota de goleiro (só quem joga no gol)' },
];

// ---------------------------------------------------------------------------
// Entrada manual de atributo (modo "Manual" do cadastro)
// ---------------------------------------------------------------------------

/**
 * Normaliza um texto digitado pro valor de um atributo: só inteiros de 0 a
 * 100. Decimais, texto não numérico, vazio ou só sinal são INVÁLIDOS
 * (retorna `null` — quem chama decide o que fazer, mas nunca deve virar 0 ou
 * NaN silenciosamente). Valores fora da faixa são clampados (não rejeitados).
 */
export const parseManualAttrInput = (raw: string): number | null => {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, n));
};
