import type { Player, Team, SimulationResult, FormationType } from '../types';

const getAvg = (arr: (number | undefined)[]) => {
  const valid = arr.filter((n): n is number => n !== undefined);
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : 1;
};

const scoreDefensor = (p: Player) => {
  if (p.position === 'DEFENSOR') return getAvg([p.stats.def_posicionamentoMarcacao, p.stats.def_interceptacao]);
  return getAvg([p.stats.mei_def_posicionamentoMarcacao, p.stats.mei_def_interceptacao]) - 0.5;
};

const scoreMeiaDefensivo = (p: Player) => {
  if (p.position === 'MEIA_DEFENSIVO') return getAvg([p.stats.mei_def_sairPressao, p.stats.mei_def_posicionamentoMarcacao, p.stats.mei_def_interceptacao, p.stats.mei_protecaoVisaoPasse]);
  if (p.position === 'DEFENSOR') return getAvg([p.stats.def_sec_protecaoVisaoPasse, p.stats.def_sec_sairPressao, p.stats.def_posicionamentoMarcacao]) - 0.5;
  if (p.position === 'MEIA_OFENSIVO') return getAvg([p.stats.mei_def_sairPressao, p.stats.mei_def_posicionamentoMarcacao, p.stats.mei_def_interceptacao, p.stats.mei_protecaoVisaoPasse]) - 0.5;
  return 1;
};

const scoreMeia = (p: Player) => {
  if (p.position === 'MEIA_DEFENSIVO' || p.position === 'MEIA_OFENSIVO') {
    const off = getAvg([p.stats.mei_of_finalizacao, p.stats.mei_of_dribleArrancada, p.stats.mei_of_passeGolTabela]);
    const def = getAvg([p.stats.mei_def_sairPressao, p.stats.mei_def_posicionamentoMarcacao, p.stats.mei_def_interceptacao]);
    const base = p.stats.mei_protecaoVisaoPasse || 3;
    return getAvg([off, def, base]);
  }
  return 1;
};

const scoreMeiaOfensivo = (p: Player) => {
  if (p.position === 'MEIA_OFENSIVO') return getAvg([p.stats.mei_of_finalizacao, p.stats.mei_of_dribleArrancada, p.stats.mei_of_passeGolTabela, p.stats.mei_protecaoVisaoPasse]);
  if (p.position === 'MEIA_DEFENSIVO') return getAvg([p.stats.mei_of_finalizacao, p.stats.mei_of_dribleArrancada, p.stats.mei_of_passeGolTabela, p.stats.mei_protecaoVisaoPasse]) - 0.5;
  if (p.position === 'ATACANTE') return getAvg([p.stats.ata_sec_dribleArrancada, p.stats.ata_sec_passeGolTabela, p.stats.ata_finalizacaoPassePivo]) - 0.5;
  return 1;
};

const scoreAtacante = (p: Player) => {
  if (p.position === 'ATACANTE') return getAvg([p.stats.ata_corpoPosicionamento, p.stats.ata_finalizacaoPassePivo]);
  if (p.position === 'MEIA_OFENSIVO') return getAvg([p.stats.mei_of_finalizacao, p.stats.mei_of_dribleArrancada]) - 0.5;
  return 1;
};

type FormationSlot = {
  id: string;
  allowedOriginalPositions: Player['position'][];
  calcScore: (p: Player) => number;
};

