# Arquitetura e decisões técnicas

Detalhamento das decisões resumidas no [README](../README.md). Este documento existe para
registrar o porquê de cada escolha, não para repetir o que o código já diz.

## Organização

Estrutura por feature, com separação inspirada em MVVM. Os arquivos do Expo Router em `app/`
funcionam apenas como coordenadores de navegação. O produto vive em `src/`.

```
src/features/<feature>/presentation     telas, estado de tela e interação
src/features/<feature>/domain           entidades, validação, casos de uso e contratos de serviço
src/features/<feature>/data             repositórios e fontes de dados locais
src/features/<feature>/infrastructure   integrações de dispositivo e plataforma
src/shared                              tokens visuais, primitivas de UI e setup do banco
```

As rotas podem compor a camada de apresentação. A apresentação só alcança dados ou infraestrutura
através de casos de uso e contratos de domínio. Nenhuma fronteira ganha API especulativa antes de
existir um requisito concreto que a exija.

## Banco de dados e migrações

Banco único `leit_field_ops.db`, aberto pelo `expo-sqlite`. As migrações são uma lista ordenada e
versionada, e cada passo grava o novo `PRAGMA user_version` dentro da mesma transação em que altera
o schema. Isso garante duas propriedades: uma falha nunca deixa o banco marcado em uma versão que
ele não alcançou de fato, e um banco que já está em determinada versão nunca reexecuta aquele passo.
Abrir o aplicativo, portanto, jamais recria nem apaga dados.

A segunda migração precisou reconstruir a tabela `visits` porque o SQLite não permite ampliar uma
constraint `CHECK` no lugar, e o estado `error` precisava entrar na lista aceita de `sync_status`.
As linhas existentes são copiadas coluna a coluna antes da tabela antiga ser removida.

## Foto da visita

A foto do medidor é capturada em resolução cheia e depois redimensionada e recomprimida antes de
qualquer gravação durável. A política é uma constante explícita, `VISIT_PHOTO_IMAGE_POLICY`, em
`features/visits/domain/services/ImageProcessingService.ts`.

Maior lado em 1600 px. Uma captura de 12 MP (4000 por 3000) vira 1600 por 1200, cerca de 1,9 MP.
Um registrador de medidor que ocupe uma fração modesta do quadro ainda mantém vários pixels por
traço de dígito, que é o que torna o número legível para quem revisa e para um OCR futuro. Alvos
menores, como 1024 px, começam a borrar o número de série e o texto impresso ao lado.

Qualidade JPEG 0.7. Fica confortavelmente acima do ponto em que os artefatos de bloco começam a
fechar traços finos de dígito, e ainda assim reduz uma captura típica de vários megabytes para
algumas centenas de kilobytes. Essa proporção importa porque uma rota inteira é capturada offline
e cada foto fica no aparelho até a sincronização acontecer.

Nunca ampliar. A função `resolveEvidenceDownscale` devolve `null` quando a captura já respeita a
política ou quando as dimensões informadas são inutilizáveis, então uma imagem pequena é apenas
recodificada.

O `expo-image-manipulator` escreve seu resultado no diretório de cache, ou seja, o arquivo
processado ainda é temporário. A ordem é portanto captura temporária, compressão temporária e só
então cópia durável para o diretório de documentos, em `visit-evidence/`. O registro da visita só
recebe a URI final e durável.

Se a compressão lançar erro ou devolver uma URI vazia, o caso de uso guarda a captura original em
vez de abortar. Uma falha de processamento custa tamanho de imagem, nunca a evidência nem o fluxo
de conclusão. Falha do armazenamento durável é o único caso que ainda reporta erro, porque nesse
ponto não existe arquivo que fosse sobreviver à limpeza do cache.

## Sincronização

O envio é um contrato de domínio, e a implementação atual é um simulador local sem qualquer acesso
de rede. A aceitação vem de uma sonda de alcançabilidade injetada, não de sorteio, para que o
caminho de falha seja reproduzível em teste e em demonstração.

Cada registro é movido um de cada vez, e cada transição é persistida antes do passo seguinte. Um
registro recusado termina em `error`, que é persistido e continua elegível para nova tentativa.
Apenas o campo `sync_status` é reescrito, então uma falha nunca encosta na leitura, na referência
da foto, nas coordenadas ou no horário de captura.

A lista de estados elegíveis inclui `syncing`. Um registro só pode continuar nesse estado no
momento da leitura da fila se o processo que o detinha foi encerrado no meio do envio, já que uma
execução viva é impedida pela trava de execução única. Lê-lo de volta recupera esses registros em
vez de deixá-los presos para sempre.

A trava de execução única fica no `VisitSyncRunner`, e os dois gatilhos do aplicativo passam por
uma única instância dele. Um segundo gatilho durante uma execução recebe `skipped` em vez de
iniciar uma passagem paralela. A promessa em andamento é sempre limpa, inclusive quando a execução
lança, para que uma falha não trave a guarda permanentemente.

A regra de reconexão é uma função pura: apenas uma transição real de offline para online inicia
uma tentativa, então uma sequência de eventos `online` repetidos não dispara execuções repetidas.

## Sincronização em segundo plano

A tarefa registrada chama o mesmo `VisitSyncRunner` e o mesmo caso de uso da interface. Nenhuma
regra é duplicada: seleção de registros elegíveis, máquina de estados persistida e trava de
execução única vêm todas do mesmo lugar. A única diferença é que o processo em segundo plano não
tem árvore React, então abre o banco por conta própria; como as migrações são idempotentes, isso
não pode reconstruir nem perder dados.

