# LEIT Field Ops Mobile

Aplicativo Android para o leiturista percorrer uma rota de atendimento trabalhando totalmente
offline: consultar a rota e seus pontos a partir do armazenamento local, registrar a visita com a
leitura atual, a foto do medidor e a localização do dispositivo, e sincronizar as visitas depois.

Tudo o que o leiturista faz em campo funciona sem conexão. A sincronização é a única etapa que
pressupõe rede, e está simulada atrás de um limite substituível por uma API real.

Versão em inglês deste documento: [README.en.md](README.en.md).
Detalhamento das decisões de arquitetura: [docs/arquitetura.md](docs/arquitetura.md).

## Pré-requisitos

* Node.js 22.5 ou superior (a suíte de testes usa o `node:sqlite`, motor SQLite embutido no Node)
* npm
* Android Studio com SDK e um emulador, ou um aparelho físico com depuração USB habilitada

## Instalação e execução

```bash
npm install
npm run android
```

O comando `npm run android` executa `expo run:android`. Na primeira vez ele gera o projeto nativo
em `android/` e instala um development build no dispositivo. O aplicativo usa módulos nativos
(SQLite, câmera, localização, conectividade), então o Expo Go não é suficiente.

Para subir apenas o bundler quando o development build já está instalado:

```bash
npm start
```

### Comandos de qualidade

```bash
npm run typecheck
npm run lint
npm test
npm run check
```

O `npm run check` roda os três em sequência, exatamente o que o workflow em
`.github/workflows/ci.yml` executa a cada push e pull request. Os testes não acessam rede nem
dependem de dispositivo.

## Por que React Native

O desafio permite React Native ou Flutter. A escolha por React Native com Expo veio das
restrições específicas deste problema, não de preferência geral.

O requisito de maior peso aqui é persistência offline, não renderização. O Expo entrega módulos
de primeira linha para exatamente as quatro necessidades de dispositivo do app (SQLite, câmera,
sistema de arquivos e localização) dentro de um único SDK versionado, o que elimina a pesquisa de
compatibilidade de plugins entre o requisito e um build funcionando.

A camada de domínio é TypeScript puro. Validação da leitura, máquina de estados de sincronização
e regras do seed não importam nada de framework, então rodam no test runner do próprio Node em
milissegundos, sem emulador. Foi isso que tornou viável cobrir o schema e o fluxo completo de
visita com testes automatizados.

Por fim, TypeScript em domínio, dados e apresentação mantém uma só linguagem e um só conjunto de
tipos da linha do SQLite até a tela, que é o ambiente em que consigo avançar mais rápido e com
mais segurança.

Flutter também seria defensável, especialmente pela consistência visual. Não foi escolhido porque
acrescentaria uma segunda linguagem ao conjunto sem melhorar nada do que a avaliação de fato pesa.

## Tecnologias utilizadas

Base do aplicativo:

* Expo SDK 57 com React Native 0.86, runtime e build Android
* Expo Router para navegação baseada em arquivos, na pasta `app/`
* TypeScript em todas as camadas

Soluções para os requisitos de dispositivo:

* Persistência: `expo-sqlite`, banco único `leit_field_ops.db` com migrações versionadas
* Câmera: `expo-camera` para a captura, `expo-file-system` para a cópia durável do arquivo e
  `expo-image-manipulator` para redimensionar e recomprimir a imagem
* Geolocalização: `expo-location`
* Conectividade: `@react-native-community/netinfo`
* Sincronização em segundo plano: `expo-background-task` com `expo-task-manager`

Qualidade:

* `typescript` para verificação de tipos
* `tsx` com o test runner nativo do Node para a suíte de testes
* `eslint` com `eslint-config-expo`

Nenhum SDK de mapa foi adicionado. O mapa é desenhado com primitivas do próprio React Native,
como explicado adiante.

## Gerenciamento de estado

Não há biblioteca externa de estado, e isso é uma decisão deliberada.

