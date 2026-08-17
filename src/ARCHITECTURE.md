# Architecture baseline

The product follows a pragmatic MVVM-C-inspired, feature-first structure. Expo Router files remain in `app/` and act only as navigation coordinators. Product modules live in `src/`.

## Boundaries

- `features/<feature>/presentation`: screens, view state and user interaction.
- `features/<feature>/domain`: entities, validation and use cases without framework dependencies.
- `features/<feature>/data`: repositories and local data sources implementing domain needs.
- `infrastructure`: device and platform integrations such as camera, location, files and connectivity.

Routes may compose Presentation. Presentation must reach Data or Infrastructure through Domain use cases and contracts introduced by the task that needs them. Empty boundaries stay free of speculative APIs until concrete requirements exist.

## Route map rendering

The route map draws raster basemap tiles with plain React Native `Image` and `View`
primitives instead of a native map SDK. Tiles come from the keyless CARTO basemap CDN, which
is rendered from OpenStreetMap data and is attributed in the card footer.

- **No Android map configuration is required.** There is no Google Maps API key, no
  `AndroidManifest` meta-data and no extra config plugin in `app.json`. A clean
  `npx expo run:android` is enough, and the map does not depend on Play Services being
  present on the emulator or device.
- Marker coordinates come from `route_points` in SQLite through `RouteRepository`, never
  from the bundled JSON at render time and never from the visual prototype.
- `RouteMapViewModel` holds the Web Mercator projection, the fit-to-bounds zoom and the tile
  selection as pure functions, so map geometry is unit tested without a device.
- Degradation is layered: points with unusable coordinates are dropped, an unmeasured or
  empty viewport renders an explanatory placeholder, failed tile requests leave the numbered
  markers in their official positions, and a render failure is contained by an error boundary.
  The route list and the visit flow stay reachable in every one of those cases.

### Route sequence line

The map draws a straight line connecting consecutive markers by the `order` field already
persisted on each `route_points` row. This is a **static visualization only**: it shows the
official visiting sequence at a glance, and it is not turn-by-turn directions and not a
computed or optimized route. No routing, shortest-path or waypoint-reordering algorithm is
involved, no distance or ETA is calculated, and the order is never recomputed or inferred —
`buildRouteSegments` in `RouteMapViewModel` only sorts the already-built markers by their
persisted `order` and joins each consecutive pair. Each segment is rendered as a plain `View`
sized to the straight-line distance between its two markers and rotated with
`Math.atan2(dy, dx)`, the same no-extra-dependency approach the tile/marker layer uses, so no
SVG or drawing library is added for it.

## Visit photo compression

Meter photos are captured at full sensor resolution and are then resized and re-encoded
before anything durable is written. The policy is a single explicit constant,
`VISIT_PHOTO_IMAGE_POLICY` in `features/visits/domain/services/ImageProcessingService.ts`:

- **Longest edge: 1600 px.** A 12 MP capture (4000 x 3000) becomes 1600 x 1200, about 1.9 MP.
  A meter register that fills a modest part of the frame still keeps several pixels per digit
  stroke, which is what makes the number readable to a reviewer and to future OCR. Smaller
  targets such as 1024 px start smearing the meter serial and the small printed text next to it.
- **JPEG quality: 0.7.** Comfortably above the level where 8x8 block artefacts begin closing
  thin digit strokes, while cutting a typical capture from several megabytes to a few hundred
  kilobytes. That ratio matters because a full route is captured offline and every photo sits
  on the device until synchronization happens.
- **Never upscale.** `resolveEvidenceDownscale` returns `null` when the capture already fits the
  policy or when the reported dimensions are unusable, so a small image is only re-encoded.
- **Library:** `expo-image-manipulator`, wrapped by `ExpoVisitPhotoProcessor` in
  `features/visits/infrastructure/imaging`.

The boundary follows the direction used everywhere else: `VisitPhotoProcessor` is declared in
Domain, implemented in Infrastructure, and injected into `prepareVisitPhoto` next to
`DurablePhotoStorage`. Compression is an explicit step in the use case rather than a hidden
detail of durable storage, so the ordering is visible and unit tested.

### Ordering and failure fallback

`expo-image-manipulator` writes its result to the cache directory, so the processed file is
still temporary. The pipeline is therefore **capture (temporary) -> compress (temporary) ->
`preserveCapture` (documents/`visit-evidence`)**, and the visit record only ever receives the
final durable URI.

If compression throws or returns a blank URI, `prepareVisitPhoto` stores the untouched original
capture instead of aborting. A processing failure costs image size, never the evidence or the
visit-completion flow. Durable storage failing is the only case that still reports `failed`,
because at that point there is no file that would survive the cache being cleared.

## Status feedback

Every state a field agent can act on — loading, error, offline, and the visit sync states
`pending`, `syncing`, `synced` and `error` — is reported with a written label first. `StatusBadge`
additionally prefixes a per-tone glyph from `shared/presentation/theme/statusGlyph.ts`, so a
status is never carried by colour alone, which matters both for colour-blind readers and for a
phone screen read in direct sunlight. Long-running work adds an `ActivityIndicator` with
`accessibilityRole="progressbar"` next to its label, and the actions that start work
(`Sync pending visits`, `Complete visit`, `Capture photo`) disable themselves while running so a
second tap cannot start a duplicate run.
