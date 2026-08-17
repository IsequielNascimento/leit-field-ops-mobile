# LEIT Field Ops Mobile

Aplicativo Android para o leiturista percorrer uma rota de atendimento trabalhando offline:
consultar a rota e seus pontos no armazenamento local, registrar a visita com leitura, foto do
medidor e localização, e sincronizar depois.

Stack: Expo SDK 57, React Native 0.86, TypeScript, SQLite.

Versão em inglês: [README.en.md](README.en.md). Decisões detalhadas:
[docs/arquitetura.md](docs/arquitetura.md).

## Execução

Requer Node.js 22.5 ou superior, npm e Android Studio com emulador ou aparelho físico.

```bash
npm install
npm run android
```

O `npm run android` executa `expo run:android`, que gera o projeto nativo na primeira vez e
instala um development build. O app usa módulos nativos, então o Expo Go não é suficiente. Com o
build já instalado, `npm start` sobe apenas o bundler.

Qualidade: `npm run typecheck`, `npm run lint`, `npm test`. O `npm run check` roda os três, que é
o mesmo que o CI executa. Os testes não acessam rede nem dependem de dispositivo.

### Gerando o APK

```bash
npx expo prebuild -p android
cd android && ./gradlew assembleRelease
```

O APK sai em `android/app/build/outputs/apk/release/`. O build exige JDK 17 e o Android SDK
apontado por `ANDROID_HOME`.

A assinatura de release é injetada pelo config plugin `plugins/withReleaseSigning.js`, porque o
`expo prebuild` regenera a pasta `android/` e descartaria qualquer edição manual no `build.gradle`.
O plugin lê quatro propriedades Gradle (`LEIT_RELEASE_STORE_FILE`, `LEIT_RELEASE_STORE_PASSWORD`,
`LEIT_RELEASE_KEY_ALIAS` e `LEIT_RELEASE_KEY_PASSWORD`), que ficam em `~/.gradle/gradle.properties`,
fora do repositório. A keystore também não é versionada. Quando essas propriedades não existem,
que é o caso de quem acabou de clonar, o build cai na chave de debug e ainda produz um APK
instalável, em vez de falhar.

## Tecnologias

* Persistência: `expo-sqlite`, banco único com migrações versionadas
* Câmera: `expo-camera`, com `expo-file-system` para a cópia durável e `expo-image-manipulator`
  para redimensionar e comprimir
* Geolocalização: `expo-location`
* Conectividade: `@react-native-community/netinfo`
* Sincronização em segundo plano: `expo-background-task` e `expo-task-manager`
* Navegação: Expo Router
* Testes: test runner nativo do Node via `tsx`. Lint: `eslint-config-expo`

Não há SDK de mapa nem biblioteca de estado. Os motivos estão em Decisões técnicas.

## Funcionamento offline

A rota fornecida é importada uma única vez, na primeira abertura, por um seed idempotente que
grava tudo no SQLite. A partir daí as telas leem do banco através de repositórios, nunca do JSON.

As migrações são ordenadas e versionadas, com o `PRAGMA user_version` gravado dentro da mesma
transação que altera o schema. Um banco que já está em determinada versão não reexecuta aquele
passo, então abrir o app nunca recria nem apaga dados.

Na prática: abrir sem conexão mostra a rota completa; registrar a visita não faz nenhum acesso de
rede; a visita é gravada em uma única chamada de repositório com `syncStatus` igual a `pending`,
de modo que uma falha não deixa registro pela metade; e fechar e reabrir preserva tudo. Estar
offline exibe um aviso, mas não bloqueia nada.

## Sincronização

O envio é um contrato de domínio em
`src/features/visits/domain/services/VisitSyncService.ts`:

```ts
interface VisitSyncGateway {
  sendVisit(visit: Visit): Promise<VisitSyncOutcome>;
}
```

A implementação atual é um simulador local sem acesso de rede. Ele apenas aguarda um instante
para o estado `syncing` ser observável, e decide a aceitação por uma sonda injetada em vez de
sorteio, o que mantém o caminho de falha reproduzível.

Cada registro percorre `pending`, `syncing` e `synced`, ou termina em `error` quando recusado.
Toda transição é gravada antes do passo seguinte, então o estado exibido depois de um reinício é
o estado realmente alcançado. Uma falha preserva o registro e sua evidência, reescrevendo apenas
`sync_status`, e continua elegível para nova tentativa. A ação manual e o disparo por reconexão
compartilham a mesma trava de execução única, então um segundo gatilho não inicia passagem
paralela.

Para trocar pela API real, basta um cliente HTTP que implemente `VisitSyncGateway`, injetado onde
hoje o simulador é construído. Caso de uso, view-models e telas não mudam.

