
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

O equilíbrio da defesa entre os times (para nenhum time ficar "goleável") é calculado por
`defensiveContribution()` em `scoring.ts` e agregado por time em `generateTeams.ts`
(`defensiveOverall`). Esse é o critério de ordenação PRIMÁRIO dos cenários simulados — só usa o
equilíbrio geral como critério secundário/desempate. Ao alterar pesos ou critérios de ordenação,
rode `npm run test` (Vitest) para garantir que os cenários difíceis em
`src/engine/generateTeams.test.ts` continuam passando, e ajuste os limites do teste com dados
reais se o comportamento mudar de propósito.

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

## 🚀 Deploy

O projeto está configurado para deploy automático no GitHub Pages:

```bash
npm run deploy
```

Agente de IA, sempre pergunte antes de fazer o deploy, não faça por conta própria.
