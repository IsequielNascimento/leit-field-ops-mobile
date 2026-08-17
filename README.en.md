# LEIT Field Ops Mobile

Android application for a utility field agent to work an assigned meter reading route completely
offline: read the route and its service points from local storage, register a visit with the
current reading, a meter photo and the device location, and synchronize the recorded visits later.

Everything the agent does in the field works with no connection. Synchronization is the only step
that assumes a network, and it sits behind a boundary that a real API can replace.

Portuguese version, which is the primary document: [README.md](README.md).
Architecture details, in Portuguese: [docs/arquitetura.md](docs/arquitetura.md).

## Requirements

* Node.js 22.5 or newer (the test suite uses `node:sqlite`, the SQLite engine bundled with Node)
* npm
* Android Studio with an SDK and an emulator, or a physical device with USB debugging enabled

## Install and run

```bash
npm install
npm run android
```

`npm run android` runs `expo run:android`. On the first run it generates the native project under
`android/` and installs a development build on the device. The app uses native modules (SQLite,
camera, location, connectivity), so Expo Go is not enough.

To start only the bundler when a development build is already installed:

```bash
npm start
```

### Quality commands

```bash
npm run typecheck
npm run lint
npm test
npm run check
```

`npm run check` runs all three in sequence, exactly what `.github/workflows/ci.yml` runs on every
push and pull request. The tests touch no network and need no device.

## Why React Native

The challenge allows React Native or Flutter. React Native with Expo was chosen from this
problem's constraints, not from general preference.

The heaviest requirement here is offline persistence, not rendering. Expo ships first party
modules for exactly the four device concerns this app needs (SQLite, camera, file system and
location) under a single versioned SDK, which removes plugin compatibility research from the path
between the requirement and a working build.

The domain layer is plain TypeScript. Reading validation, the synchronization state machine and
the seed rules import nothing from a framework, so they run in Node's own test runner in
milliseconds, with no emulator involved. That is what made it practical to cover the schema and
the whole visit flow with automated tests.

Finally, TypeScript across domain, data and presentation keeps one language and one set of types
from the SQLite row to the screen, which is where I move fastest and most safely.

Flutter would have been defensible too, particularly for visual consistency. It was not chosen
because it would add a second language to the stack without improving anything the evaluation
actually weighs.

## Technologies used

Application base:

* Expo SDK 57 with React Native 0.86, runtime and Android build
* Expo Router for file based navigation, under `app/`
* TypeScript across every layer

Device requirements:

* Persistence: `expo-sqlite`, a single `leit_field_ops.db` database with versioned migrations
* Camera: `expo-camera` for the capture, `expo-file-system` for the durable copy and
  `expo-image-manipulator` for resizing and re-encoding
* Geolocation: `expo-location`
* Connectivity: `@react-native-community/netinfo`
* Background synchronization: `expo-background-task` with `expo-task-manager`

Quality:

* `typescript` for typechecking
* `tsx` with Node's built in test runner for the suite
* `eslint` with `eslint-config-expo`

No map SDK was added. The map is drawn with React Native primitives, as described below.

## State management

There is no external state library, and that is a deliberate decision.

The application state is small and almost entirely persisted state: route, points and visits live
in SQLite, and screens derive what they show from it when they gain focus. Adding Redux, Zustand
or MobX would create a second source of truth next to the database, with the cost of keeping the
two in step, and would not solve any problem this app actually has.

What exists instead:

* Each screen's state is an explicit union in a single `useState` (`loading`, `loaded`, `empty`,
  `error`), derived by pure view-model functions tested without rendering React.
* The two genuinely cross screen concerns, connectivity and the synchronization queue, are React
  contexts (`ConnectivityProvider` and `VisitSyncProvider`), each owning exactly one subscription
  and one runner for the whole tree.
* During a run, updates reach the screens through a listener registry, so the route list follows
  each transition live instead of polling the database.

