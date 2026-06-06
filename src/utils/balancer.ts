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
    // --- DIVISÃO E ORDENAÇÃO EXATA CONFORME SOLICITADO ---
    // Isolamos quem NÃO É goleiro e ordenamos randomicamente para a linha
    const linePool = pool.filter(p => !p.isGoalkeeper).sort(() => Math.random() - 0.5);
    // Isolamos os Goleiros oficiais do cadastro
    const gkPool = pool.filter(p => p.isGoalkeeper).sort(() => Math.random() - 0.5);

    // Unimos os dois blocos colocando a prioridade de linha na frente da fila
    let availablePlayers = [...linePool, ...gkPool];
    
    // Retira exatamente os primeiros necessários para preencher as linhas (6 * número de times)
    const activeLinePlayers = availablePlayers.splice(0, baseFieldPlayersNeeded);
    
    // O resto que sobrou vira nossa "Reserva de Goleiros / Banco"
    let dynamicGkReservoir = [...availablePlayers];

    // Calcula dinamicamente quantos times receberão goleiros baseando-se estritamente nas sobras físicas reais
    let teamsWithGoalkeeper: number[] = [];
    if (!neverScaleGoalkeepers && dynamicGkReservoir.length > 0) {
      const numGoalkeepersToAssign = Math.min(dynamicGkReservoir.length, numTeams);
      for (let i = 0; i < numGoalkeepersToAssign; i++) {
        teamsWithGoalkeeper.push(i);
      }
    }

    const getNoise = () => (Math.random() - 0.5) * 1.5;
    let isValid = true;
    
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
        needsGoalkeeper: teamsWithGoalkeeper.includes(i),
        bench: [] as Team['players']
      };
    });

    // Passo 1: Aloca goleiros apenas para os times que ganharam a vaga condicional por sobras
    for (let t = 0; t < numTeams; t++) {
      if (teamsData[t].needsGoalkeeper) {
        // Prioriza pegar um jogador do reservatório que tenha a flag "isGoalkeeper" ativa
        let gkIdx = dynamicGkReservoir.findIndex(p => p.isGoalkeeper);
        if (gkIdx === -1) gkIdx = 0; // Se não houver, improvisa com a sobra de linha disponível

        const player = dynamicGkReservoir.splice(gkIdx, 1)[0];
        const req = teamsData[t].reqs.find(r => r.id === 'Goleiro');
        
        if (player && req) {
          teamsData[t].reqs = teamsData[t].reqs.filter(r => r.id !== 'Goleiro');
          teamAddPlayer(teamsData[t], player, req, player.isGoalkeeper ? 0 : 1, true);
        }
      }
    }

    // Passo 2: Distribui Capitães entre os jogadores escalados para a linha
    const caps = activeLinePlayers.filter(p => p.isCaptain);
    for (let t = 0; t < numTeams; t++) {
      const hasCap = teamsData[t].players.some(tp => tp.player.isCaptain);
      if (!hasCap && caps.length > 0) {
        const capIdx = activeLinePlayers.findIndex(p => p.id === caps[0].id);
        const player = activeLinePlayers.splice(capIdx, 1)[0];
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

    // Passo 3: Atribui Exigências defensivas estruturais de Linha
    for (let t = 0; t < numTeams; t++) {
      const defReqs = teamsData[t].reqs.filter(r => r.id.includes('Defensor') || r.id.includes('Meia Defensivo'));
      for (const req of defReqs) {
        activeLinePlayers.sort((a, b) => (req.calcScore(b) + getNoise()) - (req.calcScore(a) + getNoise()));
        let selectedIdx = -1;
        for (let i = 0; i < activeLinePlayers.length; i++) {
          if (req.allowedOriginalPositions.includes(activeLinePlayers[i].position)) {
            selectedIdx = i;
            break;
          }
        }
        
        if (activeLinePlayers.length === 0) break;
        if (selectedIdx === -1) selectedIdx = 0; // Força fallback se faltar a posição nativa

        const player = activeLinePlayers.splice(selectedIdx, 1)[0];
        const rIdx = teamsData[t].reqs.findIndex(r => r.originalIndex === req.originalIndex);
        teamsData[t].reqs.splice(rIdx, 1);

        teamAddPlayer(teamsData[t], player, req, req.allowedOriginalPositions.includes(player.position) ? 0 : 1, false);
      }
    }

    // Passo 4: Preenche posições restantes do sistema tático de linha
    for (let t = 0; t < numTeams; t++) {
      while (teamsData[t].reqs.length > 0 && activeLinePlayers.length > 0) {
        const req = teamsData[t].reqs[0];
        activeLinePlayers.sort((a, b) => (req.calcScore(b) + getNoise()) - (req.calcScore(a) + getNoise()));
        let selectedIdx = -1;
        for (let i = 0; i < activeLinePlayers.length; i++) {
          if (req.allowedOriginalPositions.includes(activeLinePlayers[i].position)) {
            selectedIdx = i;
            break;
          }
        }
        
        if (selectedIdx === -1) selectedIdx = 0;

        const player = activeLinePlayers.splice(selectedIdx, 1)[0];
        teamsData[t].reqs.splice(0, 1);

        teamAddPlayer(teamsData[t], player, req, req.allowedOriginalPositions.includes(player.position) ? 0 : 1, false);
      }
    }

    // Passo 5: Jogadores restantes no reservatório dinâmico entram para o banco de reservas (Distribuídos igualmente)
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
      const role = player.position === 'ATACANTE' ? 'Atacante' : player.position === 'MEIA_OFENSIVO' ? 'Meia Ofensivo' : player.position === 'MEIA_DEFENSIVO' ? 'Meia Defensivo' : 'Defensor';
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

    results.push({
      id: crypto.randomUUID(),
      teams: teamsData.map(t => ({ id: t.id, name: t.name, overall: t.overall, players: t.players, tacticalSystem: t.tacticalSystem, bench: t.bench })),
      scoreDeviation: deviation,
      totalImprov: totalImprov
    });
  }

  // Ordena os resultados priorizando o menor nível de improvisação e o maior equilíbrio técnico entre equipes
  results.sort((a, b) => {
    if ((a as any).totalImprov !== (b as any).totalImprov) {
      return (a as any).totalImprov - (b as any).totalImprov;
    }
    return a.scoreDeviation - b.scoreDeviation;
  });

  return results.slice(0, 10);
};