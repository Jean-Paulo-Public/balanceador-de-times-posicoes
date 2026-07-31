// Mini-wiki (Fase 7): explica, em português simples, as 7 posições de linha,
// os 4 sistemas táticos, a lista ordenada de preferência, o BOX_TO_BOX e o
// rodízio de goleiro. Texto pra jogador de pelada ler, não jargão de código.

import { ALL_LINE_POSITIONS, LINE_POSITIONS } from '../../domain/positions';
import { ALL_SYSTEMS, SYSTEMS } from '../../engine';
import { SystemFieldDiagram } from './SystemFieldDiagram';
import styles from './SystemFieldDiagram.module.css';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass-panel" style={{ padding: '16px 18px', marginBottom: 16 }}>
      <h3 style={{ margin: '0 0 10px' }}>{title}</h3>
      {children}
    </div>
  );
}

export function WikiTab() {
  return (
    <div className="animate-fade-in">
      <div className="header-top">
        <h1>Como Funciona</h1>
        <p>As posições, os sistemas táticos e as regras do balanceador, explicados</p>
      </div>

      <div style={{ padding: '20px' }}>
        <Section title="As 7 posições de linha">
          <p style={{ marginTop: 0, fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
            Todo jogador de linha (fora o goleiro) encaixa numa dessas 7 posições. O balanceador olha os 9 atributos
            do jogador (Finalização, Criação, Drible, Defesa, Velocidade, Recomposição Defensiva, Intensidade,
            Mobilidade, Físico) e calcula o quão bem ele encaixa em cada uma.
          </p>
          <div style={{ display: 'grid', gap: 10 }}>
            {ALL_LINE_POSITIONS.map((pos) => (
              <div key={pos}>
                <strong>{LINE_POSITIONS[pos].label}</strong>
                <p style={{ margin: '2px 0 0', fontSize: '0.88rem', lineHeight: 1.5 }}>{LINE_POSITIONS[pos].help}</p>
              </div>
            ))}
          </div>
          <p style={{ fontSize: '0.88rem', lineHeight: 1.5, marginTop: 12 }}>
            <strong>O par mais importante: Ala vs Volante.</strong> Os dois jogam na mesma faixa do campo, mas de
            jeitos opostos. O <strong>Ala</strong> constrói jogo <em>driblando</em> — ele não é um bom passador, ele
            resolve no 1×1 e cruza. O <strong>Volante</strong> é o oposto: ele constrói por <em>passe</em>, é o cara
            da saída de bola, e não é um driblador. Um jogador com drible bom e passe fraco vira Ala; um com passe bom
            e drible fraco vira Volante — o sistema nunca confunde os dois.
          </p>
          <p style={{ fontSize: '0.88rem', lineHeight: 1.5, marginTop: 12 }}>
            <strong>Recomposição Defensiva x Intensidade — duas coisas diferentes.</strong> Antes existia um único
            atributo de "recomposição" que misturava tudo. Agora são dois: <strong>Recomposição Defensiva</strong> é
            só o jogador voltando pra marcar — o quanto ele se sacrifica no recuo, sem entrar velocidade na conta
            (jogador rápido às vezes "faz corpo mole" na volta, então isso não deveria inflar a nota). Já{' '}
            <strong>Intensidade</strong> é sobre pressionar lá na FRENTE — no meio-campo e no ataque, marcando a saída
            de bola do adversário no campo dele. Um jogador pode ser ótimo voltando pra marcar (RCD alto) e fraco
            pressionando lá na frente (INT baixo), ou o contrário — por isso são dois números, não um só.
          </p>
        </Section>

        <Section title="Os 6 números exibidos (OVR · OFE · RCD · INT · DEF · GOL)">
          <p style={{ marginTop: 0, fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
            No cadastro e na listagem, cada jogador mostra 6 números lado a lado. OVR, OFE e DEF são OVRs (combinação
            ponderada de vários atributos). Já RCD e INT são diferentes: são os atributos de Recomposição Defensiva e
            Intensidade mostrados DIRETO, sem combinar com nada — por isso ficam lado a lado, os dois são "atributo
            puro", não OVR.
          </p>
          <p style={{ fontSize: '0.88rem', lineHeight: 1.5 }}>
            <strong>Atenção com OFE e DEF:</strong> esses dois números são o perfil INDIVIDUAL do jogador. O
            balanceador NÃO usa essas fórmulas para montar os times — ele avalia ataque e defesa no nível do TIME
            inteiro, com contas diferentes (melhores finalizadores/marcadores do time, não médias individuais). Então
            o OFE/DEF do chip é uma leitura pessoal do jogador, não uma prévia do que o balanceador vai considerar na
            hora de montar os times. Já OVR, RCD e INT batem certinho com o que o balanceador usa (são médias simples
            do time).
          </p>
          <div style={{ display: 'grid', gap: 10 }}>
            <div>
              <strong>OVR — Geral</strong>
              <p style={{ margin: '2px 0 0', fontSize: '0.88rem', lineHeight: 1.5 }}>
                A nota geral do jogador: uma média de todos os 9 atributos, sem pender pra nenhum lado. É o número
                usado como referência principal e casa com o balanceador — o equilíbrio geral do time usa a média do
                OVR Geral dos 6 de linha.
              </p>
            </div>
            <div>
              <strong>OFE — Ofensivo (perfil individual)</strong>
              <p style={{ margin: '2px 0 0', fontSize: '0.88rem', lineHeight: 1.5 }}>
                Quanto ele pesa no ataque: finalização, criação de jogo, drible e mobilidade contam mais aqui. Um
                jogador com OFE alto é o que mais ajuda a criar e converter chances de gol — mas é uma leitura dele
                sozinho. O balanceador não soma OFE dos jogadores: ele olha os 2 melhores finalizadores e o maior
                criador do TIME pra decidir o ataque.
              </p>
            </div>
            <div>
              <strong>RCD — Recomposição Defensiva</strong>
              <p style={{ margin: '2px 0 0', fontSize: '0.88rem', lineHeight: 1.5 }}>
                Este NÃO é um OVR combinado — é o atributo de Recomposição Defensiva puro, do jeito que foi
                cadastrado (com lesão aplicada, se houver). Mostra o quanto o jogador efetivamente volta pra marcar, e
                casa com o balanceador: entra direto na média de recuo do time. Um jogador com OFE alto e RCD baixo é
                o clássico "ataca bem, mas some na marcação" — bom pra criar perigo, mas deixa buraco atrás quando o
                time perde a bola.
              </p>
            </div>
            <div>
              <strong>INT — Intensidade</strong>
              <p style={{ margin: '2px 0 0', fontSize: '0.88rem', lineHeight: 1.5 }}>
                Também é atributo puro, não OVR — mostra o quanto ele pressiona lá na FRENTE, marcando a saída de bola
                do adversário no meio-campo e no ataque. Diferente do RCD (que é sobre voltar e se sacrificar no
                recuo). Também casa com o balanceador: entra direto na média de pressão do time.
              </p>
            </div>
            <div>
              <strong>DEF — Defensivo (perfil individual)</strong>
              <p style={{ margin: '2px 0 0', fontSize: '0.88rem', lineHeight: 1.5 }}>
                Quão sólido ele é na defesa em si: marcação, desarme, antecipação, posicionamento. Diferente do RCD
                (que é sobre voltar e se sacrificar no recuo), o DEF é sobre a qualidade da marcação quando ele já
                está lá — mas, assim como o OFE, é uma leitura individual. O balanceador olha os 2 melhores marcadores
                do time (mais o goleiro escalado), não a média de DEF de todo mundo.
              </p>
            </div>
            <div>
              <strong>GOL — Goleiro</strong>
              <p style={{ margin: '2px 0 0', fontSize: '0.88rem', lineHeight: 1.5 }}>
                A nota de goleiro, separada dos outros 5. Só existe pra quem está marcado como apto a jogar no gol —
                para os demais jogadores esse número simplesmente não aparece (não é zero, é "não se aplica").
              </p>
            </div>
          </div>
        </Section>

        <Section title="Os 4 sistemas táticos">
          <p style={{ marginTop: 0, fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
            Cada time monta 6 vagas de linha (fora o goleiro) num destes 4 sistemas. Você não escolhe o sistema — o
            balanceador testa os 4 pra cada time (e pra cada jogo do rodízio) e usa sempre o que rende o melhor
            encaixe pra quem está em campo naquele momento. Por isso o sistema mostrado no time pode até mudar de
            jogo pra jogo.
          </p>
          <div className={styles.grid}>
            {ALL_SYSTEMS.map((key) => (
              <SystemFieldDiagram key={key} system={SYSTEMS[key]} />
            ))}
          </div>
        </Section>

        <Section title="Lista de preferência (quem joga onde)">
          <p style={{ margin: 0, fontSize: '0.88rem', lineHeight: 1.6 }}>
            No cadastro de cada jogador, você monta uma <strong>lista ordenada</strong> das posições que ele aceita
            jogar — a ordem é o que importa: a primeira da lista é a preferida dele, a última é o último recurso.
            O balanceador NUNCA escala alguém fora dessa lista. Quando dois jogadores disputam a mesma vaga, quem
            está mais no topo da própria lista tem vantagem — mas isso não é uma regra fixa tipo "se já tem um pivô
            no time, vira meia-atacante": essa preferência emerge sozinha de como as vagas são distribuídas, o
            sistema não precisa de nenhuma regra especial pra isso acontecer.
          </p>
        </Section>

        <Section title="BOX_TO_BOX (coringa)">
          <p style={{ margin: 0, fontSize: '0.88rem', lineHeight: 1.6 }}>
            Em vez de montar uma lista, você pode marcar um jogador como <strong>BOX_TO_BOX</strong> — o coringa.
            Isso quer dizer "ele joga em qualquer posição, deixa o sistema decidir": não existe restrição nem
            preferência, o balanceador escala esse jogador na posição que melhor equilibrar o time naquele jogo.
            Todo jogador já cadastrado antes dessa atualização virou BOX_TO_BOX automaticamente — nada quebrou,
            e ninguém perdeu a chance de jogar.
          </p>
        </Section>

        <Section title="Rodízio de goleiro">
          <p style={{ margin: 0, fontSize: '0.88rem', lineHeight: 1.6 }}>
            Quando um time tem mais de um goleiro apto, eles revezam o gol jogo a jogo — os melhores primeiro, pra
            deixar a defesa mais forte logo de cara. A única exceção é o <strong>Jogo 1</strong>: ele nunca começa
            com um atacante (Pivô, Segundo Atacante ou Meia-Atacante) no gol, mesmo que esse atacante seja o melhor
            goleiro do time — o sistema busca o primeiro não-atacante da fila e coloca ele pra abrir o rodízio, sem
            bagunçar a ordem dos demais. Se por azar TODOS os goleiros aptos do time forem atacantes, o app avisa
            isso explicitamente em vez de simplesmente escalar um deles sem dizer nada.
          </p>
        </Section>
      </div>
    </div>
  );
}
