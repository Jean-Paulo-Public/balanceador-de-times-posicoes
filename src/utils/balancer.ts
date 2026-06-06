import type { Player, Team, SimulationResult, FormationType } from '../types';

const getAvg = (arr: (number | undefined)[]) => {
  const valid = arr.filter((n): n is number => n !== undefined);
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : 1;
};

const scoreDefensor = (p: Player) => {
  if (p.position === 'DEFENSOR') return getAvg([p.stats.def_posicionamentoMarcacao, p.stats.def_interceptacao, p.stats.geral_recomposicaoVelocidadeVigor]);
  return getAvg([p.stats.mei_def_posicionamentoMarcacao, p.stats.mei_def_interceptacao, p.stats.geral_recomposicaoVelocidadeVigor]) - 0.5;
};

const scoreMeiaDefensivo = (p: Player) => {
  if (p.position === 'MEIA_DEFENSIVO') return getAvg([p.stats.mei_def_sairPressao, p.stats.mei_def_posicionamentoMarcacao, p.stats.mei_def_interceptacao, p.stats.mei_protecaoVisaoPasse, p.stats.geral_recomposicaoVelocidadeVigor]);
  if (p.position === 'DEFENSOR') return getAvg([p.stats.def_sec_protecaoVisaoPasse, p.stats.def_sec_sairPressao, p.stats.def_posicionamentoMarcacao, p.stats.geral_recomposicaoVelocidadeVigor]) - 0.5;
  if (p.position === 'MEIA_OFENSIVO') return getAvg([p.stats.mei_def_sairPressao, p.stats.mei_def_posicionamentoMarcacao, p.stats.mei_def_interceptacao, p.stats.mei_protecaoVisaoPasse, p.stats.geral_recomposicaoVelocidadeVigor]) - 0.5;
  return 1;
};

const scoreMeia = (p: Player) => {
  if (p.position === 'MEIA_DEFENSIVO' || p.position === 'MEIA_OFENSIVO') {
    const off = getAvg([p.stats.mei_of_finalizacao, p.stats.mei_of_dribleArrancada, p.stats.mei_of_passeGolTabela, p.stats.geral_recomposicaoVelocidadeVigor]);
    const def = getAvg([p.stats.mei_def_sairPressao, p.stats.mei_def_posicionamentoMarcacao, p.stats.mei_def_interceptacao, p.stats.geral_recomposicaoVelocidadeVigor]);
    const base = getAvg([p.stats.mei_protecaoVisaoPasse, p.stats.geral_recomposicaoVelocidadeVigor]);
    return getAvg([off, def, base]);
  }
  return 1;
};

const scoreMeiaOfensivo = (p: Player) => {
  if (p.position === 'MEIA_OFENSIVO') return getAvg([p.stats.mei_of_finalizacao, p.stats.mei_of_dribleArrancada, p.stats.mei_of_passeGolTabela, p.stats.mei_protecaoVisaoPasse, p.stats.geral_recomposicaoVelocidadeVigor]);
  if (p.position === 'MEIA_DEFENSIVO') return getAvg([p.stats.mei_of_finalizacao, p.stats.mei_of_dribleArrancada, p.stats.mei_of_passeGolTabela, p.stats.mei_protecaoVisaoPasse, p.stats.geral_recomposicaoVelocidadeVigor]) - 0.5;
  if (p.position === 'ATACANTE') return getAvg([p.stats.ata_sec_dribleArrancada, p.stats.ata_sec_passeGolTabela, p.stats.ata_finalizacaoPassePivo, p.stats.geral_recomposicaoVelocidadeVigor]) - 0.5;
  return 1;
};

const scoreAtacante = (p: Player) => {
  if (p.position === 'ATACANTE') return getAvg([p.stats.ata_corpoPosicionamento, p.stats.ata_finalizacaoPassePivo, p.stats.geral_recomposicaoVelocidadeVigor]);
  if (p.position === 'MEIA_OFENSIVO') return getAvg([p.stats.mei_of_finalizacao, p.stats.mei_of_dribleArrancada, p.stats.geral_recomposicaoVelocidadeVigor]) - 0.5;
  return 1;
};

const scoreGoalkeeper = (p: Player) => {
  return getAvg([p.stats.gk_posicionamentoSaida, p.stats.gk_defesaReflexo, p.stats.gk_posicionamentoAereo, p.stats.gk_saidaPrecisa, p.stats.geral_recomposicaoVelocidadeVigor]);
};

