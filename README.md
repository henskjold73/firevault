# Firevault

Firevault is a Git-native operational recovery tool for Firebase Firestore.

> Git history and rollback for Firestore.

Firevault is CLI-first backup, audit, diff, rollback, and recovery tooling for existing Firebase projects. It is not a hosted database platform, Firebase replacement, generic backup vendor, SaaS product, or dashboard.

## Current Status

Firevault is in Foundation / Phase 0.

Implemented:

- TypeScript CLI setup with Commander
- `init` command scaffold
- `backup` command structure
- Firebase Admin SDK initialization
- Config loading from `firevault.config.json`
- Stable deterministic JSON serialization
- Firestore collection export to one JSON file per document

Current export shape:

```txt
firestore-backups/
  users/
    abc123.json
    def456.json
```

The immediate priority is making Firestore exports deterministic, readable in Git diffs, and reliable enough to become the foundation for diff and restore workflows.

## Install

```bash
npm install
```

## Commands

Run through the local TypeScript entrypoint during development:

```bash
npm run init
npm run backup
npm run commit
npm run snapshot
npm run changes
npm run history -- users/abc123
npm run restore-preview -- users/abc123 --from HEAD~3
npm run restore-local -- users/abc123 --from HEAD~3 --confirm
npm run restore-firestore -- users/abc123 --from HEAD~3 --confirm
```

Equivalent direct commands:

```bash
npx tsx src/index.ts init
npx tsx src/index.ts backup
npx tsx src/index.ts commit
npx tsx src/index.ts snapshot
npx tsx src/index.ts changes
npx tsx src/index.ts history users/abc123
npx tsx src/index.ts restore-preview users/abc123 --from HEAD~3
npx tsx src/index.ts restore-local users/abc123 --from HEAD~3 --confirm
npx tsx src/index.ts restore-firestore users/abc123 --from HEAD~3 --confirm
```

## Configuration

Firevault operates against an existing Firebase project using a service account.

Expected config shape:

```json
{
  "projectId": "your-project-id",
  "serviceAccountPath": "./serviceAccountKey.json",
  "outputDir": "firestore-backups",
  "collections": ["users"]
}
```

Notes:

- `serviceAccountPath` points to a local Firebase service account JSON file.
- `outputDir` is where Firestore documents are written.
- `collections` controls which top-level Firestore collections are exported.
- Service account files must not be committed.

Recommended `.gitignore` entries for local development:

```gitignore
serviceAccountKey.json
firestore-backups/
```

## Local Development Flow

1. Create a Firebase service account key in the Firebase Console or Google Cloud Console for the existing Firebase project.
2. Save the downloaded key locally as `serviceAccountKey.json` in the project root.
3. Create the Firevault config:

```bash
npm run init
```

4. Edit `firevault.config.json`:

```json
{
  "projectId": "your-project-id",
  "serviceAccountPath": "./serviceAccountKey.json",
  "outputDir": "firestore-backups",
  "collections": ["users"]
}
```

5. Run a backup:

```bash
npm run backup
```

Expected output structure:

```txt
firestore-backups/
  users/
    abc123.json
    def456.json
```

Each exported document is written as one deterministic JSON file with recursively sorted object keys.

6. Commit backup changes:

```bash
npm run commit
```

`firevault commit` only stages the configured `outputDir` and creates a local Git commit with a timestamped message such as:

```txt
backup: 2026-05-16T17:00:00.000Z
```

It does not push, does not stage unrelated files, and is intentionally separate from `firevault backup`.

For the common local workflow, run backup and commit together:

```bash
npm run snapshot
```

`firevault snapshot` runs `firevault backup` first, then `firevault commit` only if backup succeeds.

Inspect current backup file changes:

```bash
npm run changes
```

Inspect committed backup file changes from recent history:

```bash
npx tsx src/index.ts changes --last 24h
```

Show history for a backed-up document or collection:

```bash
npm run history -- users/abc123
npm run history -- firestore-backups/users/abc123.json
npm run history -- users
```

Preview restoring a backed-up document from Git:

```bash
npm run restore-preview -- users/abc123 --from HEAD~3
npm run restore-preview -- firestore-backups/users/abc123.json --from a1b2c3d
```

Restore a backed-up document into the local backup directory only:

