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