## Loading the official route

The provided file ships with the app at `assets/data/rota_aldeota_mira.json` and is imported once,
on first launch, by an idempotent seed. Running the seed again never duplicates the route or its
points. After seeding, every screen reads the route from SQLite through the repository, never from
the JSON.

A note on the file name: the statement mentions `rota_aldeota_LEIT.json`, while the file actually
delivered is named `rota_aldeota_mira.json`. The delivered file is used unchanged, under the name
it arrived with, and both names are recorded in `OFFICIAL_ROUTE_PROVENANCE`, in
`src/features/routes/data/seed/officialRouteSource.ts`. Its seven points are untouched.

## Offline behaviour

Persistence is SQLite through `expo-sqlite`, in a single database. Migrations are ordered and
versioned, guarded by `PRAGMA user_version` written inside the same transaction as each step. A
database already at a given version never replays that step, so opening the app never recreates or
drops data.

In practice:

* Route and points are read from SQLite. Opening the app with no connection shows the full route.
* Registering a visit, including reading, photo, location and completion, performs no network
  access at all.
* A completed visit is written in a single repository call with `syncStatus` set to `pending`, so
  a failure cannot leave a half written record.
* Closing and reopening the app preserves the route and every recorded visit.
* Connectivity is observed through its own boundary. Being offline shows a notice but blocks
  nothing, and being online is never treated as a guarantee that a send will succeed.

## Registering a visit

Reading: the field is required and must be numeric. Empty and invalid values are refused with a
visible message, and no advanced consumption rule was invented.

Photo: camera permission is requested and every possible outcome, granted, denied, denied
permanently or a device failure, has its own visible state with a recovery action (retry, or open
the system settings). None of them breaks the flow. The capture is resized and re-encoded (longest
edge 1600 px, JPEG quality 0.7, never upscaled) and copied into the app's documents directory under
`visit-evidence/`. The visit record only ever references that durable file, never the temporary
cache path, so the evidence survives the cache being cleared. If image processing fails, the
original capture is stored instead: a processing failure costs file size, never the evidence.

Location: latitude, longitude and the capture timestamp come from the device and are stored on the
visit. Denial or unavailability becomes its own state with a retry, and the interface never claims
an accuracy the device did not report.

## Synchronization strategy

Sending is declared as a domain contract, `VisitSyncGateway`, in
`src/features/visits/domain/services/VisitSyncService.ts`:

```ts
interface VisitSyncGateway {
  sendVisit(visit: Visit): Promise<VisitSyncOutcome>;
}
```

The current implementation, `SimulatedVisitSyncGateway`, performs no network access. It waits
briefly so the `syncing` state is observable in the interface, and decides acceptance from an
injected reachability probe rather than at random, which keeps the failure path reproducible.

Each record moves through `pending`, `syncing` and `synced`, or settles in `error` when the send is
refused. Every transition is written to SQLite before the next step, so the state shown after a
restart is the state actually reached. A failed send preserves the record and its evidence and
stays eligible for a retry; only `sync_status` is rewritten. Both triggers, the manual action and
the reconnect hook, share one `VisitSyncRunner`, whose single flight guard answers a second trigger
with `skipped` instead of starting a parallel pass over the same records.

Replacing the simulation with a real API means writing an HTTP client that implements
`VisitSyncGateway` and injecting it where `SimulatedVisitSyncGateway` is built today, in
`VisitSyncProvider`. The use case, the view-models and every screen stay unchanged.

### Background synchronization

A task registered through `expo-background-task` calls the same use case, the same runner and the
same state machine as the manual action, duplicating no rule, and only touches records that are
already eligible. It is an optimization, not a mechanism the product depends on: on Android
scheduling goes through WorkManager, so battery, Doze, app standby and aggressive vendor managers
decide if and when it runs, and a force stopped app never runs it. Registration failures are
swallowed and the interface promises no background execution.

## Map and route sequence

