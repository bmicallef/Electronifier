# Electronifier
Electronifier is a native .NET orchestration hub that packages self-hosted .NET services inside lightweight Photino wrappers for macOS, Windows, and Linux.

## Current state
- Wiretap-based desktop UI (`src/Electronifier.Desktop`) now runs a splash screen, then a dependency check/install workflow, and finally a projects dashboard with project list and creation form.
- Core domain (`src/Electronifier.Core`) models projects, releases, launch configuration, publication targets, and encrypts sensitive GitHub tokens that hang alongside each destination.
- `AppStateRepository` persists `app.json` under the local application data folder while `EncryptionHelper` keeps secrets encrypted in that store.
- `DependencyChecker` now only validates the .NET SDK (Photino publishing no longer needs npm/electron).

## Running locally
1. Ensure the .NET 9 SDK is installed on macOS/Linux or Windows.
2. Build and run the solution:
- dotnet build Electronifier.sln
dotnet run --project src/Electronifier.Desktop

## Data layout
- `ProjectDefinition` captures metadata such as name/version, namespace, organization, support contacts, binary path, and the shared icon path.
- `ProjectRelease` tracks specific releases, target platforms, source folder, splash asset, and publication timing.
- `ProjectPublicationSettings` contains `PublicationDestination` entries (GitHub release or local directory) and `LaunchOptions` for window sizing/placement/shortcut preferences.
- `PublicationDestination` records either a local path or GitHub release metadata, and `EncryptionHelper` encrypts the associated access token for safe storage.

## Release automation
Electronifier now packages Photino wrappers for macOS, Windows, and Linux when you create a release. The automation:

1. Clones the Photino wrapper template (`templates/PhotinoWrapper`) into a temp folder, injects your project metadata/icon, and writes `launch-settings.json` that carries launch options and the backend execution script override.
2. Copies the .NET runtime output you referenced in the project (or a single binary) into the wrapper's `runtime/` folder.
3. Runs `dotnet publish` for each requested runtime identifier (macOS, Windows, Linux) to emit self-contained Photino apps, then zips the publish folder into per-platform artifacts.
4. Publishes the generated artifact(s) to either:
   - a configured local directory (copies the files), or
   - a GitHub release when a repository URL and access token are provided (release creation + asset upload).

Trigger this flow via the desktop UI once the .NET SDK is available and the project has a valid publication destination; the release history is persisted through `ProjectRelease`.

## Future work ideas
1. Populate the dependency panel with clickable install scripts (Homebrew, dotnet-install, etc.) and capture installer output for diagnostics.
2. Harden the Photino wrapper with richer diagnostics, health checks, and optional embedded static UI.
3. Provide per-project release history/details together with upload progress/validation statuses.
