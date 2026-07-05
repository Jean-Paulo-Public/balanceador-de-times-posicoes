
## 📂 Estrutura de Arquivos

```text
src/
├── domain/          # Modelo de dados: types.ts, playerAttributes.ts (labels/defaults), formations.ts (3 sistemas)
├── engine/          # Motor de balanceamento: scoring.ts, improvisation.ts, generateTeams.ts (+ testes)
├── store/           # Zustand: usePlayerStore.ts, migration.ts (migra dados antigos)
├── features/
│   ├── players/         # PlayerForm.tsx, PlayerCard.tsx, PlayersTab.tsx, importExport.ts
│   └── simulation/      # SimulationTab.tsx, FieldMap.tsx
├── components/       # UI genérica (StarRating.tsx)
├── App.tsx / main.tsx
```

## Instruções para o agente de IA

Agente de IA, as alterações referentes à lógica de balanceamento e formação das equipes ficam em
`src/engine/` (principalmente `generateTeams.ts` e `scoring.ts`) e em `src/domain/formations.ts`
(vagas de cada sistema tático), com impacto visual em `src/features/simulation/SimulationTab.tsx`
e `FieldMap.tsx`.

As propriedades e atributos de jogador ficam centralizados em `src/domain/playerAttributes.ts`
(metadados/labels) e `src/domain/types.ts` (o tipo `PlayerStats`). Sempre que adicionar um atributo
novo, atualize os dois arquivos — e adicione o atributo em `ALL_ATTRIBUTE_KEYS` para que o
cadastro rápido e a normalização de stats continuem funcionando. O formulário em
`src/features/players/PlayerForm.tsx` lê esses metadados automaticamente, então normalmente não
precisa ser editado ao adicionar um atributo.

Modelo atual: 3 posições (`DEFENSOR`, `MEIA`, `ATACANTE`). Defensor e Atacante só improvisam como
Meia; o Meia improvisa em qualquer posição. Essa regra vive em `src/engine/improvisation.ts`
(`isImprovisationAllowed`) — qualquer mudança nela deve ser espelhada em `scoring.ts` (as funções
`scoreDefensorRole`/`scoreMeiaRole`/`scoreAtacanteRole` precisam ter um branch para cada posição
que a matriz de improviso permite, senão o jogador cai numa nota neutra fixa).

O campo `Player.pivotFriendly` (só relevante para Meias) afeta a escolha de QUEM improvisa em duas
situações, ambas implementadas em `selectBestPlayerIndex` (`src/engine/generateTeams.ts`), que usa
um esquema de "buckets" com prioridade rígida (nativo > forçado > fallback comum > último recurso):

- **Meia pivô virando Atacante**: se a vaga de Atacante só pode ser preenchida por improviso e o
  time AINDA NÃO tem nenhum Atacante de origem (`hasNativeAtacante`), o Meia pivô disponível é
  escalado ali com prioridade ABSOLUTA (`forcePivotForAtacante`), mesmo que outro Meia tivesse nota
  melhor — isso pode derrubar o overall do time de propósito, porque é o que aconteceria na prática
  dado o perfil desse jogador. Se o time JÁ tem pelo menos um Atacante de origem, o pivô só ganha um
  bônus pequeno (`getImprovisationBonus` em `improvisation.ts`, +0.4 numa escala de 6 estrelas) que
  não deve superar uma diferença real de nível.
- **Meia pivô virando Defensor**: o motor EVITA escalar um Meia pivô na defesa — ele só entra ali
  como último recurso, quando não sobra nenhum outro Meia disponível pro fallback daquela vaga.

O rótulo exibido quando o pivô joga de Atacante passa a ser "Atacante (pivô)" em vez de "Atacante
(improvisado)" (`getRoleLabels`, parâmetro `isPivotFit`).

Um jogador nunca é escalado como Goleiro e como Defensor ao mesmo tempo (ou é um, ou é outro): quem
vira goleiro sai do pool de jogadores de linha daquela simulação. Quando um time não tem goleiro
nativo escalado (`hasGkCoverage` retorna falso — nem goleiro titular, nem ninguém isGoalkeeper na
linha), o motor dá um bônus (`GK_BACKUP_BONUS`, também em `selectBestPlayerIndex`) pra priorizar um
jogador que também sabe jogar no gol numa das vagas de Defensor desse time — na prática, isso deixa
o time preparado pra ter alguém cobrindo o gol se precisar (inclusive pra emprestar pro time que
estiver de fora, no formato de rodízio com 3 times).

O equilíbrio da defesa entre os times (para nenhum time ficar "goleável") é calculado por
`defensiveContribution()` em `scoring.ts` e agregado por time em `generateTeams.ts`
(`defensiveOverall`). Esse é o critério de ordenação PRIMÁRIO dos cenários simulados — só usa o
equilíbrio geral como critério secundário/desempate. Ao alterar pesos ou critérios de ordenação,
rode `npm run test` (Vitest) para garantir que os cenários difíceis em
`src/engine/generateTeams.test.ts` continuam passando, e ajuste os limites do teste com dados
reais se o comportamento mudar de propósito.

