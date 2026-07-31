# Balanceador Fut7 — Design v2: Atributos, Funções, Sinergia e Aprendizado

**Documento de design enxuto (para validação antes de implementar).**
Versão **0.4** — 22/07/2026. Autor: assistente + Jean.
Escopo: substituir o modelo de "estrela única" por um modelo de atributos (0–100), funções táticas, sinergia e balanceamento multi-métrica, encaixado no app React/TS/Vite atual.

> **Como ler:** este é um documento para você **discordar**. Cada peso e cada fórmula aqui é um *default calibrável*, não uma verdade. Fut7 = 7 por lado (1 goleiro + 6 de linha).

> **Mudanças recentes (feedback do Jean):**
> 1. **Recomposição** passa a ser atributo **explícito** (`MOT` → **`REC`**), com preset rápido tipo checkbox; e fica claro que **funções são calculadas, não declaradas** (Seções 3, 4, 6).
> 2. **Goleiro:** nota efetiva = **média por cenário** de troca de goleiro (peso de gol = `1/k`); reescrita a Seção 7.
> 3. **Posição é portão duro** (matriz de improviso): DEFENSOR nunca ataca, ATACANTE nunca defende — **mesmo contra os atributos** (Seções 4, 10).
> 4. **Time sem goleiro** (6 escalados ou opção "não escalar goleiros"): goleiro é **emprestado** — a nota de goleiro é **desconsiderada** no balanceamento; não há penalidade (Seções 7.4, 10).
> 5. **Sem líder/capitão:** `isCaptain` e tudo associado **removidos** (na prática não há líder em campo).
> 6. **Rodízio = jogos de 10 min** com pontos 3/1/0; 2 times → 9 jogos, 3 times → 9 totais (6 por time, descansa 3 e empresta goleiro), 4 → 9 (Seção 7.2).
> 7. **Explicabilidade turbinada:** texto tático de como jogar + **4 mapinhas** (Geral, Defendendo, Pressão à saída, Fase final do ataque) + observações individuais (Seção 13).

---

## 0. Sumário executivo e postura crítica

O núcleo do que você quer está **correto**: dois times com a mesma soma de nota podem ser desequilibrados porque a composição de funções e as sinergias diferem. É o motivo de o modelo atual (estrela única, variância de média) falhar. A correção certa é migrar para atributos, derivar **funções naturais**, **inferir a formação** da composição e balancear em **várias métricas** ao mesmo tempo.

O que eu **recomendo NÃO fazer**, e por quê (minha leitura, discuta):

1. **Não** usar ~30 atributos. Metade é redundante. Uso **8 atributos** quase ortogonais (Seção 3); a Tabela 3.2 mostra os 30 colapsando nos 8 sem perder sinal.
2. **Não** prometer "aprendizado em tempo real com o resultado". Amostra minúscula + ruído gigante = você não aprende 8 atributos de um 6×4. O que dá pra fazer é modesto e honesto (Seção 14).
3. **Não** usar algoritmo genético/simulated annealing. Com ≤ 24 jogadores e 2–4 times, guloso + busca local por trocas chega perto do ótimo em milissegundos (Seção 12). Mesma disciplina no escalonamento de banco (7.3): o essencial na Fase 1, o ótimo na Fase 2.
4. A matriz de afinidade (8.3) é **heurística ajustável**, não ciência. O núcleo da sinergia é matematicamente defensável (complementaridade finalização×criação, 8.1).

O que muda pro usuário: em vez de "os 7 melhores", o app monta **equipes funcionais** — cada time ganha identidade tática coerente (formação inferida), os times ficam parelhos em ataque/defesa/motor/coesão pra a tabela de pontos ficar disputada, o rodízio de goleiro é considerado, e o app **explica** como o time deve jogar (Seção 13).

---

## 1. Diagnóstico do estado atual (código real)

O `instructions.md` e o `Relatorio_Auditoria_Balanceador.docx` descrevem uma arquitetura **antiga** (`utils/balancer.ts`, `scoring.ts`, `MEIA_OFENSIVO/DEFENSIVO`, atributos por posição). O código atual foi reescrito e **simplificado**. O baseline real:

- **Dados (`src/domain/types.ts`):** `Player` = `{ id, name, active, isCaptain, isGoalkeeper, position: DEFENSOR|MEIA|ATACANTE, rating: 0–5 (passo 0,5), pivotFriendly, recompoePouco, boaSaidaDeBola, veloz }`. **Uma nota só**; os "atributos" viraram 4 booleans.
- **Formações (`src/domain/formations.ts`):** só **3** — 2-2-2, 2-3-1, 1-4-1. `chooseFormation(nDef, nAta)` escolhe por contagem.
- **Motor (`src/engine/generateTeams.ts`):** construção **gulosa randomizada** com ruído, ~3000 simulações, dedupe por assinatura, ordenação por `equilibrium = variância das médias de estrela`. Reserva de goleiro limitada por `spareCapacity`. Improviso já implementa a matriz DEF/ATA só viram MEIA.
- **Observações (`src/engine/observations.ts`):** texto de diagnóstico, não influencia o balanceamento — semente da explicabilidade (Seção 13).
- **Persistência (`src/store/usePlayerStore.ts`):** Zustand + localStorage, `version = 4`, com `migrate`/`normalizePlayer`. Cultura de migração já existe.

