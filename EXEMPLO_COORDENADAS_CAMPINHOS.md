# Exemplos Práticos: Coordenadas e Renderização dos Campinhos

## Exemplo 1: Posicionamento Simples (React - FieldMapV2.tsx)

### Dados de Entrada
```javascript
const slots = [
  { x: 25, y: 20, player: { name: "João Silva" }, role: "LATERAL", zone: "DEF" },
  { x: 50, y: 35, player: { name: "Pedro Santos" }, role: "VOLANTE", zone: "MID" },
  { x: 75, y: 60, player: { name: "Marco Atacante" }, role: "PIVO", zone: "ATK" },
];
const goalkeeperName = "Carlos Goleiro";
```

### Renderização React
```jsx
<div style={{
  position: 'relative',
  width: '100%',
  paddingBottom: '160%',
  background: 'linear-gradient(to top, #1d7a3d, #2fa159)',
  border: '1px solid rgba(255,255,255,0.25)'
}}>
  {/* Linha central */}
  <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, background: '...' }} />
  
  {/* Círculo central */}
  <div style={{ position: 'absolute', left: '50%', top: '50%', width: 44, height: 44, ... }} />
  
  {/* Goleiro: (50%, 11%) */}
  <Chip x={50} y={11} label="Carlos Goleiro" role="GOL" gk={true} />
  
  {/* Lateral (DEF): (25%, 20% + 6% = 26%) */}
  <Chip x={25} y={26} label="João Silva" role="LAT" gk={false} />
  
  {/* Volante (MID): (50%, 35% + 6% = 41%) */}
  <Chip x={50} y={41} label="Pedro Santos" role="VOL" gk={false} />
  
  {/* Pivô (ATK): (75%, 60% + 6% = 66%) */}
  <Chip x={75} y={66} label="Marco Atacante" role="PIV" gk={false} />
</div>
```

### Visualização no Navegador
```
┌─────────────────────────────────┐
│      Jogo 1 · 4-2-3-1           │
├─────────────────────────────────┤
│                                 │
│   [João LAT]                    │
│        ~~~~ linha central ~~~~  │ ← y = 50% (meio do campo)
│   [Pedro VOL]  ·(círculo)       │
│                                 │
│   [Marco PIV]                   │
│  [Carlos GOL]  (amarelo)        │
│                                 │
└─────────────────────────────────┘
```

**Notas:**
- Goleiro sempre em `(50%, 11%)` — baixinho no campo
- Laterais em `(25%, 26%)` — esquerda, logo na defesa
- Volante em `(50%, 41%)` — centro, ligeiramente acima do meio
- Pivô em `(75%, 66%)` — direita, alto no ataque

---

## Exemplo 2: Renderização Canvas (fieldMapImage.ts)

### Mesmos Dados, mas em PNG

Dimensões do Canvas para **2 times, 1 jogo**:
```
cellW = 190, cellH = 224, headerH = 48, gap = 6, pad = 12
cols = 2, rows = 1
W = 12*2 + 2*190 + 1*6 = 410
H = 12*2 + 48 + 1*224 + 0*6 = 500
```

### Estrutura da Imagem
```
┌──────────────────────────────────────────┐
│        CABEÇALHO (48px)                  │
│  Time A           │  Time B              │
│  Banco: X, Y      │  Banco: M, N         │
├──────────────────────────────────────────┤
│ Jogo 1 · 4-2-3-1 │ Jogo 1 · 4-2-3-1    │
│ ┌────────────┐   │ ┌────────────┐      │
│ │[Campo #1]  │   │ │[Campo #2]  │      │
│ │...(190x224)│   │ │           │      │
│ └────────────┘   │ └────────────┘      │
│ (x=12, y=60)     │ (x=208, y=60)       │
└──────────────────────────────────────────┘
```

### Cálculo de Coordenadas do Chip "João Lateral"

**Dados do slot:**
```
s.x = 25 (0-100)
s.y = 20 (0-100)
s.zone = "DEF"
s.player.name = "João Silva"
s.role = "LATERAL"
```

**Ajuste de posição:**
```javascript
y_ajustado = s.zone === "DEF" ? s.y + 7 : s.y
y_ajustado = 20 + 7 = 27
```

