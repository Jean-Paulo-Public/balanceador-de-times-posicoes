# Documentação: Geração de Campinhos na Exportação de Imagens

## Resumo Executivo

Os campinhos (campos de futebol) são gerados em **dois contextos**:

1. **FieldMapV2.tsx** — Exibe o campinho em React durante a simulação (em tempo real)
2. **fieldMapImage.ts** — Exporta os campinhos como PNG usando Canvas 2D

Ambos usam as **mesmas coordenadas** `(s.x, s.y)` dos `BalancedSlot`, mas a renderização é diferente:
- React: posicionamento CSS absoluto
- Canvas: desenho pixel-por-pixel

---

## 1. Visualização em Tempo Real (React)

### Arquivo: `src/features/simulation/FieldMapV2.tsx`

#### Container do Campo
```jsx
<div style={{
  position: 'relative',
  width: '100%',
  paddingBottom: '160%',  // aspecto responsivo 160:100
  borderRadius: 8,
  background: 'linear-gradient(to top, #1d7a3d, #2fa159)',  // verde gradiente
  border: '1px solid rgba(255,255,255,0.25)',
  overflow: 'hidden',
}}>
```

**Por que 160% de padding-bottom?**
- Mantém aspecto responsivo
- 160% é maior que 128% anterior (mais espaço vertical para chips)
- Evita sobreposição de nomes na defesa e goleiro

#### Linha Central
```jsx
<div style={{
  position: 'absolute',
  left: 0, right: 0,
  top: '50%',
  height: 1,
  background: 'rgba(255,255,255,0.25)'
}} />
```

#### Círculo Central
```jsx
<div style={{
  position: 'absolute',
  left: '50%', top: '50%',
  width: 44, height: 44,
  marginLeft: -22, marginTop: -22,  // centra o círculo
  borderRadius: '50%',
  border: '1px solid rgba(255,255,255,0.22)'
}} />
```

#### Componente Chip (Jogador)
```jsx
function Chip({ x, y, label, role, gk = false }) {
  const first = label.split(' ')[0];
  return (
    <div style={{
      position: 'absolute',
      left: `${x}%`,
      bottom: `${y}%`,  // CSS usa "bottom" para posicionar de baixo
      transform: 'translate(-50%, 50%)',  // centra o chip
      textAlign: 'center',
      pointerEvents: 'none'
    }}>
      <div style={{
        background: gk ? 'rgba(255,193,7,0.85)' : 'rgba(0,0,0,0.6)',
        color: gk ? '#1a1a1a' : '#fff',
        fontSize: '0.62rem',
        fontWeight: 600,
        padding: '1px 5px',
        borderRadius: 7,
        maxWidth: 74,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {first}  {/* mostra apenas primeiro nome */}
      </div>
      <div style={{ fontSize: '0.52rem', color: '#e6ffee', marginTop: 1 }}>
        {role}  {/* abreviação: FIX, LAT, VOL, etc */}
      </div>
    </div>
  );
}
```

**Posicionamento:**
- `left: ${x}%` — coordenada horizontal (0-100)
- `bottom: ${y}%` — coordenada vertical invertida (0 = fundo do campo)
- `transform: 'translate(-50%, 50%)'` — centra o chip no ponto (x, y)

**Chamada:**
```jsx
{goalkeeperName && <Chip x={50} y={11} label={goalkeeperName} role="GOL" gk />}
{slots.map((s, i) => (
  <Chip key={i} x={s.x} y={s.y + 6} label={s.player.name} role={ROLE_SHORT[s.role]} />
))}
```

Nota: goleiro fica em `y=11`, outros jogadores em `y=s.y + 6`.

---

## 2. Exportação como PNG (Canvas)

### Arquivo: `src/features/simulation/fieldMapImage.ts`

#### Estrutura da Imagem