const getPlayerOverall = (p: Player): number => {
  // Se é goleiro, calcula a média entre seu overall de goleiro e seu overall de linha
  if (p.isGoalkeeper) {
    const goalkeeperScore = scoreGoalkeeper(p);
    const lineScore = p.position === 'DEFENSOR' ? scoreDefensor(p) : p.position === 'MEIA_DEFENSIVO' ? scoreMeiaDefensivo(p) : p.position === 'MEIA_OFENSIVO' ? scoreMeiaOfensivo(p) : scoreAtacante(p);
    return getAvg([goalkeeperScore, lineScore]);
  }
  
  // Se é defensor, pode ter overall de goleiro também
  if (p.position === 'DEFENSOR') {
    const lineScore = scoreDefensor(p);
    const goalkeeperScore = scoreGoalkeeper(p);
    // Sempre considera a média com o overall de goleiro
    return getAvg([lineScore, goalkeeperScore]);
  }

  // Para outros, usa o score normal da posição
  if (p.position === 'ATACANTE') return scoreAtacante(p);
  if (p.position === 'MEIA_OFENSIVO') return scoreMeiaOfensivo(p);
  if (p.position === 'MEIA_DEFENSIVO') return scoreMeiaDefensivo(p);
  
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
    { id: 'Volante', allowedOriginalPositions: ['MEIA_DEFENSIVO'], calcScore: scoreMeiaDefensivo },
    { id: 'Meia 1', allowedOriginalPositions: ['MEIA_DEFENSIVO', 'MEIA_OFENSIVO'], calcScore: scoreMeia },
    { id: 'Meia 2', allowedOriginalPositions: ['MEIA_DEFENSIVO', 'MEIA_OFENSIVO'], calcScore: scoreMeia },
    { id: 'Meia Ofensivo', allowedOriginalPositions: ['MEIA_OFENSIVO', 'ATACANTE'], calcScore: scoreMeiaOfensivo },
    { id: 'Atacante', allowedOriginalPositions: ['ATACANTE'], calcScore: scoreAtacante },
  ],
  OFENSIVA: [
    { id: 'Defensor', allowedOriginalPositions: ['DEFENSOR'], calcScore: scoreDefensor },
    { id: 'Volante', allowedOriginalPositions: ['MEIA_DEFENSIVO'], calcScore: scoreMeiaDefensivo },
    { id: 'Meia', allowedOriginalPositions: ['MEIA_DEFENSIVO', 'MEIA_OFENSIVO'], calcScore: scoreMeia },
    { id: 'Meia Ofensivo 1', allowedOriginalPositions: ['MEIA_OFENSIVO', 'ATACANTE'], calcScore: scoreMeiaOfensivo },
    { id: 'Meia Ofensivo 2', allowedOriginalPositions: ['MEIA_OFENSIVO', 'ATACANTE'], calcScore: scoreMeiaOfensivo },
    { id: 'Atacante', allowedOriginalPositions: ['ATACANTE'], calcScore: scoreAtacante },
  ],
  DEFENSIVA: [
    { id: 'Defensor 1', allowedOriginalPositions: ['DEFENSOR'], calcScore: scoreDefensor },
    { id: 'Defensor 2', allowedOriginalPositions: ['DEFENSOR'], calcScore: scoreDefensor },
    { id: 'Volante', allowedOriginalPositions: ['MEIA_DEFENSIVO'], calcScore: scoreMeiaDefensivo },
    { id: 'Meia 1', allowedOriginalPositions: ['MEIA_DEFENSIVO', 'MEIA_OFENSIVO'], calcScore: scoreMeia },
    { id: 'Meia 2', allowedOriginalPositions: ['MEIA_DEFENSIVO', 'MEIA_OFENSIVO'], calcScore: scoreMeia },
    { id: 'Atacante', allowedOriginalPositions: ['ATACANTE'], calcScore: scoreAtacante },
  ]
};

