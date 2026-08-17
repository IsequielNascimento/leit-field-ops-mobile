# LEIT Field Ops Mobile

Android application for a utility field agent to work a meter reading route offline: read the
route and its points from local storage, register a visit with the reading, a meter photo and the
device location, and synchronize later.

Stack: Expo SDK 57, React Native 0.86, TypeScript, SQLite.

**Ready to install: [`leit-field-ops.apk`](leit-field-ops.apk)**, in the repository root. It runs on
a physical device and on an emulator, with nothing to compile. Installing outside the Play Store
makes Android ask for confirmation about an unknown source.

Portuguese version, the primary document: [README.md](README.md). Detailed decisions, in
Portuguese: [docs/arquitetura.md](docs/arquitetura.md).

## Running

Requires Node.js 22.5 or newer, npm, and Android Studio with an emulator or a physical device.

```bash
npm install
npm run android
```

`npm run android` runs `expo run:android`, which generates the native project on the first run and
installs a development build. The app uses native modules, so Expo Go is not enough. With the
build installed, `npm start` starts only the bundler.

Quality: `npm run typecheck`, `npm run lint`, `npm test`. `npm run check` runs all three, which is
what CI runs. The tests touch no network and need no device.

### Building the APK

```bash
npx expo prebuild -p android
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,x86_64
```

The APK lands in `android/app/build/outputs/apk/release/`. The build needs JDK 17 and the Android
SDK pointed at by `ANDROID_HOME`.

Those two architectures cover modern physical devices and the standard emulator. Without the
parameter Gradle also packages `armeabi-v7a` and `x86`, both 32 bit and only relevant to old
devices, and the APK goes past 120 MB. Restricting them is what keeps the committed file under
GitHub's 100 MB per file limit.

Release signing is injected by the `plugins/withReleaseSigning.js` config plugin, because
`expo prebuild` regenerates `android/` and would discard any manual `build.gradle` edit. The plugin
reads four Gradle properties (`LEIT_RELEASE_STORE_FILE`, `LEIT_RELEASE_STORE_PASSWORD`,
`LEIT_RELEASE_KEY_ALIAS` and `LEIT_RELEASE_KEY_PASSWORD`) kept in `~/.gradle/gradle.properties`,
outside the repository. The keystore is not versioned either. When those properties are absent,
which is the case for anyone who just cloned the project, the build falls back to the debug key and
still produces an installable APK instead of failing.

## Technologies

* Persistence: `expo-sqlite`, a single database with versioned migrations
* Camera: `expo-camera`, with `expo-file-system` for the durable copy and `expo-image-manipulator`
  for resizing and compression
* Geolocation: `expo-location`
* Connectivity: `@react-native-community/netinfo`
* Background synchronization: `expo-background-task` and `expo-task-manager`
* Navigation: Expo Router
* Tests: Node's built in test runner via `tsx`. Lint: `eslint-config-expo`

There is no map SDK and no state library. The reasons are under Technical decisions.

## Offline behaviour

The provided route is imported once, on first launch, by an idempotent seed that writes everything
to SQLite. From then on the screens read from the database through repositories, never from the
JSON.

Migrations are ordered and versioned, with `PRAGMA user_version` written inside the same
transaction that changes the schema. A database already at a given version does not replay that
step, so opening the app never recreates or drops data.

In practice: opening with no connection shows the full route; registering a visit performs no
network access; the visit is written in a single repository call with `syncStatus` set to
`pending`, so a failure cannot leave a half written record; and closing and reopening preserves
everything. Being offline shows a notice but blocks nothing.

## Synchronization

Sending is a domain contract in `src/features/visits/domain/services/VisitSyncService.ts`:

```ts
interface VisitSyncGateway {
  sendVisit(visit: Visit): Promise<VisitSyncOutcome>;
}
```

The current implementation is a local simulator with no network access. It waits briefly so the
`syncing` state is observable, and decides acceptance from an injected probe rather than at
random, which keeps the failure path reproducible.