O estado da aplicação é pequeno e quase todo estado persistido: rota, pontos e visitas vivem no
SQLite, e as telas derivam o que exibem a partir dele quando ganham foco. Adicionar Redux,
Zustand ou MobX criaria uma segunda fonte de verdade ao lado do banco, com o custo de mantê-las
sincronizadas, sem resolver nenhum problema que o app tenha de fato.

O que existe no lugar:

* O estado de cada tela é uma união explícita em um único `useState` (`loading`, `loaded`,
  `empty`, `error`), derivada por funções de view-model puras e testadas sem renderizar React.
* As duas preocupações realmente transversais, conectividade e fila de sincronização, são
  contextos React (`ConnectivityProvider` e `VisitSyncProvider`), cada um dono de exatamente uma
  assinatura e um executor para toda a árvore.
* Durante uma sincronização, as atualizações chegam às telas por um registro de listeners, então
  a lista da rota acompanha cada transição ao vivo sem ficar consultando o banco em intervalos.

## Carregamento da rota oficial

O arquivo fornecido acompanha o aplicativo em `assets/data/rota_aldeota_mira.json` e é importado
uma única vez, na primeira abertura, por um seed idempotente. Rodar o seed novamente não duplica
a rota nem os pontos. Depois do seed, todas as telas leem a rota do SQLite através do repositório,
nunca do JSON.

Observação sobre o nome do arquivo: o enunciado cita `rota_aldeota_LEIT.json`, enquanto o arquivo
efetivamente entregue chama-se `rota_aldeota_mira.json`. O arquivo entregue é usado sem qualquer
alteração, sob o nome em que foi recebido, e os dois nomes ficam registrados em
`OFFICIAL_ROUTE_PROVENANCE`, em `src/features/routes/data/seed/officialRouteSource.ts`. Os sete
pontos estão intactos.

## Funcionamento offline

A persistência é SQLite através do `expo-sqlite`, em um banco único. As migrações são ordenadas e
versionadas, protegidas por `PRAGMA user_version` gravado dentro da mesma transação de cada passo.
Um banco que já está em determinada versão nunca reexecuta aquele passo, então abrir o aplicativo
jamais recria nem apaga dados.

Na prática:

* A rota e os pontos são lidos do SQLite. Abrir o app sem conexão mostra a rota completa.
* O registro da visita, incluindo leitura, foto, localização e conclusão, não faz nenhum acesso
  de rede.
* A visita concluída é gravada em uma única chamada de repositório com `syncStatus` igual a
  `pending`, de modo que uma falha não deixa registro pela metade.
* Fechar e reabrir o aplicativo preserva a rota e todas as visitas registradas.
* A conectividade é observada por um limite próprio. Estar offline exibe um aviso, mas não
  bloqueia nada, e estar online nunca é tratado como garantia de que um envio vai funcionar.

## Registro da visita

Leitura: o campo é obrigatório e precisa ser numérico. Valor vazio e valor inválido são recusados
com mensagem visível, e nenhuma regra avançada de consumo foi inventada.

Foto: a permissão de câmera é solicitada e cada desfecho possível, concedida, negada, negada
permanentemente ou falha do dispositivo, tem seu próprio estado visível com ação de recuperação
(tentar de novo ou abrir as configurações do sistema). Nenhum deles derruba o fluxo. A captura é
redimensionada e recomprimida (maior lado em 1600 px, qualidade JPEG 0.7, nunca ampliando) e
copiada para o diretório de documentos do app, em `visit-evidence/`. O registro da visita só
referencia esse arquivo durável, nunca o caminho temporário do cache, então a evidência sobrevive
à limpeza do cache. Se o processamento da imagem falhar, a captura original é guardada no lugar:
uma falha de processamento custa tamanho de arquivo, nunca a evidência.