**Limitação central:** `overall = média das estrelas` e `equilibrium = variância dessas médias`. Unidimensional. O motor não sabe que o Time A tem 3 marcadores e nenhum criador. Todo o resto ataca isso.

**A preservar:** arquitetura `domain/engine/store/features` limpa e testável (Vitest); o motor guloso+ruído+dedupe funciona e é rápido; a matriz de improviso. Vamos **evoluí-lo**.

---

## 2. Princípios de design

1. **Enxuto > completo.** Poucos atributos, todos distinguíveis a olho.
2. **Transparente > caixa-preta.** Toda nota final explicável em uma frase.
3. **Honesto sobre incerteza.** Nota manual é *prior* ruidoso; o sistema encolhe em direção a defaults.
4. **Incremental.** Cada fase entrega valor sozinha e cabe no código atual.
5. **Calibrável.** Todo peso vive num arquivo de config, ajustável sem tocar na lógica.

---

## 3. Modelo de atributos (8 core + Goleiro)

Escala **0–100** (0 = muito ruim, 50 = mediano *do seu grupo*, 100 = referência do grupo). Ancorar em "mediano do grupo = 50" reduz inflação (decisão 16.1).

### 3.1 Os oito atributos

| Sigla | Atributo | O que agrega | Por que é separado |
|------|----------|--------------|--------------------|
| **FIN** | Finalização | Chute, finalização de dentro e de fora | Fazer gol ≠ criar gol |
| **CRI** | Criação | Passe curto/longo, visão, saída de bola, último passe | O "cérebro"; independe de finalizar |
| **DRI** | Drible & Domínio | 1v1, condução, controle em espaço curto | Sair da marcação ≠ passar bem |
| **DEF** | Defesa | Marcação, desarme, antecipação, posicionamento, cobertura | Leitura/marcação ≠ força bruta |
| **VEL** | Velocidade | Ritmo + aceleração (pique) | Explosão ≠ resistência ≠ força |
| **REC** | Recomposição | Recompõe, pressão sem bola, fôlego pra correr o jogo todo | Vontade/capacidade de voltar; **o que mais decide no Fut7**; independe de pique |
| **MOV** | Mobilidade | Desmarque, ocupação de espaço, movimento ofensivo sem bola | Achar espaço ≠ ser rápido |
| **FIS** | Físico/Força | Proteção de bola, dividida, duelo, roubo no corpo, aéreo | **Forte ≠ rápido** |
| *GOL* | Goleiro | Reflexo, saída, jogo com os pés no gol | Ortogonal: craque de linha pode ser péssimo goleiro |

**REC é entrada explícita (não inferida).** Não dá pra deduzir "recompõe bem" de um papel. REC é nota 0–100 dada direto; pra ficar leve como um checkbox, o form oferece **preset rápido**: Alta = 75, Média = 50, Baixa = 25 (e dá pra afinar). O antigo boolean `recompoePouco` vira "REC baixo" na migração.

**FIS é core (não opcional).** Do próprio Jean: *"não corro super rápido, mas protejo a bola, ganho dividida e roubo no corpo"* — FIS alto com VEL baixo, eixo que a velocidade não captura. **REC e FIS são os que mais vão precisar de correção manual pós-migração** (a estrela antiga não tinha esses eixos).

**GOL é separado e pode ser nulo.** Quem não joga no gol tem `GOL = null`. Viabiliza o rodízio gol/linha (Seção 7).

### 3.2 De 30 → 8 (nada importante se perde)

| Atributo do esboço (30) | Vai para |
|---|---|
| Velocidade, Aceleração | **VEL** |
| Agilidade | **VEL** + **DRI** (parte) |
| Resistência | **REC** (fôlego pra correr o jogo todo) |
| Força | **FIS** |
| Passe curto, Passe longo, Visão | **CRI** |
| Domínio | **CRI** + **DRI** (parte) |
| Drible | **DRI** |
| Finalização, Chute de longe | **FIN** |
| Cruzamento | **CRI** (parte) |
| Cabeceio | **FIS** (aéreo) |
| Marcação, Desarme, Antecipação, Cobertura, Posicionamento | **DEF** |
| Decisão, Calma, Inteligência tática | multiplicador; distribuído em **CRI/DEF** |
| Liderança | removido (Seção 6) |
| Desmarque, Ocupação de espaço | **MOV** |
| Recomposição, Pressão | **REC** |
| Mobilidade | **MOV** |

