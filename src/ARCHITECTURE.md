# Architecture baseline

The product follows a pragmatic MVVM-C-inspired, feature-first structure. Expo Router files remain in `app/` and act only as navigation coordinators. Product modules live in `src/`.

## Boundaries

- `features/<feature>/presentation`: screens, view state and user interaction.
- `features/<feature>/domain`: entities, validation and use cases without framework dependencies.
- `features/<feature>/data`: repositories and local data sources implementing domain needs.
- `infrastructure`: device and platform integrations such as camera, location, files and connectivity.

Routes may compose Presentation. Presentation must reach Data or Infrastructure through Domain use cases and contracts introduced by the task that needs them. Empty boundaries stay free of speculative APIs until concrete requirements exist.