Each record moves through `pending`, `syncing` and `synced`, or settles in `error` when refused.
Every transition is written before the next step, so the state shown after a restart is the state
actually reached. A failure preserves the record and its evidence, rewriting only `sync_status`,
and stays eligible for a retry. The manual action and the reconnect hook share one single flight
guard, so a second trigger does not start a parallel pass.

To switch to a real API, write an HTTP client implementing `VisitSyncGateway` and inject it where
the simulator is built today. Use case, view-models and screens do not change.

## Technical decisions

Feature first organization with an MVVM inspired split. Expo Router files under `app/` act only as
navigation coordinators.

```
src/features/<feature>/presentation     screens, view-models and components
src/features/<feature>/domain           entities, validation, use cases and contracts
src/features/<feature>/data             repositories and local data sources
src/features/<feature>/infrastructure   device and platform implementations
src/shared                              design tokens, UI primitives and database setup
```

* **Domain declares, infrastructure implements.** Camera, location, image processing, connectivity
  and sending are domain interfaces, with implementations injected at the route layer. That is
  what makes the flow testable without a device and the gateway replaceable without touching the
  interface.
* **View-models are pure functions.** Screen state, validation and map geometry are plain
  functions, tested without rendering React Native.
* **SQLite is the source of truth.** The JSON is seed input, not a data source.
* **No state library.** State is almost entirely persisted in the database; Redux or equivalent
  would create a second source of truth. Each screen uses an explicit union in one `useState`, and
  the two cross screen concerns are React contexts.
* **No map SDK.** The map is drawn with `Image` and `View` over OpenStreetMap tiles, which needs
  no API key and no extra Android configuration.
* **Status never depends on colour alone.** Each tone also carries a symbol, and actions that
  start work disable themselves while it runs.
* **No speculative abstraction.** There is no backend, no authentication and no layer a delivered
  requirement did not need.

## Why React Native

The heaviest requirement here is offline persistence, not rendering. Expo ships first party
modules for the app's four device concerns (SQLite, camera, file system and location) under a
single versioned SDK, removing plugin compatibility research from the path between the requirement
and a working build. The domain layer stays plain TypeScript and runs in Node's test runner in
milliseconds, with no emulator, which is what made covering the schema and the visit flow with
automated tests practical.

Flutter would have been defensible too, mainly for visual consistency, but it would add a second
language without improving what the evaluation actually weighs.

## Tests

`npm test` covers `src/**/*.test.ts` at two levels: domain and view-model logic against doubles of
the contracts, and schema and repositories against the real SQLite engine bundled with Node, which
makes migration ordering, seed idempotency at SQL level and the visit foreign key verifiable
without an emulator. An integration test also walks the main flow end to end through the screens'
view-model functions, with doubles only at the device boundaries.

## Implemented differentials

Map with the seven points, route sequence visualization, connectivity detection, automatic
synchronization on reconnect, failure handling with a persisted `error` state and retry, image
resizing and compression, automated tests, and separation between interface, persistence, rules,
services and synchronization.

## Limitations

* **Synchronization is simulated.** No server exists. The simulator is the seam a real HTTP client
  would replace, with no change to the layers above.
* **Background synchronization is opportunistic.** On Android, WorkManager decides if and when it
  runs. The app stays correct if it never does; the guaranteed paths are the manual action and the
  reconnect attempt.
* **There is no OCR.** The reading is always typed. The item is optional in the statement and
  would require a native module. The evolution would be isolating it behind a domain interface,
  treating the recognized number as an editable suggestion.
* **The map uses raster tiles**, which need a connection to load. Markers and the sequence line
  still render offline, without the base map. The evolution would be bundling regional tiles.
* **The target is Android.** iOS configuration exists, but verification was done on Android.
* **There are no component render tests.** Interaction is covered by view-model and integration
  tests.

## About the route file

The statement mentions `rota_aldeota_LEIT.json` and the delivered file is named
`rota_aldeota_mira.json`. It is used unchanged, under the name it arrived with, and both names are
recorded in `OFFICIAL_ROUTE_PROVENANCE`, in
`src/features/routes/data/seed/officialRouteSource.ts`.