Justificativa: marcação/desarme/antecipação/posicionamento são quase perfeitamente correlacionados numa avaliação de racha — colapsá-los em **DEF** remove ruído, não sinal. (Conceito: *role discovery* por clustering — poucas dimensões latentes, Seção 17.)

---

## 4. Funções (Roles) — a "função natural" de cada jogador

> **As funções são CALCULADAS, nunca declaradas.** Você não marca "fulano é box-to-box"; dá as notas (inclusive REC) e o sistema **deriva** a função de maior aptidão. Box-to-box é consequência de REC/DEF/CRI altos, não entrada.

**A posição continua sendo um portão duro (vontade/gosto do jogador).** A `position` (DEFENSOR/MEIA/ATACANTE) **não** é substituída pelas funções — ela **restringe** quais funções o jogador pode assumir, e vem **antes** do atributo. Vale a matriz de improviso atual:

- **MEIA** → qualquer zona (defende, meio, ataca).
- **DEFENSOR** → zona de defesa ou meio; **nunca ataca**.
- **ATACANTE** → zona de ataque ou meio; **nunca defende**.

> **Vale mesmo que os atributos digam o contrário:** um zagueiro com cara de finalizador **não** vira atacante — "o cara simplesmente não sabe e não gosta de fazer aquela função" (Jean). O atributo decide a **qualidade dentro** das funções permitidas; a posição decide **quais** são permitidas.

Mapa função→zona: **Defesa** = {MARC, CONS}; **Meio** = {B2B, ARM, ALA}; **Ataque** = {PIVO, SA}. Assim: `funçõesPermitidas(DEFENSOR) = {MARC, CONS, B2B, ARM, ALA}`; `funçõesPermitidas(ATACANTE) = {PIVO, SA, B2B, ARM, ALA}`; `funçõesPermitidas(MEIA)` = todas.

A **função natural** = a de maior aptidão **entre as permitidas**.

```
fit(p, r) = Σ_a  w[r][a] · attr(p, a)      (a ∈ 8 atributos; Σ_a w[r][a] = 1)
funçãoNatural(p) = argmax_{r ∈ funçõesPermitidas(p)} fit(p, r)      // o portão da posição vem primeiro
top2(p) = as duas de maior fit permitidas (versatilidade)
```

### 4.1 Catálogo de funções e pesos (defaults calibráveis)

Pesos sobre `[FIN, CRI, DRI, DEF, VEL, REC, MOV, FIS]` (cada linha soma 1,00):

| Função | FIN | CRI | DRI | DEF | VEL | REC | MOV | FIS |
|---|---|---|---|---|---|---|---|---|
| **MARC** — Marcador (zaga de contenção) | .00 | .07 | .04 | .40 | .13 | .16 | .05 | .15 |
| **CONS** — Construtor (zaga que sai jogando) | .03 | .40 | .13 | .24 | .04 | .06 | .04 | .06 |
| **B2B** — Box-to-box (volante motor) | .07 | .18 | .08 | .20 | .12 | .22 | .07 | .06 |
| **ARM** — Armador (organizador) | .08 | .36 | .22 | .04 | .06 | .05 | .15 | .04 |
| **ALA** — Ala/Corredor (móvel pelos lados) | .10 | .12 | .12 | .07 | .26 | .17 | .12 | .04 |
| **PIVO** — Pivô (referência de área) | .30 | .17 | .09 | .05 | .03 | .06 | .12 | .18 |
| **SA** — Segundo atacante (móvel/infiltrador) | .30 | .08 | .17 | .04 | .16 | .07 | .16 | .02 |
| **GOL** — Goleiro | usa o atributo **GOL** diretamente | | | | | | | |

**B2B** com REC .22, **PIVO** com FIS .18, **MARC** com FIS .15 + REC .16: é onde o perfil "forte, marca e recompõe" do Jean pontua alto — lido como marcador/box-to-box, não meia genérico. **REC é candidato nº 1 a subir** se os jogos mostrarem que recomposição decide ainda mais — é só um parâmetro.

### 4.2 Versatilidade

`versatilidade(p) = 1 − (fit_1 − fit_2)/fit_1` (0 = especialista, ~1 = coringa). Coringa encaixa onde falta; leve bônus (Seção 11).

---

## 5. OVRs contextuais (derivados — poucos, não dez)

Uso **6** (Geral só pra exibição). Pesos sobre `[FIN, CRI, DRI, DEF, VEL, REC, MOV, FIS]`, cada linha soma 1,00:

| OVR | FIN | CRI | DRI | DEF | VEL | REC | MOV | FIS | Para que serve |
|---|---|---|---|---|---|---|---|---|---|
| **Geral** | .15 | .16 | .12 | .16 | .10 | .11 | .09 | .11 | Referência/exibição |
| **Ataque** | .32 | .15 | .17 | .00 | .10 | .03 | .15 | .08 | Poder ofensivo |
| **Defesa** | .00 | .05 | .02 | .40 | .13 | .20 | .05 | .15 | Não ser goleável |
| **Construção** | .03 | .44 | .17 | .11 | .03 | .05 | .09 | .08 | Sair jogando/circular |
| **Intensidade** | .03 | .07 | .03 | .24 | .26 | .25 | .04 | .08 | Motor/transição/pressão |
| **Mobilidade** | .10 | .07 | .12 | .04 | .28 | .15 | .19 | .05 | Movimento/espaço |