```
┌─────────────────────────────────────┐
│  CABEÇALHO (headerH = 48px)         │
│  Nome Time 1  │ Nome Time 2 │ ...   │
│  Banco: ...   │ Banco: ...  │ ...   │
├─────────────────────────────────────┤
│ Jogo 1        │ Jogo 1      │ Jogo 1│
│ ┌──────────┐  │ ┌──────────┐ │ ...  │
│ │ Campo 1  │  │ │ Campo 2  │ │      │
│ └──────────┘  │ └──────────┘ │      │
├─────────────────────────────────────┤
│ Jogo 2        │ Jogo 2      │ Jogo 2│
│ ┌──────────┐  │ ┌──────────┐ │ ...  │
│ │ Campo 1  │  │ │ Campo 2  │ │      │
│ └──────────┘  │ └──────────┘ │      │
└─────────────────────────────────────┘

Dimensões:
- cellW = 190px (largura de cada campo)
- cellH = 224px (altura de cada campo)
- gap = 6px (espaço entre colunas/linhas)
- pad = 12px (padding externo)

W = pad*2 + cols*cellW + (cols-1)*gap
H = pad*2 + headerH + rows*cellH + (rows-1)*gap
```

#### Canvas Setup

```javascript
const canvas = document.createElement('canvas');
const scale = 2;  // retina 2x
canvas.width = W * scale;   // exemplo: 400 → 800px
canvas.height = H * scale;
const ctx = canvas.getContext('2d');
ctx.scale(scale, scale);  // compensa zoom 2x
```

**Por que escala 2x?**
- Melhor qualidade em telas de alta densidade
- PNG final fica nítido quando compartilhado/impresso

#### Renderização do Cabeçalho

```javascript
teams.forEach((t, c) => {
  const cx = pad + c * (cellW + gap) + cellW / 2;  // x central
  
  // Nome do time
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(truncate(teamDisplayLabel(t), 24), cx, pad + 16);
  
  // Banco
  ctx.fillStyle = '#93e6b0';  // verde
  ctx.font = '9px sans-serif';
  const benchTxt = t.bench.length
    ? 'Banco: ' + t.bench.map((b) => b.name.split(' ')[0]).join(', ')
    : 'Sem banco';
  ctx.fillText(truncate(benchTxt, 34), cx, pad + 32);
});
```

#### Função `drawField()`

Renderiza um único campinho (190×224px):

```javascript
const drawField = (
  ctx: CanvasRenderingContext2D,
  x: number,        // x superior-esquerdo do campinho
  y: number,        // y superior-esquerdo do campinho
  w: number,        // 190 (largura)
  h: number,        // 224 (altura)
  title: string,    // "Jogo 1 · 4-2-3-1"
  subtitle: string, // "Sai: João  Entra: Pedro"
  gkName: string | null,
  cells: Cell[]     // [{ x, y, label, role }, ...]
): void => {
  const titleH = subtitle ? 28 : 17;  // espaço para título + subtitle
  
  // 1. TÍTULO
  ctx.fillStyle = '#cfead8';  // bege
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(truncate(title, 26), x + w / 2, y + 11);
  
  if (subtitle) {
    ctx.fillStyle = '#ffd9a8';  // bege mais quente
    ctx.font = '8px sans-serif';
    ctx.fillText(truncate(subtitle, 44), x + w / 2, y + 22);
  }

  // 2. CAMPO (parte verde)
  const fx = x;          // posição x do campo
  const fy = y + titleH; // posição y (abaixo do título)
  const fw = w;          // largura do campo (190)
  const fh = h - titleH; // altura do campo (224 - 28 ou 17)

  // Fundo verde
  ctx.fillStyle = '#1f7a3d';
  ctx.fillRect(fx, fy, fw, fh);

  // Borda branca
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.strokeRect(fx + 2, fy + 2, fw - 4, fh - 4);

  // Linha central
  ctx.beginPath();
  ctx.moveTo(fx, fy + fh / 2);
  ctx.lineTo(fx + fw, fy + fh / 2);
  ctx.stroke();

  // 3. CHIPS DOS JOGADORES
  const place = (px: number, py: number, label: string, role: string, gk = false) => {
    // Converte coordenadas de % para pixels
    const cx = fx + (px / 100) * fw;  // esquerda: 0% → fx, 100% → fx+fw
    const cy = fy + fh - (py / 100) * fh;  // cima: 0% → fy+fh, 100% → fy

    const text = label.split(' ')[0];  // primeiro nome
    ctx.font = '9px sans-serif';
    const tw = ctx.measureText(text).width + 6;  // largura do texto + padding

    // Fundo do chip
    ctx.fillStyle = gk ? 'rgba(255,193,7,0.92)' : 'rgba(0,0,0,0.62)';
    ctx.fillRect(cx - tw / 2, cy - 7, tw, 12);

    // Texto (nome)
    ctx.fillStyle = gk ? '#111' : '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(text, cx, cy + 2);

    // Posição (role)
    ctx.fillStyle = '#dfe9e1';  // cinza claro
    ctx.font = '7px sans-serif';
    ctx.fillText(role, cx, cy + 10);
  };

  // Goleiro (sempre em y=15, x=50)
  if (gkName) place(50, 15, gkName, 'GOL', true);

  // Outros jogadores
  for (const c of cells) {
    place(c.x, c.y, c.label, ROLE_SHORT[c.role] ?? c.role, false);
  }
};
```

