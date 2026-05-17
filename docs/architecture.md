# Architecture

Firevault is an undo button for Firestore: operational recovery tooling that gives Firestore projects Git-style history, change inspection, and document-level rollback.

## Positioning

Firevault wraps existing Firestore projects. It does not replace Firebase and does not host data.

The architecture should optimize for:

- safe restores,
- readable recovery previews,
- document-level rollback,
- deterministic exports,
- Git-backed history,
- disaster recovery workflows,
- simple local operation.

## Current Stack

- TypeScript
- Node.js
- Firebase Admin SDK
- Commander
- tsx for development execution

## Current Project Structure

```txt
my-app/
  src/
  firebase.ts
  .env.local
  .gitignore
  .firevault/
    config.json
    firestore-backups/
    .git/
    .gitignore
```

## Command Layer

`src/index.ts` creates the Commander program and registers commands.

Current commands:

- `firevault init`
- `firevault backup`
- `firevault commit`
- `firevault snapshot`
- `firevault changes`
- `firevault history`
- `firevault restore-preview`
- `firevault restore-local`
- `firevault restore-firestore`

Expected future commands:

```bash
firevault diff users/abc123
```

## Configuration

Configuration is loaded from `.firevault/config.json`.

Firevault 0.2 uses `.firevault/config.json` and a dedicated `.firevault` recovery workspace. There is no backward compatibility with the old root-based `firevault.config.json` prerelease model.

Intended shape:

```json
{
  "projectId": "your-project-id",
  "serviceAccountPath": "./serviceAccountKey.json",
  "outputDir": "firestore-backups",
  "collections": ["users"]
}
```

Current implementation notes:

- `loadConfig` walks upward from the current directory, finds the nearest `.firevault/config.json`, and treats that `.firevault` directory as the workspace root.
- Config-relative paths resolve from the workspace root.
- Firebase initialization expects `serviceAccountPath` relative to `.firevault/`.
- `firevault init` guides setup, validates required fields, checks Git state before writing, creates `.firevault/`, and updates `.gitignore` files without overwriting existing entries.
- `firevault init` can suggest project IDs from local Firebase config files and likely service account paths from local filenames.
- `firevault init --force` allows dirty Git state and config overwrite with a warning.
- `firevault init --yes` provides a deterministic non-interactive path for tests and automation, using a detected project ID if one is available and skipping Firebase collection listing.

## Init Safety

`firevault init` is intentionally conservative because setup writes local project files.

Behavior:

- prints the Firevault identity before prompting,
- detects whether the app directory is inside a Git repository,
- offers to initialize Git inside `.firevault/`,
- scans common local Firebase files for project ID candidates,
- shows detected project ID candidates with their source files,
- suggests likely service account paths without reading or printing private key contents,
- prints the Firebase Console Admin SDK service account URL for the entered project ID,
- explains where to save the manually downloaded service account key,
- optionally lists top-level Firestore collections only after telling the user and only when the selected service account file exists,
- refuses to run in a dirty Git working tree unless `--force` is provided,
- refuses to overwrite `.firevault/config.json` unless `--force` is provided,
- adds `.firevault/` to the parent app repo `.gitignore` when the parent is a Git repo,
- appends `.firevault/.gitignore` safety entries, including the selected service account path, without duplicating existing lines,
- never creates service accounts, opens browsers, runs `gcloud`, commits, pushes, creates GitHub repositories, contacts Firebase, or writes secrets.

## Firebase Access

`src/firestore/firebase.ts` initializes Firebase Admin SDK from the configured service account path and returns a Firestore client.

When `FIRESTORE_EMULATOR_HOST` is set, Firebase Admin initializes with only the configured `projectId`. This lets integration tests run against the local Firestore emulator without a service account file and without contacting real Firebase.

Design constraints:

- operate only on existing Firestore projects,
- keep credentials local,
- use manually managed service account credentials,
- do not introduce credential brokerage, hosted auth, or account systems,
- avoid committing service account files.

## Workspace Boundary

The app repo and Firevault recovery repo are separate:

- app repo: application source code and normal development history,
- `.firevault` repo: Firestore recovery config, backup JSON, and recovery history.

Operational commands work from the app root or from inside `.firevault/` by discovering the nearest `.firevault/config.json`. Git commands run with `.firevault/` as their working directory so `firevault commit`, `changes`, `history`, and restore previews cannot stage or inspect unrelated app source files.

`firestore-backups/` is not ignored inside `.firevault/` by default. The `.firevault` repository exists to commit backup data.

## GitHub Actions Automation

`firevault setup-github-action` is a local workflow-file generator for scheduled offsite snapshots. It writes `.firevault/.github/workflows/firevault-snapshot.yml` and stops there.

The command does not create GitHub repositories, call GitHub APIs, create secrets, push, stage, commit, store credentials, or depend on the GitHub CLI. Users push the `.firevault` repository and create the `FIREVAULT_SERVICE_ACCOUNT_JSON` secret themselves.

The generated workflow checks out the recovery repository into a `.firevault` directory, installs `firevault@next`, writes the service account JSON from the GitHub secret to `.firevault/serviceAccountKey.json`, runs `firevault snapshot` from the parent workspace, and pushes only if a backup commit was created.

## Emulator Tests

Firestore emulator integration tests live under `test/integration/`.

The test command:

```bash
npm run test:emulator
```

starts the Firestore emulator through `firebase-tools`, runs Node's built-in test runner through `tsx`, and uses temporary Git repositories and backup directories for each test. The tests seed emulator Firestore directly, drive the Firevault CLI, and clean up temporary directories where practical.

Current emulator coverage:

- backup export from emulator Firestore,
- deterministic JSON output,
- single-document `restore-firestore` overwrite into emulator Firestore,
- collection path rejection,
- `--confirm` enforcement.

## Publishing

Prerelease publishing is intentionally local-script based for now. `scripts/publish.ts` calculates an npm-safe prerelease version from Git state with `gitversionjs`, verifies a clean working tree for real publishes, runs clean/build/emulator tests, inspects `npm pack --dry-run` contents, rejects known unsafe paths, and publishes with the `next` npm dist-tag only after explicit confirmation.

There is no GitHub Actions publishing, trusted publishing, or release automation beyond this local guard script yet.

## Export Pipeline

Current backup flow:

1. Load config.
2. Iterate configured collections.
3. Fetch each collection through Firebase Admin SDK.
4. Write each document to `.firevault/<outputDir>/<collection>/<documentId>.json`.
5. Serialize document data using deterministic JSON.

The current exporter handles configured top-level collections. Subcollections, deletes, metadata, timestamps, references, and special Firestore value types need explicit design before production use.

## Deterministic Serialization

`src/firestore/stableStringify.ts` recursively sorts object keys and writes pretty JSON.

This is foundational because Git is the history engine. Output should be stable when Firestore data has not changed.

Serialization rules should remain boring and predictable:

- sort object keys,
- preserve array order,
- write one document per file,
- avoid transient metadata unless explicitly modeled.

## Git Boundary

Git is the storage and history engine. Firevault should wrap Git workflows rather than reimplement versioning.

For Firevault 0.2, Git operations are scoped to the `.firevault` workspace repository, not the parent app repository.

Near-term Git integration should focus on:

- detecting working tree changes after backup,
- showing changed documents,
- helping users inspect diffs,
- optionally guiding commit workflows without committing automatically.

AI agents and Firevault itself must not create commits automatically unless a human explicitly performs that step outside the agent workflow.

## Restore Boundary

Restore is safety-critical and should be introduced incrementally.

Initial restore scope:

- document-level only,
- dry-run by default,
- explicit confirmation required for writes,
- clear source revision and target document path,
- readable diff before applying changes.

Avoid early whole-database restore commands.

## Non-Goals

Do not introduce these before the core workflow is stable:

- SaaS platform,
- hosted infrastructure,
- web dashboard,
- billing,
- auth system,
- collaboration features,
- Firebase Extensions,
- generic multi-cloud backup abstractions.