**Defesa** é o OVR de maior peso no balanceamento (Seção 11), refletindo sua prioridade.

---

## 6. Traits (comportamentos) — mínimos, reaproveitando o que já existe

Traits **não** entram no OVR; ajudam na montagem e na explicação:

- **Pé:** Canhoto / Destro / Ambidestro (restrição leve: espalhar canhotos).
- **Pivô nato** (`pivotFriendly` já existe) → preferência por ser a referência de área.
- **Joga no gol** (`isGoalkeeper` já existe) → habilita GOL e o rodízio (Seção 7).

Saem do modelo: `veloz` e `boaSaidaDeBola` viram **atributos** (VEL e CRI); `recompoePouco` vira **REC baixo** (nota explícita). **`isCaptain` é removido** e tudo associado (na prática não há líder em campo). Na migração (Seção 15) as flags de atributo semeiam os valores e somem.

---

## 7. Goleiro, rodízio gol/linha e a média por jogo

> Requisito (refinado pelo Jean): num time de 7, só quem é goleiro reveza no gol. A nota efetiva de um goleiro-apto é a média entre sua nota de goleiro (quando está no gol) e suas notas de linha nos cenários em que **cada um dos outros** goleiros-aptos vai pro gol (a posição pode mudar em cada cenário). O OVR do time é a média ao longo dos **jogos** do rodízio.

### 7.1 Nota efetiva de um goleiro-apto (média por cenário)

Seja um time com `k` jogadores aptos ao gol (`isGoalkeeper`). Para um apto `A`, há `k` cenários: em 1 deles `A` está no gol; nos outros `k−1`, cada outro apto `X` está no gol e `A` joga na linha (na melhor função disponível **naquele** cenário — pode mudar, porque o outfield muda quando `X` sai da linha).

```
efetiva(A) = (1/k) · [ GOL(A) + Σ_{X apto, X≠A} linha(A | X no gol) ]
    linha(A | X no gol) = fit(A, melhorFunçãoDisponível(A, outfield sem X))
```
- **k = 1:** `efetiva(A) = GOL(A)` — fica no gol o jogo todo; a nota de linha não conta.
- **k = 2:** `efetiva(A) = (GOL(A) + linha(A))/2`.
- **k = 3:** `efetiva(A) = (GOL(A) + linha(A|B) + linha(A|C))/3` — a estrela de goleiro "dividida por 3".
- ...o peso de gol é sempre `1/k`.

**Exemplo (k = 3):** A com GOL 84; na linha rende 72 (quando B vai pro gol) e 66 (quando C vai) → `efetiva = (84+72+66)/3 = 74`.
**Exemplo (k = 2):** A com GOL 80 e linha 60 → `70`; B com GOL 55 e linha 78 → `66,5`.

> **Time sem goleiro escalado** (`k = 0`, ou "não escalar goleiros" ligado): não há rotação — os aptos jogam **na linha o tempo todo** e a nota **GOL é desconsiderada** (goleiro emprestado — Seção 7.4).

### 7.2 Formato do rodízio e média por jogo

A sessão é um **rodízio de jogos curtos de ~10 min**, com pontuação **derrota 0 / empate 1 / vitória 3** (soma os pontos; quem tiver mais vence). O formato depende do nº de times:

| Nº de times | Confrontos | Jogos na sessão | Cada time joga |
|---|---|---|---|
| 2 | A×B, repetido | **9 jogos** | 9 (todos) |
| 3 | A×B, A×C, B×C — cada um **repetido 3×** | **9 jogos** | **6** (descansa 3; **empresta o goleiro** na folga) |
| 4 | cada time enfrenta os outros 3 | 9 jogos *(schedule exato a confirmar; não afeta o balanceamento)* | — |

Isto fecha o "6 jogos por time" de antes: com 3 times, cada equipe joga **6 dos 9** jogos e descansa 3 — e é na folga que ela empresta o goleiro pra quem está em campo. Ao longo dos jogos os goleiros aptos **revezam** o gol (7.1) e, havendo banco, os jogadores de linha revezam (7.3).

**OVR do time = média das forças ao longo dos jogos que disputa** — na prática já capturada pelas notas efetivas da 7.1 (o peso `1/k` de gol é a fração de jogos que cada goleiro passa no gol). O balanceamento quer os times **próximos em força** pra tabela de pontos ficar disputada.

### 7.3 Banco e ordem de substituição (quando houver reservas)