const Formations: Record<'EQUILIBRADA' | 'OFENSIVA' | 'DEFENSIVA', FormationSlot[]> = {
  EQUILIBRADA: [
    { id: 'Defensor', allowedOriginalPositions: ['DEFENSOR'], calcScore: scoreDefensor },
    { id: 'Meia Defensivo', allowedOriginalPositions: ['MEIA_DEFENSIVO', 'DEFENSOR', 'MEIA_OFENSIVO'], calcScore: scoreMeiaDefensivo },
    { id: 'Meia 1', allowedOriginalPositions: ['MEIA_DEFENSIVO', 'MEIA_OFENSIVO'], calcScore: scoreMeia },
    { id: 'Meia 2', allowedOriginalPositions: ['MEIA_DEFENSIVO', 'MEIA_OFENSIVO'], calcScore: scoreMeia },
    { id: 'Meia Ofensivo', allowedOriginalPositions: ['MEIA_OFENSIVO', 'MEIA_DEFENSIVO', 'ATACANTE'], calcScore: scoreMeiaOfensivo },
    { id: 'Atacante', allowedOriginalPositions: ['ATACANTE'], calcScore: scoreAtacante },
  ],
  OFENSIVA: [
    { id: 'Defensor', allowedOriginalPositions: ['DEFENSOR'], calcScore: scoreDefensor },
    { id: 'Meia Defensivo', allowedOriginalPositions: ['MEIA_DEFENSIVO', 'DEFENSOR', 'MEIA_OFENSIVO'], calcScore: scoreMeiaDefensivo },
    { id: 'Meia 1', allowedOriginalPositions: ['MEIA_DEFENSIVO', 'MEIA_OFENSIVO'], calcScore: scoreMeia },
    { id: 'Meia 2', allowedOriginalPositions: ['MEIA_DEFENSIVO', 'MEIA_OFENSIVO'], calcScore: scoreMeia },
    { id: 'Atacante/Meia Of.', allowedOriginalPositions: ['ATACANTE', 'MEIA_OFENSIVO'], calcScore: scoreMeiaOfensivo },
    { id: 'Atacante', allowedOriginalPositions: ['ATACANTE'], calcScore: scoreAtacante },
  ],
  DEFENSIVA: [
    { id: 'Defensor 1', allowedOriginalPositions: ['DEFENSOR'], calcScore: scoreDefensor },
    { id: 'Defensor/Meia Def.', allowedOriginalPositions: ['DEFENSOR', 'MEIA_DEFENSIVO'], calcScore: scoreMeiaDefensivo },
    { id: 'Meia Defensivo', allowedOriginalPositions: ['MEIA_DEFENSIVO', 'DEFENSOR', 'MEIA_OFENSIVO'], calcScore: scoreMeiaDefensivo },
    { id: 'Meia 1', allowedOriginalPositions: ['MEIA_DEFENSIVO', 'MEIA_OFENSIVO'], calcScore: scoreMeia },
    { id: 'Meia 2', allowedOriginalPositions: ['MEIA_DEFENSIVO', 'MEIA_OFENSIVO'], calcScore: scoreMeia },
    { id: 'Atacante', allowedOriginalPositions: ['ATACANTE'], calcScore: scoreAtacante },
  ]
};

