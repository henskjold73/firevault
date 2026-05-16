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
```

Equivalent direct commands:

```bash
npx tsx src/index.ts init
npx tsx src/index.ts backup
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

## Backup Model

Firevault writes one document per file:

```txt
<outputDir>/<collection>/<documentId>.json
```

JSON output is stable:

- object keys are sorted recursively,
- formatting is deterministic,
- files are intended to produce readable Git diffs.

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
