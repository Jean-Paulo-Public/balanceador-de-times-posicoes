# ⚽ Balanceador de Times

Uma aplicação web moderna para organizar partidas esportivas, permitindo cadastrar jogadores com diferentes níveis de habilidade e posições, e gerar times equilibrados automaticamente — com foco especial em manter a defesa dos times equilibrada entre si.

## 🚀 Funcionalidades

- **Cadastro de Jogadores**: nome, posição (Defensor, Meia ou Atacante), 3 atributos ofensivos + 3 defensivos por posição, e uma nota geral de recomposição defensiva (peso alto no equilíbrio).
- **Improviso controlado**: Defensor e Atacante só improvisam como Meia; o Meia improvisa em qualquer posição.
- **3 sistemas táticos**: Ofensiva (2-2-2), Equilibrada (1-4-1) e Defensiva (2-3-1).
- **Algoritmo de Equilíbrio com foco na defesa**: simula milhares de escalações e escolhe a que deixa a força defensiva mais parecida entre os times (para não ter time goleável), sem abrir mão do equilíbrio geral.
- **Testes automatizados** (Vitest) cobrindo cenários fáceis e difíceis (poucos defensores, poucos meias, poucos atacantes, elenco desnivelado).
- **Interface Responsiva** e **Persistência Local** (localStorage via Zustand), com migração automática de dados de versões antigas do app.

## 🛠️ Tecnologias Utilizadas

- [React 19](https://react.dev/) — Biblioteca para interfaces de usuário.
- [TypeScript](https://www.typescriptlang.org/) — Tipagem estática.
- [Vite](https://vitejs.dev/) — Bundler.
- [Vitest](https://vitest.dev/) — Testes automatizados.
- [Zustand](https://zustand-demo.pmnd.rs/) — Estado global com persistência.
- [Lucide React](https://lucide.dev/) — Ícones.

## 📂 Estrutura de Arquivos

```text
src/
├── domain/              # Modelo de dados puro (sem lógica de negócio pesada)
│   ├── types.ts             # Player, Team, Position, FormationType, SimulationResult...
│   ├── playerAttributes.ts  # Metadados dos atributos (labels, defaults, normalização)
│   └── formations.ts        # As 3 formações táticas e suas vagas
├── engine/              # Motor de balanceamento (lógica pura, testável)
│   ├── scoring.ts           # Fórmulas de nota por papel + "força defensiva" do jogador
│   ├── improvisation.ts     # Matriz de improviso e rótulos de papel
│   ├── combinatorics.ts     # Combinações (usado para escolher goleiros)
│   ├── generateTeams.ts     # Algoritmo principal de geração/equilíbrio de times
│   ├── testFixtures.ts      # Geradores de elenco para os testes (fácil/difícil)
│   └── generateTeams.test.ts# Suíte de testes de equilíbrio
├── store/               # Estado global (Zustand)
│   ├── usePlayerStore.ts    # Jogadores, opções, persistência
│   └── migration.ts         # Migração do modelo antigo (4 posições) para o atual
├── features/
│   ├── players/             # Cadastro de jogadores (form, card, lista, import/export)
│   └── simulation/           # Geração e visualização das escalações
├── components/           # Componentes de UI genéricos e reutilizáveis (StarRating)
├── App.tsx / main.tsx    # Ponto de entrada
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

3. Rode os testes automatizados do algoritmo de balanceamento:
   ```bash
   npm run test
   ```

4. Para build de produção:
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

Sempre que for sugerir ou fazer mudanças leia primeiro o "instructions.md"
