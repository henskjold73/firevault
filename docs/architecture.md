# Architecture

Firevault is a CLI-first tool for exporting Firestore data into deterministic files that Git can store, diff, and roll back.

## Positioning

Firevault wraps existing Firebase projects. It does not replace Firebase and does not host data.

The architecture should optimize for:

- deterministic exports,
- readable diffs,
- safe restores,
- Git integration,
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
src/
  commands/
    init.ts
    backup.ts
  config/
    loadConfig.ts
  firestore/
    exportFirestore.ts
    firebase.ts
    stableStringify.ts
  git/
  index.ts
firevault.config.json
package.json
tsconfig.json
```

## Command Layer

`src/index.ts` creates the Commander program and registers commands.

Current commands:

- `firevault init`
- `firevault backup`

Expected future commands:

```bash
firevault backup
firevault changes --last 24h
firevault diff users/abc123
firevault restore users/abc123 --from HEAD~3
```

## Configuration

Configuration is loaded from `firevault.config.json`.

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

- `loadConfig` reads and parses `firevault.config.json`.
- Firebase initialization expects `serviceAccountPath`.
- The current `init` template should be kept aligned with the expected config shape.

## Firebase Access

`src/firestore/firebase.ts` initializes Firebase Admin SDK from the configured service account path and returns a Firestore client.

Design constraints:

- operate only on existing Firebase projects,
- keep credentials local,
- do not introduce hosted auth or account systems,
- avoid committing service account files.

## Export Pipeline

Current backup flow:

1. Load config.
2. Iterate configured collections.
3. Fetch each collection through Firebase Admin SDK.
4. Write each document to `<outputDir>/<collection>/<documentId>.json`.
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
