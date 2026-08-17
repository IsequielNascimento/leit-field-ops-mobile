# LEIT Field Ops Mobile

Android application for a utility field agent to work an assigned meter-reading route
completely offline: read the route and its service points from local storage, register a visit
with the current reading, a meter photo and the device location, and synchronize the recorded
visits later.

Everything the agent does works with no connection. Synchronization is the only step that
assumes a network, and it is currently simulated behind a replaceable boundary.

## Requirements

- Node.js 22.5 or newer (the test suite uses `node:sqlite`, the SQLite engine bundled with Node)
- npm
- Android Studio with an SDK and an emulator or a physical device with USB debugging

## Install and run

```bash
npm install
npm run android      # builds and installs the development build on Android
```

`npm run android` runs `expo run:android`, which generates the native `android/` project on the
first run and installs a development build. The project uses native modules (SQLite, camera,
location, connectivity), so **Expo Go is not enough** — a development build is required.

To start only the bundler against an already installed development build:

```bash
npm start
```

### Quality commands

```bash
npm run typecheck    # tsc --noEmit
npm run lint         # eslint over the whole project
npm test             # Node test runner over src/**/*.test.ts, no network, no device
npm run check        # all three, in that order — the same steps CI runs
```

`.github/workflows/ci.yml` runs exactly those three steps on every push and pull request.

## Framework and main libraries

| Library | Used for |
| --- | --- |
| Expo SDK 57 + React Native 0.86 | application runtime and Android build |
| `expo-router` | file-based navigation (`app/`) |
| `expo-sqlite` | durable local database |
| `expo-camera` | meter photo capture |
| `expo-file-system` | durable copy of the captured photo |
| `expo-image-manipulator` | resizing and re-encoding the photo |
| `expo-location` | latitude/longitude of the visit |
| `@react-native-community/netinfo` | connectivity detection |
| `expo-background-task` + `expo-task-manager` | opportunistic background synchronization |
| `typescript`, `tsx`, `node:test` | typechecking and the test suite |
| `eslint` + `eslint-config-expo` | linting |

