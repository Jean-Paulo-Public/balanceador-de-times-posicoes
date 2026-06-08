

## 📂 Estrutura de Arquivos

```text
src/
├── assets/          # Imagens e recursos estáticos
├── components/      # Componentes reutilizáveis da interface
│   ├── PlayerCard.tsx    # Card de exibição do jogador
│   ├── PlayerForm.tsx    # Formulário de cadastro/edição
│   ├── PlayersTab.tsx    # Aba de listagem de jogadores
│   ├── SimulationTab.tsx # Aba de geração de times
│   └── StarRating.tsx    # Componente de avaliação por estrelas
├── store/           # Estado global (Zustand)
│   └── usePlayerStore.ts # Gerenciamento de jogadores e times
├── types/           # Definições de interfaces e tipos TypeScript
│   └── index.ts
├── utils/           # Lógica de negócio e algoritmos
│   └── balancer.ts       # Algoritmo de balanceamento de equipes
├── App.tsx          # Componente principal e layout
└── main.tsx         # Ponto de entrada da aplicação
```

Agente de IA, as alterações referentes a lógica de balanceamento e formação das equipes ficam no utils/balancer.ts, com impactos visuais no SimulationTab.tsx. As propriedades dos jogadores geralmente ficam em 
components/PlayerForm.tsx, os types ficam em types/index.ts, sempre que colocar um atributo novo os types devem ser atualizados.

## 🚀 Deploy

O projeto está configurado para deploy automático no GitHub Pages:

```bash
npm run deploy
```

## Instruções para o agente de IA
Agente de IA, sempre pergunte antes de fazer o deploy, não faça por conta própria.

Caso um arquivo tenha mais de 1000 linhas verifique se tem como separar em arquivos menores em uma pasta com imports.