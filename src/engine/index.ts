// Fachada pública do engine. Consumido pela camada `features/**`.
//
// `generateTeams` continua existindo internamente (usado por `balance.ts`
// como gerador de divisões candidatas) mas o que a UI deve chamar é
// `balanceTeams`/`balanceTeamsOptions` — o motor v2.
export * from './balance';
export * from './scoring';
export * from './formationModel';
export * from './playerModel';
export * from './rotation';
export * from './generateTeams';
export * from './feasibility';
export * from './hungarian';
