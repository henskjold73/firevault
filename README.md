# Firevault

Undo button for Firestore.

Firevault gives Firestore projects Git-style history, change inspection, and document-level rollback so teams can recover from accidental writes, bad migrations, and destructive scripts.

Supporting line: Git-style history, rollback, and recovery for Firestore projects.

Firevault is focused operational recovery tooling for existing Firestore projects. It is not a hosted database platform, Firebase replacement, generic backup vendor, SaaS product, or dashboard.

## Current Status

Firevault is in Foundation / Phase 0.

This is an experimental prerelease CLI. Use it against test or non-critical Firestore projects until recovery behavior has been reviewed for your project.

Current scope:

- snapshot Firestore into Git-friendly JSON,
- inspect changes,
- view document history,
- preview rollback,
- restore one document back to Firestore.

Current export shape:

```txt
firestore-backups/
  users/
    abc123.json
    def456.json
```

The immediate priority is trustworthy document-level recovery: clear previews, explicit confirmation, and no broad destructive restore flows.

## Quick Start

```bash
npm install -g firevault
```

Create a Firebase service account key for your Firestore project, save it as `serviceAccountKey.json`, and keep it out of Git.

Run guided setup:

```bash
firevault init
```

`firevault init` asks for your Firebase project ID, service account path, output directory, and collections. It also checks Git state before writing files and appends safety entries to `.gitignore`.

After you enter a project ID, Firevault prints the direct Firebase Console URL for that project's Admin SDK service account page:

```txt
Create a Firebase service account key here:

https://console.firebase.google.com/project/your-project-id/settings/serviceaccounts/adminsdk

Download the JSON key and save it as:

./serviceAccountKey.json
```

Firevault does not create service accounts, open a browser, run `gcloud`, or authenticate against Firebase during setup.

Generated `firevault.config.json`:

```json
{
  "projectId": "your-project-id",
  "serviceAccountPath": "./serviceAccountKey.json",
  "outputDir": "firestore-backups",
  "collections": ["users"]
}
```

Take a snapshot:

```bash
firevault snapshot
```

Example output:

```txt
Exported 2 docs from users
Backup complete.
Created commit: backup: 2026-05-16T17:00:00.000Z
```

Inspect what changed:

```bash
firevault changes
```

Example output:

```txt
Added:

* firestore-backups/users/abc123.json

Modified:

Deleted:
```

Preview a document rollback:

```bash
firevault restore-preview users/abc123 --from HEAD~1
```

Example output:

```txt
Target: firestore-backups/users/abc123.json
Source commit: HEAD~1
Current file exists: yes

Diff:

  {
-   "name": "Ada Lovelace"
+   "name": "Ada"
  }
```

Restore one document to Firestore after reviewing the preview:

```bash
firevault restore-firestore users/abc123 --from HEAD~1 --confirm
```

`restore-firestore` overwrites one Firestore document with the JSON from Git. It does not support collection restore, merge, or patch restore yet.

## Recovery Workflow

Scenario: a script accidentally overwrites `users/abc123`.

1. Inspect recent snapshot changes:

```bash
firevault changes --last 24h
```

2. Find the document history:

```bash
firevault history users/abc123
```

3. Preview the rollback:

```bash
firevault restore-preview users/abc123 --from HEAD~3
```

4. Restore only that document:

```bash
firevault restore-firestore users/abc123 --from HEAD~3 --confirm
```

5. Take a new snapshot after recovery:

```bash
firevault snapshot
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

`firevault init` adds these safety entries automatically. `firestore-backups/` is ignored by default so exported Firestore data is not committed accidentally with normal Git commands. Firevault can still commit the configured backup directory explicitly through `firevault commit` or `firevault snapshot`, and it stages only that directory.

## Commands

```bash
firevault init
firevault backup
firevault commit
firevault snapshot
firevault changes
firevault changes --last 24h
firevault history users/abc123
firevault restore-preview users/abc123 --from HEAD~3
firevault restore-local users/abc123 --from HEAD~3 --confirm
firevault restore-firestore users/abc123 --from HEAD~3 --confirm
```

`firevault init --yes` uses default values for non-interactive setup. `firevault init --force` allows setup with a dirty Git working tree and overwrites an existing config after warning.

## Local Development

Install dependencies and run commands through the TypeScript entrypoint:

```bash
npm install
npm run dev -- --help
npm run dev -- backup
npm run dev -- changes
```

Build and link the compiled CLI:

```bash
npm run build
npm link
firevault --help
```

The installed `firevault` binary runs from `dist/index.js`.

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

`firevault snapshot` is the safe local recovery snapshot workflow:

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

## Testing

Run the TypeScript build:

```bash
npm run build
```

Run Firestore emulator integration tests:

```bash
npm run test:emulator
```

The emulator tests require dependencies installed through `npm install`, including the `firebase-tools` dev dependency. The test runner starts the local Firestore emulator with demo project `demo-firevault-test`; it does not require `serviceAccountKey.json` and does not contact a real Firebase project.

Covered emulator flows:

- `backup` exports a known Firestore document,
- `backup` writes deterministic JSON,
- `restore-firestore` overwrites one emulator document from a Git commit,
- `restore-firestore` rejects collection paths,
- `restore-firestore` requires `--confirm`.

## Publishing

Firevault uses a local publish script for early prereleases. npm auth must already be configured before publishing; `npm whoami` should succeed for the intended npm account.

Calculate the Git-derived prerelease version:

```bash
npm run version:calculate
```

Verify the package without publishing:

```bash
npm run publish:dry-run
```

Publish the prerelease with the `next` dist-tag:

```bash
npm run publish:next
```

Use `npm run publish:next -- --yes` only when you intentionally want to skip the final confirmation prompt.

The publish script:

- requires a clean Git working tree before real publishing,
- calculates the npm prerelease version with `gitversionjs`,
- runs clean, build, and emulator tests,
- runs `npm pack --dry-run --cache /private/tmp/firevault-npm-cache`,
- rejects forbidden package contents such as `serviceAccountKey.json`, `firestore-backups/`, `firestore-debug.log`, `src/`, `test/`, `firebase.json`, `firestore.rules`, and `.env` files,
- publishes with `npm publish --access public --tag next --cache /private/tmp/firevault-npm-cache`.

The package `bin` points to `./dist/index.js`, so a published or linked package must include compiled output. `prepublishOnly` currently runs clean, build, and emulator tests.

## Product Principles

Firevault should stay:

- small,
- operational,
- trustworthy,
- CLI-first,
- Git-backed.

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
- [GitHub labels](docs/github-labels.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
- [AI review ledger](AI_REVIEW.md)

AI agents must never create git commits automatically. Human review and commits are required.
