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
  if (p.position === 'DEFENSOR') return scoreDefensor(p) - 0.5;
  if (p.position === 'ATACANTE') return scoreAtacante(p) - 0.5;
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

const scoreGoalkeeper = (p: Player, forceLowStats: boolean = false) => {
  if (forceLowStats) return 1;
  return getAvg([p.stats.gk_posicionamentoSaida, p.stats.gk_defesaReflexo, p.stats.gk_posicionamentoAereo, p.stats.gk_saidaPrecisa, p.stats.geral_recomposicaoVelocidadeVigor]);
};

const getLineScoreByPosition = (p: Player, currentRole?: string): number => {
  const role = currentRole?.toLowerCase() || '';
  if (role.includes('defensor') || p.position === 'DEFENSOR') return scoreDefensor(p);
  if (role.includes('volante') || role.includes('meia defensivo') || p.position === 'MEIA_DEFENSIVO') return scoreMeiaDefensivo(p);
  if (role.includes('meia ofensivo') || role.includes('meia atacante') || p.position === 'MEIA_OFENSIVO') return scoreMeiaOfensivo(p);
  if (role.includes('atacante') || p.position === 'ATACANTE') return scoreAtacante(p);
  return scoreMeia(p);
};

const isImprovisationAllowed = (playerPosition: Player['position'], targetRoleId: string): boolean => {
  const role = targetRoleId.toLowerCase();
  
  if (role.includes('defensor')) {
    return playerPosition === 'MEIA_DEFENSIVO' || playerPosition === 'DEFENSOR';
  }
  if (role.includes('volante') || role.includes('meia defensivo')) {
    return playerPosition === 'MEIA_OFENSIVO';
  }
  if (role.includes('meia ofensivo') || role.includes('meia atacante')) {
    return playerPosition === 'ATACANTE' || playerPosition === 'DEFENSOR' || playerPosition === 'MEIA_DEFENSIVO';
  }
  if (role.includes('atacante')) {
    return playerPosition === 'MEIA_OFENSIVO';
  }
  if (role === 'meia' || role.includes('meia 1') || role.includes('meia 2')) {
    if (playerPosition === 'MEIA_DEFENSIVO' || playerPosition === 'MEIA_OFENSIVO') return true;
  }
  return true;
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

interface ExtendedSimulationResult extends SimulationResult {
  benchToTitularDiff: number;
  benchEquilibrium: number;
}

export const generateTeams = (
  players: Player[],
  formationType: FormationType | FormationType[],
  numTeams: number,
  numSimulations: number = 2000,
  neverScaleGoalkeepers: boolean = false
): SimulationResult[] => {
  const pool = players.filter(p => p.active);
  
  const baseFieldPlayersNeeded = numTeams * 6;
  if (pool.length < baseFieldPlayersNeeded) return [];

  const results: ExtendedSimulationResult[] = [];
  const formationKeys: (keyof typeof Formations)[] = ['EQUILIBRADA', 'OFENSIVA', 'DEFENSIVA'];

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

    if (lower.includes('goleiro') || isGoalkeeperRole) {
      return { roleShort: 'GK', roleLabel: 'Goleiro' };
    }

    if (player.position === 'ATACANTE' && lower.includes('meia')) {
      return { roleShort: 'MA', roleLabel: 'Meia Atacante (improvisado)' };
    }
    if (lower.includes('defensor')) {
      return { roleShort: 'DEF', roleLabel: `Defensor${improvised ? ' (improvisado)' : ''}` };
    }
    if (lower.includes('volante') || lower.includes('meia defensivo')) {
      return { roleShort: 'MD', roleLabel: `Meia Defensivo${improvised ? ' (improvisado)' : ''}` };
    }
    if (lower.includes('meia ofensivo') || lower.includes('meia of.') || lower.includes('meia atacante') || lower.includes('meia of')) {
      const impro = improvised || player.position === 'ATACANTE';
      return { roleShort: 'MA', roleLabel: `Meia Atacante${impro ? ' (improvisado)' : ''}` };
    }
    
    if (lower === 'meia' || lower.includes('meia 1') || lower.includes('meia 2')) {
      const isNativeMid = player.position === 'MEIA_DEFENSIVO' || player.position === 'MEIA_OFENSIVO';
      const actualImpro = isNativeMid ? false : improvised;
      return { roleShort: 'MEI', roleLabel: `Meia${actualImpro ? ' (improvisado)' : ''}` };
    }

    if (lower.includes('atacante')) {
      const impro = improvised || player.position !== 'ATACANTE';
      return { roleShort: 'ATA', roleLabel: `Atacante${impro ? ' (improvisado)' : ''}` };
    }

    return { roleShort: 'MEI', roleLabel: originalPosLabel };
  };

  const teamAddPlayer = (
    team: { players: Team['players'] },
    player: Player,
    req: { id: string; allowedOriginalPositions: Player['position'][]; calcScore: (p: Player) => number; },
    improvised: number,
    isGoalkeeperRole: boolean = false,
    forceGkLowStats: boolean = false
  ) => {
    const lowerReq = req.id.toLowerCase();
    let finalImprovisedPenalty = improvised;
    if ((lowerReq === 'meia' || lowerReq.includes('meia 1') || lowerReq.includes('meia 2')) && 
        (player.position === 'MEIA_DEFENSIVO' || player.position === 'MEIA_OFENSIVO')) {
      finalImprovisedPenalty = 0;
    }

    const labels = getRoleLabels(player, req.id, finalImprovisedPenalty === 1, isGoalkeeperRole);
    const finalRoleScore = isGoalkeeperRole 
      ? getAvg([scoreGoalkeeper(player, forceGkLowStats), getLineScoreByPosition(player, req.id)])
      : getLineScoreByPosition(player, req.id);

    team.players.push({
      player,
      assignedRole: req.id,
      roleScore: finalRoleScore,
      improvisationPenalty: finalImprovisedPenalty,
      ...labels
    });
  };

  for (let iter = 0; iter < numSimulations; iter++) {
    const workingPool = [...pool].sort(() => Math.random() - 0.5);

    const getNoise = () => (Math.random() - 0.5) * 1.5;
    const getTeamCurrentScore = (team: { players: Team['players'] }) =>
      team.players.reduce((sum, tp) => sum + tp.roleScore, 0);

    const teamsData = Array.from({ length: numTeams }, (_, i) => {
      const teamFormation = Array.isArray(formationType) ? (formationType[i] ?? 'QUALQUER') : formationType;
      const fKey = teamFormation === 'QUALQUER'
        ? formationKeys[Math.floor(Math.random() * formationKeys.length)]
        : teamFormation as keyof typeof Formations;

      return {
        id: i + 1,
        name: `Time ${i + 1}`,
        tacticalSystem: fKey,
        overall: 0,
        benchOverall: 0,
        players: [] as Team['players'],
        reqs: [...Formations[fKey]].map((r, idx) => ({ ...r, originalIndex: idx })),
        bench: [] as Team['players']
      };
    });

    // 1. ALOCAÇÃO ANTECIPADA DE GOLEIROS TITULARES (Até 1 por time, se houver)
    if (!neverScaleGoalkeepers) {
      for (let t = 0; t < numTeams; t++) {
        if (workingPool.length === 0) break;

        let chosenGkPlayer: Player | null = null;
        let gkIdx = workingPool.findIndex(p => p.isGoalkeeper);
        let forceLowGkStats = false;

        if (gkIdx === -1) gkIdx = workingPool.findIndex(p => p.stats.gk_pegas_no_gol && p.position === 'MEIA_DEFENSIVO');
        if (gkIdx === -1) gkIdx = workingPool.findIndex(p => p.stats.gk_pegas_no_gol && p.position === 'DEFENSOR');
        if (gkIdx === -1) gkIdx = workingPool.findIndex(p => p.stats.gk_pegas_no_gol);
        if (gkIdx === -1) {
          gkIdx = workingPool.findIndex(p => p.position === 'MEIA_DEFENSIVO');
          if (gkIdx !== -1) forceLowGkStats = true;
        }
        if (gkIdx === -1 && workingPool.length > 0) gkIdx = 0;

        if (gkIdx !== -1) {
          chosenGkPlayer = workingPool.splice(gkIdx, 1)[0];
          const gkReq = {
            id: 'Goleiro',
            allowedOriginalPositions: ['DEFENSOR', 'MEIA_DEFENSIVO', 'MEIA_OFENSIVO', 'ATACANTE'] as Player['position'][],
            calcScore: scoreGoalkeeper,
          };
          teamAddPlayer(teamsData[t], chosenGkPlayer, gkReq, (chosenGkPlayer.isGoalkeeper || !chosenGkPlayer.position) ? 0 : 1, true, forceLowGkStats);
        }
      }
    }

    // 2. SISTEMA DE SELEÇÃO E DISTRIBUIÇÃO DA LINHA (Trata goleiros sobressalentes como linhas nativos)
    const selectBestPlayerIndex = (
      req: { id: string; allowedOriginalPositions: Player['position'][]; calcScore: (p: Player) => number; },
      sourcePool: Player[]
    ) => {
      let bestAllowedIdx = -1;
      let bestAllowedScore = -Infinity;
      let bestFallbackIdx = -1;
      let bestFallbackScore = -Infinity;

      for (let i = 0; i < sourcePool.length; i++) {
        const player = sourcePool[i];
        const score = req.calcScore(player) + getNoise();
        
        if (req.allowedOriginalPositions.includes(player.position)) {
          if (score > bestAllowedScore) {
            bestAllowedScore = score;
            bestAllowedIdx = i;
          }
        } else if (isImprovisationAllowed(player.position, req.id)) {
          if (score > bestFallbackScore) {
            bestFallbackScore = score;
            bestFallbackIdx = i;
          }
        }
      }

      return bestAllowedIdx !== -1 ? bestAllowedIdx : bestFallbackIdx;
    };

    const assignPlayerToRole = (
      team: { players: Team['players']; reqs: Array<{ id: string; allowedOriginalPositions: Player['position'][]; calcScore: (p: Player) => number; originalIndex: number; }> },
      req: { id: string; allowedOriginalPositions: Player['position'][]; calcScore: (p: Player) => number; originalIndex: number; }
    ) => {
      if (workingPool.length === 0) return false;
      
      const playerIndexInPool = selectBestPlayerIndex(req, workingPool);
      if (playerIndexInPool === -1) return false;
      
      const chosenPlayer = workingPool.splice(playerIndexInPool, 1)[0];
      team.reqs = team.reqs.filter((r) => r.originalIndex !== req.originalIndex);
      
      const isAllowedDirectly = req.allowedOriginalPositions.includes(chosenPlayer.position);
      teamAddPlayer(team, chosenPlayer, req, isAllowedDirectly ? 0 : 1, false);
      return true;
    };

    const isAttackRole = (reqId: string) => {
      const lower = reqId.toLowerCase();
      return lower.includes('atacante') || lower.includes('meia ofensivo') || (lower.includes('meia') && !lower.includes('defensivo') && !lower.includes('defensor'));
    };

    const isDefenderRole = (reqId: string) => {
      const lower = reqId.toLowerCase();
      return lower.includes('defensor');
    };

    const isDefensiveMidRole = (reqId: string) => {
      const lower = reqId.toLowerCase();
      return lower.includes('volante') || lower.includes('meia defensivo');
    };

    let validGeneration = true;

    // Distribuição em ondas prioritárias
    const attackPending = teamsData.flatMap(t => t.reqs.filter(r => isAttackRole(r.id)).map(r => ({ team: t, req: r })));
    attackPending.sort((a, b) => getTeamCurrentScore(a.team) - getTeamCurrentScore(b.team));
    for (const { team, req } of attackPending) {
      if (!assignPlayerToRole(team, req)) { validGeneration = false; break; }
    }
    if (!validGeneration) continue;

    const defenderPending = teamsData.flatMap(t => t.reqs.filter(r => isDefenderRole(r.id)).map(r => ({ team: t, req: r })));
    defenderPending.sort((a, b) => getTeamCurrentScore(a.team) - getTeamCurrentScore(b.team));
    for (const { team, req } of defenderPending) {
      if (!assignPlayerToRole(team, req)) { validGeneration = false; break; }
    }
    if (!validGeneration) continue;

    const defMidPending = teamsData.flatMap(t => t.reqs.filter(r => isDefensiveMidRole(r.id)).map(r => ({ team: t, req: r })));
    defMidPending.sort((a, b) => getTeamCurrentScore(a.team) - getTeamCurrentScore(b.team));
    for (const { team, req } of defMidPending) {
      if (!assignPlayerToRole(team, req)) { validGeneration = false; break; }
    }
    if (!validGeneration) continue;

    const remainingPending = teamsData.flatMap(t => t.reqs.map(r => ({ team: t, req: r })));
    for (const { team, req } of remainingPending) {
      if (!assignPlayerToRole(team, req)) { validGeneration = false; break; }
    }
    if (!validGeneration) continue;

    // Salvaguarda matemática rígida dos 6 de linha
    const missingLinePlayers = teamsData.some(t => t.players.filter(p => p.assignedRole !== 'Goleiro').length < 6);
    if (missingLinePlayers) continue;

    // 3. DISTRIBUIÇÃO DOS RESERVAS SOBRANTES (Goleiros excedentes no banco atuam na sua linha nativa)
    let currentTeamBenchIdx = 0;
    while (workingPool.length > 0) {
      const player = workingPool.shift()!;
      const targetTeam = teamsData[currentTeamBenchIdx % numTeams];
      const role = player.position === 'ATACANTE' ? 'Atacante'
                 : player.position === 'MEIA_OFENSIVO' ? 'Meia Ofensivo'
                 : player.position === 'MEIA_DEFENSIVO' ? 'Meia Defensivo' : 'Defensor';

      const score = getLineScoreByPosition(player, role);
      const labels = getRoleLabels(player, role, false, false);

      targetTeam.bench.push({
        player,
        assignedRole: role,
        roleScore: score,
        improvisationPenalty: 0,
        ...labels
      });
      currentTeamBenchIdx++;
    }

    // 4. PROCESSAMENTO DE MÉDIAS E OVERALLS
    let benchToTitularDiff = 0;
    teamsData.forEach(team => {
      const sumScores = team.players.reduce((s, tp) => s + tp.roleScore, 0);
      const totalPenalty = team.players.reduce((s, tp) => s + tp.improvisationPenalty, 0);
      
      const avgScore = team.players.length ? sumScores / team.players.length : 1;
      let overall = Math.round((avgScore / 6) * 100);
      overall -= totalPenalty * 3;
      team.overall = Math.max(0, Math.min(100, overall));

      const benchScoresSum = team.bench.reduce((sum, bp) => sum + bp.roleScore, 0);
      const avgBenchScore = team.bench.length ? benchScoresSum / team.bench.length : 0;
      team.benchOverall = Math.max(0, Math.min(100, Math.round((avgBenchScore / 6) * 100)));

      benchToTitularDiff += Math.abs(team.overall - team.benchOverall);
    });

    let benchEquilibrium = 0;
    for (let i = 0; i < teamsData.length; i++) {
      for (let j = i + 1; j < teamsData.length; j++) {
        benchEquilibrium += Math.pow(teamsData[i].benchOverall - teamsData[j].benchOverall, 2);
      }
    }

    const overalls = teamsData.map(t => t.overall);
    const mean = overalls.reduce((a, b) => a + b, 0) / overalls.length;
    const deviation = Math.sqrt(overalls.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / overalls.length);
    const totalImprov = teamsData.reduce((acc, t) => acc + t.players.reduce((sum, p) => sum + p.improvisationPenalty, 0), 0);

    let equilibrium = 0;
    for (let i = 0; i < overalls.length; i++) {
      for (let j = i + 1; j < overalls.length; j++) {
        equilibrium += Math.pow(overalls[i] - overalls[j], 2);
      }
    }

    results.push({
      id: crypto.randomUUID(),
      teams: teamsData.map(t => ({ 
        id: t.id, 
        name: t.name, 
        overall: t.overall, 
        benchOverall: t.benchOverall, 
        players: t.players, 
        tacticalSystem: t.tacticalSystem, 
        bench: t.bench 
      })),
      scoreDeviation: deviation,
      totalImprov: totalImprov,
      equilibrium,
      benchToTitularDiff,
      benchEquilibrium
    });
  }

  results.sort((a, b) => {
    const eqA = a.equilibrium ?? 0;
    const eqB = b.equilibrium ?? 0;

    let tierA = 3;
    if (eqA < 10 && a.totalImprov === 0) tierA = 1;
    else if (eqA < 50) tierA = 2;

    let tierB = 3;
    if (eqB < 10 && b.totalImprov === 0) tierB = 1;
    else if (eqB < 50) tierB = 2;

    if (tierA !== tierB) return tierA - tierB;
    if (eqA !== eqB) return eqA - eqB;
    if (a.totalImprov !== b.totalImprov) return a.totalImprov - b.totalImprov;
    if (a.benchToTitularDiff !== b.benchToTitularDiff) return a.benchToTitularDiff - b.benchToTitularDiff;
    
    return a.scoreDeviation - b.scoreDeviation;
  });

  return results;
};