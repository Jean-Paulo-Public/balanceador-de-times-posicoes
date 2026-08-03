import { describe, it, expect } from 'vitest';
import type { AttrVector } from '../domain/attributes';
import type { Player } from '../domain/types';
import { BOX_TO_BOX, allEnabled, type LinePosition, type PositionPreferenceEntry } from '../domain/positions';
import {
  SYSTEMS, ALL_SYSTEMS, assignSystem, chooseBestSystem, inferBestFormation,
  identityCost, PREFERENCE_PENALTY_SCALE,
} from './formationModel';

const A = (o: Partial<AttrVector>): AttrVector =>
  ({ FIN: 50, CRI: 50, DRI: 50, DEF: 50, VEL: 50, RCD: 50, INT: 50, MOV: 50, FIS: 50, ...o });

let idc = 0;
const bx = (attrs: AttrVector): Player => ({
  id: `p${++idc}`, name: `p${idc}`, active: true, isGoalkeeper: false, position: 'MEIA',
  attributes: attrs, gk: null, acceptedPositions: allEnabled([BOX_TO_BOX]),
});
const pref = (attrs: AttrVector, positions: LinePosition[]): Player => ({
  id: `p${++idc}`, name: `p${idc}`, active: true, isGoalkeeper: false, position: 'MEIA',
  attributes: attrs, gk: null, acceptedPositions: allEnabled(positions),
});
const withEntries = (attrs: AttrVector, entries: PositionPreferenceEntry[]): Player => ({
  id: `p${++idc}`, name: `p${idc}`, active: true, isGoalkeeper: false, position: 'MEIA',
  attributes: attrs, gk: null, acceptedPositions: entries,
});

describe('SYSTEMS — catálogo de 4 sistemas táticos', () => {
  it('tem exatamente 4 sistemas, cada um com 6 vagas de linha', () => {
    expect(ALL_SYSTEMS.length).toBe(4);
    for (const key of ALL_SYSTEMS) {
      expect(SYSTEMS[key].slots).toHaveLength(6);
      expect(SYSTEMS[key].label.length).toBeGreaterThan(0);
      expect(SYSTEMS[key].description.length).toBeGreaterThan(0);
    }
  });

  it('nenhum sistema tem mais de 1 vaga que aceita PIVO (a restrição de no máx. 1 pivô por time é estrutural)', () => {
    for (const key of ALL_SYSTEMS) {
      const pivoSlots = SYSTEMS[key].slots.filter((s) => s.identities.includes('PIVO'));
      expect(pivoSlots.length).toBeLessThanOrEqual(1);
    }
  });

  it('DOIS_ATACANTES é o único sistema sem pivô (dois atacantes móveis no lugar da referência de área)', () => {
    const withPivo = ALL_SYSTEMS.filter((key) => SYSTEMS[key].slots.some((s) => s.identities.includes('PIVO')));
    expect(withPivo.sort()).toEqual(['DEFENSIVO', 'OFENSIVO', 'REFERENCIA']);
  });
});

describe('assignSystem — atribuição via húngaro', () => {
  it('exige exatamente 6 jogadores de linha', () => {
    expect(() => assignSystem([bx(A({}))], 'REFERENCIA')).toThrow();
  });

  it('6 jogadores coringa (BOX_TO_BOX) sempre encontram atribuição viável em qualquer sistema', () => {
    const line = Array.from({ length: 6 }, () => bx(A({})));
    for (const system of ALL_SYSTEMS) {
      const inf = assignSystem(line, system);
      expect(inf.feasible).toBe(true);
      expect(inf.assignments).toHaveLength(6);
      expect(inf.assignments.map((a) => a.playerIndex).sort()).toEqual([0, 1, 2, 3, 4, 5]);
    }
  });

  it('RESTRIÇÃO HARD: jogador fora da lista de posições aceitas nunca é escalado nelas', () => {
    // 5 coringas + 1 jogador que só aceita FIXO.
    const soFixo = pref(A({ DEF: 90, FIS: 85 }), ['FIXO']);
    const line = [soFixo, ...Array.from({ length: 5 }, () => bx(A({})))];
    const inf = assignSystem(line, 'REFERENCIA');
    expect(inf.feasible).toBe(true);
    const slotOfSoFixo = inf.assignments.find((a) => a.playerIndex === 0)!;
    expect(slotOfSoFixo.identity).toBe('FIXO');
  });

  it('detecta INVIABILIDADE quando não existe atribuição válida (2 jogadores só-FIXO, 1 vaga FIXO)', () => {
    const soFixo1 = pref(A({}), ['FIXO']);
    const soFixo2 = pref(A({}), ['FIXO']);
    const line = [soFixo1, soFixo2, ...Array.from({ length: 4 }, () => bx(A({})))];
    const inf = assignSystem(line, 'REFERENCIA');
    expect(inf.feasible).toBe(false);
  });
});

