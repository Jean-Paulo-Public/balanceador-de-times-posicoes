import { useState } from 'react';
import { PlayersTab } from './features/players/PlayersTab';
import { SimulationTab } from './features/simulation/SimulationTab';
import { Users, Trophy } from 'lucide-react';

function App() {
  const [activeTab, setActiveTab] = useState<'players' | 'simulation'>('players');

  return (
    <div className="app-container">
      {activeTab === 'players' ? <PlayersTab /> : <SimulationTab />}

      <nav className="bottom-nav">
        <div className="bottom-nav-inner">
          <div
            className={`nav-item ${activeTab === 'players' ? 'active' : ''}`}
            onClick={() => setActiveTab('players')}
          >
            <Users size={24} />
            <span>Jogadores</span>
          </div>
          <div
            className={`nav-item ${activeTab === 'simulation' ? 'active' : ''}`}
            onClick={() => setActiveTab('simulation')}
          >
            <Trophy size={24} />
            <span>Simular Partidas</span>
          </div>
        </div>
      </nav>
    </div>
  );
}

export default App;