---

## 3. Fluxo Completo: Da Simulação ao PNG

### Passo 1: Coleta de Dados

**Em SimulationTab.tsx:**
```typescript
const handleExportFieldImage = async () => {
  setIsExportingImage(true);
  try {
    const blob = await buildFieldMapsImage(result, lateArrivalsMap);
    // ...compartilha ou baixa...
  } finally {
    setIsExportingImage(false);
  }
};
```

### Passo 2: Monta Layout

**Em buildFieldMapsImage():**
```typescript
const teams = result.teams;  // todos os times
const totalGames = gamesForTeamCount(teams.length);  // 9 ou 6 ou 3
const schedules = teams.map((t) => buildTeamSchedule(t, totalGames, undefined, undefined, lateArrivalsMap));

// Decide número de linhas
const anyVariation = schedules.some((s) => !s.constant);
const rows = anyVariation ? totalGames : 1;
const cols = teams.length;

// Calcula dimensões do canvas
const W = pad * 2 + cols * cellW + (cols - 1) * gap;
const H = pad * 2 + headerH + rows * cellH + (rows - 1) * gap;
```

**Lógica de `anyVariation`:**
- Se todos os times têm escalação idêntica em todos os jogos → `rows = 1` (mostra "Jogo 1 ao N")
- Se algum time varia goleiro/banco → `rows = totalGames` (um jogo por linha)

### Passo 3: Renderiza Canvas

```typescript
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    const x = pad + c * (cellW + gap);
    const y = pad + headerH + r * (cellH + gap);
    const sch = schedules[c];  // schedule do time c
    let game = null;
    let title = '';
    let subtitle = '';

    if (sch.constant) {
      // Todos os jogos iguais
      if (r === 0) {
        game = sch.games[0];
        title = `Jogo 1 ao ${totalGames}`;
      }
    } else {
      // Jogo varia
      game = sch.games[r] ?? null;
      title = `Jogo ${r + 1}`;

      if (game) {
        // Compara com jogo anterior para "Sai/Entra"
        if (r > 0) {
          const prev = sch.games[r - 1];
          const cur = game;
          const entra = prev.benchNames.filter((nm) => !cur.benchNames.includes(nm));
          const sai = cur.benchNames.filter((nm) => !prev.benchNames.includes(nm));
          subtitle = `Sai: ${sai.join(', ') || '—'}  Entra: ${entra.join(', ') || '—'}`;
        }

        // "Chega" são jogadores que chegam PELA PRIMEIRA VEZ
        if (game.arrivals.length) {
          subtitle += `  Chega: ${game.arrivals.map((a) => a.name.split(' ')[0]).join(', ')}`;
        }
      }
    }

    if (!game) {
      // Célula vazia (preto)
      ctx.fillStyle = '#000000';
      ctx.fillRect(x, y, cellW, cellH);
      continue;
    }

    // Converte slots para cells
    const cells: Cell[] = game.slots.map((s) => ({
      x: s.x,
      // Ajustes de posição para evitar sobreposição
      y: s.zone === 'DEF' ? s.y + 7
        : s.role === 'SEGUNDO_ATACANTE' ? s.y - 8
        : s.y,
      label: s.player.name,
      role: s.role,
    }));

    // Renderiza o campinho
    drawField(ctx, x, y, cellW, cellH, `${title} · ${game.formation}`, subtitle, game.goalkeeperName, cells);
  }
}
```

