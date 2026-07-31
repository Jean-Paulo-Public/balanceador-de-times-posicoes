import { useState } from 'react';
import { PlayersTab } from './features/players/PlayersTab';
import { SimulationTab } from './features/simulation/SimulationTab';
import { WikiTab } from './features/wiki/WikiTab';
import { Users, Trophy, BookOpen } from 'lucide-react';

function App() {
  const [activeTab, setActiveTab] = useState<'players' | 'simulation' | 'wiki'>('players');

  return (
    <div className="app-container">
      {activeTab === 'players' && <PlayersTab />}
      {activeTab === 'simulation' && <SimulationTab />}
      {activeTab === 'wiki' && <WikiTab />}

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
          <div
            className={`nav-item ${activeTab === 'wiki' ? 'active' : ''}`}
            onClick={() => setActiveTab('wiki')}
          >
            <BookOpen size={24} />
            <span>Como Funciona</span>
          </div>
        </div>
      </nav>
    </div>
  );
}

export default App;
