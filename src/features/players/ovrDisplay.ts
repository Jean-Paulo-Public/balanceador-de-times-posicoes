// Overalls contextuais exibidos no cadastro (PlayerForm) e na listagem
// (PlayerCard) — 6 números lado a lado. Módulo PURAMENTE ADITIVO e sem
// estado: só combina peças que já existiam.
//
// Mapeamento pras chaves contextuais escolhidas de OVR_WEIGHTS:
//  - Ofensivo      -> 'Ataque' (pesa FIN/CRI/DRI/MOV — o que ele produz com bola).
//  - Defensivo     -> 'Defesa', mas SEM RECOMPOSIÇÃO: o RCD é ZERADO e o
//    resultado REESCALADO por regra de três (ver `defesaSemRecomposicao`). O
//    chip responde "quanto ele defende, tirando o voltar pra marcar" — porque a
//    recomposição já tem chip próprio ao lado e contá-la nos dois mostrava o
//    mesmo sinal duas vezes.
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

import { OVR_WEIGHTS, type AttrVector } from '../../domain/attributes';
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
/**
 * OVR de defesa DESCONTANDO a recomposição: zera o RCD e reescala pela fração
 * de peso que sobrou, devolvendo o número à régua 0–100. Exportado para teste.
 */
export const defesaSemRecomposicao = (attrs: AttrVector): number => {
  const pesoRcd = OVR_WEIGHTS.Defesa.RCD;
  const restante = 1 - pesoRcd;
  if (restante <= 0) return 0; // defensivo: só aconteceria se o vetor fosse 100% RCD
  return ovr({ ...attrs, RCD: 0 }, 'Defesa') / restante;
};

export const computeDisplayOvrs = (attrs: AttrVector, gk: number | null): DisplayOvrs => ({
  geral: Math.round(ovr(attrs, 'Geral')),
  ofensivo: Math.round(ovr(attrs, 'Ataque')),
  recomposicao: Math.round(attrs.RCD),
  intensidade: Math.round(attrs.INT),
  // O chip DEF mede DEFESA SEM RECOMPOSIÇÃO (pedido do dono): a recomposição já
  // tem chip PRÓPRIO ao lado, então contá-la aqui também mostrava o mesmo sinal
  // duas vezes.
  // COMO: zera o RCD e REESCALA por regra de três — o vetor `Defesa` sem o RCD
  // só chega a `1 - peso(RCD)` (hoje 0,78), então divide-se por isso pra voltar
  // à régua 0–100. Divisão, não soma: com peso .22 o fator é 1/0,78 = 1,282
  // (+28,2%), NÃO +22%.
  // Por que não zerar o peso de RCD no vetor: isso mudaria o peso RELATIVO de
  // todos os outros atributos. Reescalar preserva as proporções entre marcação,
  // físico e o resto exatamente como estão calibradas.
  // Lê-se o peso do próprio vetor em vez de constante fixa: se o peso de RCD em
  // `OVR_WEIGHTS.Defesa` mudar, isto acompanha sozinho.
  // ATENÇÃO: é SÓ EXIBIÇÃO. O eixo defensivo do balanceador
  // (`estabilidadeDefensiva`, em src/engine/scoring.ts) continua usando o RCD
  // REAL do jogador — nada aqui muda como os times são montados.
  defensivo: Math.round(defesaSemRecomposicao(attrs)),
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
    fullLabel: 'Overall defensivo SEM recomposição — quanto ele defende tirando o "volta pra marcar", que já tem o chip RCD ao lado. Perfil INDIVIDUAL: o balanceador não usa esse número (a defesa do time é calculada à parte, com os melhores marcadores + goleiro, e lá a recomposição real CONTA).',
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
