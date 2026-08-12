import { describe, it, expect } from 'vitest';
import {
  normalizePlayer, normalizePlayers, parseAttrVector, parseAcceptedPositions, parsePositionOrderIndifferent,
  parseVeteran, parseGoodMarker, parseExcludedTeammateIds,
} from './migration';
import { emptyAttrs } from '../domain/attributes';

const VALID_ATTRS = { FIN: 70, CRI: 60, DRI: 55, DEF: 40, VEL: 65, RCD: 50, INT: 48, MOV: 45, FIS: 58, OFE: 50 };
/**
 * `acceptedPositions` é OBRIGATÓRIO: sem lista válida o registro é descartado
 * (não existe mais default de coringa). Todo jogador-exemplo válido precisa dela.
 */
const VALID_POS = [{ position: 'PIVO', enabled: true }];

describe('normalizePlayer — shape atual (v9, escala ÚNICA 0–100, sem estrela)', () => {
  it('jogador válido (attributes + gk) passa intacto, com defaults sensatos pros campos cosméticos', () => {
    const p = normalizePlayer({
      id: 'x', name: 'Fulano', active: false, isGoalkeeper: true,
      position: 'ATACANTE', attributes: VALID_ATTRS, gk: 88, acceptedPositions: VALID_POS,
    });
    expect(p).not.toBeNull();
    expect(p!.id).toBe('x');
    expect(p!.name).toBe('Fulano');
    expect(p!.active).toBe(false);
    expect(p!.isGoalkeeper).toBe(true);
    expect(p!.position).toBe('ATACANTE');
    expect(p!.attributes).toEqual(VALID_ATTRS);
    expect(p!.gk).toBe(88);
    // não existe mais campo de estrela no shape do Player.
    expect((p as unknown as Record<string, unknown>).rating).toBeUndefined();
  });

  it('jogador v2 (com attributes válidos) preserva os atributos intactos, sem re-derivar', () => {
    const attrs = { FIN: 70, CRI: 60, DRI: 55, DEF: 40, VEL: 65, RCD: 50, INT: 48, MOV: 45, FIS: 58, OFE: 50 };
    const p = normalizePlayer({
      id: 'y', name: 'Ciclano', position: 'MEIA', isGoalkeeper: true,
      attributes: attrs, gk: 77, acceptedPositions: VALID_POS,
    });
    expect(p!.attributes).toEqual(attrs);
    expect(p!.gk).toBe(77);
  });

  it('não-goleiro com gk explicitamente null preserva o null', () => {
    const attrs = { FIN: 50, CRI: 50, DRI: 50, DEF: 50, VEL: 50, RCD: 50, INT: 50, MOV: 50, FIS: 50, OFE: 50 };
    const p = normalizePlayer({ name: 'Sem Gol', attributes: attrs, gk: null, isGoalkeeper: false, acceptedPositions: VALID_POS });
    expect(p!.gk).toBeNull();
  });

  it('aplica defaults pros campos cosméticos quando faltam (meia, ativo, sem goleiro)', () => {
    const p = normalizePlayer({ name: 'Sem Nada', attributes: VALID_ATTRS, gk: null, acceptedPositions: VALID_POS });
    expect(p).not.toBeNull();
    expect(p!.active).toBe(true);
    expect(p!.isGoalkeeper).toBe(false);
    expect(p!.position).toBe('MEIA');
    expect(typeof p!.id).toBe('string');
  });

  it('posição inválida vira MEIA (não invalida o registro)', () => {
    const p = normalizePlayer({ position: 'ZAGUEIRO' as unknown as string, attributes: VALID_ATTRS, gk: null, acceptedPositions: VALID_POS });
    expect(p!.position).toBe('MEIA');
  });

  it('normalizePlayers converte a lista e ignora entrada não-array', () => {
    expect(normalizePlayers([
      { name: 'A', attributes: VALID_ATTRS, gk: null, acceptedPositions: VALID_POS },
      { name: 'B', attributes: VALID_ATTRS, gk: 90, acceptedPositions: VALID_POS },
    ])).toHaveLength(2);
    expect(normalizePlayers(null)).toEqual([]);
  });
});

