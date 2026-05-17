# Changelog

## Unreleased

- Added optional VS Code settings support during `firevault init` to hide the nested `.firevault` Git repository from the parent workspace Source Control panel.

## 0.2.0-beta.3

- Changed `firevault doctor` to treat service account paths outside `.firevault` as informational rather than a failure.

## 0.2.0-beta.2

- Fixed CLI version reporting to read from `package.json` instead of a hardcoded version.

## 0.2.0-beta.1

- Added `firevault status` for compact local recovery health checks.
- Added `firevault doctor` for actionable local setup validation.
- Added `firevault setup-github-action` to generate a scheduled GitHub Actions workflow for offsite snapshots.
- Added local workflow detection for generated GitHub Actions snapshot automation.

## 0.2.0-beta.0

Breaking prerelease change:

- Firevault now uses `.firevault/config.json` and a dedicated `.firevault` recovery workspace.
- Firevault backup history now lives in the `.firevault` Git repository instead of the parent app repo.
- Config-relative paths now resolve from `.firevault/`.
- Operational commands discover the nearest `.firevault/config.json` from the app root or from inside `.firevault/`.
- `firevault init` no longer creates root `firevault.config.json`.
- `firestore-backups/` is no longer ignored inside `.firevault/` by default.

## 0.1.1-beta.1

- Added guided `firevault init` setup with prompts for project ID, service account path, output directory, and collections.
- Added init Git safety checks, `--force`, and `--yes`.
- Added safe `.gitignore` updates for service account keys, backup output, and emulator logs.
- Ensured Firevault can still explicitly commit the configured backup directory even when it is ignored by default.
- Added a guarded local npm prerelease publish workflow using `gitversionjs`, pack verification, and forbidden-path checks.

## 0.1.0

Initial prerelease candidate for Firevault, an undo button for Firestore.

- Firestore backup to deterministic JSON files.
- Git-scoped local snapshot workflow.
- File-level change inspection.
- Document and collection history inspection.
- Restore preview from Git.
- Local backup-file restore with explicit confirmation.
- Single-document Firestore restore with explicit confirmation.
- Firestore emulator integration tests for backup and restore safety paths.