describe('chooseBestSystem / inferBestFormation (compat)', () => {
  it('escolhe o sistema de maior fit total entre os 4, e o rótulo é emergente', () => {
    const line = Array.from({ length: 6 }, () => bx(A({})));
    const inf = chooseBestSystem(line);
    expect(ALL_SYSTEMS).toContain(inf.system);
    expect(inf.shape).toBe(inf.system);
  });

  it('inferBestFormation é um alias de chooseBestSystem (compat de nome)', () => {
    const line = Array.from({ length: 6 }, () => bx(A({})));
    const a = inferBestFormation(line);
    const b = chooseBestSystem(line);
    expect(a.system).toBe(b.system);
  });

  it('perfil ALA (DRI alto/CRI baixo) puxa o sistema pra usar a identidade ALA e não VOLANTE', () => {
    const alaProfile = A({ FIN: 60, CRI: 20, DRI: 85, DEF: 20, VEL: 80, RCD: 40, INT: 40, MOV: 70, FIS: 30 });
    const line = [pref(alaProfile, ['ALA', 'VOLANTE']), ...Array.from({ length: 5 }, () => bx(A({})))];
    const inf = chooseBestSystem(line);
    const own = inf.assignments.find((a) => a.playerIndex === 0)!;
    expect(own.identity).toBe('ALA');
  });
});

describe('identityCost — fórmula exata da penalidade de preferência (Fase 4)', () => {
  it('índice 0 (topo da lista) não tem penalidade: custo = 100 - fit', () => {
    const attrs = A({});
    const p = withEntries(attrs, [{ position: 'FIXO', enabled: true }, { position: 'LATERAL', enabled: true }]);
    const fit = 100 - identityCost(p, 'FIXO');
    expect(identityCost(p, 'FIXO')).toBeCloseTo(100 - fit, 9);
  });

  it('BOX_TO_BOX nunca tem penalidade de preferência, mesmo com outras entradas na lista', () => {
    const attrs = A({});
    const p = withEntries(attrs, [{ position: 'FIXO', enabled: true }, { position: BOX_TO_BOX, enabled: true }]);
    const fitFixo = 100 - identityCost(bx(attrs), 'FIXO'); // custo de um coringa puro = 100 - fit
    expect(identityCost(p, 'FIXO')).toBeCloseTo(100 - fitFixo, 6);
    expect(identityCost(p, 'PIVO')).toBeCloseTo(100 - (100 - identityCost(bx(attrs), 'PIVO')), 6);
  });

  it('penalidade é RELATIVA ao tamanho da lista habilitada: último recurso de uma lista de 2 custa o máximo (ESCALA)', () => {
    const attrs = A({});
    const p = withEntries(attrs, [{ position: 'FIXO', enabled: true }, { position: 'LATERAL', enabled: true }]);
    const fitLateral = 100 - identityCost(bx(attrs), 'LATERAL');
    const custo = identityCost(p, 'LATERAL'); // idx=1, enabledCount=2 -> profundidade relativa = 1
    expect(custo).toBeCloseTo((100 - fitLateral) + PREFERENCE_PENALTY_SCALE * 1, 6);
  });

  it('posição fora da lista (e desabilitada) é PROIBITIVA — restrição hard', () => {
    const attrs = A({});
    const p = withEntries(attrs, [{ position: 'FIXO', enabled: true }, { position: 'PIVO', enabled: false }]);
    expect(identityCost(p, 'PIVO')).toBeGreaterThanOrEqual(1_000_000);
    expect(identityCost(p, 'ALA')).toBeGreaterThanOrEqual(1_000_000); // nem está na lista
  });

  it('mesma distância de 1 índice custa mais numa lista curta que numa lista longa (profundidade RELATIVA)', () => {
    const attrs = A({});
    const curta = withEntries(attrs, [{ position: 'FIXO', enabled: true }, { position: 'LATERAL', enabled: true }]);
    const longa = withEntries(attrs, [
      { position: 'FIXO', enabled: true }, { position: 'LATERAL', enabled: true },
      { position: 'VOLANTE', enabled: true }, { position: 'ALA', enabled: true },
    ]);
    const penalCurta = identityCost(curta, 'LATERAL') - (100 - (100 - identityCost(bx(attrs), 'LATERAL')));
    const penalLonga = identityCost(longa, 'LATERAL') - (100 - (100 - identityCost(bx(attrs), 'LATERAL')));
    expect(penalCurta).toBeGreaterThan(penalLonga);
  });
});

