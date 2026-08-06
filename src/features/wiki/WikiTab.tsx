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
            Todo jogador de linha (fora o goleiro) encaixa numa dessas 7 posições. O balanceador olha os atributos do
            jogador (Finalização, Criação, Drible, Defesa, Velocidade, Recomposição Defensiva, Intensidade,
            Mobilidade e Físico) e calcula o quão bem ele encaixa em cada uma. A <strong>Ofensividade</strong> é o
            décimo atributo e, por enquanto, é a única que NÃO entra nesse encaixe de posição — ela pesa na nota
            geral do jogador, no número de ataque dele (o ATA) e no ataque do TIME, mas não decide em que vaga ele
            joga.
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
          <p style={{ fontSize: '0.88rem', lineHeight: 1.5, marginTop: 12 }}>
            <strong>Recomposição e Marcação: peso IGUAL no eixo defensivo.</strong> No balanceador, a defesa do time é
            um <strong>PRODUTO, não uma soma</strong>: a defesa de um time é calculada como a raiz da média dos 2 melhores
            marcadores, multiplicada pela raiz da média da recomposição de todos os 6 de linha — e o resultado entra no
            cálculo geral junto com a nota do goleiro. Isso significa que marcar bem SEM voltar pra recompor deixa o time
            frágil — não dá pra compensar uma coisa com a outra. Recentemente marcação e recomposição passaram a pesar
            IGUAL nessa conta (foi aumentado o peso relativo da recomposição). Antes, um time que marcava muito bem conseguia
            disfarçar um pouco a recomposição fraca; agora, uma recomposição baixa (ou muito desigual entre os jogadores)
            derruba a defesa muito mais.
          </p>
        </Section>

        <Section title="Os 7 números exibidos (OVR · ATA · RCD · INT · OFE · DEF · GOL)">
          <p style={{ marginTop: 0, fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
            No cadastro e na listagem, cada jogador mostra 7 números lado a lado. OVR, ATA e DEF são OVRs (combinação
            ponderada de vários atributos). Já RCD, INT e OFE são diferentes: são os atributos de Recomposição
            Defensiva, Intensidade e Ofensividade mostrados DIRETO, sem combinar com nada — por isso ficam lado a
            lado, os três são "atributo puro", não OVR.
          </p>
          <p style={{ fontSize: '0.88rem', lineHeight: 1.5 }}>
            <strong>Atenção com ATA e DEF:</strong> esses dois números são o perfil INDIVIDUAL do jogador. O
            balanceador NÃO usa essas fórmulas para montar os times — ele avalia ataque e defesa no nível do TIME
            inteiro, com contas diferentes (melhores finalizadores/marcadores do time, não médias individuais). Então
            o ATA/DEF do chip é uma leitura pessoal do jogador, não uma prévia do que o balanceador vai considerar na
            hora de montar os times. Já OVR, RCD e INT batem certinho com o que o balanceador usa (são médias simples
            do time).
          </p>
          <div style={{ display: 'grid', gap: 10 }}>
            <div>
              <strong>OVR — Geral</strong>
              <p style={{ margin: '2px 0 0', fontSize: '0.88rem', lineHeight: 1.5 }}>
                A nota geral do jogador: uma média ponderada dos atributos, sem pender pra nenhum lado. É o número
                usado como referência principal e casa com o balanceador — o equilíbrio geral do time usa a média do
                OVR Geral dos 6 de linha. A <strong>Ofensividade entra nesta conta</strong> e é hoje o maior peso
                dela — um jogador com ofensividade altíssima sobe bastante o OVR. A marcação e a recomposição
                mantiveram o peso que tinham; quem cedeu espaço pra ofensividade foram os outros atributos ofensivos.
              </p>
            </div>
            <div>
              <strong>ATA — Ofensivo (perfil individual)</strong>
              <p style={{ margin: '2px 0 0', fontSize: '0.88rem', lineHeight: 1.5 }}>
                Quanto ele pesa no ataque: finalização, criação de jogo, drible, mobilidade e ofensividade (ver OFE
                abaixo) contam mais aqui. Um jogador com ATA alto é o que mais ajuda a criar e converter chances de
                gol — mas é uma leitura dele sozinho. O balanceador não soma ATA dos jogadores: ele olha os 2 melhores
                finalizadores, o maior criador e os 2 jogadores mais ofensivos do TIME pra decidir o ataque.
              </p>
            </div>
            <div>
              <strong>RCD — Recomposição Defensiva</strong>
              <p style={{ margin: '2px 0 0', fontSize: '0.88rem', lineHeight: 1.5 }}>
                Este NÃO é um OVR combinado — é o atributo de Recomposição Defensiva puro, do jeito que foi
                cadastrado (com lesão aplicada, se houver). Mostra o quanto o jogador efetivamente volta pra marcar, e
                casa com o balanceador: entra direto na média de recuo do time. Um jogador com ATA alto e RCD baixo é
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
              <strong>OFE — Ofensividade</strong>
              <p style={{ margin: '2px 0 0', fontSize: '0.88rem', lineHeight: 1.5 }}>
                Também é atributo puro, não OVR — mostra a "esperteza" do jogador com bola no pé perto do ataque: saber
                reconhecer o espaço, driblar quando dá pra driblar, chutar quando chutar é a melhor opção. Não é
                velocidade, nem finalização isolada — é o julgamento de decidir a jogada certa na hora certa. Pesa
                bastante no número ATA (quase um terço da conta) e também entra direto no cálculo do ataque do TIME: o
                balanceador olha os 2 jogadores mais ofensivos do time, do mesmo jeito que olha os 2 melhores
                finalizadores — quem joga mais atrás no time conta menos nessa conta, do jeito que já acontecia com
                finalização e criação.
              </p>
            </div>
            <div>
              <strong>DEF — Defensivo SEM recomposição (perfil individual)</strong>
              <p style={{ margin: '2px 0 0', fontSize: '0.88rem', lineHeight: 1.5 }}>
                Quão sólido ele é na defesa em si: marcação, desarme, antecipação, posicionamento — <strong>tirando o
                "volta pra marcar"</strong>, que é o RCD. A recomposição já tem chip próprio ao lado, então contá-la
                também dentro do DEF mostrava o mesmo sinal duas vezes. Agora são dois números independentes: DEF responde
                "o quanto ele marca (quando já está lá)", RCD responde "o quanto ele volta". Um jogador com todos os
                atributos iguais continua com o mesmo DEF de antes — tirar da conta um atributo que vale exatamente a
                média não muda a média. Quem se mexe é quem tem a recomposição descolada do próprio nível defensivo
                (ex.: quem compensava marcação fraca com recomposição alta agora aparece mais baixo no DEF). Como ATA, é
                uma leitura individual — o balanceador olha os 2 melhores marcadores do time (mais o goleiro escalado),
                não a média de DEF de todo mundo.
              </p>
            </div>
            <div>
              <strong>GOL — Goleiro</strong>
              <p style={{ margin: '2px 0 0', fontSize: '0.88rem', lineHeight: 1.5 }}>
                A nota de goleiro, separada dos outros 6. Só existe pra quem está marcado como apto a jogar no gol —
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

        <Section title="'Tanto faz a ordem' (ordem indiferente)">
          <p style={{ margin: 0, fontSize: '0.88rem', lineHeight: 1.6 }}>
            Tem um terceiro botão no cadastro, junto da lista de posições: <strong>"Tanto faz a ordem"</strong>.
            É diferente do coringa — o jogador continua jogando SÓ nas posições que você marcou (a restrição não
            muda em nada), mas deixa de existir preferência entre elas: sair da 1ª posição da lista pra 3ª não
            custa nada pro balanceador. Serve pro jogador que topa qualquer uma das posições marcadas, mas não tem
            uma "posição do coração" entre elas.
          </p>
          <p style={{ margin: 0, marginTop: 8, fontSize: '0.88rem', lineHeight: 1.6 }}>
            Resumindo os três casos:
          </p>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: '0.88rem', lineHeight: 1.6 }}>
            <li><strong>Lista ordenada normal</strong>: só joga nas posições marcadas, e a ordem entre elas importa
              — sair da preferida custa caro.</li>
            <li><strong>Ordem indiferente</strong>: só joga nas posições marcadas (igualzinho), mas não tem
              preferência entre elas — qualquer uma marcada serve do mesmo jeito.</li>
            <li><strong>BOX_TO_BOX (coringa)</strong>: joga em QUALQUER posição do jogo, marcada ou não — o
              sistema decide tudo.</li>
          </ul>
        </Section>

        <Section title="Rodízio de goleiro">
          <p style={{ margin: 0, fontSize: '0.88rem', lineHeight: 1.6 }}>
            Quando um time tem mais de um goleiro apto, eles revezam o gol — os melhores primeiro, pra deixar a
            defesa mais forte no início. A fila respeita a ordem: quem vem pra jogar só volta ao gol depois que
            todos os outros passaram.
          </p>
          <p style={{ margin: '10px 0 0', fontSize: '0.88rem', lineHeight: 1.6 }}>
            <strong>A decisão é JOGO A JOGO (por rodada), não pelo tamanho do elenco.</strong> Um time reveza goleiro
            próprio numa rodada quando tem <strong>pelo menos 7 jogadores disponíveis</strong> naquela rodada
            específica (goleiro + 6 de linha + banco). Com 7 ou mais ele tira um goleiro da fila pro gol; com
            exatamente 6, aquela rodada usa goleiro emprestado do time que está de fora e os 6 vão todos pra linha.
            Com menos de 6 não dá pra fechar a escalação: aí o app avisa e bloqueia, em vez de montar um time
            incompleto. O mesmo time pode usar goleiro emprestado nos primeiros jogos e passar a revezar goleiro
            próprio depois — é o que acontece quando alguém chega atrasado e o time enche na metade da pelada. É
            esperado, não é bug. Consequência: a nota de goleiro só conta nas rodadas em que há um goleiro do
            próprio time no gol.
          </p>
          <p style={{ margin: '10px 0 0', fontSize: '0.88rem', lineHeight: 1.6 }}>
            <strong>Jogo 1 nunca começa com um atacante no gol:</strong> mesmo que um atacante (Pivô, Segundo
            Atacante ou Meia-Atacante) seja o melhor goleiro do time, o sistema busca o primeiro não-atacante da
            fila e coloca ele pra abrir o rodízio, sem bagunçar a ordem dos demais. Se TODOS os goleiros aptos do
            time forem atacantes, o app avisa isso explicitamente em vez de simplesmente escalar um deles sem dizer
            nada.
          </p>
        </Section>

        <Section title="Veterano (distribuição igual entre os times)">
          <p style={{ margin: 0, fontSize: '0.88rem', lineHeight: 1.6 }}>
            No cadastro de cada jogador existe o checkbox <strong>"Veterano"</strong> — marca os mais velhos do
            racha. É só uma marcação manual, não muda nenhum atributo nem nota do jogador: serve unicamente para o
            balanceador saber quem entra na conta da distribuição.
          </p>
          <p style={{ margin: '10px 0 0', fontSize: '0.88rem', lineHeight: 1.6 }}>
            A regra é <strong>espalhar os veteranos igualmente entre os times</strong>. Com veteranos ativos
            sobrando de forma que não dá pra dividir exato, alguns times ficam com um veterano a mais que os
            outros — nunca um time cheio de veteranos enquanto outro fica sem nenhum. Ex.: 3 veteranos em 2 times
            vira 2 e 1 (nunca 3 e 0); 5 veteranos em 2 times vira 3 e 2. Uma divisão que concentra veteranos demais
            num só time é <strong>excluída das opções</strong>, do mesmo jeito que acontece com a regra do banco —
            se, mesmo assim, nenhuma divisão sobrar, a simulação é bloqueada e o app explica com os números daquele
            elenco (quantos veteranos ativos, quantos times, a divisão exigida).
          </p>
          <p style={{ margin: '10px 0 0', fontSize: '0.88rem', lineHeight: 1.6 }}>
            Importante: a conta é feita <strong>na formação dos times</strong> (o elenco completo de cada time —
            goleiro reservado, os 6 de linha e o banco), <strong>não jogo a jogo</strong>. O rodízio de banco pode,
            numa rodada específica, deixar temporariamente mais veteranos de um time em campo do que do outro (por
            causa de quem sentou naquela rodada) sem que isso invalide nada — o que precisa estar espalhado é o
            elenco todo, não quem está em campo a cada jogo.
          </p>
          <p style={{ margin: '10px 0 0', fontSize: '0.88rem', lineHeight: 1.6 }}>
            <strong>Exceção do veterano PIVÔ.</strong> Vale <strong>só</strong> para quem está cadastrado
            <strong> exclusivamente como Pivô</strong> — nenhuma outra posição habilitada na lista, e não marcado
            como coringa. Quem tem Pivô <em>e</em> qualquer outra posição habilitada NÃO entra nessa exceção: conta
            como veterano normal. O caso que isso resolve é o do pessoal que joga de segundo atacante ou
            meia-atacante e só quebra um galho no pivô, então acaba cadastrado apenas como Pivô.
          </p>
          <p style={{ margin: '10px 0 0', fontSize: '0.88rem', lineHeight: 1.6 }}>
            Esse veterano só entra na conta da distribuição quando o total de veteranos é <strong>menor ou igual à
            quantidade de times</strong>, ou <strong>múltiplo da quantidade de times</strong>. Nesses dois casos a
            divisão já sai limpa sozinha (no máximo um veterano por time, ou exatamente a mesma quantidade em cada),
            então não há motivo pra tratar ninguém de forma especial. Fora desses casos, sobra veterano — algum time
            teria que levar um a mais — e aí o veterano-pivô sai da conta, porque <strong>o time dele é quem aguenta
            o extra</strong>: pivô fica plantado na área e não corre o campo inteiro.
          </p>
          <p style={{ margin: '10px 0 0', fontSize: '0.88rem', lineHeight: 1.6 }}>
            Na prática, com 3 veteranos em 2 times (um deles pivô): os <strong>dois que correm</strong> ficam um em
            cada time, e o pivô acompanha um deles. O que nunca acontece é os dois que correm caírem no mesmo time
            enquanto o outro fica só com o pivô. Já com 4 veteranos em 2 times, 4 é múltiplo de 2, então todos
            contam e a divisão é 2 e 2.
          </p>
          <p style={{ margin: '10px 0 0', fontSize: '0.88rem', lineHeight: 1.6 }}>
            A exceção vale <strong>por jogador</strong>, então se houver mais de um veterano exclusivamente-pivô cada
            um deles é retirado da conta — e a conta não quebra, porque eles já ficam separados de qualquer forma:
            existe <strong>uma única vaga de Pivô por time</strong> em todos os sistemas táticos, então dois pivôs
            nunca caem no mesmo time.
          </p>
          <p style={{ margin: '10px 0 0', fontSize: '0.88rem', lineHeight: 1.6 }}>
            <strong>Escape: "Desconsiderar veteranos"</strong> (checkbox na tela de Simular Partidas, desmarcado por
            padrão e que NÃO fica salvo — some quando você reabre o app). Quando marcado, a distribuição de
            veteranos deixa de valer por completo: nenhuma divisão é excluída por causa disso.
          </p>
        </Section>

        <Section title="Não jogará os primeiros jogos (atrasados)">
          <p style={{ margin: 0, fontSize: '0.88rem', lineHeight: 1.6 }}>
            Na tela de Simular Partidas, logo abaixo de "Manter separados", existe o filtro <strong>"Não jogará os primeiros jogos"</strong> — serve para marcar quem chega atrasado no dia (saiu do trabalho, trânsito, qualquer coisa).
          </p>
          <p style={{ margin: '10px 0 0', fontSize: '0.88rem', lineHeight: 1.6 }}>
            Você escolhe um jogador e quantos jogos ele vai <strong>ficar completamente ausente</strong> no início da pelada (entre 1 e o máximo de jogos da rodada menos 1 — com rodízio de 6 jogos, o máximo é 5 jogos de ausência; com 2 times a rodada tem 9 jogos, então o máximo é 8). Depois dele "entrar" (depois desses jogos passarem), ele volta ao rodízio normal.
          </p>
          <p style={{ margin: '10px 0 0', fontSize: '0.88rem', lineHeight: 1.6 }}>
            <strong>Atenção: ele está AUSENTE, não está no banco.</strong> Enquanto durar a ausência, ele não aparece em nenhum lugar — nem como reserva, nem na contagem de banco. É como se ele não estivesse relacionado naqueles jogos. Quando chega, o app marca isso com uma indicação própria (a forma como aparece é diferente de "entrou do banco"). Depois que chega, ele entra no rodízio de banco normal, como qualquer outro.
          </p>
          <p style={{ margin: '10px 0 0', fontSize: '0.88rem', lineHeight: 1.6 }}>
            <strong>A ausência não conta na justiça do banco.</strong> Aqueles jogos em que ele não estava não entram na contagem de quantas vezes ele foi pro banco — ele não "deve" nada por eles. A regra de ninguém ficar dois jogos seguidos no banco não o afeta enquanto está ausente (ele não está em campo, então não há nada a "cumprir" naquele jogo).
          </p>
          <p style={{ margin: '10px 0 0', fontSize: '0.88rem', lineHeight: 1.6 }}>
            <strong>Fim da fila do gol.</strong> Quando chega, o atrasado entra no fim da fila de revezamento de goleiro
            — não faz sentido a primeira coisa que ele faça ao chegar ser ir pro gol (ele já perdeu jogos de ausência). O mesmo vale se há vários atrasados: quem chegou mais tarde fica ainda mais pro fim da fila.
          </p>
          <p style={{ margin: '10px 0 0', fontSize: '0.88rem', lineHeight: 1.6 }}>
            <strong>Fim da fila do banco (entra por último).</strong> Quando chega, o atrasado recebe uma contagem de
            banco equiparada ao maior valor do time naquele instante — assim a regra normal (senta quem foi menos
            vezes) empurra as idas dele ao banco pro fim sozinha, sem tratamento especial. Isso não é isenção: se não
            houver alternativa ele senta mesmo assim; e ao longo da pelada a conta dele não fica muito abaixo da dos
            outros. O mecanismo evita que ele chegasse com "saldo zero" de banco e virasse o primeiro a sentar — o
            oposto do desejado.
          </p>
          <p style={{ margin: '10px 0 0', fontSize: '0.88rem', lineHeight: 1.6 }}>
            <strong>Distribuição igualitária entre os times.</strong> Se o time A tem Fulano atrasado e o time B não tem ninguém, a simulação não sai balanceada — o balanceador trata isso com a mesma seriedade que a distribuição de veteranos. Os atrasados são espalhados entre os times da forma mais uniforme possível: com 3 atrasados em 2 times, um time fica com 2 e o outro com 1; com 4 atrasados em 2 times, fica 2 e 2. Se nenhuma divisão conseguir fazer isso sem concentrar atrasados demais num só time, a simulação é bloqueada e o app explica o problema.
          </p>
          <p style={{ margin: '10px 0 0', fontSize: '0.88rem', lineHeight: 1.6 }}>
            <strong>Bloqueio se faltar gente pra fechar a rodada.</strong> Se o time ficar tão desfalcado numa rodada (ainda com atrasados ausentes) que não consiga arrumar 6 jogadores de linha, o app avisa explicitamente qual é a rodada e por que não dá (p. ex., "no Time A, no jogo 3 do rodízio só há 5 jogadores disponíveis para os 6 de linha"). Isso torna a divisão inviável — nenhuma mudança no rodízio ou banco vai resolver, e o app descarta essa opção. As saídas são: reduzir a quantidade de jogos de ausência de alguém, marcar menos jogadores como atrasados, ou ativar mais jogadores de linha.
          </p>
        </Section>

        <Section title="Rodízio de banco (quem fica de fora)">
          <p style={{ margin: 0, fontSize: '0.88rem', lineHeight: 1.6 }}>
            Ninguém escolhe quem senta a dedo: a cada jogo do rodízio o sistema decide sozinho quem vai pro banco. A
            regra é <strong>ESTRITA e sempre a mesma, para todo mundo</strong>: ninguém pode ficar mais de um jogo
            seguido no banco — não importa o tamanho do banco daquele time nem quantos times a pelada tem.
          </p>
          <p style={{ margin: '10px 0 0', fontSize: '0.88rem', lineHeight: 1.6 }}>
            Entre os elegíveis a sentar (quem não sentou no jogo anterior), a justiça continua valendo: vai pro banco
            quem sentou <strong>menos vezes</strong> até ali. Ninguém fica de fora quatro vezes enquanto outro fica só
            uma. Em caso de empate entre igualmente elegíveis, sai quem sentar causa menos desequilíbrio no time que
            fica em campo.
          </p>
          <p style={{ margin: '10px 0 0', fontSize: '0.88rem', lineHeight: 1.6 }}>
            <strong>Quando essa regra não dá pra cumprir</strong> (o time não tem jogadores de linha suficientes para
            alternar sem ninguém repetir banco), a divisão não é mais oferecida com um aviso "por baixo do pano" —
            ela é <strong>excluída das opções</strong>. Se depois de excluir todas as divisões que não cumprem a
            regra não sobrar nenhuma, a simulação é bloqueada e o app explica o motivo com números concretos daquele
            elenco (quantos jogadores de linha há, quantas vagas de banco por rodada, e por que isso torna impossível
            alternar sem repetir) e sugere saídas — jogar com mais times, ativar/desativar jogadores, ou usar a
            exceção abaixo.
          </p>
          <p style={{ margin: '10px 0 0', fontSize: '0.88rem', lineHeight: 1.6 }}>
            <strong>Exceção: "Permitir jogadores ficarem duas vezes seguidas no banco"</strong> (checkbox na tela de
            Simular Partidas, desmarcado por padrão e que NÃO fica salvo — some quando você reabre o app). Quando
            marcado e a regra estrita não fecha o banco sozinha, um jogador pode sentar pela <strong>2ª vez
            seguida</strong> — isso "gasta um crédito": esse jogador fica de fora do banco (sempre jogando) pelas{' '}
            <strong>6 rodadas seguintes</strong>; passada essa janela, ele volta a ser elegível normalmente (inclusive
            podendo gastar o crédito de novo mais adiante, se for preciso). A regra estrita continua sendo a
            preferida mesmo com a exceção ligada: o crédito de ninguém é gasto à toa, só quando faltam vagas
            estritamente elegíveis pra fechar o banco daquela rodada.
          </p>
          <p style={{ margin: '10px 0 0', fontSize: '0.88rem', lineHeight: 1.6 }}>
            Importante: a exceção é um alívio <strong>limitado</strong>, não uma solução permanente. Um elenco
            estruturalmente pequeno demais pro número de times escolhido pode voltar a travar mais adiante no
            rodízio, mesmo com a exceção ligada — nesse caso, considere jogar com mais times (o banco de cada time
            encolhe) ou ativar mais jogadores de linha.
          </p>
        </Section>
      </div>
    </div>
  );
}
