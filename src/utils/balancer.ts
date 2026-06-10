import type { Player, Team, SimulationResult, FormationType } from '../types';
import { getAvg, scoreGoalkeeper, getLineScoreByPosition, scoreMeia } from './balancer/scoring';
import { getCombinations, isImprovisationAllowed, getRoleLabels } from './balancer/helpers';
import { Formations } from './balancer/formations';

interface ExtendedSimulationResult extends SimulationResult {
  benchToTitularDiff: number;
  benchEquilibrium: number;
  defensiveEquilibrium: number;
}

export const generateTeams = (
  players: Player[],
  formationType: FormationType | FormationType[],
  numTeams: number,
  numSimulations: number = 2000,
  neverScaleGoalkeepers: boolean = false,
  maxSixLinePlayers: boolean = false
): SimulationResult[] => {
  const pool = players.filter(p => p.active);

  if (pool.length < numTeams * 6) return [];

  const results: ExtendedSimulationResult[] = [];
  const formationKeys: (keyof typeof Formations)[] = ['EQUILIBRADA', 'OFENSIVA', 'DEFENSIVA', 'CONTENCAO'];

  // Funções auxiliares para identificação de papéis táticos
  const isAttackRole = (reqId: string) => {
    const lower = reqId.toLowerCase();
    return lower.includes('atacante') || lower.includes('meia ofensivo') || (lower.includes('meia') && !lower.includes('defensivo') && !lower.includes('defensor') && !lower.includes('volante'));
  };

  const isDefenderRole = (reqId: string) => {
    const lower = reqId.toLowerCase();
    return lower.includes('defensor');
  };

  const isDefensiveMidRole = (reqId: string) => {
    const lower = reqId.toLowerCase();
    return lower.includes('volante') || lower.includes('meia defensivo');
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
    if ((lowerReq === 'meia' || lowerReq.includes('meia 1') || lowerReq.includes('meia 2') || lowerReq.includes('extra')) && 
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

  const selectBestPlayerIndex = (
    req: { id: string; allowedOriginalPositions: Player['position'][]; calcScore: (p: Player) => number; },
    sourcePool: Player[],
    noise: number
  ) => {
    let bestAllowedIdx = -1;
    let bestAllowedScore = -Infinity;
    let bestFallbackIdx = -1;
    let bestFallbackScore = -Infinity;

    for (let i = 0; i < sourcePool.length; i++) {
      const player = sourcePool[i];
      const score = req.calcScore(player) + noise;
      
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

  // MODIFICAÇÃO: Filtra estritamente quem possui a flag real de goleiro (ex: p.isGoalkeeper ou p.stats.isGoalkeeper)
  // Certifique-se de usar a propriedade boolean exata que representa a flag em seu cadastro.
  const nativeGks = pool.filter(p => p.isGoalkeeper); 
  
  // A meta de goleiros é o menor valor entre o total de goleiros reais disponíveis e o número de times
  let targetGkCount = !neverScaleGoalkeepers ? Math.min(nativeGks.length, numTeams) : 0;
  
  if (!neverScaleGoalkeepers && numTeams === 3) {
    if (pool.length === 20) {
      targetGkCount = Math.min(nativeGks.length, 2);
    } else if (pool.length === 19) {
      targetGkCount = Math.min(nativeGks.length, 1);
    }
  }

  // MODIFICAÇÃO: As combinações agora utilizam unicamente e exclusivamente os goleiros reais detectados
  let goalkeeperCombos: Player[][] = [];
  if (targetGkCount > 0) {
    goalkeeperCombos = getCombinations(nativeGks, targetGkCount);
  }

  for (let iter = 0; iter < numSimulations; iter++) {
    let workingPool = [...pool];

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

    if (goalkeeperCombos.length > 0) {
      const randomComboIndex = Math.floor(Math.random() * goalkeeperCombos.length);
      const chosenGkCombo = goalkeeperCombos[randomComboIndex];

      for (let t = 0; t < chosenGkCombo.length; t++) {
        const targetGk = chosenGkCombo[t];
        const poolIndex = workingPool.findIndex(p => p.id === targetGk.id);

        if (poolIndex !== -1) {
          const chosenGkPlayer = workingPool.splice(poolIndex, 1)[0];
          
          const gkReq = {
            id: 'Goleiro',
            allowedOriginalPositions: ['DEFENSOR', 'MEIA_DEFENSIVO', 'MEIA_OFENSIVO', 'ATACANTE'] as Player['position'][],
            calcScore: scoreGoalkeeper,
          };
          
          teamAddPlayer(teamsData[t], chosenGkPlayer, gkReq, 0, true, false);
        }
      }
    }

    workingPool.sort(() => Math.random() - 0.5);

    const assignPlayerToRole = (
      team: { players: Team['players']; reqs: Array<{ id: string; allowedOriginalPositions: Player['position'][]; calcScore: (p: Player) => number; originalIndex: number; }> },
      req: { id: string; allowedOriginalPositions: Player['position'][]; calcScore: (p: Player) => number; originalIndex: number; }
    ) => {
      if (workingPool.length === 0) return false;
      
      const playerIndexInPool = selectBestPlayerIndex(req, workingPool, getNoise());
      if (playerIndexInPool === -1) return false;
      
      const chosenPlayer = workingPool.splice(playerIndexInPool, 1)[0];
      team.reqs = team.reqs.filter((r) => r.originalIndex !== req.originalIndex);
      
      const isAllowedDirectly = req.allowedOriginalPositions.includes(chosenPlayer.position);
      teamAddPlayer(team, chosenPlayer, req, isAllowedDirectly ? 0 : 1, false);
      return true;
    };

    let validGeneration = true;

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

    const missingLinePlayers = teamsData.some(t => t.players.filter(p => p.assignedRole !== 'Goleiro').length < 6);
    if (missingLinePlayers) continue;

    // Distribuição igualitária de jogadores de linha extras (caso sobrem jogadores)
    if (!maxSixLinePlayers) {
      const remainingPlayersCount = workingPool.length;
      const extraPerTeam = Math.floor(remainingPlayersCount / numTeams);

      if (extraPerTeam > 0) {
        const extraMidReq = {
          id: 'Meia Extra',
          allowedOriginalPositions: ['MEIA_DEFENSIVO', 'MEIA_OFENSIVO'] as Player['position'][],
          calcScore: scoreMeia
        };

        for (let step = 0; step < extraPerTeam; step++) {
          for (let t = 0; t < numTeams; t++) {
            const currentTeam = teamsData[t];
            const bestIndex = selectBestPlayerIndex(extraMidReq, workingPool, getNoise());
            
            if (bestIndex !== -1) {
              const chosenExtraPlayer = workingPool.splice(bestIndex, 1)[0];
              const isAllowedDirectly = extraMidReq.allowedOriginalPositions.includes(chosenExtraPlayer.position);
              teamAddPlayer(currentTeam, chosenExtraPlayer, extraMidReq, isAllowedDirectly ? 0 : 1, false);
            }
          }
        }
      }
    }

    // O que restar vai uniformemente para o banco de reservas
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

    // Cálculo do Equilíbrio Defensivo (Média de overall de Defensores + Volantes)
    const defOveralls = teamsData.map(t => {
      const defPlayers = t.players.filter(p => isDefenderRole(p.assignedRole) || isDefensiveMidRole(p.assignedRole));
      const sumWeightedSkill = defPlayers.reduce((s, p) => {
        const weight = isDefensiveMidRole(p.assignedRole) ? 0.7 : 1.0;
        return s + (p.roleScore * weight);
      }, 0);
      const avgSkill = defPlayers.length ? sumWeightedSkill / defPlayers.length : 0;
      let score = (avgSkill / 6) * 100;

      // Aplica pesos baseados no sistema tático para normalizar a expectativa defensiva
      if (t.tacticalSystem === 'OFENSIVA') score *= 0.8;
      else if (t.tacticalSystem === 'EQUILIBRADA') score *= 0.9;

      return score;
    });
    let defensiveEquilibrium = 0;
    for (let i = 0; i < defOveralls.length; i++) {
      for (let j = i + 1; j < defOveralls.length; j++) {
        defensiveEquilibrium += Math.pow(defOveralls[i] - defOveralls[j], 2);
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
      benchEquilibrium,
      defensiveEquilibrium
    });
  }

  results.sort((a, b) => {
    const eqA = a.equilibrium ?? 0;
    const eqB = b.equilibrium ?? 0;

    // Novo Critério: Se o equilíbrio geral estiver dentro de um limite aceitável (<= 100),
    // priorizamos as simulações com o melhor equilíbrio defensivo (menor diferença entre zagueiros/volantes).
    const isUnderThresholdA = eqA <= 100;
    const isUnderThresholdB = eqB <= 100;

    if (isUnderThresholdA && isUnderThresholdB) {
      if (a.defensiveEquilibrium !== b.defensiveEquilibrium) {
        return a.defensiveEquilibrium - b.defensiveEquilibrium;
      }
    } else if (isUnderThresholdA) {
      return -1;
    } else if (isUnderThresholdB) {
      return 1;
    }

    let tierA = 3;
    if (eqA < 10 && a.totalImprov === 0) tierA = 1;
    if (eqA < 50) tierA = 2;

    let tierB = 3;
    if (eqB < 10 && b.totalImprov === 0) tierB = 1;
    if (eqB < 50) tierB = 2;

    if (tierA !== tierB) return tierA - tierB;
    if (eqA !== eqB) return eqA - eqB;
    if (a.totalImprov !== b.totalImprov) return a.totalImprov - b.totalImprov;
    if (a.benchToTitularDiff !== b.benchToTitularDiff) return a.benchToTitularDiff - b.benchToTitularDiff;
    
    return a.scoreDeviation - b.scoreDeviation;
  });

  return results;
};