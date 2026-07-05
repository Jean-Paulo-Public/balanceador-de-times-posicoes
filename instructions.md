
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

O campo `Player.pivotFriendly` (só relevante para Meias) dá um pequeno bônus de pontuação — ver
`getImprovisationBonus` em `src/engine/improvisation.ts` — quando esse Meia disputa uma vaga de
Atacante por improviso, para priorizá-lo sobre outro Meia de nível parecido. O bônus é
propositalmente pequeno (não deve superar uma diferença real de nível) e só se aplica ao par
Meia→Atacante. O rótulo exibido nesse caso passa a ser "Atacante (pivô)" em vez de "Atacante
(improvisado)" (`getRoleLabels`, parâmetro `isPivotFit`).

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
avisar) várias vezes nesse projeto — inclusive `.ts`, `.tsx` e `.css`. Depois de qualquer edição
importante, verifique o arquivo final com algo como `wc -c arquivo` + `tail -c 200 arquivo` (o
arquivo não pode terminar no meio de uma expressão) antes de confiar que a edição funcionou. Na
dúvida, reescreva o arquivo inteiro em vez de aplicar um diff pequeno.

## 🚀 Deploy

O projeto está configurado para deploy automático no GitHub Pages:

```bash
npm run deploy
```

Agente de IA, sempre pergunte antes de fazer o deploy, não faça por conta própria.