Há banco quando: **2 times com > 14** jogadores, ou **3 times com > 21**. Aí jogadores de linha entram e saem entre jogos. O sistema precisa (1) dar **tempo de jogo justo** e (2) escolher a **ordem de troca** que mantém as forças por jogo equilibradas — o seu *"melhor ordem pra não desbalancear"*. Formalmente: minimizar a variância das diferenças de força **por jogo** entre os times, sujeito a play-time justo. **Recomendação:** rodízio de goleiro já na **Fase 1** (barato); escalonador ótimo de banco na **Fase 2** (guloso: quem descansou reforça o lado mais fraco do próximo jogo).

### 7.4 Cobertura de gol e o caso "sem goleiro" (goleiro emprestado)
Quando o time **escala** goleiro (`k ≥ 1`):
```
coberturaGol(time) = (1/k) · Σ_{p apto} GOL(p)        // média de GOL dos aptos, peso 1/k
```
Quando o time **não** escala goleiro — 6 jogadores de linha, ou a opção "não escalar goleiros" (`neverScaleGoalkeepers`) — o goleiro é **emprestado** (boa vontade dos goleiros do adversário / do time de fora no rodízio de 3). Nesse caso a nota de goleiro é **desconsiderada**: `coberturaGol` sai do objetivo, os aptos jogam na linha o tempo todo, e o balanceamento usa **só as métricas de linha**. Não há penalidade — é um modo de jogo. (Se só *alguns* times ficam sem goleiro, o eixo `coberturaGol` é neutralizado para todos, pra não comparar quem tem com quem não tem.)

### 7.5 Exibição (liga com a Seção 13)
Ao mostrar a divisão: a formação-resumo e o **detalhamento** — quem reveza no gol e as trocas de linha ao longo dos jogos.

---

## 8. Sinergia / Química

Três camadas, da mais defensável à mais palpite.

### 8.1 Complementaridade (núcleo, matematicamente defensável)

Seu exemplo: um finalizador excelente cercado de gente que não passa **não recebe bola**. Isso é **complementaridade**, não soma. Modelo tipo Cobb-Douglas (produto):

```
PotencialAtaque(time) = (Finalização_efetiva)^α · (Criação_efetiva)^(1−α),  α ≈ 0,5
EstabilidadeDefensiva(time) = (Defesa_efetiva)^β · (Recomposição_efetiva)^(1−β),  β ≈ 0,6
```
Se `Criação_efetiva → 0`, `PotencialAtaque → 0` mesmo com finalizadores de 90 — o "você não recebe bola". Captura ~80% da sinergia **sem inventar número**.

### 8.2 Penalidades estruturais (congestionamento e dependências)

- **Congestionamento de função:** 2+ com função natural PIVO no mesmo time → penalidade.
- **Dependência de criação:** finalização alta e nenhum CRI/ARM acima do limite → penalidade.
- **Dependência de recomposição:** soma de REC abaixo do limite → penalidade (time "morre" no fim).
- **Sem saída de bola:** nenhum CONS/ARM com CRI acima do limite → penalidade.

### 8.3 Matriz de afinidade entre funções (camada opcional, heurística rotulada)

Palpite calibrável (−10 a +10), **não** ciência. Química = soma das afinidades dos pares presentes:

| Par de funções | Afinidade |
|---|---|
| Armador + Segundo atacante | +8 |
| Armador + Pivô | +7 |
| Pivô + Segundo atacante | +6 |
| Construtor + Ala | +5 |
| Marcador + Construtor | +5 |
| Box-to-box + Armador | +4 |
| Pivô + Pivô | −8 |
| Segundo atacante + Segundo atacante | −3 |
| Ala + Ala | −2 |

Recomendo **ligar só na Fase 2**, depois que 8.1 e 8.2 provarem que já resolvem a maior parte.

---

## 9. Formações e inferência da formação

### 9.1 As cinco formações (expandir de 3 → 5)

Cada uma é um **vetor de demanda de funções** (6 vagas de linha + goleiro):

| Formação | Layout | Demanda de funções (linha) |
|---|---|---|
| 2-3-1 | universal | 2×{MARC/CONS}, 3×{ARM/B2B/ALA}, 1×PIVO |
| 3-2-1 | contra adversário forte | 3×{MARC/CONS}, 2×B2B, 1×{PIVO/SA} |
| 2-2-2 | triângulos | 2×{MARC/CONS}, 2×{ARM/B2B}, 2×{SA/PIVO} |
| 1-3-2 | técnico/rápido, sem pivô | 1×CONS, 3×{ARM/B2B/ALA}, 2×SA |
| 1-4-1 | domínio de posse | 1×MARC, 4×{ARM/B2B/ALA}, 1×PIVO |

(O app hoje tem só 2-2-2, 2-3-1 e 1-4-1. Faltam 3-2-1 e 1-3-2.)

### 9.2 Inferir a formação a partir do elenco (o "pulo do gato")