describe('normalizePlayer — DESCARTE (não conserto) de registro malformado', () => {
  it('sem `attributes` válidos (vetor 0–100 completo), o registro inteiro é DESCARTADO — não deriva de nada', () => {
    expect(normalizePlayer({ id: 'x', name: 'Sem Atributos', gk: null })).toBeNull();
  });

  it('`attributes` parcial (falta 1 das 10 chaves) descarta o registro inteiro', () => {
    const partial = { FIN: 70, CRI: 60, DRI: 55, DEF: 40, VEL: 65, RCD: 50, INT: 44, MOV: 45, OFE: 50 }; // falta FIS
    expect(normalizePlayer({ name: 'Parcial', attributes: partial, gk: null })).toBeNull();
  });

  it('`attributes` no formato ANTIGO (REC em vez de RCD/INT — a escala de estrela/v7) é descartado', () => {
    const legacyAttrs = { FIN: 70, CRI: 60, DRI: 55, DEF: 40, VEL: 65, REC: 50, MOV: 45, FIS: 58 };
    expect(normalizePlayer({ name: 'Formato Antigo', attributes: legacyAttrs, gk: null })).toBeNull();
  });

  it('`attributes` com tipo errado (não-objeto) descarta o registro', () => {
    expect(normalizePlayer({ name: 'X', attributes: 'nope', gk: null })).toBeNull();
  });

  it('`gk` ausente/tipo errado descarta o registro (mesmo com attributes válidos)', () => {
    expect(normalizePlayer({ name: 'SemGk', attributes: VALID_ATTRS })).toBeNull();
    expect(normalizePlayer({ name: 'GkErrado', attributes: VALID_ATTRS, gk: 'alto' })).toBeNull();
  });

  it('`gk` null é ACEITO (não é "ausente" — é o estado válido de "não joga no gol")', () => {
    expect(normalizePlayer({ name: 'ComGkNull', attributes: VALID_ATTRS, gk: null, acceptedPositions: VALID_POS })).not.toBeNull();
  });

  it('clampeia valores de attributes fora de 0–100 quando o vetor é válido (10 chaves)', () => {
    const attrs = { FIN: 500, CRI: -30, DRI: 55, DEF: 40, VEL: 65, RCD: 50, INT: 44, MOV: 45, FIS: 58, OFE: 50 };
    const p = normalizePlayer({ name: 'Clamp', attributes: attrs, gk: null, acceptedPositions: VALID_POS });
    expect(p!.attributes.FIN).toBe(100);
    expect(p!.attributes.CRI).toBe(0);
  });

  it('gk fora de 0–100 é clampeado (não descartado)', () => {
    const p = normalizePlayer({ name: 'GkAlto', attributes: VALID_ATTRS, gk: 150, acceptedPositions: VALID_POS });
    expect(p!.gk).toBe(100);
  });

  it('normalizePlayers filtra (não quebra) quando a lista mistura registros válidos e malformados', () => {
    const result = normalizePlayers([
      { name: 'Valido', attributes: VALID_ATTRS, gk: null, acceptedPositions: VALID_POS },
      { name: 'SemAtributos' },
      { name: 'GkInvalido', attributes: VALID_ATTRS, gk: 'x', acceptedPositions: VALID_POS },
      { name: 'SemPosicoes', attributes: VALID_ATTRS, gk: null }, // sem acceptedPositions → descartado
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Valido');
  });
});

describe('parseAttrVector — validação estrita do vetor 0–100', () => {
  it('aceita um vetor com as 9 chaves numéricas', () => {
    expect(parseAttrVector(emptyAttrs(60))).toEqual(emptyAttrs(60));
  });

  it('rejeita (undefined) qualquer coisa que não seja um objeto completo', () => {
    expect(parseAttrVector(undefined)).toBeUndefined();
    expect(parseAttrVector(null)).toBeUndefined();
    expect(parseAttrVector('nope')).toBeUndefined();
    expect(parseAttrVector({ FIN: 50 })).toBeUndefined();
  });
});

describe('normalizePlayer — acceptedPositions NUNCA vira coringa sozinho', () => {
  // REGRESSÃO CORRIGIDA: havia um default `?? [{ BOX_TO_BOX }]` aqui. Como
  // normalizePlayer roda em TODA reidratação do localStorage, dado gravado por
  // versão anterior (sem `acceptedPositions`) fazia o ELENCO INTEIRO virar
  // coringa em silêncio. Regra do dono: BOX_TO_BOX só existe se o usuário marcar
  // no cadastro. Sem lista válida, o registro é DESCARTADO — como attributes/gk.

  // REGRESSÃO 2 (mesmo sintoma, outra causa): `parseAcceptedPositions` FORÇAVA
  // `enabled: true` na entrada BOX_TO_BOX ("coringa nunca é desabilitado"). Mas o
  // PlayerForm grava a entrada do coringa com `enabled: false` para dizer "este
  // jogador NÃO é coringa" — ela fica na lista só pra preservar a ordem. Com o
  // valor forçado, TODO jogador do elenco real virava coringa a cada
  // reidratação e o sistema de posições era ignorado.
  it('BOX_TO_BOX com enabled:false NÃO é forçado a true (jogador não vira coringa)', () => {
    const p = normalizePlayer({
      name: 'Torres', attributes: VALID_ATTRS, gk: 20,
      acceptedPositions: [
        { position: 'BOX_TO_BOX', enabled: false },
        { position: 'ALA', enabled: true },
        { position: 'SEGUNDO_ATACANTE', enabled: true },
        { position: 'FIXO', enabled: false },
      ],
    });
    const box = p!.acceptedPositions.find((e) => e.position === 'BOX_TO_BOX');
    expect(box!.enabled).toBe(false);
    // só as habilitadas de verdade são jogáveis
    expect(p!.acceptedPositions.filter((e) => e.enabled).map((e) => e.position)).toEqual(['ALA', 'SEGUNDO_ATACANTE']);
  });

  it('BOX_TO_BOX com enabled:true é preservado (o coringa de verdade continua coringa)', () => {
    const p = normalizePlayer({
      name: 'Bruno', attributes: VALID_ATTRS, gk: 50,
      acceptedPositions: [{ position: 'BOX_TO_BOX', enabled: true }, { position: 'PIVO', enabled: false }],
    });
    expect(p!.acceptedPositions.find((e) => e.position === 'BOX_TO_BOX')!.enabled).toBe(true);
  });

  it('jogador SEM acceptedPositions é DESCARTADO — não vira coringa', () => {
    const p = normalizePlayer({ name: 'Legado', attributes: VALID_ATTRS, gk: null });
    expect(p).toBeNull();
  });

  it('elenco inteiro de dado antigo (sem acceptedPositions) é descartado, não convertido em coringas', () => {
    const antigos = [
      { name: 'A', attributes: VALID_ATTRS, gk: null },
      { name: 'B', attributes: VALID_ATTRS, gk: null },
      { name: 'C', attributes: VALID_ATTRS, gk: null },
    ];
    expect(normalizePlayers(antigos)).toEqual([]);
  });

  it('BOX_TO_BOX só aparece quando está GRAVADO no dado (escolha do usuário)', () => {
    const p = normalizePlayer({
      name: 'Coringa', attributes: VALID_ATTRS, gk: null,
      acceptedPositions: [{ position: 'BOX_TO_BOX', enabled: true }],
    });
    expect(p!.acceptedPositions).toEqual([{ position: 'BOX_TO_BOX', enabled: true }]);
  });

  it('preserva uma lista ordenada válida já existente', () => {
    const list = [
      { position: 'SEGUNDO_ATACANTE', enabled: true }, { position: 'PIVO', enabled: true },
      { position: 'MEIA_ATACANTE', enabled: true }, { position: 'ALA', enabled: true },
    ];
    const p = normalizePlayer({ name: 'Jean', attributes: VALID_ATTRS, gk: null, acceptedPositions: list });
    expect(p!.acceptedPositions).toEqual(list);
  });

  it('lista de posição única (Guto/Tayrone: só jogam de PIVO) é preservada', () => {
    const p = normalizePlayer({
      name: 'Guto', attributes: VALID_ATTRS, gk: null,
      acceptedPositions: [{ position: 'PIVO', enabled: true }],
    });
    expect(p!.acceptedPositions).toEqual([{ position: 'PIVO', enabled: true }]);
  });

  it('lista com item inválido tem só esse item descartado (preserva o resto)', () => {
    const p = normalizePlayer({
      name: 'Ruim', attributes: VALID_ATTRS, gk: null,
      acceptedPositions: [{ position: 'PIVO', enabled: true }, { position: 'ATACANTE_FALSO', enabled: true }],
    });
    expect(p!.acceptedPositions).toEqual([{ position: 'PIVO', enabled: true }]);
  });

  it('array vazio DESCARTA o registro (não vira coringa)', () => {
    expect(normalizePlayer({ name: 'Vazio', attributes: VALID_ATTRS, gk: null, acceptedPositions: [] })).toBeNull();
  });

  it('todas as entradas desabilitadas DESCARTA o registro (sem posição jogável)', () => {
    const p = normalizePlayer({
      name: 'SemPosicao', attributes: VALID_ATTRS, gk: null,
      acceptedPositions: [{ position: 'PIVO', enabled: false }],
    });
    expect(p).toBeNull();
  });

  it('parseAcceptedPositions exposto isoladamente (mesma função usada acima)', () => {
    expect(parseAcceptedPositions([])).toBeUndefined();
    expect(parseAcceptedPositions([{ position: 'PIVO', enabled: true }])).toEqual([{ position: 'PIVO', enabled: true }]);
  });
});

describe('normalizePlayer — positionOrderIndifferent (opcional/cosmético, NÃO estrito)', () => {
  it('parsePositionOrderIndifferent aceita true/false e ignora qualquer outro tipo', () => {
    expect(parsePositionOrderIndifferent(true)).toBe(true);
    expect(parsePositionOrderIndifferent(false)).toBe(false);
    expect(parsePositionOrderIndifferent('true')).toBeUndefined();
    expect(parsePositionOrderIndifferent(1)).toBeUndefined();
    expect(parsePositionOrderIndifferent(null)).toBeUndefined();
    expect(parsePositionOrderIndifferent(undefined)).toBeUndefined();
    expect(parsePositionOrderIndifferent({})).toBeUndefined();
  });

  it('normalizePlayer grava positionOrderIndifferent quando é boolean', () => {
    const p = normalizePlayer({
      name: 'ComFlag', attributes: VALID_ATTRS, gk: null,
      acceptedPositions: VALID_POS, positionOrderIndifferent: true,
    });
    expect(p!.positionOrderIndifferent).toBe(true);
  });

  it('tipo inválido só OMITE o campo — nunca descarta o jogador (diferente de attributes/gk/acceptedPositions)', () => {
    const p = normalizePlayer({
      name: 'FlagInvalida', attributes: VALID_ATTRS, gk: null,
      acceptedPositions: VALID_POS, positionOrderIndifferent: 'sim',
    });
    expect(p).not.toBeNull();
    expect(p!.positionOrderIndifferent).toBeUndefined();
  });

  it('campo ausente não aparece no jogador normalizado', () => {
    const p = normalizePlayer({ name: 'SemFlag', attributes: VALID_ATTRS, gk: null, acceptedPositions: VALID_POS });
    expect(p).not.toBeNull();
    expect(p!.positionOrderIndifferent).toBeUndefined();
  });
});

describe('normalizePlayer — veteran (opcional/cosmético, mesmo padrão de positionOrderIndifferent)', () => {
  it('parseVeteran aceita true/false e ignora qualquer outro tipo', () => {
    expect(parseVeteran(true)).toBe(true);
    expect(parseVeteran(false)).toBe(false);
    expect(parseVeteran('true')).toBeUndefined();
    expect(parseVeteran(1)).toBeUndefined();
    expect(parseVeteran(null)).toBeUndefined();
    expect(parseVeteran(undefined)).toBeUndefined();
    expect(parseVeteran({})).toBeUndefined();
  });

  it('normalizePlayer grava veteran quando é boolean', () => {
    const p = normalizePlayer({
      name: 'Veterano', attributes: VALID_ATTRS, gk: null,
      acceptedPositions: VALID_POS, veteran: true,
    });
    expect(p!.veteran).toBe(true);
  });

  it('tipo inválido só OMITE o campo — nunca descarta o jogador', () => {
    const p = normalizePlayer({
      name: 'VeteranoInvalido', attributes: VALID_ATTRS, gk: null,
      acceptedPositions: VALID_POS, veteran: 'sim',
    });
    expect(p).not.toBeNull();
    expect(p!.veteran).toBeUndefined();
  });

  it('campo ausente não aparece no jogador normalizado', () => {
    const p = normalizePlayer({ name: 'SemVeteran', attributes: VALID_ATTRS, gk: null, acceptedPositions: VALID_POS });
    expect(p).not.toBeNull();
    expect(p!.veteran).toBeUndefined();
  });
});

describe('normalizePlayer — goodMarker ("sabe marcar bem", mesmo padrão de veteran)', () => {
  it('parseGoodMarker aceita true/false e ignora qualquer outro tipo', () => {
    expect(parseGoodMarker(true)).toBe(true);
    expect(parseGoodMarker(false)).toBe(false);
    expect(parseGoodMarker('true')).toBeUndefined();
    expect(parseGoodMarker(1)).toBeUndefined();
    expect(parseGoodMarker(null)).toBeUndefined();
    expect(parseGoodMarker(undefined)).toBeUndefined();
    expect(parseGoodMarker({})).toBeUndefined();
  });

  it('normalizePlayer grava goodMarker quando é boolean', () => {
    const p = normalizePlayer({
      name: 'Marcador', attributes: VALID_ATTRS, gk: null,
      acceptedPositions: VALID_POS, goodMarker: true,
    });
    expect(p!.goodMarker).toBe(true);
  });

  it('tipo inválido só OMITE o campo — nunca descarta o jogador', () => {
    const p = normalizePlayer({
      name: 'MarcadorInvalido', attributes: VALID_ATTRS, gk: null,
      acceptedPositions: VALID_POS, goodMarker: 'sim',
    });
    expect(p).not.toBeNull();
    expect(p!.goodMarker).toBeUndefined();
  });

  it('dado de versão anterior (sem a chave) não vira marcador sozinho', () => {
    const p = normalizePlayer({ name: 'SemMarcador', attributes: VALID_ATTRS, gk: null, acceptedPositions: VALID_POS });
    expect(p).not.toBeNull();
    expect(p!.goodMarker).toBeUndefined();
  });

  it('goodMarker e veteran convivem no mesmo jogador (flags independentes)', () => {
    const p = normalizePlayer({
      name: 'VeteranoMarcador', attributes: VALID_ATTRS, gk: null,
      acceptedPositions: VALID_POS, veteran: true, goodMarker: true,
    });
    expect(p!.veteran).toBe(true);
    expect(p!.goodMarker).toBe(true);
  });
});

describe('normalizePlayer — excludedTeammateIds ("não pode jogar com")', () => {
  it('parseExcludedTeammateIds filtra entradas não-string e descarta duplicatas', () => {
    expect(parseExcludedTeammateIds(['a', 'b', 'a', 'b'], 'self')).toEqual(['a', 'b']);
    expect(parseExcludedTeammateIds(['a', 1, null, undefined, {}, 'b'], 'self')).toEqual(['a', 'b']);
  });

  it('parseExcludedTeammateIds descarta o próprio id do jogador (auto-exclusão)', () => {
    expect(parseExcludedTeammateIds(['a', 'self', 'b'], 'self')).toEqual(['a', 'b']);
  });

  it('parseExcludedTeammateIds descarta string vazia', () => {
    expect(parseExcludedTeammateIds(['a', '', 'b'], 'self')).toEqual(['a', 'b']);
  });

  it('parseExcludedTeammateIds devolve undefined quando não é array, ou quando a limpeza esvazia a lista', () => {
    expect(parseExcludedTeammateIds(undefined, 'self')).toBeUndefined();
    expect(parseExcludedTeammateIds(null, 'self')).toBeUndefined();
    expect(parseExcludedTeammateIds('a,b', 'self')).toBeUndefined();
    expect(parseExcludedTeammateIds({}, 'self')).toBeUndefined();
    expect(parseExcludedTeammateIds([], 'self')).toBeUndefined();
    expect(parseExcludedTeammateIds(['self'], 'self')).toBeUndefined(); // só sobrava a auto-exclusão
  });

  it('normalizePlayer grava excludedTeammateIds quando é uma lista válida', () => {
    const p = normalizePlayer({
      id: 'x', name: 'Excludente', attributes: VALID_ATTRS, gk: null,
      acceptedPositions: VALID_POS, excludedTeammateIds: ['y', 'z'],
    });
    expect(p!.excludedTeammateIds).toEqual(['y', 'z']);
  });

  it('normalizePlayer descarta o PRÓPRIO id (já resolvido) da lista de exclusão', () => {
    const p = normalizePlayer({
      id: 'x', name: 'Excludente', attributes: VALID_ATTRS, gk: null,
      acceptedPositions: VALID_POS, excludedTeammateIds: ['x', 'y'],
    });
    expect(p!.excludedTeammateIds).toEqual(['y']);
  });

  it('tipo inválido só OMITE o campo — nunca descarta o jogador', () => {
    const p = normalizePlayer({
      name: 'ExclusaoInvalida', attributes: VALID_ATTRS, gk: null,
      acceptedPositions: VALID_POS, excludedTeammateIds: 'não é array',
    });
    expect(p).not.toBeNull();
    expect(p!.excludedTeammateIds).toBeUndefined();
  });

  it('dado de versão anterior (sem a chave) não vira exclusão sozinha', () => {
    const p = normalizePlayer({ name: 'SemExclusao', attributes: VALID_ATTRS, gk: null, acceptedPositions: VALID_POS });
    expect(p).not.toBeNull();
    expect(p!.excludedTeammateIds).toBeUndefined();
  });

  it('excludedTeammateIds convive com veteran/goodMarker (flags independentes)', () => {
    const p = normalizePlayer({
      name: 'Completo', attributes: VALID_ATTRS, gk: null, acceptedPositions: VALID_POS,
      veteran: true, goodMarker: true, excludedTeammateIds: ['y'],
    });
    expect(p!.veteran).toBe(true);
    expect(p!.goodMarker).toBe(true);
    expect(p!.excludedTeammateIds).toEqual(['y']);
  });
});
