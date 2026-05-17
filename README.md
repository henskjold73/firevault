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
.firevault/
  config.json
  firestore-backups/
    users/
      abc123.json
      def456.json
```

The immediate priority is trustworthy document-level recovery: clear previews, explicit confirmation, and no broad destructive restore flows.

## Quick Start

```bash
npm install -g firevault@next
cd my-app
```

Firevault 0.2 uses `.firevault/config.json` and a dedicated `.firevault` recovery workspace. The app repo stays focused on application source code; `.firevault/` contains Firevault config, backup JSON, credentials, and its own Git history.

Run guided setup:

```bash
firevault init
```

`firevault init` asks for your Firebase project ID, service account path, output directory, and collections. It creates `.firevault/`, writes `.firevault/config.json`, writes `.firevault/.gitignore`, can initialize Git inside `.firevault/`, and adds `.firevault/` to the parent app repo `.gitignore` when the parent is a Git repo.

During setup, Firevault looks for likely Firebase project IDs in local files such as `.env.local`, `.env.development`, `firebase.json`, and common Firebase config files. Detection is best-effort and transparent: if Firevault finds candidates, it shows where they came from and lets you accept one or enter a value manually.

Firevault also looks for likely local service account files such as `serviceAccountKey.json`, `service-account.json`, `firebase-service-account.json`, and `credentials/firebase.json`. It never prints private key contents. If you select a service account path, Firevault adds that path to `.gitignore`.

After you enter a project ID, Firevault prints the direct Firebase Console URL for that project's Admin SDK service account page:

```txt
Create a Firebase service account key here:

https://console.firebase.google.com/project/your-project-id/settings/serviceaccounts/adminsdk

Download the JSON key and save it as:

.firevault/serviceAccountKey.json
```

Firevault does not create service accounts, open a browser, run `gcloud`, or authenticate against Firebase during setup.

If the selected service account file already exists, Firevault can optionally connect to Firestore and list top-level collections so you can choose which ones to back up. If the file is missing or Firebase access fails, init continues and you can enter collections manually.

Generated `.firevault/config.json`:

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

Operational commands discover the nearest `.firevault/config.json`, so they work from the app root or from inside `.firevault/`.

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

Expected config path:

```txt
.firevault/config.json
```

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

- paths are relative to `.firevault/`,
- `serviceAccountPath` points to a local Firebase service account JSON file,
- `outputDir` is where Firestore documents are written inside `.firevault/`,
- `collections` controls which top-level Firestore collections are exported.
- Service account files must not be committed.

Parent app repo `.gitignore`:

```gitignore
.firevault/
```

`.firevault/.gitignore`:

```gitignore
serviceAccountKey.json
firestore-debug.log
.env
.env.*
```

`firevault init` adds these safety entries automatically. In the 0.2 workspace model, `firestore-backups/` is not ignored inside `.firevault/` because the `.firevault` Git repo exists to track backup history.

## Commands

```bash
firevault init
firevault backup
firevault commit
firevault snapshot
firevault status
firevault doctor
firevault setup-github-action
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

`firevault commit` commits inside the `.firevault` Git repository.

Behavior:

- checks for changes under the configured `outputDir`,
- exits successfully if no backup changes exist,
- stages only the configured `outputDir`,
- creates a local commit with message `backup: <ISO timestamp>`,
- never stages app source files from the parent repo,
- never pushes.

Keep `serviceAccountKey.json` ignored so credentials cannot be committed by this workflow or by manual Git usage.

`firevault snapshot` is the safe local recovery snapshot workflow:

- runs backup,
- stops immediately if backup fails,
- commits backup changes when files changed,
- exits successfully when backup succeeds but no Git changes exist,
- never pushes.

`firevault status` shows a compact local recovery health overview. It does not contact Firebase, call GitHub APIs, fetch from remotes, write files, stage, commit, or push.

Example output:

```txt
Firevault status

Workspace:
  Path: .firevault
  Config: OK

Firestore:
  Project: my-project
  Collections configured: 4

Backups:
  Output directory: firestore-backups
  Output exists: yes
  Last snapshot: 2026-05-17T14:22:10Z
  Uncommitted backup changes: none

Git:
  Repository: OK
  Branch: main
  Working tree: clean
  Remote origin: configured
  Remote sync: unknown

Automation:
  GitHub Actions workflow: not configured
```

`firevault doctor` validates the local Firevault setup and prints actionable fixes. It checks workspace discovery, config validity, service account file presence, backup output state, `.firevault` Git setup, remote origin, GitHub Actions workflow contents, `.gitignore` safety, tracked secret-looking files, backup directory trackability, and working tree state.

Doctor is local-only. It does not contact Firebase, call GitHub APIs, write files, stage, commit, push, or print secrets.

Exit codes:

- `0`: all checks OK,
- `1`: warnings only,
- `2`: one or more failures.

`firevault setup-github-action` creates a local scheduled workflow at `.firevault/.github/workflows/firevault-snapshot.yml`.

The workflow is intended for a private GitHub repository containing the `.firevault` recovery workspace. It runs daily by default, supports manual dispatch, installs `firevault@next`, writes the Firebase service account JSON from the GitHub secret `FIREVAULT_SERVICE_ACCOUNT_JSON`, runs `firevault snapshot`, and pushes only when a backup commit was created.

This command only writes the workflow file. It does not create GitHub repositories, call GitHub APIs, create secrets, push, stage, commit, store credentials, or install GitHub CLI dependencies.

After generation, push the `.firevault` repo to GitHub, create the `FIREVAULT_SERVICE_ACCOUNT_JSON` repository secret with the full service account JSON, review the workflow, and commit it yourself.

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