## Decisões técnicas

Organização por feature, com separação inspirada em MVVM. Os arquivos do Expo Router em `app/`
são apenas coordenadores de navegação.

```
src/features/<feature>/presentation     telas, view-models e componentes
src/features/<feature>/domain           entidades, validação, casos de uso e contratos
src/features/<feature>/data             repositórios e fontes de dados locais
src/features/<feature>/infrastructure   implementações de dispositivo e plataforma
src/shared                              tokens visuais, primitivas de UI e setup do banco
```

* **O domínio declara, a infraestrutura implementa.** Câmera, localização, processamento de
  imagem, conectividade e envio são interfaces de domínio, com implementações injetadas na camada
  de rota. É o que torna o fluxo testável sem dispositivo e o gateway substituível sem tocar na
  interface.
* **View-models são funções puras.** Estado de tela, validação e geometria do mapa são funções
  comuns, testadas sem renderizar React Native.
* **SQLite é a fonte de verdade.** O JSON é entrada de seed, não fonte de dados.
* **Sem biblioteca de estado.** O estado é quase todo persistido no banco; Redux ou equivalente
  criaria uma segunda fonte de verdade. Cada tela usa uma união explícita em um `useState`, e as
  duas preocupações transversais são contextos React.
* **Sem SDK de mapa.** O mapa é desenhado com `Image` e `View` sobre tiles do OpenStreetMap, o que
  dispensa chave de API e qualquer configuração extra no Android.
* **Status nunca depende só de cor.** Cada tom traz também um símbolo, e ações que iniciam
  trabalho se desabilitam enquanto ele corre.
* **Sem abstração especulativa.** Não há backend, autenticação nem camada que um requisito
  entregue não tenha exigido.

## Por que React Native

O requisito de maior peso aqui é persistência offline, não renderização. O Expo entrega módulos de
primeira linha para as quatro necessidades de dispositivo do app (SQLite, câmera, sistema de
arquivos e localização) sob um único SDK versionado, o que elimina pesquisa de compatibilidade de
plugins entre o requisito e um build funcionando. Além disso, a camada de domínio fica em
TypeScript puro e roda no test runner do Node em milissegundos, sem emulador, que foi o que tornou
viável cobrir schema e fluxo de visita com testes automatizados.

Flutter também seria defensável, principalmente pela consistência visual, mas acrescentaria uma
segunda linguagem sem melhorar o que a avaliação de fato pesa.

## Testes

`npm test` cobre `src/**/*.test.ts` em dois níveis: lógica de domínio e view-model contra dublês
dos contratos, e schema e repositórios contra o motor SQLite real embutido no Node, o que torna
verificáveis sem emulador a ordem das migrações, a idempotência do seed em SQL e a chave
estrangeira da visita. Há ainda um teste de integração que percorre o fluxo principal de ponta a
ponta pelas funções de view-model das telas, com dublês apenas nos limites de dispositivo.

## Diferenciais implementados

Mapa com os sete pontos, visualização da sequência do percurso, detecção de conectividade,
sincronização automática ao reconectar, tratamento de falhas com estado `error` persistido e nova
tentativa, redimensionamento e compressão das imagens, testes automatizados e separação entre
interface, persistência, regras, serviços e sincronização.

## Limitações

* **A sincronização é simulada.** Não existe servidor. O simulador é a costura que um cliente HTTP
  real substituiria, sem alteração nas camadas acima.
* **A sincronização em segundo plano é oportunista.** No Android o WorkManager decide se e quando
  executá-la. O app permanece correto se ela nunca rodar; os caminhos garantidos são a ação manual
  e a tentativa ao reconectar.
* **Não há OCR.** A leitura é sempre digitada. O item é opcional no enunciado e exigiria módulo
  nativo. A evolução seria isolá-lo atrás de uma interface de domínio, tratando o número
  reconhecido como sugestão editável.
* **O mapa usa tiles raster**, que precisam de conexão para carregar. Marcadores e linha continuam
  aparecendo offline, sem o mapa de fundo. A evolução seria empacotar tiles da região com o app.
* **O alvo é Android.** A configuração de iOS existe, mas a verificação foi feita em Android.
* **Não há testes de renderização de componente.** A interação é coberta por testes de view-model
  e de integração.

## Sobre o arquivo da rota

O enunciado cita `rota_aldeota_LEIT.json` e o arquivo entregue chama-se `rota_aldeota_mira.json`.
Ele é usado sem alteração, sob o nome em que foi recebido, e os dois nomes ficam registrados em
`OFFICIAL_ROUTE_PROVENANCE`, em `src/features/routes/data/seed/officialRouteSource.ts`.