As "Observações do Time" (pontos de atenção exibidos na tela de simulação) são geradas por
`generateTeamObservations()` em `src/engine/observations.ts`, a partir do `Team` já montado — é
puramente diagnóstico/texto, não influencia o balanceamento em si. Novas heurísticas de observação
devem ser adicionadas ali, e exibidas em `SimulationTab.tsx` (bloco "Observações do Time").

Sempre que adicionar um cenário de teste novo, use os geradores de elenco em
`src/engine/testFixtures.ts` como base.

Caso um arquivo tenha mais de 1000 linhas, verifique se há como separar em arquivos menores em uma
pasta com imports.

### Build/deploy nunca pode depender do Vitest estar instalado

`vite.config.ts` e `tsconfig.app.json` (o projeto usado por `tsc -b` no script `build`) NUNCA devem
importar nada de `vitest` nem incluir arquivos `*.test.ts`. A config de testes vive isolada em
`vitest.config.ts`, e os arquivos de teste (`src/**/*.test.ts`) são excluídos explicitamente em
`tsconfig.app.json` (`"exclude"`). Isso existe porque já quebrou o `npm run deploy` uma vez: o
`vite.config.ts` importava de `'vitest/config'` e o `tsc -b` type-checava o arquivo de teste, então
se o `vitest` não estivesse instalado (por exemplo, alguém rodou o build sem ter dado `npm install`
depois de uma mudança no `package.json`), o build — e por consequência o deploy — quebrava. Antes de
mexer nessas configs de novo, rode `npm run build` num ambiente limpo (ou pelo menos releia esse
parágrafo) para não reintroduzir o acoplamento.

### Depois de qualquer mudança grande, valide antes de devolver

Agente de IA, depois de qualquer alteração estrutural (mexer em `package.json`, `tsconfig*.json`,
`vite.config.ts`, ou reorganizar pastas), rode nessa ordem antes de considerar a tarefa concluída:
`npm run build` (o mesmo comando que roda no `predeploy`), `npx tsc -b --noEmit`, `npm run lint` e
`npm run test`. Se o ambiente onde você está rodando essas checagens não for confiável (ex.: sync
de arquivo instável, node_modules incompleto), valide numa cópia limpa antes de reportar sucesso —
não basta o código parecer certo, o `npm run build` real precisa passar.

**Cuidado ao sincronizar para uma cópia limpa com `rsync`:** se você (agente de IA) copiar o projeto
para outro diretório para validar (ex.: `rsync -a origem/ destino/`), use sempre a flag
`--checksum`. Sem ela, o `rsync` decide se copia um arquivo comparando só tamanho e data de
modificação — e nesse ambiente (pasta do Windows montada num sandbox Linux) já aconteceu de um
arquivo editado ficar com o mesmo tamanho/mtime aparente do arquivo antigo, fazendo o `rsync` pular
a cópia e a validação rodar silenciosamente contra código desatualizado (ou corrompido). O comando
seguro é `rsync -a --checksum --delete --exclude node_modules --exclude dist --exclude .git origem/ destino/`.

**Cuidado com corrupção/truncamento ao editar arquivos nessa pasta montada do Windows:** as
ferramentas de escrita de arquivo já truncaram arquivos no meio (cortando o resto do conteúdo sem
avisar) várias vezes nesse projeto — inclusive `.ts`, `.tsx`, `.css` e este próprio `instructions.md`.
Pior: já aconteceu de uma leitura logo em seguida mostrar o conteúdo NOVO (correto) enquanto o
arquivo de fato salvo no disco continuava com o conteúdo VELHO/truncado — ou seja, não dá pra confiar
cegamente numa única leitura de confirmação. Depois de qualquer edição importante nessa pasta:

1. Verifique o arquivo final por fora da ferramenta de edição (ex.: `wc -c arquivo` + `tail -c 200
   arquivo` via shell) — o arquivo não pode terminar no meio de uma expressão.
2. Repita a checagem depois de uma pequena espera (2-5s) — já aconteceu do arquivo aparecer certo
   na hora e depois "voltar" para uma versão antiga.
3. Se desconfiar de corrupção, escreva o conteúdo completo num arquivo NOVO (nome ainda não usado
   nessa sessão) numa pasta de rascunho, confirme que ele está correto por fora da ferramenta, e só
   então copie por cima do arquivo final (ex.: via `cp` no shell). Reescrever em cima do mesmo nome
   repetidas vezes é o cenário onde a corrupção mais aparece.

## 🚀 Deploy

O projeto está configurado para deploy automático no GitHub Pages:

```bash
npm run deploy
```

Agente de IA, sempre pergunte antes de fazer o deploy, não faça por conta própria.