### Passo 4: Converte para PNG

```typescript
return await new Promise<Blob>((resolve, reject) => {
  canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao gerar a imagem'))), 'image/png');
});
```

### Passo 5: Compartilha ou Baixa

**Em SimulationTab.tsx:**
```typescript
if (navigator.share) {
  await navigator.share({ files: [new File([blob], filename, { type: 'image/png' })] });
} else {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

---

## 4. Ajustes de Posição (Importante!)

As coordenadas de cada jogador (`s.x`, `s.y`) são pré-calculadas pelo engine, mas há ajustes **visuais** aplicados na renderização:

```javascript
y: s.zone === 'DEF' ? s.y + 7       // zaga sobe 7px
  : s.role === 'SEGUNDO_ATACANTE' ? s.y - 8  // 2º atacante recua 8px
  : s.y
```

**Por quê?**
- Evita que chips se sobreponham
- Zaga sobe um pouco (descola do goleiro)
- 2º atacante recua um pouco em relação ao pivô

Esses ajustes **SÓ são feitos na exportação**, não em FieldMapV2.tsx (onde é apenas `s.y + 6`).

---

## 5. Abreviações de Posições

```javascript
const ROLE_SHORT: Record<LinePosition, string> = {
  FIXO: 'FIX',
  LATERAL: 'LAT',
  VOLANTE: 'VOL',
  ALA: 'ALA',
  MEIA_ATACANTE: 'MAT',  // 'MA' em FieldMapV2.tsx
  SEGUNDO_ATACANTE: 'SA',
  PIVO: 'PIV',
};
```

---

## 6. Tabela de Cores

| Componente | Cor | Uso | RGB/HSL |
|---|---|---|---|
| Fundo geral | `#0e1116` | Preto da imagem | rgb(14, 17, 22) |
| Cabeçalho (título) | `#cfead8` | Nome do time | rgb(207, 234, 216) |
| Cabeçalho (banco) | `#ffd9a8` | Banco de subs | rgb(255, 217, 168) |
| Campo | `#1f7a3d` | Fundo verde | rgb(31, 122, 61) |
| Campo (gradient) | `#2fa159` | Topo do gradiente | rgb(47, 161, 89) |
| Borda campo | `rgba(255,255,255,0.28)` | Branco translúcido | - |
| Linha central | `rgba(255,255,255,0.25)` | Branco translúcido | - |
| Chip normal | `rgba(0,0,0,0.62)` | Preto translúcido | - |
| Chip goleiro | `rgba(255,193,7,0.92)` | Amarelo/ouro | - |
| Texto (nome) | `#ffffff` ou `#fff` | Branco | - |
| Texto goleiro | `#111` | Quase preto | rgb(17, 17, 17) |
| Role (posição) | `#dfe9e1` | Cinza claro | rgb(223, 233, 225) |

---

## 7. Teste e Verificação

### Na UI
1. Vá para a aba **Simulação**
2. Clique em **"Exportar mapinhas (imagem)"**
3. Verifique:
   - Campinhos aparecem em grid (cols=times, rows=jogos)
   - Goleiro em amarelo
   - Nomes abreviados nos chips
   - Informações de banco, subs e chegadas nos subtítulos

### No Código
1. Abra `fieldMapImage.ts` (linhas 67-169)
2. Inspione `drawField()` (linhas 18-65)
3. Adicione `console.log()` para debug de coordenadas:
   ```javascript
   console.log(`Chip: ${label} at (${cx}, ${cy})`);
   ```

---

## 8. Referências Rápidas

- **Componente visual**: `src/features/simulation/FieldMapV2.tsx`
- **Exportação PNG**: `src/features/simulation/fieldMapImage.ts`
- **Integração**: `src/features/simulation/SimulationTab.tsx` (linhas 240-261)
- **Engine**: `src/engine/rotation.ts` (cálculo de rodízio e coordenadas)
- **Tipos**: `src/engine/index.ts` (`BalancedSlot`, `BalanceResult`)