```
para cada formação f:
    resolve atribuição jogadores→vagas de f que MAXIMIZA Σ fit(p, vaga)   // matching
      (só pares permitidos pela matriz de improviso: DEFENSOR nunca em vaga de ataque, ATACANTE nunca em defesa)
    scoreForm(f) = Σ fit − penalidadesHard(f) − penalidadesEstruturais(f)
formaçãoDoTime = argmax_f scoreForm(f)
```
Matching bipartido (jogador × vaga); com 6 vagas resolve ótimo por Hungarian ou guloso. É o que a literatura de *team formation* faz (Springer 2023; revisão OR — Seção 17), adaptado ao Fut7. **A composição força o sistema tático.**

---

## 10. Restrições: duras, suaves, déficit e compensação

**Hard (violar = penalidade alta):** **matriz de improviso** (DEFENSOR nunca ataca, ATACANTE nunca defende, MEIA em qualquer — Seção 4, vale mesmo contra os atributos); ≥ 1 construtor; ≥ 1 marcador; formações com pivô = exatamente 1 PIVO/falso-9; teto de atacantes (`MAX_ATTACKERS = 4` vira teto por função ofensiva). (Cobertura de gol **não** é dura: sem goleiro escalado, é emprestado e a nota é desconsiderada — 7.4.)

**Soft (desejáveis; diferença a minimizar):** velocidade média, criação média, intensidade (REC), distribuição de canhotos/destros, ≤ 2 dribladores, ≤ 2 velocistas.

**Déficit por requisito:** `deficit_req(time) = max(0, minimo_req − valor_req(time))`.
**Correção (evita bug real):** meça relativo ao **melhor possível dado o elenco**, não a um mínimo absoluto — senão penaliza os dois times por algo que o grupo inteiro não tem (foi o que já quebrou o motor; o `spareCapacity` do goleiro existe por isso):
```
minimo_req_efetivo = min(minimo_req, melhorValorAlcançável(req, elenco))
```
**Compensação (handicap):** déficit inevitável e assimétrico já é compensado pelo custo (Seção 11) se as métricas forem medidas em déficit relativo e agregadas por diferença entre times.

---

## 11. Função-objetivo e índice de equilíbrio

Generaliza o `equilibrium = variância(médias)` atual para **variância multi-métrica ponderada**, com cada métrica como **média por jogo** (7.2):

```
Para cada time t:  M(t) = [ Geral, Ataque, Defesa, Intensidade, PotencialAtaque,
                            EstabilidadeDefensiva, Química, coberturaGol ]

Custo(divisão) =  Σ_d  w_d · Var_t( M_d(t) )        // desequilíbrio entre times
              +  Σ_t  Penalidades_hard(t)           // restrições duras
              −  γ · Σ_t versatilidadeMédia(t)      // leve prêmio a elencos flexíveis

Objetivo: minimizar Custo.
```

Pesos `w_d` default (calibráveis), prioridade na **defesa**:
`w_Defesa = 0,28`, `w_EstabilidadeDefensiva = 0,15`, `w_coberturaGol = 0,12`, `w_Geral = 0,15`, `w_Ataque = 0,12`, `w_PotencialAtaque = 0,08`, `w_Intensidade = 0,06`, `w_Química = 0,04`. (Somam 1,00.)

**Backward-compat:** com `w_Geral = 1` e o resto 0, `Custo` = o `equilibrium` atual. O modelo novo **contém** o antigo — dá pra migrar ligando peso por peso e comparando com os testes existentes.

---

## 12. Algoritmo (evolução do motor atual, sem GA/SA)

Mantém o esqueleto de `generateTeams.ts` e adiciona:
1. **Construção gulosa randomizada** (já existe): distribui respeitando mínimos, com ruído.
2. **Avaliação multi-métrica**: troca `variância(overall)` pelo `Custo` (Seção 11, médias por jogo).
3. **Busca local por trocas (novo, alto ganho):** `repita: ache a troca (p_i↔p_j entre times) que mais reduz Custo; aplique se reduz; senão pare`. O(times²·jogadores²) por passo — trivial pra ≤ 24 jogadores.
4. **Multi-restart + dedupe (já existe):** devolve as top-N divisões distintas (as "propostas").

**Por que não GA/SA?** Para 2–4 times e ≤ 24 jogadores o espaço é pequeno; guloso + troca de pares com vários reinícios chega perto do ótimo em milissegundos. GA/SA = mais parâmetros, zero ganho.

---

## 13. Explicabilidade — "por que este time?" e como jogar

Estende `observations.ts` + `FieldMap.tsx`. Para cada divisão escolhida, um **relatório por time**:

- **Como o time deve se comportar (texto tático):** parágrafo curto com a melhor forma de jogar dado o elenco. Ex.: *"Time forte na dividida e na recomposição, fraco em velocidade → jogue compacto, force o jogo pelo meio e evite corrida pras costas; segure a bola no pivô e suba a linha junto."*
- **Quatro mapinhas de posição** (evolui o `FieldMap.tsx`, mais preciso) — realiza a ideia de formação **dinâmica** (a forma muda por fase; ref. de formações dinâmicas, Seção 17):
  1. **Geral** — formação-base inferida.
  2. **Defendendo** — como o time se fecha sem a bola (linha recuada, quem marca quem).
  3. **Pressionando a saída** — posições na pressão alta à saída de bola adversária.
  4. **Fase final do ataque** — posições no último terço (quem sobe, quem dá largura, quem segura).
