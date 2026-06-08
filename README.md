# ⚽ Balanceador de Times

Uma aplicação web moderna para organizar partidas esportivas, permitindo cadastrar jogadores com diferentes níveis de habilidade e posições, e gerar times equilibrados automaticamente.

## 🚀 Funcionalidades

- **Cadastro de Jogadores**: Adicione jogadores com nome, nível de habilidade (1 a 5 estrelas) e posição.
- **Gerenciamento de Lista**: Edite ou remova jogadores facilmente.
- **Algoritmo de Equilíbrio**: Gera times balanceados levando em conta a média de nível técnico.
- **Interface Responsiva**: Design moderno e adaptável para dispositivos móveis e desktop.
- **Persistência Local**: Seus dados são salvos no navegador para não perdê-los ao recarregar.

## 🛠️ Tecnologias Utilizadas

- [React 19](https://react.dev/) - Biblioteca para interfaces de usuário.
- [TypeScript](https://www.typescriptlang.org/) - Tipagem estática para maior segurança.
- [Vite](https://vitejs.dev/) - Bundler rápido para desenvolvimento.
- [Zustand](https://zustand-demo.pmnd.rs/) - Gerenciamento de estado leve e eficiente.
- [Tailwind CSS](https://tailwindcss.com/) - Estilização moderna via utilitários.
- [Lucide React](https://lucide.dev/) - Biblioteca de ícones.

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

## 🔧 Como Executar

1. Instale as dependências:
   ```bash
   npm install
   ```

2. Inicie o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```

3. Para build de produção:
   ```bash
   npm run build
   ```

## 🚀 Deploy

O projeto está configurado para deploy automático no GitHub Pages:

```bash
npm run deploy
```

---
Desenvolvido para facilitar a organização da sua pelada semanal! 🏃‍♂️💨