export const generateTeams = (
  players: Player[],
  formationType: FormationType | FormationType[],
  numTeams: number,
  numSimulations: number = 2000,
  neverScaleGoalkeepers: boolean = false
): SimulationResult[] => {
  const pool = players.filter(p => p.active);
  const activeGoalkeepersCount = pool.filter(p => p.isGoalkeeper).length;
  
  // NEW LOGIC:
  // - If neverScaleGoalkeepers === false: use 7v7 (1 GK + 6 field) when conditions allow
  // - If neverScaleGoalkeepers === true: use base 6v6, but scale GKs when extras are available
  const is7v7Base = !neverScaleGoalkeepers && [2, 3, 4].includes(numTeams) && activeGoalkeepersCount >= numTeams && pool.length >= numTeams * 7;
  
  let playersPerTeam = 6;
  let teamsWithGoalkeeper: number[] = []; // which team indices get a goalkeeper
  
  if (is7v7Base) {
    playersPerTeam = 7;
    teamsWithGoalkeeper = Array.from({ length: numTeams }, (_, i) => i); // all teams get GK
  } else if (neverScaleGoalkeepers && activeGoalkeepersCount > 0) {
    // NOVO: Scale goalkeepers when flag is set
    const minPlayersNeeded = numTeams * 6;
    const extraPlayers = pool.length - minPlayersNeeded;
    
    if (extraPlayers >= 1 && activeGoalkeepersCount >= Math.min(extraPlayers, numTeams)) {
      // Assign goalkeepers to teams based on extra players
      const numGoalkeepersToAssign = Math.min(extraPlayers, numTeams, activeGoalkeepersCount);
      for (let i = 0; i < numGoalkeepersToAssign; i++) {
        teamsWithGoalkeeper.push(i);
      }
      playersPerTeam = 7; // This doesn't apply uniformly, handled per team below
    }
  }

  if (pool.length < numTeams * playersPerTeam && (teamsWithGoalkeeper.length === 0 || teamsWithGoalkeeper.length < numTeams)) {
    // If uniform playersPerTeam not available, check if we have enough for mixed configuration
    const totalNeeded = numTeams * 6 + teamsWithGoalkeeper.length; // 6 base + 1 extra for GK teams
    if (pool.length < totalNeeded) return [];
  }

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

  const getRoleLabels = (player: Player, assignedRole: string, improvised: boolean, isGoalkeeperRole: boolean = false) => {
    const originalPosLabel = posToLabel(player.position);
    const lower = assignedRole.toLowerCase();

    // If this is an actual goalkeeper role, treat as GK
    if (lower.includes('goleiro') || isGoalkeeperRole) {
      return { roleShort: 'GK', roleLabel: 'Goleiro' };
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

    // Fallback: derive from original position
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
    improvisationPenalty: number,
    isGoalkeeperRole: boolean = false
  ) => {
    const labels = getRoleLabels(player, req.id, improvisationPenalty === 1, isGoalkeeperRole);
    team.players.push({
      player,
      assignedRole: req.id,
      roleScore: getPlayerOverall(player), // Use new overall calculation
      improvisationPenalty,
      ...labels
    });
  };

  for (let iter = 0; iter < numSimulations; iter++) {
    let availablePlayers = [...pool].sort(() => Math.random() - 0.5);
    const getNoise = () => (Math.random() - 0.5) * 1.5;
    let isValid = true;
    
    // Determine playersPerTeam for each team in this iteration
    const playersPerTeamArr = Array(numTeams).fill(6);
    for (const teamIdx of teamsWithGoalkeeper) {
      playersPerTeamArr[teamIdx] = 7;
    }
    
    const teamsData = Array.from({ length: numTeams }, (_, i) => {
      const teamFormation = Array.isArray(formationType) ? (formationType[i] ?? 'QUALQUER') : formationType;
      const fKey = teamFormation === 'QUALQUER'
        ? formationKeys[Math.floor(Math.random() * formationKeys.length)]
        : teamFormation as keyof typeof Formations;

      let reqs = [...Formations[fKey]];
      if (teamsWithGoalkeeper.includes(i)) {
        reqs = [{ id: 'Goleiro', allowedOriginalPositions: ['DEFENSOR', 'MEIA_DEFENSIVO', 'MEIA_OFENSIVO', 'ATACANTE'], calcScore: scoreGoalkeeper }, ...reqs];
      }

      return {
        id: i + 1,
        name: `Time ${i + 1}`,
        tacticalSystem: fKey,
        overall: 0,
        players: [] as Team['players'],
        reqs: reqs.map((r, idx) => ({ ...r, originalIndex: idx })),
        playersPerTeam: playersPerTeamArr[i],
        needsGoalkeeper: teamsWithGoalkeeper.includes(i),
        bench: [] as Team['players']
      };
    });

    // First: Assign goalkeepers to teams that need them
    const gksAvailable = availablePlayers.filter(p => p.isGoalkeeper);
    for (let t = 0; t < numTeams; t++) {
      if (teamsData[t].needsGoalkeeper && gksAvailable.length > 0) {
        const gk = gksAvailable.shift();
        if (!gk) {
          isValid = false;
          break;
        }

        const selectedIdx = availablePlayers.findIndex(p => p.id === gk.id);
        if (selectedIdx === -1) {
          isValid = false;
          break;
        }

        const player = availablePlayers.splice(selectedIdx, 1)[0];
        const req = teamsData[t].reqs.find(r => r.id === 'Goleiro');
        if (!req) {
          isValid = false;
          break;
        }
        
        teamsData[t].reqs = teamsData[t].reqs.filter(r => r.id !== 'Goleiro');
        teamAddPlayer(teamsData[t], player, req, 0, true);
      }
    }
    if (!isValid) continue;

    // Second: Assign captains
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
        teamAddPlayer(teamsData[t], player, req, 0, false);
      }
    }

    // Third: Assign defensive requirements
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

        teamAddPlayer(teamsData[t], player, req, req.allowedOriginalPositions.includes(player.position) ? 0 : 1, false);
      }
      if (!isValid) break;
    }
    if (!isValid) continue;

    // Fourth: Assign remaining position requirements
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

        teamAddPlayer(teamsData[t], player, req, req.allowedOriginalPositions.includes(player.position) ? 0 : 1, false);
      }
      if (!isValid) break;
    }
    if (!isValid) continue;

    // Fifth: Fill remaining spots and create bench BY TEAM
    const sortedTeams = [...teamsData].sort((a, b) => teamAverage(a) - teamAverage(b));

    for (const team of sortedTeams) {
      // First, fill the team to its playersPerTeam size
      while (team.players.length < team.playersPerTeam && availablePlayers.length > 0) {
        const gkIdx = availablePlayers.findIndex(p => p.isGoalkeeper);
        if (gkIdx !== -1 && !team.needsGoalkeeper) {
          // Skip GKs if team doesn't need them (unless we're filling last spots)
          if (team.players.length < team.playersPerTeam - 1) {
            availablePlayers.splice(gkIdx, 1);
            availablePlayers.push(availablePlayers.shift()!); // Move to end to try next player
            continue;
          }
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
              : 'Defensor';
        const score = player.position === 'ATACANTE'
          ? scoreAtacante(player)
          : player.position === 'MEIA_OFENSIVO'
            ? scoreMeiaOfensivo(player)
            : player.position === 'MEIA_DEFENSIVO'
              ? scoreMeiaDefensivo(player)
              : scoreDefensor(player);
        const originalRole = player.position === 'ATACANTE'
          ? 'Atacante'
          : player.position === 'MEIA_OFENSIVO'
            ? 'Meia Ofensivo'
            : player.position === 'MEIA_DEFENSIVO'
              ? 'Meia Defensivo'
              : 'Defensor';
        const penalty = role !== originalRole ? 1 : 0;

        const dummyReq = { id: role, allowedOriginalPositions: [player.position], calcScore: () => score };
        teamAddPlayer(team, player, dummyReq, penalty, false);
      }

      // Now handle bench for this team (NOVO)
      // Seleciona por time o jogador que impacta menos o overall na posição
      while (availablePlayers.length > 0) {
        let minImpactIdx = 0;
        let minImpactScore = 999;

        for (let i = 0; i < availablePlayers.length; i++) {
          const player = availablePlayers[i];
          const playerScore = getPlayerOverall(player);

          if (playerScore < minImpactScore) {
            minImpactScore = playerScore;
            minImpactIdx = i;
          }
        }

        const player = availablePlayers.splice(minImpactIdx, 1)[0];
        const role = player.position === 'ATACANTE'
          ? 'Atacante'
          : player.position === 'MEIA_OFENSIVO'
            ? 'Meia Ofensivo'
            : player.position === 'MEIA_DEFENSIVO'
              ? 'Meia Defensivo'
              : 'Defensor';
        const score = getPlayerOverall(player);

        const labels = getRoleLabels(player, role, false, false);
        team.bench.push({
          player,
          assignedRole: role,
          roleScore: score,
          improvisationPenalty: 0,
          ...labels
        });
      }
    }

    teamsData.forEach(team => {
      let sumScores = 0;
      let totalPenalty = 0;
      team.players.forEach(tp => {
        sumScores += tp.roleScore;
        totalPenalty += tp.improvisationPenalty;
      });
      const avgScore = sumScores / team.players.length;
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
      teams: teamsData.map(t => ({ id: t.id, name: t.name, overall: t.overall, players: t.players, tacticalSystem: t.tacticalSystem, bench: t.bench })),
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