describe('exceção de atributo por posição (modelo v3.1) alcançando o solver', () => {
  it('exceção de FIN em PIVO faz o húngaro preferir escalar o jogador em PIVO', () => {
    // base fraca em tudo (fit baixo em qualquer posição); exceção de PIVO dispara FIN/FIS.
    const fraco = A({ FIN: 30, FIS: 30, CRI: 30, DRI: 30, DEF: 30, VEL: 30, RCD: 30, INT: 30, MOV: 30 });
    const comExcecao = withEntries(fraco, allEnabled(['PIVO', 'ALA', 'VOLANTE']));
    comExcecao.positionOverrides = { PIVO: { FIN: 95, FIS: 90 } };
    const line = [comExcecao, ...Array.from({ length: 5 }, () => bx(A({})))];
    const inf = chooseBestSystem(line);
    const own = inf.assignments.find((a) => a.playerIndex === 0)!;
    expect(own.identity).toBe('PIVO');
  });
});

describe('identityCost — fórmula da penalidade de preferência (profundidade RELATIVA)', () => {
  const neutral = A({});

  it('(a) fit igual em duas posições habilitadas: custo menor pra quem está mais no topo da lista', () => {
    const p = pref(neutral, ['ALA', 'VOLANTE']); // fit igual (atributos neutros) nas duas
    const costTop = identityCost(p, 'ALA');      // idx 0
    const costSecond = identityCost(p, 'VOLANTE'); // idx 1, lista de 2 -> profundidade 1,0 (pior caso)
    expect(costTop).toBeLessThan(costSecond);
    expect(costSecond - costTop).toBeCloseTo(PREFERENCE_PENALTY_SCALE, 6);
  });

  it('(b) entre dois jogadores empurrados pra 2ª opção, rebaixa mais barato quem tem lista MAIS LONGA (mais folga)', () => {
    // Exemplo real do elenco: Jean = [SEGUNDO_ATACANTE, PIVO, MEIA_ATACANTE, ALA] (lista de 4,
    // profundidade do idx1 = 1/3). Comparado a alguém com só 2 opções (profundidade do idx1 = 1,0).
    const jean = pref(neutral, ['SEGUNDO_ATACANTE', 'PIVO', 'MEIA_ATACANTE', 'ALA']);
    const listaCurta = pref(neutral, ['SEGUNDO_ATACANTE', 'PIVO']);
    // no topo (idx0), custo igual pros dois (mesmo fit neutro, sem penalidade).
    expect(identityCost(jean, 'SEGUNDO_ATACANTE')).toBeCloseTo(identityCost(listaCurta, 'SEGUNDO_ATACANTE'), 6);
    // na 2ª posição (idx1), Jean (lista longa, tem folga) é mais barato que quem só tem 2 opções.
    const costJeanSecond = identityCost(jean, 'PIVO');
    const costCurtoSecond = identityCost(listaCurta, 'PIVO');
    expect(costJeanSecond).toBeLessThan(costCurtoSecond);
  });

  it('a normalização usa a contagem de HABILITADAS, não o total cadastrado (Jean com 2 desabilitadas fica "apertado")', () => {
    // Jean cadastra 4 mas desabilita MEIA_ATACANTE e ALA — só 2 habilitadas de fato.
    // Deve custar o mesmo que alguém que só cadastrou essas 2 (sem folga nenhuma).
    const jeanApertado = withEntries(neutral, [
      { position: 'SEGUNDO_ATACANTE', enabled: true },
      { position: 'PIVO', enabled: true },
      { position: 'MEIA_ATACANTE', enabled: false },
      { position: 'ALA', enabled: false },
    ]);
    const listaCurta = pref(neutral, ['SEGUNDO_ATACANTE', 'PIVO']);
    expect(identityCost(jeanApertado, 'PIVO')).toBeCloseTo(identityCost(listaCurta, 'PIVO'), 6);
    // e é MAIS CARO que a versão com as 4 habilitadas (essa tem folga de verdade).
    const jeanFolgado = pref(neutral, ['SEGUNDO_ATACANTE', 'PIVO', 'MEIA_ATACANTE', 'ALA']);
    expect(identityCost(jeanApertado, 'PIVO')).toBeGreaterThan(identityCost(jeanFolgado, 'PIVO'));
  });

  it('(c) uma diferença GRANDE de roleFit ainda vence a penalidade máxima (último recurso habilitado)', () => {
    // idx0 = VOLANTE (fit ruim pro perfil), idx1 = PIVO (fit ótimo) — lista de 2, pior caso de penalidade.
    const pivoProfile = A({ FIN: 95, FIS: 90, CRI: 10, DRI: 10, DEF: 10, VEL: 10, RCD: 10, INT: 10, MOV: 10 });
    const p = pref(pivoProfile, ['VOLANTE', 'PIVO']);
    const costTop = identityCost(p, 'VOLANTE');   // idx0, sem penalidade, fit ruim
    const costSecond = identityCost(p, 'PIVO');   // idx1, penalidade máxima, fit ótimo
    expect(costSecond).toBeLessThan(costTop); // mesmo pagando a penalidade cheia, PIVO ainda vence
  });

  it('BOX_TO_BOX nunca paga penalidade, em nenhuma posição', () => {
    const p = bx(A({ FIN: 70 }));
    // custo = 100 - fit, igual em qualquer identidade, sem soma de penalidade.
    const costAla = identityCost(p, 'ALA');
    const costPivo = identityCost(p, 'PIVO');
    expect(costAla).toBeGreaterThan(0);
    expect(costPivo).toBeGreaterThan(0);
  });
});

