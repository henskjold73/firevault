# Changelog

## 0.1.1-beta.1 - Unreleased

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