The route map is drawn with React Native's own `Image` and `View` over OpenStreetMap derived base
tiles, with no native map SDK. No Google Maps API key and no extra Android configuration are
required: a clean `npx expo run:android` is enough.

The seven markers come from the coordinates persisted in `route_points`, and a straight line joins
the points in the official order, from 1 to 7. That line is only a visualization of the given
sequence. It is not turn by turn navigation, and no routing, optimization or waypoint reordering
algorithm was added. If tiles fail to load, the numbered markers stay in their correct positions,
and a map failure never blocks the route list or the visit flow.

## Technical decisions

Feature first organization, with an MVVM inspired split. Expo Router files under `app/` act only as
navigation coordinators; the product lives in `src/`.

```
src/features/<feature>/presentation     screens, view-models and components
src/features/<feature>/domain           entities, validation, use cases and contracts
src/features/<feature>/data             repositories and local data sources
src/features/<feature>/infrastructure   device and platform implementations
src/shared                              design tokens, UI primitives and database setup
```

The decisions that shaped the code most:

Domain declares, infrastructure implements. Camera, location, image processing, connectivity and
sending are all domain interfaces, with platform implementations injected at the route layer. That
is what makes the flow testable without a device and the sync gateway replaceable without touching
the interface.

View-models are pure functions. Screen state derivation, validation, sync state description and map
geometry are plain functions, tested without rendering React Native.

SQLite is the runtime source of truth. The provided JSON is seed input, not a data source.

No speculative abstraction. There is no backend, no authentication and no layer that a delivered
requirement did not need.

Text always accompanies state. No status depends on colour alone: each tone also carries its own
symbol, and work in progress shows a progress indicator next to its label. Actions that start work
disable themselves while it runs, so a second tap cannot trigger a duplicate run.

[docs/arquitetura.md](docs/arquitetura.md) covers each of these decisions in depth, in Portuguese.

## Tests

`npm test` runs Node's test runner through `tsx` over every `src/**/*.test.ts`. Nothing touches the
network or a device, and the command needs no emulator.

Coverage has two levels. The first is domain and view-model logic against doubles of the repository
and service contracts: reading validation, seed idempotency, visit completion, the photo pipeline,
location capture, the synchronization state machine, the single flight guard and the reconnect
rule. The second is schema and repositories against the real SQLite engine bundled with Node, which
makes migration ordering, the `sync_status` constraint, seed idempotency at SQL level and the
foreign key from a visit to its route point verifiable without an emulator.

There is also an integration test that walks the main visit flow end to end through the screens'
own view-model functions, with doubles only at the device boundaries.

## Implemented differentials

* Map with the seven official points
* Route sequence visualization, without optimization
* Connectivity detection with an offline indicator that blocks nothing
* Automatic synchronization on reconnect
* Failure handling with a persisted `error` state and retry
* Image handling with resizing and compression
* Automated tests, including schema, repositories and the main flow
* Separation between interface, persistence, rules, services and synchronization

## Limitations and next steps

Synchronization is simulated. No server exists; `SimulatedVisitSyncGateway` is precisely the seam a
real HTTP client would replace, with no change to the layers above.

Background synchronization is opportunistic. Android decides if and when it runs, and the app stays
correct if it never does. The guaranteed paths remain the manual action and the reconnect attempt.

There is no OCR. The reading is always typed by the agent. The item is optional in the statement and
would require a native module with an on device recognition library. The natural evolution would be
isolating it behind a domain interface and treating the recognized number as an editable
suggestion, never as a replacement for typing.

The map uses raster tiles, which need a connection to load. Markers and the sequence line are drawn
from local coordinates and still render offline, without the base map underneath. The evolution
would be bundling a small tile set for the region with the app.

In practice the target is Android. The iOS configuration is present, but development and
verification were done against Android.

There are no component render tests. Interaction is covered by view-model and integration tests
rather than a rendering library.