No map SDK is used — see [Map](#map) below.

## How it works

### Local data and persistence

Persistence is SQLite through `expo-sqlite`, in a single database `leit_field_ops.db`.

- Ordered, versioned migrations run at startup (`src/shared/data/database/migrations.ts`),
  guarded by `PRAGMA user_version` inside the same transaction as each step. A database already
  at a version never replays it, so opening the app never recreates or drops data.
- Tables: `routes`, `route_points` and `visits`. A visit stores the point, installation, meter,
  previous and current reading, photo URI, latitude, longitude, capture timestamp and sync status.
- Repositories (`SQLiteRouteRepository`, `SQLiteVisitRepository`) own all SQL; screens only see
  domain types through repository contracts.

### The official route

The provided route file ships with the app at `assets/data/rota_aldeota_mira.json` and is
imported once, on first launch, by an idempotent seed. Re-running the seed never duplicates the
route or its points. After seeding, every screen reads the route from SQLite through the
repository — never from the JSON.

> **File name note.** The challenge statement refers to `rota_aldeota_LEIT.json` while the file
> actually delivered was named `rota_aldeota_mira.json`. The delivered file is used unchanged,
> under its delivered name, and both names are recorded in `OFFICIAL_ROUTE_PROVENANCE` in
> `src/features/routes/data/seed/officialRouteSource.ts`. Its seven points are untouched.

### Camera

The agent captures the meter photo with `expo-camera`. Permission is requested and every outcome
— granted, denied, denied permanently, or a camera failure — has its own visible state with a
recovery action (retry, or open the system settings); none of them crashes the flow.

The capture is then resized and re-encoded (longest edge 1600 px, JPEG quality 0.7, never
upscaled) and copied into the app's documents directory under `visit-evidence/`. The visit record
only ever references that durable file, never the camera's temporary cache path, so the evidence
survives the cache being cleared. If image processing fails, the untouched capture is stored
instead — a processing failure costs image size, never the evidence.

### Geolocation

`expo-location` provides the current position when the visit is registered. Latitude, longitude
and the capture timestamp are read from the device and stored on the visit. Denial or an
unavailable fix is reported as its own state with a retry, and the interface never claims an
accuracy figure the device did not report.

### Offline behaviour

- Route and points are read from SQLite; opening the app with no connection shows the full route.
- Registering a visit — reading, photo, location, completion — performs no network access at all.
- A completed visit is written in a single repository call with `syncStatus = 'pending'`, so a
  failure cannot leave a half-written record.
- Closing and reopening the app preserves the route and every recorded visit.
- Connectivity is observed through a `ConnectivityService` boundary. Being offline shows a banner
  but blocks nothing, and `connected` is never treated as a guarantee that a send will succeed.

### Synchronization (simulated)

Sending is declared as a domain contract, `VisitSyncGateway` in
`src/features/visits/domain/services/VisitSyncService.ts`:

```ts
interface VisitSyncGateway {
  sendVisit(visit: Visit): Promise<VisitSyncOutcome>;
}
```

The current implementation, `SimulatedVisitSyncGateway`, performs **no network access**. It waits
briefly so the `syncing` state is observable, and decides acceptance from an injected
reachability probe rather than randomly, which keeps the failure path reproducible.

Each record moves `pending → syncing → synced`, or settles in `error` when the send is refused,
and every transition is written to SQLite before the next step — so the status shown after a
restart is the status actually reached. A failed send keeps the record and its evidence intact
and stays eligible for a retry; only `sync_status` is ever rewritten. Both triggers, the manual
action and the reconnect hook, share one `VisitSyncRunner`, whose single-flight guard answers a
second trigger with `skipped` instead of starting a parallel pass.

**Replacing the simulation with a real API** means writing an HTTP client that implements
`VisitSyncGateway` and passing it where `SimulatedVisitSyncGateway` is constructed today
(`VisitSyncProvider`). The use case, the view-models and every screen stay unchanged.

### Background synchronization

A background task registered through `expo-background-task` calls the same use case, the same
runner and the same state machine as the manual action — no rule is duplicated, and it only ever
touches records that are already eligible. It is an optimization, not a mechanism the product
depends on: Android schedules it through WorkManager, so battery state, Doze, app standby and
vendor battery managers decide if and when it runs, a force-stopped app never runs it, and
registration failures are swallowed. Nothing in the interface promises background execution.

### Map

The route map is drawn with plain React Native `Image` and `View` primitives over keyless
OpenStreetMap-derived basemap tiles, instead of a native map SDK. **No Google Maps API key and no
extra Android configuration are required** — a clean `npx expo run:android` is enough.

The seven markers come from the coordinates persisted in `route_points`, and a straight line
connects them in the official `order` from 1 to 7. That line is a **visualization of the given
sequence only** — it is not turn-by-turn directions, and no routing, optimization or
waypoint-reordering algorithm is involved. If tiles fail to load, the numbered markers stay in
place, and a map failure never blocks the route list or the visit flow.

## Architecture

Feature-first, with an MVVM-inspired split. Expo Router files in `app/` are navigation
coordinators only; the product lives in `src/`.

```
src/features/<feature>/presentation   screens, view-models, components
src/features/<feature>/domain         entities, validation, use cases, service contracts
src/features/<feature>/data           repositories and local data sources
src/features/<feature>/infrastructure device/platform implementations of domain contracts
src/shared                            design tokens, UI primitives, database setup
```

Key decisions:

- **Domain declares, infrastructure implements.** Camera, location, image processing,
  connectivity and sending are all domain interfaces with platform implementations injected at
  the route layer. That is what makes the flow testable without a device and the sync gateway
  replaceable without touching the UI.
- **View-models are pure functions.** Screen state derivation, validation, sync-state description
  and map geometry are plain functions unit-tested without rendering React Native.
- **SQLite is the runtime source of truth.** The bundled JSON is a seed input, not a data source.
- **No speculative abstractions.** There is no backend, no authentication and no layer that a
  delivered requirement did not need.

`src/ARCHITECTURE.md` documents the individual decisions in more depth.

## Tests

`npm test` runs Node's test runner through `tsx` over every `src/**/*.test.ts`. Nothing touches
the network or a device.

- Domain and view-model logic against fakes of the repository/service contracts: reading
  validation, seed idempotency, visit completion, the photo pipeline, location capture, the sync
  state machine, its single-flight runner and the reconnect rule.
- Schema and repositories against the real SQLite engine bundled with Node: migration ordering
  and replay safety, the `sync_status` constraint, seed idempotency at SQL level, and the foreign
  key from a visit to its route point.
- One integration test drives the main visit flow end to end through the screens' own view-model
  functions, faking only the device boundaries.

## Implemented differentials

- Connectivity detection with an offline indicator that blocks nothing
- Persisted `error` state, manual retry, and an automatic attempt on reconnect
- Route map with the seven official markers and the official sequence drawn between them
- Photo resizing and compression before durable storage
- Opportunistic background synchronization reusing the same use case
- An integration test over the main visit flow

## Limitations and next steps

- **Synchronization is simulated.** No server exists; `SimulatedVisitSyncGateway` is the seam a
  real HTTP client would replace.
- **Background synchronization is opportunistic.** A registered background task reuses the same
  synchronization use case, but Android's WorkManager decides if and when it runs — battery,
  Doze, app standby and vendor battery managers can delay it indefinitely, and a force-stopped
  app never runs it. The app is fully correct if it never runs; the manual action and the
  reconnect attempt remain the paths that are actually guaranteed.
- **No on-device OCR.** The reading is always typed by the agent.
- **The map uses raster tiles.** Tiles need a connection to load; markers and the sequence line
  are drawn from local coordinates and still render offline, without the basemap underneath.
- **Android only in practice.** The iOS configuration is present but the app was developed and
  verified against Android.
- **No component-render tests.** Interaction is covered through view-model and integration tests
  rather than a rendering library.