Limitações do sistema operacional, ditas sem rodeio:

* No Android o agendamento passa pelo WorkManager. O intervalo mínimo é o piso de uma janela, nunca
  uma garantia. O sistema decide o momento real conforme bateria, Doze e o balde de app standby.
* Um aplicativo encerrado à força, um aparelho em que o usuário restringiu atividade em segundo
  plano, ou um gerenciador agressivo de fabricante simplesmente nunca a executam.
* O registro é de melhor esforço e absorve as próprias falhas.

Uma execução ignorada pela trava é reportada ao agendador como sucesso, e apenas uma falha de
armazenamento local é reportada como falha, para que registros recusados pelo gateway não façam o
sistema estrangular a tarefa. Esses registros ficam em `error` e permanecem elegíveis.

## Mapa

O mapa desenha tiles raster com `Image` e `View` do próprio React Native, em vez de um SDK nativo.
Os tiles vêm de uma CDN de base sem chave, renderizada a partir de dados do OpenStreetMap, com a
atribuição no rodapé do card.

Nenhuma configuração de mapa é necessária no Android. Não há chave de API do Google Maps, nem
metadados no `AndroidManifest`, nem plugin adicional no `app.json`. Um `npx expo run:android` limpo
basta, e o mapa não depende de o Play Services estar presente.

As coordenadas dos marcadores vêm de `route_points` no SQLite, através do repositório, nunca do
JSON em tempo de renderização.

O `RouteMapViewModel` concentra a projeção Web Mercator, o zoom por enquadramento e a seleção de
tiles como funções puras, então a geometria do mapa é testada sem dispositivo.

A degradação é em camadas: pontos com coordenadas inutilizáveis são descartados, uma área ainda não
medida ou vazia renderiza um aviso explicativo, tiles que falham deixam os marcadores numerados nas
posições oficiais, e uma falha de renderização é contida por um error boundary. A lista da rota e o
fluxo de visita continuam alcançáveis em todos esses casos.

### Linha da sequência

A linha liga marcadores consecutivos pelo campo `order` já persistido em cada linha de
`route_points`. É visualização estática: mostra a sequência oficial de visita de relance, e não é
navegação nem rota calculada ou otimizada. Nenhum algoritmo de roteirização, caminho mínimo ou
reordenação de waypoints foi adicionado, nenhuma distância ou tempo estimado é calculado, e a ordem
nunca é recalculada ou inferida. A função `buildRouteSegments` apenas ordena os marcadores já
construídos pelo `order` persistido e junta cada par consecutivo. Cada segmento é uma `View` comum
dimensionada pela distância em linha reta e rotacionada com `Math.atan2`, a mesma abordagem sem
dependência extra usada na camada de tiles e marcadores.

## Feedback de estado

Todo estado sobre o qual o leiturista pode agir, carregamento, erro, offline e os estados de
sincronização `pending`, `syncing`, `synced` e `error`, é comunicado primeiro por texto escrito.
O `StatusBadge` acrescenta um símbolo por tom, vindo de `shared/presentation/theme/statusGlyph.ts`,
para que o status nunca dependa apenas de cor. Isso importa tanto para leitores com daltonismo
quanto para uma tela lida sob sol forte.

Trabalho demorado exibe um `ActivityIndicator` com papel de acessibilidade de barra de progresso ao
lado do rótulo. As ações que iniciam trabalho se desabilitam enquanto ele corre, para que um
segundo toque não dispare execução duplicada.

## Estratégia de testes

O comando `npm test` roda o test runner nativo do Node através do `tsx` e descobre todo arquivo
`src/**/*.test.ts`. Um teste novo passa a rodar só por existir, sem lista para manter em sincronia.
Nenhum teste acessa rede ou dispositivo.

Dois níveis são cobertos.

Lógica de domínio e de view-model roda contra dublês escritos à mão dos contratos de repositório e
de serviço: validação da leitura, idempotência do seed, conclusão da visita, pipeline da foto,
captura de localização, máquina de estados de sincronização, a trava de execução única e a regra de
reconexão.

Dados e schema rodam contra o motor SQLite real embutido no Node, através de
`shared/data/database/testing/inMemoryTestDatabase.ts`, um adaptador exclusivo de teste que
implementa a fatia de `SQLiteDatabase` que o aplicativo usa. É isso que torna verificáveis sem
emulador a ordem das migrações, a constraint ampliada de `sync_status`, a idempotência do seed em
nível de SQL e a chave estrangeira que liga uma visita ao seu ponto de rota. Esse adaptador nunca é
importado por código de produção.

### Teste de integração do fluxo principal

O arquivo `features/visits/presentation/mainVisitFlow.test.ts` percorre um ponto de ponta a ponta
pelas próprias funções de view-model das telas: detalhes do ponto, validação da leitura, contexto da
evidência, tratamento do desfecho da câmera, captura de localização, conclusão da visita e o estado
do painel de sincronização, tudo contra o schema real e os repositórios reais. Os únicos dublês são
os limites de dispositivo, ou seja, permissão de câmera e armazenamento durável, permissão e
posição de localização, e o gateway de envio. Nenhuma regra de domínio fica escondida atrás de mock.

Os cenários cobertos são o caminho offline até `pending` sobrevivendo a uma nova leitura do banco,
uma leitura inválida que nunca gera registro, a passagem por `pending`, `syncing` e `synced`, um
envio recusado que termina em `error` preservando a evidência e depois chega a `synced` na
retentativa, e um segundo gatilho durante uma execução sendo ignorado em vez de duplicar trabalho.