**Cálculo no `drawField()` (campo 1, Time A):**
```
fx = 12 (x do campo)
fy = 60 (y do campo, depois do header)
fw = 190 (largura do campo)
fh = 176 (altura do campo = 224 - 48)

// Função place(px, py, label, role, gk)
px = 25, py = 27
cx = fx + (px / 100) * fw
cx = 12 + (25 / 100) * 190
cx = 12 + 47.5
cx = 59.5

cy = fy + fh - (py / 100) * fh
cy = 60 + 176 - (27 / 100) * 176
cy = 60 + 176 - 47.52
cy = 188.48

// Posição final do chip: (59.5, 188.48)
```

### Comparação: React vs Canvas

| Aspecto | React (FieldMapV2) | Canvas (fieldMapImage) |
|---|---|---|
| **Coordenada Y** | `bottom: ${y}%` | `fy + fh - (py/100)*fh` |
| **Ajuste** | `+6` sempre | `+7` se DEF, `-8` se SA, normal outros |
| **Goleiro** | `y=11` | `y=15` |
| **Escalas** | Responsive | 2x (retina) |
| **Tamanho fonte** | 0.62rem (9px) | 9px direto |

**Por que diferentes?**
- React precisa ser responsivo (em %)
- Canvas é pixel-perfeito (em px)
- Ajustes diferentes evitam sobreposição em cada contexto

---

## Exemplo 3: Múltiplos Jogos (Rodízio Completo)

### Cenário: 2 Times, 3 Jogos com Variação

```
Jogo 1: Time A escala [João, Pedro, Marco, Carlos], Time B escala [Ana, Bruno, Carlos]
Jogo 2: Time A escala [João, Pedro, Lucas, Carlos], Time B escala [Ana, Bruno, Carlos]
        (Marco saiu, Lucas entrou)
Jogo 3: Time A escala [João, Pedro, Marco, Carlos], Time B escala [Ana, Victor, Carlos]
        (Lucas saiu, Marco voltou; Victor entrou em B)
```

### buildFieldMapsImage() Calcula:
```javascript
anyVariation = true  (alguém varia)
rows = 3 (um jogo por linha)
cols = 2 (dois times)

W = 12*2 + 2*190 + 1*6 = 410
H = 12*2 + 48 + 3*224 + 2*6 = 754  (3 linhas de jogos)
```

### Layout da Imagem Exportada
```
┌──────────────────────────────────────────┐
│  Time A               │  Time B           │
│  Banco: X, Y, Z, ...  │  Banco: M, N, ... │
├──────────────────────────────────────────┤
│ Jogo 1 · 4-2-3-1     │ Jogo 1 · 3-3-2   │
│ ┌────────────┐       │ ┌────────────┐   │
│ │[João, Pedro│       │ │[Ana, Bruno │   │
│ │ Marco, GK] │       │ │ Carlos, GK]│   │
│ └────────────┘       │ └────────────┘   │
├─────────────────────┼──────────────────┤
│ Jogo 2 · 4-2-3-1    │ Jogo 2 · 3-3-2   │
│ Sai: Marco           │ (sem mudança)     │
│ Entra: Lucas         │                   │
│ ┌────────────┐       │ ┌────────────┐   │
│ │[João, Pedro│       │ │[Ana, Bruno │   │
│ │ Lucas, GK] │       │ │ Carlos, GK]│   │
│ └────────────┘       │ └────────────┘   │
├─────────────────────┼──────────────────┤
│ Jogo 3 · 4-2-3-1    │ Jogo 3 · 3-3-2   │
│ Sai: Lucas           │ Sai: Bruno        │
│ Entra: Marco         │ Entra: Victor     │
│ ┌────────────┐       │ ┌────────────┐   │
│ │[João, Pedro│       │ │[Ana, Victor│   │
│ │ Marco, GK] │       │ │ Carlos, GK]│   │
│ └────────────┘       │ └────────────┘   │
└──────────────────────────────────────────┘
```

**Posições das células:**
```
Jogo 1:  Time A @ (12, 60),    Time B @ (208, 60)
Jogo 2:  Time A @ (12, 290),   Time B @ (208, 290)
Jogo 3:  Time A @ (12, 520),   Time B @ (208, 520)

(cada jogo ocupa 224px de altura + 6px de gap)
```

---

## Exemplo 4: Onde as Coordenadas Vêm

### No Engine (rotation.ts)

As coordenadas `x` e `y` de cada slot são definidas pelo **sistema tático**:

```typescript
// Exemplo: formação 4-2-3-1
const slots = [
  { x: 50, y: 15, role: "GOLEIRO", ... },      // centro, baixo
  { x: 25, y: 30, role: "FIXO", zone: "DEF" },   // esquerda, defesa
  { x: 75, y: 30, role: "FIXO", zone: "DEF" },   // direita, defesa
  { x: 25, y: 20, role: "LATERAL", zone: "DEF" }, // lateral esq
  { x: 75, y: 20, role: "LATERAL", zone: "DEF" }, // lateral dir
  { x: 35, y: 40, role: "VOLANTE", zone: "MID" }, // volante esq
  { x: 65, y: 40, role: "VOLANTE", zone: "MID" }, // volante dir
  { x: 25, y: 55, role: "MEIA_ATACANTE", zone: "ATK" }, // MAT esq
  { x: 75, y: 55, role: "MEIA_ATACANTE", zone: "ATK" }, // MAT dir
  { x: 50, y: 60, role: "SEGUNDO_ATACANTE", zone: "ATK" }, // 2º atacante
  { x: 50, y: 75, role: "PIVO", zone: "ATK" },   // pivô (ponta), topo
];
```

### Como Varia por Formação

**Formação 3-3-2** (menos defesa, mais ataque):
```
Defesa move para trás (y reduz para 10-25)
Ataque move para frente (y sobe para 65-80)
```

**Formação 5-4-1** (defensiva):
```
Defesa adiciona lateral-volante (5 em vez de 4)
Ataque reduz para 1 pivô
Coordenadas espalhadas horizontalmente
```

---

## Exemplo 5: Debug de Coordenadas

### Adicionar Logs no `drawField()`

```javascript
const drawField = (ctx, x, y, w, h, title, subtitle, gkName, cells) => {
  // ... setup ...
  
  const place = (px, py, label, role, gk = false) => {
    const cx = fx + (px / 100) * fw;
    const cy = fy + fh - (py / 100) * fh;
    
    // LOG AQUI
    console.log(`
      Slot: ${label} (${role})
      Entrada: px=${px}%, py=${py}%
      Canvas: cx=${cx.toFixed(1)}px, cy=${cy.toFixed(1)}px
      Campo: x=${x}, y=${y}, w=${w}, h=${h}
      Zona: ${gk ? "GK" : "normal"}
    `);
    
    // ... rest ...
  };
};
```

### Inspecionar Blob no Console

```javascript
// Em SimulationTab.tsx, após buildFieldMapsImage()
const blob = await buildFieldMapsImage(result, lateArrivalsMap);
const url = URL.createObjectURL(blob);
console.log(`PNG Blob: ${blob.size} bytes`);
console.log(`Preview: ${url}`);

// Abre a imagem em aba nova
window.open(url);
```

---

## Exemplo 6: Ajustes Visuais (Evitar Sobreposição)

### Problema Original
```
Zaga (y=20) e Goleiro (y=15) muito próximos:

  [Carlos GOL] ← y=15
  [João FIX]  ← y=20 (MUITO PERTO!)
```

### Solução
```javascript
// Em fieldMapImage.ts
y: s.zone === 'DEF' ? s.y + 7  // +7 pixels para cima
```

Resultado:
```
  [Carlos GOL] ← y=15
  [João FIX]  ← y=27 (MAIS ESPAÇO!)
```

### Outro Ajuste: 2º Atacante
```javascript
// 2º atacante recua um pouco em relação ao pivô
y: s.role === 'SEGUNDO_ATACANTE' ? s.y - 8
```

Sem ajuste:
```
[Marco 2A] ← y=60 (ATRÁS DO PIVÔ)
[Paulo PIV] ← y=75
```

Com ajuste:
```
[Marco 2A] ← y=52 (RECUADO, MAS NÃO TANTO)
[Paulo PIV] ← y=75
```

---

## Resumo das Fórmulas

### React (FieldMapV2.tsx)
```
left = x%
bottom = y% (onde y é do slot + 6)
transform = translate(-50%, 50%)
```

### Canvas (fieldMapImage.ts)
```
cx = fx + (px / 100) * fw
cy = fy + fh - (py / 100) * fh

Onde:
fx = x do campo (pad + col * (cellW + gap))
fy = y do campo (pad + headerH + row * (cellH + gap))
fw = largura do campo (190)
fh = altura do campo (224 - titleH)
px, py = coordenadas do slot (0-100)
```

### Exemplo Concreto
```
Campo no canvas: x=12, y=60, w=190, h=176
Jogador: px=25, py=27

cx = 12 + (25/100) * 190 = 59.5
cy = 60 + 176 - (27/100) * 176 = 188.5
```