- **Escalação por função** com o fit de cada um ("Jean → Marcador, fit 74; 2ª opção Box-to-box, 69").
- **Observações individuais** ("Jean: segure a dividida e a bola de costas; não é o cara pra sair no pique"; "Fulano: veloz, ataque o espaço nas costas").
- **Destaques de química** (complementaridade e pares fortes/fracos).
- **Tabela de equilíbrio**: Ataque/Defesa/Intensidade/coberturaGol de cada time, lado a lado, com o gap.
- **Alertas de restrição**: "Time B sem saída de bola clara".

---

## 14. Aprendizado pós-jogo (honesto e modesto)

> Aqui é onde eu mais te contrario. "Ajustar em tempo real e aprender com o resultado" **não** é viável do jeito ingênuo. Amostra minúscula, ruído gigante, time muda toda semana. Um 6×4 não prova "faltou armador".

### 14.1 Substrato: log de partidas
Registrar cada jogo: divisão usada (quem em cada time/função), placar/pontos, e **feedback estruturado** (não texto livre): caixas como "sofremos por trás", "não saímos jogando", "faltou gol", "cansamos no fim", ligadas a time/jogador.

### 14.2 Ajuste de "forma" tipo Elo/Glicko (com encolhimento forte)
Não se ajustam os 8 atributos. Mantém-se **um escalar de forma por jogador**, `formAdj`:
```
esperado(A vs B) = 1 / (1 + 10^(-(ForçaA − ForçaB)/D))
formAdj(p) ← formAdj(p) + K · share(p) · (resultado − esperado)      // K pequeno, teto ±2/jogo
OVR_efetivo(p) = OVR_prior(p) + λ · formAdj(p)                        // λ pequeno (encolhimento)
```
Exige ≥ 5 jogos antes de confiar; RD tipo Glicko cresce se o jogador some. Reduz subjetividade ao longo de **muitos** jogos — não aprende num jogo.

### 14.3 Calibração manual assistida (o "ajuste em tempo real" honesto)
Quando você postar "o time X sofreu com bola aérea e não tinha saída", eu **não** mexo sozinho nas notas. Eu (1) mapeio pra métricas/atributos (aéreo→FIS/DEF de fulano; saída→CRI/CONS do time), (2) **proponho** um ajuste pequeno com justificativa, (3) você aprova; fica num log reversível.

### 14.4 Limites que eu declaro na cara
Não dá pra atribuir causa tática confiável com poucos jogos; placar é ruidosíssimo; todo ajuste automático é encolhido e capado; controle final é humano.

---

## 15. Encaixe no código atual (mapa de mudanças)

| Arquivo | Mudança |
|---|---|
| `src/domain/types.ts` | `Player` ganha `attributes: { FIN,CRI,DRI,DEF,VEL,REC,MOV,FIS }` (0–100) e `gk: number\|null`. `rating` mantida (retrocompat/exibição), derivada do Geral. `naturalRole`, `top2` calculados. **Remover `isCaptain`**. |
| `src/domain/playerAttributes.ts` | Catálogo: labels, defaults (50), presets rápidos (Alta/Média/Baixa) p/ REC, `clampAttr`, `ALL_ATTRIBUTE_KEYS`, pesos de OVR e de função (config calibrável). |
| `src/domain/formations.ts` | Adicionar 3-2-1 e 1-3-2; trocar `chooseFormation(contagem)` por `inferFormation(time)` via matching (Seção 9). |
| `src/engine/` (novo `scoring.ts`) | `fit(p,r)`, `funçõesPermitidas`, OVRs, complementaridade, química, `efetiva` do goleiro (7.1), `teamMetrics`. |
| `src/engine/generateTeams.ts` | Trocar `variância(overall)` por `Custo` (Seção 11); busca local por trocas (Seção 12); rodízio de goleiro. **Preservar a matriz de improviso** (hoje em `arrangeTeam`/`pickImprovisedAttacker`) como `funçõesPermitidas`. **Remover `enforceCaptainPerTeam`/capitão**. |
| `src/engine/observations.ts` | Relatório "por que este time": texto tático, observações individuais, química, tabela de equilíbrio (Seção 13). |
| `src/store/usePlayerStore.ts` + `migration.ts` | Bump `version 4 → 5`; `normalizePlayer` semeia atributos de estrela+posição+flags (15.1); default 50. **Remover `isCaptain`** e a opção de capitão. |
| `src/features/players/PlayerForm.tsx` | 8 sliders + GOL + presets de REC + traits, lidos dos metadados. **Tirar o checkbox de capitão.** |
| `src/features/simulation/*` (+ `FieldMap.tsx`) | Função inferida, tabela de equilíbrio, **texto tático** e **4 mapinhas** (Geral / Defendendo / Pressão à saída / Fase final) mais precisos. Tirar ícone de capitão. |
| Testes (Vitest) | Manter cenários existentes (com `w_Geral=1` devem passar iguais); adicionar testes de fit/portão de posição/goleiro-por-cenário/inferência de formação. |