Localização: latitude, longitude e data e hora da captura vêm do dispositivo e são gravadas na
visita. Negação ou indisponibilidade viram estado próprio com nova tentativa, e a interface não
afirma nenhuma precisão que o aparelho não tenha informado.

## Estratégia de sincronização

O envio é declarado como um contrato de domínio, `VisitSyncGateway`, em
`src/features/visits/domain/services/VisitSyncService.ts`:

```ts
interface VisitSyncGateway {
  sendVisit(visit: Visit): Promise<VisitSyncOutcome>;
}
```

A implementação atual, `SimulatedVisitSyncGateway`, não faz nenhum acesso de rede. Ela apenas
aguarda um instante para que o estado `syncing` seja observável na interface, e decide a aceitação
a partir de uma sonda de alcançabilidade injetada, em vez de sorteio, o que mantém o caminho de
falha reproduzível.

Cada registro percorre `pending`, `syncing` e `synced`, ou termina em `error` quando o envio é
recusado. Toda transição é gravada no SQLite antes do passo seguinte, então o estado exibido depois
de um reinício é o estado realmente alcançado. Um envio que falha preserva o registro e sua
evidência e continua elegível para nova tentativa; apenas o campo `sync_status` é reescrito. Os
dois gatilhos, a ação manual e o disparo por reconexão, compartilham um único `VisitSyncRunner`,
cuja trava de execução única responde a um segundo gatilho com `skipped` em vez de iniciar uma
passagem paralela sobre os mesmos registros.

Para substituir a simulação por uma API real, basta escrever um cliente HTTP que implemente
`VisitSyncGateway` e injetá-lo onde hoje o `SimulatedVisitSyncGateway` é construído, no
`VisitSyncProvider`. O caso de uso, os view-models e todas as telas permanecem sem alteração.

### Sincronização em segundo plano

Uma tarefa registrada via `expo-background-task` chama o mesmo caso de uso, o mesmo executor e a
mesma máquina de estados da ação manual, sem duplicar regra, e só toca em registros já elegíveis.
É uma otimização, não um mecanismo do qual o produto dependa: no Android o agendamento passa pelo
WorkManager, então bateria, Doze, app standby e gerenciadores agressivos de fabricante decidem se
e quando ela roda, e um app encerrado à força nunca a executa. Falhas de registro são absorvidas
em silêncio e a interface não promete execução em segundo plano.

## Mapa e percurso

O mapa da rota é desenhado com `Image` e `View` do próprio React Native sobre tiles de base
derivados do OpenStreetMap, sem SDK nativo de mapa. Não é preciso chave de API do Google Maps nem
qualquer configuração adicional no Android: um `npx expo run:android` limpo já basta.

Os sete marcadores vêm das coordenadas persistidas em `route_points`, e uma linha reta liga os
pontos na ordem oficial, de 1 a 7. Essa linha é apenas a visualização da sequência fornecida. Não
é navegação passo a passo, e nenhum algoritmo de roteirização, otimização ou reordenação de
waypoints foi adicionado. Se os tiles não carregarem, os marcadores numerados continuam nas
posições corretas, e uma falha do mapa nunca bloqueia a lista da rota nem o fluxo de visita.

## Decisões técnicas

Organização por feature, com separação inspirada em MVVM. Os arquivos do Expo Router em `app/`
funcionam apenas como coordenadores de navegação; o produto vive em `src/`.

```
src/features/<feature>/presentation     telas, view-models e componentes
src/features/<feature>/domain           entidades, validação, casos de uso e contratos
src/features/<feature>/data             repositórios e fontes de dados locais
src/features/<feature>/infrastructure   implementações de dispositivo e plataforma
src/shared                              tokens visuais, primitivas de UI e setup do banco
```

As decisões que mais moldaram o código:

O domínio declara, a infraestrutura implementa. Câmera, localização, processamento de imagem,
conectividade e envio são todos interfaces de domínio, com implementações de plataforma injetadas
na camada de rota. É isso que torna o fluxo testável sem dispositivo e o gateway de sincronização
substituível sem encostar na interface.

