// Overalls contextuais exibidos no cadastro (PlayerForm) e na listagem
// (PlayerCard) — 6 números lado a lado. Módulo PURAMENTE ADITIVO e sem
// estado: só combina peças que já existiam.
//
// Mapeamento pras chaves contextuais escolhidas de OVR_WEIGHTS:
//  - Ofensivo      -> 'Ataque' (pesa FIN/CRI/DRI/MOV — o que ele produz com bola).
//  - Defensivo     -> 'Defesa' (pesa DEF/RCD/FIS — solidez pura de marcação).
// O "OVR de goleiro" NÃO vem de OVR_WEIGHTS: é a nota de goleiro do jogador
// (`gk`/`effectiveGk`, 0–100), separada dos 9 atributos de linha.
//
// IMPORTANTE — chips "recomposicao" e "intensidade" são DIFERENTES dos outros:
// os outros 3 (geral/ofensivo/defensivo) são OVRs (combinação ponderada de
// vários atributos). Recomposição e Intensidade NÃO são OVRs — são os
// atributos-base RCD e INT mostrados DIRETO, sem pesos. Isso corrige o bug
// original: o chip rotulado como recomposição mostrava o OVR 'Intensidade'
// (uma mistura de DEF/REC/VEL), que não era o mesmo conceito de "o jogador
// volta pra marcar". Ver `ATTRIBUTE_META.RCD`/`ATTRIBUTE_META.INT` em
// src/domain/attributes.ts para as definições.
//
// DIVERGÊNCIA CONHECIDA (não é bug, não "conserte" isto sem reler o balanceador
// primeiro) — OFE e DEF mostram o perfil INDIVIDUAL do jogador (`ovr(attrs,
// 'Ataque'/'Defesa')`), mas o balanceador (src/engine/balance.ts +
// src/engine/scoring.ts) NÃO usa essas fórmulas para montar os times:
//  - Eixo ofensivo do time = `potencialAtaque`: raiz da média dos 2 melhores
//    FIN do time × raiz do maior CRI do time. Não existe "potencialAtaque de
//    um jogador isolado" — é uma propriedade não-linear do TIME (top-2/máximo).
//  - Eixo defensivo do time = `estabilidadeDefensiva`: (média dos 2 melhores
//    DEF do time)^0,6 × (média das RCD do time)^0,4, mais a nota do goleiro
//    escalado valendo 1/3 do eixo.
//  - Ou seja: a contribuição de cada jogador é CONDICIONAL — o DEF dele só
//    conta se estiver entre os 2 melhores marcadores do time; o RCD dele
//    sempre entra na média do time. O chip OFE/DEF é só uma leitura pessoal,
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
  defensivo: number;
  /** null quando o jogador não tem nota de goleiro (não joga no gol). */
  goleiro: number | null;
}

/**
 * Calcula os 6 números exibidos, a partir dos atributos de linha (base, sem
 * contexto de posição) e da nota de goleiro (já resolvida por quem chama —
 * `null` se o jogador não é apto ao gol). `recomposicao` e `intensidade` NÃO
 * são OVRs — são os valores efetivos dos atributos-base RCD e INT, diretos
 * (ver comentário no topo do arquivo).
 */
export const computeDisplayOvrs = (attrs: AttrVector, gk: number | null): DisplayOvrs => ({
  geral: Math.round(ovr(attrs, 'Geral')),
  ofensivo: Math.round(ovr(attrs, 'Ataque')),
  recomposicao: Math.round(attrs.RCD),
  intensidade: Math.round(attrs.INT),
  defensivo: Math.round(ovr(attrs, 'Defesa')),
  goleiro: gk == null ? null : Math.round(gk),
});

export interface OvrDisplayItem {
  key: keyof DisplayOvrs;
  /** Sigla curta (3 letras) — usada na listagem e no cadastro. */
  abbr: string;
  /** Nome completo, pro title/aria-label (acessibilidade e descoberta da sigla). */
  fullLabel: string;
}

/** Ordem e siglas fixas dos 6 números — mesma listagem e cadastro, pra nunca divergir. */
export const OVR_DISPLAY_ITEMS: OvrDisplayItem[] = [
  {
    key: 'geral', abbr: 'OVR',
    fullLabel: 'Overall geral — média do time, casa com o balanceador (é a média de OVR Geral dos 6 de linha).',
  },
  {
    key: 'ofensivo', abbr: 'OFE',
    fullLabel: 'Overall ofensivo — perfil INDIVIDUAL do jogador. O balanceador não usa esse número: o ataque do time é calculado à parte (melhores finalizadores + maior criador do time), não como média de perfis individuais.',
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
    key: 'defensivo', abbr: 'DEF',
    fullLabel: 'Overall defensivo — perfil INDIVIDUAL do jogador. O balanceador não usa esse número: a defesa do time é calculada à parte (melhores marcadores do time + goleiro), não como média de perfis individuais.',
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