### 15.1 Semente da migração (estrela → atributos)
`b = rating/5` (0..1). Para cada atributo: `attr = clamp0-100( 100·b + offset[posição][attr] + offset[trait] )`.

| offset | FIN | CRI | DRI | DEF | VEL | REC | MOV | FIS |
|---|---|---|---|---|---|---|---|---|
| DEFENSOR | −18 | +2 | −10 | +12 | 0 | +6 | −8 | +8 |
| MEIA | −6 | +8 | +2 | −2 | 0 | +6 | +4 | 0 |
| ATACANTE | +14 | −6 | +6 | −16 | +4 | −6 | +10 | +2 |
| trait `veloz` | | | | | +15 | | | |
| trait `boaSaidaDeBola` | | +12 | | | | | | |
| trait `recompoePouco` | | | | −4 | | **−15** | +6 | |
| trait `pivotFriendly` | +6 | +4 | | | | | −4 | +8 |

`GOL = isGoalkeeper ? clamp(100·b + 5) : null`. Depois da migração, **o grupo revisa REC, FIS e GOL manualmente**.

---

## 16. Plano de fases e decisões

**Fase 1 (MVP):** 8 atributos + GOL; migração v5 (+ remover `isCaptain`); `fit`/função natural com **portão da posição**; 5 formações + inferência; custo multi-métrica + busca local; **rodízio de goleiro** (média por cenário); complementaridade (8.1) + penalidades estruturais (8.2); relatório "por que este time" com **texto tático + 4 mapinhas + observações individuais**. **Sem** matriz de afinidade, **sem** Elo, **sem** escalonador ótimo de banco.

**Fase 2:** escalonamento ótimo de banco; matriz de afinidade (8.3); soft constraints na UI; refinos de química.

**Fase 3:** log de partidas + ajuste de forma Elo/Glicko encolhido + calibração manual assistida + analytics.

**Decisões:**
1. **Ancoragem da escala:** default "50 = mediano do grupo" (recomendado), ajustável.
2. **Rodízio (resolvido):** jogos de 10 min, pontos 3/1/0. 2 times → 9 jogos (cada um joga 9). 3 times → 9 jogos totais (3 confrontos × 3), cada time joga 6 e descansa 3 (empresta goleiro na folga). 4 times → 9 jogos *(schedule exato a confirmar; não afeta o balanceamento da Fase 1)*.
3. **Gatilho de banco:** 2 times > 14 e 3 times > 21 — confere?
4. **Escalonador de banco:** Fase 2 (recomendado).
5. **Matriz de afinidade (8.3):** Fase 2 (recomendado).

---

## 17. Referências (verificadas)

Todas conferidas na web (jul/2026). **Correção honesta:** eu havia marcado a "Optimal Selection... (2026)" como possível alucinação pela data futura — **estava errado**: é real (arXiv 2303.12385, 2023; o "2026" é o ano da edição no periódico).

1. **Player Chemistry: Striving for a Perfectly Balanced Soccer Team** — Bransen & Van Haaren (SciSports/KU Leuven), MIT Sloan 2020. arXiv:2003.01712. *(Base da Seção 8, rebaixada a heurística.)*
2. **Intelligent team formation and player selection: a data-driven approach for football coaches** — *Applied Intelligence* (Springer), 2023. DOI 10.1007/s10489-023-05150-x. Matching bipartido (Hungarian). *(Base da Seção 9.)*
3. **Operations Research Contributions for Football Teams Formation: A Systematic Review** — Salles & Hora, *Pesquisa Operacional* (SciELO), 2019. 1.637 artigos, 12 selecionados. *(Base das Seções 10–11.)*
4. **Optimal Selection of the Starting Lineup for a Football Team** — arXiv:2303.12385 (2023; ed. periódico 2026). LASSO + logística multinomial + GRASP; efeito de combinações. *(Base das Seções 8/11.)*
5. **Statistical analysis of team formation and player roles in football** — arXiv:2502.03342 (2025). Formações **dinâmicas**, papéis mudam no jogo. *(Base das Seções 9 e 13.)*
6. **Role/perfil por clustering** — Stats Perform; "Distinguishing Between Roles of Football Players" (arXiv:1809.05173); PlayeRank (arXiv:1802.04987). *(Base da Seção 3.2.)*

---

*Fim do design v2 (rev. 0.4). Aprovado o modelo, a Fase 1 começa pelo core (domain + engine, testável) e depois a UI (mapinhas + form).*
