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

const scoreGoalkeeper = (p: Player) => {
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
  
  // Mínimo absoluto de jogadores ativos necessários para as linhas (6 por time)
  const baseFieldPlayersNeeded = numTeams * 6;
  if (pool.length < baseFieldPlayersNeeded) return [];

  const results: SimulationResult[] = [];
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
    if (lower.includes('meia')) {
      return { roleShort: 'MEI', roleLabel: `Meia${improvised ? ' (improvisado)' : ''}` };
    }
    if (lower.includes('atacante')) {
      const impro = improvised || player.position !== 'ATACANTE';
      return { roleShort: 'ATA', roleLabel: `Atacante${impro ? ' (improvisado)' : ''}` };
    }

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
    const finalRoleScore = isGoalkeeperRole 
      ? getAvg([scoreGoalkeeper(player), getLineScoreByPosition(player, req.id)])
      : getLineScoreByPosition(player, req.id);

    team.players.push({
      player,
      assignedRole: req.id,
      roleScore: finalRoleScore,
      improvisationPenalty,
      ...labels
    });
  };

  for (let iter = 0; iter < numSimulations; iter++) {
    const linePool = pool.filter(p => !p.isGoalkeeper).sort(() => Math.random() - 0.5);
    const gkPool = pool.filter(p => p.isGoalkeeper).sort(() => Math.random() - 0.5);

    const availablePlayers = [...linePool, ...gkPool];
    const activeLinePlayers = availablePlayers.splice(0, baseFieldPlayersNeeded);
    let dynamicGkReservoir = [...availablePlayers];

    const teamsWithGoalkeeper: number[] = [];
    if (!neverScaleGoalkeepers && dynamicGkReservoir.length > 0) {
      const numGoalkeepersToAssign = Math.min(dynamicGkReservoir.length, numTeams);
      for (let i = 0; i < numGoalkeepersToAssign; i++) {
        teamsWithGoalkeeper.push(i);
      }
    }

    const getNoise = () => (Math.random() - 0.5) * 1.5;
    const getTeamCurrentScore = (team: { players: Team['players'] }) =>
      team.players.reduce((sum, tp) => sum + tp.roleScore, 0);

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
        } else if (score > bestFallbackScore) {
          bestFallbackScore = score;
          bestFallbackIdx = i;
        }
      }

      return bestAllowedIdx !== -1 ? bestAllowedIdx : bestFallbackIdx;
    };

    const assignPlayerToRole = (
      team: { players: Team['players']; reqs: Array<{ id: string; allowedOriginalPositions: Player['position'][]; calcScore: (p: Player) => number; originalIndex: number; }> },
      req: { id: string; allowedOriginalPositions: Player['position'][]; calcScore: (p: Player) => number; originalIndex: number; }
    ) => {
      if (activeLinePlayers.length === 0) return;
      const playerIndex = selectBestPlayerIndex(req, activeLinePlayers);
      if (playerIndex === -1) return;
      const player = activeLinePlayers.splice(playerIndex, 1)[0];
      team.reqs = team.reqs.filter((r) => r.originalIndex !== req.originalIndex);
      teamAddPlayer(team, player, req, req.allowedOriginalPositions.includes(player.position) ? 0 : 1, false);
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

    const assignRolesByPredicate = (predicate: (id: string) => boolean) => {
      const pending = teamsData
        .flatMap((team) => team.reqs.filter((req) => predicate(req.id)).map((req) => ({ team, req })));
      pending.sort((a, b) => getTeamCurrentScore(a.team) - getTeamCurrentScore(b.team));
      for (const { team, req } of pending) {
        assignPlayerToRole(team, req);
      }
    };

    const teamsData = Array.from({ length: numTeams }, (_, i) => {
      const teamFormation = Array.isArray(formationType) ? (formationType[i] ?? 'QUALQUER') : formationType;
      const fKey = teamFormation === 'QUALQUER'
        ? formationKeys[Math.floor(Math.random() * formationKeys.length)]
        : teamFormation as keyof typeof Formations;

      const reqs = [...Formations[fKey]].map((r, idx) => ({ ...r, originalIndex: idx }));

      return {
        id: i + 1,
        name: `Time ${i + 1}`,
        tacticalSystem: fKey,
        overall: 0,
        players: [] as Team['players'],
        reqs,
        needsGoalkeeper: teamsWithGoalkeeper.includes(i),
        bench: [] as Team['players']
      };
    });

    // Passo 1: Escala os atacantes e meias ofensivos primeiro, equilibrando pelas equipes mais fracas.
    assignRolesByPredicate(isAttackRole);

    // Passo 2: Escala ao menos um defensor por equipe, priorizando os melhores zagueiros por time.
    const defenderTeams = teamsData
      .filter((team) => team.reqs.some((req) => isDefenderRole(req.id)))
      .sort((a, b) => getTeamCurrentScore(a) - getTeamCurrentScore(b));
    for (const team of defenderTeams) {
      const defenderReq = team.reqs.find((req) => isDefenderRole(req.id));
      if (defenderReq) assignPlayerToRole(team, defenderReq);
    }

    // Passo 3: Escala os volantes e meias defensivos para equilibrar a proteção do meio-campo.
    assignRolesByPredicate(isDefensiveMidRole);

    // Passo 4: Preenche as posições restantes de linha.
    assignRolesByPredicate((id) => !isAttackRole(id) && !isDefenderRole(id) && !isDefensiveMidRole(id));

    // Passo 5: Caso a equipe ainda precise de um goleiro mínimo, aproveita o reservatório disponível.
    for (let t = 0; t < numTeams; t++) {
      if (!teamsData[t].needsGoalkeeper) continue;
      if (dynamicGkReservoir.length === 0) break;
      let gkIdx = dynamicGkReservoir.findIndex(p => p.isGoalkeeper);
      if (gkIdx === -1) gkIdx = 0;
      const player = dynamicGkReservoir.splice(gkIdx, 1)[0];
      const req = {
        id: 'Goleiro',
        allowedOriginalPositions: ['DEFENSOR', 'MEIA_DEFENSIVO', 'MEIA_OFENSIVO', 'ATACANTE'] as Player['position'][],
        calcScore: scoreGoalkeeper,
      };
      teamAddPlayer(teamsData[t], player, req, player.isGoalkeeper ? 0 : 1, true);
    }

    // Passo 6: Jogadores restantes entram no banco de reservas.
    let currentTeamBenchIdx = 0;
    while (dynamicGkReservoir.length > 0) {
      const targetTeam = teamsData[currentTeamBenchIdx % numTeams];
      let minImpactIdx = 0;
      let minImpactScore = 999;
      for (let i = 0; i < dynamicGkReservoir.length; i++) {
        const player = dynamicGkReservoir[i];
        const playerScore = getLineScoreByPosition(player);
        if (playerScore < minImpactScore) {
          minImpactScore = playerScore;
          minImpactIdx = i;
        }
      }

      const player = dynamicGkReservoir.splice(minImpactIdx, 1)[0];
      const role = player.position === 'ATACANTE'
        ? 'Atacante'
        : player.position === 'MEIA_OFENSIVO'
          ? 'Meia Ofensivo'
          : player.position === 'MEIA_DEFENSIVO'
            ? 'Meia Defensivo'
            : 'Defensor';
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

    // Passo 6: Cálculo de médias finais e pontuação de equilíbrio (Overall)
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

    // Compute equilibrium metric: sum of squared differences for all pairwise team overalls
    let equilibrium = 0;
    for (let i = 0; i < overalls.length; i++) {
      for (let j = i + 1; j < overalls.length; j++) {
        const diff = overalls[i] - overalls[j];
        equilibrium += diff * diff;
      }
    }

    results.push({
      id: crypto.randomUUID(),
      teams: teamsData.map(t => ({ id: t.id, name: t.name, overall: t.overall, players: t.players, tacticalSystem: t.tacticalSystem, bench: t.bench })),
      scoreDeviation: deviation,
      totalImprov: totalImprov,
      equilibrium
    });
  }

  const isAllQualquer = Array.isArray(formationType) && formationType.length === numTeams && formationType.every(f => f === 'QUALQUER');
  let finalResults = results;

  if (isAllQualquer) {
    const fixedFormations: FormationType[] = ['EQUILIBRADA', 'OFENSIVA', 'DEFENSIVA'];
    const fixedResults = fixedFormations
      .map((fixed) => {
        const fixedFormationArray = Array(numTeams).fill(fixed) as FormationType[];
        const fixedSimulations = generateTeams(players, fixedFormationArray, numTeams, Math.max(300, Math.floor(numSimulations / 3)), neverScaleGoalkeepers);
        return fixedSimulations.length > 0 ? fixedSimulations[0] : null;
      })
      .filter((item): item is SimulationResult => item !== null);

    finalResults = [...results, ...fixedResults];
  }

  finalResults.sort((a, b) => {
    const ae = (a as any).equilibrium ?? 0;
    const be = (b as any).equilibrium ?? 0;
    if (ae !== be) return ae - be;
    if (a.totalImprov !== b.totalImprov) return a.totalImprov - b.totalImprov;
    return a.scoreDeviation - b.scoreDeviation;
  });

  return finalResults;
};