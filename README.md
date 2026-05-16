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
```

Equivalent direct commands:

```bash
npx tsx src/index.ts init
npx tsx src/index.ts backup
npx tsx src/index.ts commit
npx tsx src/index.ts snapshot
npx tsx src/index.ts changes
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

## Product Principles

Firevault should stay:

- small,
- operational,
- trustworthy,
- CLI-first,
- Git-native.

Avoid adding SaaS features, hosted infrastructure, auth systems, collaboration features, dashboards, billing, or broad multi-cloud abstractions before the core Firestore to stable JSON to Git workflow is robust.

## Safety

Restore features are not implemented yet. When added, restore flows should:

- default to dry-run,
- require explicit confirmation for writes,
- start with document-level recovery,
- avoid early whole-database destructive workflows.

## Documentation

- [Architecture](docs/architecture.md)
- [Roadmap](docs/roadmap.md)
- [AI review ledger](AI_REVIEW.md)

AI agents must never create git commits automatically. Human review and commits are required.