```bash
npm run restore-local -- users/abc123 --from HEAD~3 --confirm
npm run restore-local -- firestore-backups/users/abc123.json --from a1b2c3d --confirm
```

Restore a backed-up document directly into Firestore:

```bash
npm run restore-firestore -- users/abc123 --from HEAD~3 --confirm
npm run restore-firestore -- firestore-backups/users/abc123.json --from a1b2c3d --confirm
```

## Backup Model

Firevault writes one document per file:

```txt
<outputDir>/<collection>/<documentId>.json
```

JSON output is stable:

- object keys are sorted recursively,
- formatting is deterministic,
- files are intended to produce readable Git diffs.

## Git Commit Flow

`firevault backup` exports configured Firestore collections to deterministic local JSON files. It does not stage or commit anything.

`firevault commit` expects to run inside a Git repository.

Behavior:

- checks for changes under the configured `outputDir`,
- exits successfully if no backup changes exist,
- stages only the configured `outputDir`,
- creates a local commit with message `backup: <ISO timestamp>`,
- never pushes.

Keep `serviceAccountKey.json` ignored so credentials cannot be committed by this workflow or by manual Git usage.

`firevault snapshot` is the safe local backup workflow:

- runs backup,
- stops immediately if backup fails,
- commits backup changes when files changed,
- exits successfully when backup succeeds but no Git changes exist,
- never pushes.

`firevault changes` shows a file-level Git summary for the configured `outputDir` only:

```txt
Added:

* firestore-backups/users/abc123.json

Modified:

* firestore-backups/users/def456.json

Deleted:

* firestore-backups/users/old-user.json
```

Without options it inspects working tree changes. With `--last 24h`, it uses Git history and lists files changed under `outputDir` in commits since that time window. It does not contact Firebase.

`firevault history <path>` shows commit history for one backed-up document or collection. It accepts logical paths like `users/abc123`, full backup file paths like `firestore-backups/users/abc123.json`, and collection paths like `users`.

Output includes commit short SHA, commit date, and commit message. For collection paths, it also includes the number of files changed by each commit under that collection. It uses Git history only and does not contact Firebase.

`firevault restore-preview <path> --from <commit>` shows what would be restored for one backed-up document without writing anything. It accepts logical document paths and full backup file paths, reads the source JSON from Git, compares it to the current local backup file if present, and prints a readable line diff.

Restore preview is intentionally dry-run only. It does not write to Firestore, does not overwrite local files, does not push, and does not contact Firebase.

`firevault restore-local <path> --from <commit> --confirm` restores one backed-up document from Git into the local backup directory. It prints the same preview information before writing, creates parent directories if needed, and requires `--confirm`.

Restore local does not write to Firestore, does not stage, does not commit, does not push, and does not contact Firebase.

`firevault restore-firestore <path> --from <commit> --confirm` restores one backed-up document from Git directly into Firestore. It prints target backup path, Firestore collection, document ID, source commit, and a local JSON diff before writing.

Firestore restore overwrites the target document with the parsed JSON from Git. It does not support collection restore, merge, or patch restore yet. It does not modify local backup files, stage, commit, push, or contact GitHub.

Manual Firestore restore verification:

1. Point `serviceAccountPath` at a valid service account for a test Firebase project.
2. Run `npm run restore-preview -- users/abc123 --from <commit>` and inspect the diff.
3. Run `npm run restore-firestore -- users/abc123 --from <commit> --confirm`.
4. Verify the document in Firestore was overwritten with the JSON from Git.
5. Run `git status` to confirm no local files were changed by `restore-firestore`.

## Product Principles

Firevault should stay:

- small,
- operational,
- trustworthy,
- CLI-first,
- Git-native.

Avoid adding SaaS features, hosted infrastructure, auth systems, collaboration features, dashboards, billing, or broad multi-cloud abstractions before the core Firestore to stable JSON to Git workflow is robust.

## Safety

Firestore restore is document-only and overwrite-only for now. Future restore flows should:

- default to dry-run,
- require explicit confirmation for writes,
- start with document-level recovery,
- avoid early whole-database destructive workflows.

## Documentation

- [Architecture](docs/architecture.md)
- [Roadmap](docs/roadmap.md)
- [AI review ledger](AI_REVIEW.md)

AI agents must never create git commits automatically. Human review and commits are required.