Os view-models são funções puras. Derivação de estado de tela, validação, descrição do estado de
sincronização e geometria do mapa são funções comuns, testadas sem renderizar React Native.

O SQLite é a fonte de verdade em tempo de execução. O JSON fornecido é entrada de seed, não fonte
de dados.

Nada de abstração especulativa. Não há backend, autenticação nem camada que algum requisito
entregue não tenha exigido.

O texto sempre acompanha o estado. Nenhum status depende só de cor: cada tom traz também um
símbolo próprio, e trabalho em andamento exibe indicador de progresso com o rótulo. As ações que
iniciam trabalho se desabilitam enquanto ele corre, para que um segundo toque não dispare
execução duplicada.

O documento [docs/arquitetura.md](docs/arquitetura.md) detalha cada uma dessas decisões.

## Testes

`npm test` roda o test runner do Node através do `tsx` sobre todo `src/**/*.test.ts`. Nada acessa
rede ou dispositivo, e o comando não depende de emulador.

A cobertura tem dois níveis. O primeiro é lógica de domínio e de view-model contra dublês dos
contratos de repositório e serviço: validação da leitura, idempotência do seed, conclusão da
visita, pipeline da foto, captura de localização, máquina de estados de sincronização, a trava de
execução única e a regra de reconexão. O segundo é schema e repositórios contra o motor SQLite
real embutido no Node, o que torna verificáveis sem emulador a ordem das migrações, a constraint
de `sync_status`, a idempotência do seed em SQL e a chave estrangeira que liga uma visita ao seu
ponto de rota.

Há ainda um teste de integração que percorre o fluxo principal de visita de ponta a ponta pelas
próprias funções de view-model das telas, com dublês apenas nos limites de dispositivo.

## Diferenciais implementados

* Mapa com os sete pontos oficiais
* Visualização da sequência do percurso, sem otimização
* Detecção de conectividade com indicação de offline que não bloqueia nada
* Sincronização automática ao reconectar
* Tratamento de falhas com estado `error` persistido e nova tentativa
* Tratamento de imagens com redimensionamento e compressão
* Testes automatizados, incluindo schema, repositórios e fluxo principal
* Separação entre interface, persistência, regras, serviços e sincronização

## Limitações e próximos passos

A sincronização é simulada. Não existe servidor; o `SimulatedVisitSyncGateway` é justamente a
costura que um cliente HTTP real substituiria, sem alteração nas camadas acima.

A sincronização em segundo plano é oportunista. O Android decide se e quando executá-la, e o
aplicativo permanece correto caso ela nunca rode. Os caminhos garantidos continuam sendo a ação
manual e a tentativa ao reconectar.

Não há OCR. A leitura é sempre digitada pelo leiturista. O item é opcional no enunciado e exigiria
módulo nativo com uma biblioteca de reconhecimento no dispositivo. A evolução natural seria
isolá-lo atrás de uma interface de domínio e tratar o número reconhecido como sugestão editável,
nunca como substituto da digitação.

O mapa usa tiles raster, que precisam de conexão para carregar. Marcadores e linha de sequência
são desenhados a partir das coordenadas locais e continuam aparecendo offline, sem o mapa de fundo.
A evolução seria empacotar um conjunto reduzido de tiles da região com o aplicativo.

Na prática o alvo é Android. A configuração de iOS está presente, mas o desenvolvimento e a
verificação foram feitos contra Android.

Não há testes de renderização de componente. A interação é coberta por testes de view-model e de
integração, e não por uma biblioteca de renderização.

## Estrutura da entrega

O repositório contém o código-fonte completo, este README, as instruções de execução, as
dependências declaradas em `package.json`, o arquivo JSON usado no desafio em
`assets/data/rota_aldeota_mira.json` e a descrição da arquitetura adotada neste documento e em
`docs/arquitetura.md`.