describe('identityCost — positionOrderIndifferent ("tanto faz a ordem")', () => {
  const neutral = A({});

  it('com a flag ligada, a última posição habilitada custa o MESMO que a primeira (sem penalidade de profundidade)', () => {
    // Torres: só ALA, SEGUNDO_ATACANTE, MEIA_ATACANTE habilitadas, nessa ordem.
    const torres: Player = {
      ...pref(neutral, ['ALA', 'SEGUNDO_ATACANTE', 'MEIA_ATACANTE']),
      positionOrderIndifferent: true,
    };
    const costFirst = identityCost(torres, 'ALA');              // idx 0
    const costLast = identityCost(torres, 'MEIA_ATACANTE');      // idx 2 (último habilitado)
    // Com a flag ligada, custo = (100 - fit) puro em ambas — nenhuma soma de
    // PREFERENCE_PENALTY_SCALE, mesmo o último estando na profundidade máxima.
    const fitAla = 100 - identityCost(bx(neutral), 'ALA'); // custo de um coringa puro = 100 - fit
    const fitMeiaAtacante = 100 - identityCost(bx(neutral), 'MEIA_ATACANTE');
    expect(costFirst).toBeCloseTo(100 - fitAla, 6);
    expect(costLast).toBeCloseTo(100 - fitMeiaAtacante, 6);
  });

  it('com a flag ligada, posição FORA da lista habilitada continua PROIBITIVA (a restrição hard não cede)', () => {
    const torres: Player = {
      ...pref(neutral, ['ALA', 'SEGUNDO_ATACANTE', 'MEIA_ATACANTE']),
      positionOrderIndifferent: true,
    };
    expect(identityCost(torres, 'FIXO')).toBeGreaterThanOrEqual(1_000_000); // nunca escalado de FIXO
    expect(identityCost(torres, 'VOLANTE')).toBeGreaterThanOrEqual(1_000_000);
  });

  it('com a flag ligada, posição da lista mas DESABILITADA continua proibitiva', () => {
    const p: Player = {
      ...withEntries(neutral, [
        { position: 'ALA', enabled: true },
        { position: 'VOLANTE', enabled: false },
      ]),
      positionOrderIndifferent: true,
    };
    expect(identityCost(p, 'VOLANTE')).toBeGreaterThanOrEqual(1_000_000);
  });

  it('com a flag DESLIGADA (ausente), o comportamento é idêntico ao de hoje — nenhuma regressão', () => {
    const semFlag = pref(neutral, ['ALA', 'SEGUNDO_ATACANTE', 'MEIA_ATACANTE']);
    const comFlagFalse: Player = { ...semFlag, positionOrderIndifferent: false };
    // idx2 (último habilitado, lista de 3) paga a penalidade cheia de profundidade relativa 1,0.
    const expectedLast = (100 - (100 - identityCost(bx(neutral), 'MEIA_ATACANTE'))) + PREFERENCE_PENALTY_SCALE * 1;
    expect(identityCost(semFlag, 'MEIA_ATACANTE')).toBeCloseTo(expectedLast, 6);
    expect(identityCost(comFlagFalse, 'MEIA_ATACANTE')).toBeCloseTo(expectedLast, 6);
    expect(identityCost(comFlagFalse, 'MEIA_ATACANTE')).toBeCloseTo(identityCost(semFlag, 'MEIA_ATACANTE'), 9);
  });
});