export const generateTeams = (
  players: Player[],
  formationType: FormationType,
  numTeams: number,
  numSimulations: number = 2000
): SimulationResult[] => {
  const pool = players.filter(p => p.active);
  const is7v7 = numTeams === 2 && pool.length >= 14;
  const playersPerTeam = is7v7 ? 7 : 6;

  if (pool.length < numTeams * playersPerTeam) return [];

  const results: SimulationResult[] = [];
  const formationKeys: (keyof typeof Formations)[] = ['EQUILIBRADA', 'OFENSIVA', 'DEFENSIVA'];

  const teamAverage = (team: { players: Team['players'] }) => getAvg(team.players.map(tp => tp.roleScore));

  const posToLabel = (pos: Player['position']) => {
    switch (pos) {
      case 'DEFENSOR': return 'Defensor';
      case 'MEIA_DEFENSIVO': return 'Meia Defensivo';
      case 'MEIA_OFENSIVO': return 'Meia Ofensivo';
      case 'ATACANTE': return 'Atacante';
      default: return 'Jogador';
    }
  };

  const getRoleLabels = (player: Player, assignedRole: string, improvised: boolean) => {
    const originalPosLabel = posToLabel(player.position);
    const lower = assignedRole.toLowerCase();

    // If this is an actual goalkeeper role in 7v7, treat as GK but show defense code
    if (lower.includes('goleiro') && is7v7) {
      return { roleShort: 'DEF', roleLabel: 'Goleiro' };
    }

    if (player.position === 'ATACANTE' && lower.includes('meia')) {
      return { roleShort: 'MA', roleLabel: 'Meia Atacante (improvisado)' };
    }

    // Map defenders / defensive midfield
    if (lower.includes('defensor')) {
      return { roleShort: 'DEF', roleLabel: `Defensor${improvised ? ' (improvisado)' : ''}` };
    }

    if (lower.includes('volante') || lower.includes('meia defensivo') || lower === 'meia defensivo') {
      return { roleShort: 'MD', roleLabel: `Meia Defensivo${improvised ? ' (improvisado)' : ''}` };
    }

    // Meia ofensivo / meia atacante
    if (lower.includes('meia ofensivo') || lower.includes('meia of.') || lower.includes('meia atacante') || lower.includes('meia of')) {
      const impro = improvised || player.position === 'ATACANTE';
      // If original was attacker and now plays as meia, mark as Meia Atacante (improvisado)
      return { roleShort: 'MA', roleLabel: `Meia Atacante${impro ? ' (improvisado)' : ''}` };
    }

    // Generic meia
    if (lower.includes('meia')) {
      return { roleShort: 'MEI', roleLabel: `Meia${improvised ? ' (improvisado)' : ''}` };
    }

    // Atacante
    if (lower.includes('atacante')) {
      const impro = improvised || player.position !== 'ATACANTE';
      return { roleShort: 'ATA', roleLabel: `Atacante${impro ? ' (improvisado)' : ''}` };
    }

    console.warn('[balancer] assignedRole não reconhecido:', assignedRole, 'player:', player.name, 'position:', player.position);

    // Fallback: derive from original position (no Goleiro Reserva label)
    switch (player.position) {
      case 'DEFENSOR': return { roleShort: 'DEF', roleLabel: originalPosLabel };
      case 'MEIA_DEFENSIVO': return { roleShort: 'MD', roleLabel: originalPosLabel };
      case 'MEIA_OFENSIVO': return { roleShort: 'MA', roleLabel: originalPosLabel };
      case 'ATACANTE': return { roleShort: 'ATA', roleLabel: originalPosLabel };
      default: return { roleShort: 'MEI', roleLabel: originalPosLabel };
    }
  };

  const teamAddPlayer = (
    team: { players: Team['players'] },
    player: Player,
    req: { id: string; allowedOriginalPositions: Player['position'][]; calcScore: (p: Player) => number; },
    improvisationPenalty: number
  ) => {
    const labels = getRoleLabels(player, req.id, improvisationPenalty === 1);
    team.players.push({
      player,
      assignedRole: req.id,
      roleScore: req.calcScore(player),
      improvisationPenalty,
      ...labels
    });
  };

  for (let iter = 0; iter < numSimulations; iter++) {
    let availablePlayers = [...pool].sort(() => Math.random() - 0.5);
    const getNoise = () => (Math.random() - 0.5) * 1.5;
    let isValid = true;
    const teamsData = Array.from({ length: numTeams }, (_, i) => {
      const fKey = formationType === 'QUALQUER'
        ? formationKeys[Math.floor(Math.random() * formationKeys.length)]
        : formationType as keyof typeof Formations;

      let reqs = [...Formations[fKey]];
      if (is7v7) {
        reqs = [{ id: 'Goleiro', allowedOriginalPositions: ['DEFENSOR', 'MEIA_DEFENSIVO', 'MEIA_OFENSIVO', 'ATACANTE'], calcScore: scoreDefensor }, ...reqs];
      }

      return {
        id: i + 1,
        name: `Time ${i + 1}`,
        tacticalSystem: fKey,
        overall: 0,
        players: [] as Team['players'],
        reqs: reqs.map((r, idx) => ({ ...r, originalIndex: idx }))
      };
    });

    const gks = availablePlayers.filter(p => p.isGoalkeeper);
    if (is7v7) {
      for (let t = 0; t < numTeams && gks.length > 0; t++) {
        const gk = gks.shift()!;
        const selectedIdx = availablePlayers.findIndex(p => p.id === gk.id);
        const player = availablePlayers.splice(selectedIdx, 1)[0];
        const reqIdx = teamsData[t].reqs.findIndex(r => r.id === 'Goleiro');
        if (reqIdx === -1) continue;

        const req = teamsData[t].reqs.splice(reqIdx, 1)[0];
        teamAddPlayer(teamsData[t], player, req, 0);
      }
    }

    const caps = availablePlayers.filter(p => p.isCaptain);
    for (let t = 0; t < numTeams; t++) {
      const hasCap = teamsData[t].players.some(tp => tp.player.isCaptain);
      if (!hasCap && caps.length > 0) {
        const capIdx = availablePlayers.findIndex(p => p.id === caps[0].id);
        const player = availablePlayers.splice(capIdx, 1)[0];
        caps.shift();

        let bestReqIdx = 0;
        let bestScore = -99;
        for (let r = 0; r < teamsData[t].reqs.length; r++) {
          const req = teamsData[t].reqs[r];
          const score = req.calcScore(player);
          if (score > bestScore) {
            bestScore = score;
            bestReqIdx = r;
          }
        }

        const req = teamsData[t].reqs.splice(bestReqIdx, 1)[0];
        teamAddPlayer(teamsData[t], player, req, 0);
      }
    }

    for (let t = 0; t < numTeams; t++) {
      const defReqs = teamsData[t].reqs.filter(r => r.id.includes('Defensor') || r.id.includes('Meia Defensivo'));
      for (const req of defReqs) {
        availablePlayers.sort((a, b) => (req.calcScore(b) + getNoise()) - (req.calcScore(a) + getNoise()));
        let selectedIdx = -1;
        for (let i = 0; i < availablePlayers.length; i++) {
          if (req.allowedOriginalPositions.includes(availablePlayers[i].position)) {
            selectedIdx = i;
            break;
          }
        }
        if (availablePlayers.length === 0 || selectedIdx === -1) {
          isValid = false;
          break;
        }

        const player = availablePlayers.splice(selectedIdx, 1)[0];
        const rIdx = teamsData[t].reqs.findIndex(r => r.originalIndex === req.originalIndex);
        teamsData[t].reqs.splice(rIdx, 1);

        teamAddPlayer(teamsData[t], player, req, req.allowedOriginalPositions.includes(player.position) ? 0 : 1);
      }
      if (!isValid) break;
    }
    if (!isValid) continue;

    for (let t = 0; t < numTeams; t++) {
      while (teamsData[t].reqs.length > 0) {
        const req = teamsData[t].reqs[0];
        const currentAvg = getAvg(teamsData[t].players.map(tp => tp.roleScore));

        availablePlayers.sort((a, b) => (req.calcScore(b) + getNoise()) - (req.calcScore(a) + getNoise()));
        let selectedIdx = -1;
        for (let i = 0; i < availablePlayers.length; i++) {
          if (req.allowedOriginalPositions.includes(availablePlayers[i].position)) {
            selectedIdx = i;
            break;
          }
        }
        if (availablePlayers.length === 0 || selectedIdx === -1) {
          isValid = false;
          break;
        }

        if (currentAvg > 3.5 && availablePlayers.length > 2) {
          for (let i = availablePlayers.length - 1; i >= 0; i--) {
            if (req.allowedOriginalPositions.includes(availablePlayers[i].position)) {
              selectedIdx = i;
              break;
            }
          }
        }

        const player = availablePlayers.splice(selectedIdx, 1)[0];
        teamsData[t].reqs.splice(0, 1);

        teamAddPlayer(teamsData[t], player, req, req.allowedOriginalPositions.includes(player.position) ? 0 : 1);
      }
      if (!isValid) break;
    }
    if (!isValid) continue;

    const sortedTeams = [...teamsData].sort((a, b) => teamAverage(a) - teamAverage(b));

    for (const team of sortedTeams) {
      while (team.players.length < playersPerTeam && availablePlayers.length > 0) {
        const gkIdx = availablePlayers.findIndex(p => p.isGoalkeeper);
        if (gkIdx !== -1) {
          const player = availablePlayers.splice(gkIdx, 1)[0];
          const posAssigned = player.position === 'DEFENSOR' ? 'Defensor' : player.position === 'MEIA_DEFENSIVO' ? 'Meia Defensivo' : player.position === 'MEIA_OFENSIVO' ? 'Meia Ofensivo' : 'Atacante';
          const dummyReq = { id: posAssigned, allowedOriginalPositions: [player.position], calcScore: player.position === 'ATACANTE' ? scoreAtacante : player.position === 'MEIA_OFENSIVO' ? scoreMeiaOfensivo : scoreMeiaDefensivo };
          teamAddPlayer(team, player, dummyReq, 0);
          continue;
        }

        let candidatePositionOrder: Player['position'][] = ['ATACANTE', 'MEIA_OFENSIVO', 'MEIA_DEFENSIVO', 'DEFENSOR'];
        let selectedIdx = -1;

        for (const position of candidatePositionOrder) {
          selectedIdx = availablePlayers.findIndex(p => p.position === position);
          if (selectedIdx !== -1) break;
        }

        if (selectedIdx === -1) selectedIdx = 0;

        const player = availablePlayers.splice(selectedIdx, 1)[0];
        const role = player.position === 'ATACANTE'
          ? 'Atacante'
          : player.position === 'MEIA_OFENSIVO'
            ? 'Meia Ofensivo'
            : player.position === 'MEIA_DEFENSIVO'
              ? 'Meia Defensivo'
              : 'Defensor Improvisado';
        const score = player.position === 'ATACANTE'
          ? scoreAtacante(player)
          : player.position === 'MEIA_OFENSIVO'
            ? scoreMeiaOfensivo(player)
            : player.position === 'MEIA_DEFENSIVO'
              ? scoreMeiaDefensivo(player)
              : scoreDefensor(player);
        const penalty = role === 'Meia Defensivo' || role === 'Meia Ofensivo' || role === 'Atacante' ? 0 : 1;

        const dummyReq = { id: role, allowedOriginalPositions: [player.position], calcScore: () => score };
        teamAddPlayer(team, player, dummyReq, penalty);
      }
    }

    teamsData.forEach(team => {
      let sumScores = 0;
      let totalPenalty = 0;
      team.players.forEach(tp => {
        sumScores += tp.roleScore;
        totalPenalty += tp.improvisationPenalty;
      });
      const avgScore = sumScores / playersPerTeam;
      let overall = Math.round((avgScore / 6) * 100);
      overall -= totalPenalty * 3;
      overall = Math.max(0, Math.min(100, overall));
      team.overall = overall;
    });

    const overalls = teamsData.map(t => t.overall);
    const mean = overalls.reduce((a, b) => a + b, 0) / overalls.length;
    const deviation = Math.sqrt(overalls.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / overalls.length);
    const totalImprov = teamsData.reduce((acc, t) => acc + t.players.reduce((sum, p) => sum + p.improvisationPenalty, 0), 0);

    results.push({
      id: crypto.randomUUID(),
      teams: teamsData.map(t => ({ id: t.id, name: t.name, overall: t.overall, players: t.players, tacticalSystem: t.tacticalSystem })),
      bench: availablePlayers,
      scoreDeviation: deviation,
      totalImprov: totalImprov
    });
  }

  results.sort((a, b) => {
    if ((a as any).totalImprov !== (b as any).totalImprov) {
      return (a as any).totalImprov - (b as any).totalImprov;
    }
    return a.scoreDeviation - b.scoreDeviation;
  });

  return results.slice(0, 10);
};
