import type { Team, TeamSlotPlayer } from '../../domain/types';
import { FORMATION_LABELS } from '../../domain/formations';

/**
 * Geração da "lista dos times" em texto simples — usada tanto pela visualização
 * em tela (`TeamRosterList.tsx`) quanto pelo export para WhatsApp
 * (`SimulationTab.tsx`). Mantido num único lugar pra não haver duas fontes de
 * verdade sobre como agrupar/ordenar os jogadores de cada time.
 */

/** Nome legível do sistema tático do time (ex.: "Ofensiva (2-2-2)"), com fallback
 * pro valor bruto caso não bata com nenhuma chave conhecida de `FORMATION_LABELS`. */
export const formationLabelFor = (team: Team): string =>
  FORMATION_LABELS[team.tacticalSystem as keyof typeof FORMATION_LABELS] ?? team.tacticalSystem ?? '';

const SECTION_ORDER: { roleShort: string; label: string }[] = [
  { roleShort: 'GK', label: 'Goleiro' },
  { roleShort: 'DEF', label: 'Defensores' },
  { roleShort: 'MEI', label: 'Meias' },
  { roleShort: 'ATA', label: 'Atacantes' },
];

export interface RosterSection {
  label: string;
  names: string[];
}

const namesByRole = (players: TeamSlotPlayer[], roleShort: string): string[] =>
  players.filter(tp => tp.roleShort === roleShort).map(tp => tp.player.name);

/** Seções (Goleiro/Defensores/Meias/Atacantes/Banco) de um time, pulando as vazias. */
export const buildTeamSections = (team: Team): RosterSection[] => {
  const sections: RosterSection[] = [];
  for (const { roleShort, label } of SECTION_ORDER) {
    const names = namesByRole(team.players, roleShort);
    if (names.length > 0) sections.push({ label, names });
  }
  if (team.bench.length > 0) {
    sections.push({ label: 'Banco', names: team.bench.map(bp => bp.player.name) });
  }
  return sections;
};

/**
 * Texto pronto pra compartilhar (ex.: WhatsApp). Usa `*Time X*` (negrito no
 * WhatsApp) para o título de cada time e "- " como marcador de item — de
 * propósito, pra não usar "*" isolado antes do nome, que o WhatsApp poderia
 * interpretar como início de negrito. Inclui a formação de cada time logo no
 * início (junto com o nome), mas NÃO inclui overall/defesa — esses números só
 * aparecem na tela, não fazem sentido soltos numa mensagem de texto.
 */
export const buildRosterText = (teams: Team[]): string =>
  teams
    .map(team => {
      const sections = buildTeamSections(team);
      const body = sections
        .map(section => `${section.label}:\n${section.names.map(name => `- ${name}`).join('\n')}`)
        .join('\n');
      return `*${team.name}*\nFormação: ${formationLabelFor(team)}\n${body}`;
    })
    .join('\n\n');
