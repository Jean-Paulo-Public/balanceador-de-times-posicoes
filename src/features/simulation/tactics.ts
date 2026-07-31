// Gera o texto tático de "como o time deve jogar" e as observações individuais,
// a partir das métricas e das funções do time balanceado. Ver Design v2, Seção 13.

import type { BalancedTeam } from '../../engine';
import { LINE_POSITIONS, type LinePosition } from '../../domain/positions';

const ROLE_NOTE: Record<LinePosition, string> = {
  FIXO: 'último homem, segura a marcação e ganha a dividida',
  LATERAL: 'sobe pelo lado, mas volta rápido pra recompor',
  VOLANTE: 'sai jogando de trás, primeira construção por passe',
  ALA: 'dá a largura, constrói driblando e cruza no terço final',
  MEIA_ATACANTE: 'recua na defesa e entra na boca da área no ataque',
  SEGUNDO_ATACANTE: 'ataca o espaço nas costas e finaliza',
  PIVO: 'referência de área, segura a bola de costas',
};

export interface TeamTactics {
  summary: string;
  individual: { name: string; note: string }[];
}

export const teamTactics = (t: BalancedTeam): TeamTactics => {
  const m = t.metrics;
  const parts: string[] = [];

  if (m.def >= m.off + 8) parts.push('Mais sólido atrás do que na frente: jogue compacto e aposte na transição rápida.');
  else if (m.off >= m.def + 8) parts.push('Mais forte no ataque: imponha o ritmo e mantenha a linha alta.');
  else parts.push('Equilibrado entre defesa e ataque: controle o meio e escolha a hora de subir.');

  // Recuo (RCD) e pressão (INT) são eixos independentes: o cruzamento dos dois
  // é justamente o que o antigo "motor" único não conseguia dizer.
  if (m.recuo >= 70 && m.pressao >= 70) parts.push('Motor completo — pressiona à frente e recompõe atrás o jogo inteiro.');
  else if (m.pressao >= 70 && m.recuo < 55) parts.push('Pressiona bem à frente, mas volta pouco: cuidado com o contra-ataque nas costas do meio.');
  else if (m.recuo >= 70 && m.pressao < 55) parts.push('Se sacrifica no recuo, mas pressiona pouco: espere o adversário e saia na transição.');
  else if (m.recuo < 55 && m.pressao < 55) parts.push('Motor limitado — economize corrida e evite se esticar no campo.');

  if (m.cobertura == null) parts.push('Sem goleiro fixo (emprestado): combinem antes quem cobre o gol.');
  else if (m.cobertura < 55) parts.push('Goleiro é o ponto mais frágil — protejam a área e afastem o perigo.');

  const summary = parts.join(' ');
  const individual = t.slots.map((s) => ({
    name: s.player.name,
    note: `${LINE_POSITIONS[s.role].label} — ${ROLE_NOTE[s.role] ?? ''}`,
  }));
  return { summary, individual };
};
