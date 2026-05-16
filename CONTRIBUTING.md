# Contributing

Firevault is an undo button for Firestore. Contributions should keep the project focused on operational recovery, clear previews, explicit confirmation, and document-level safety.

## Local Development

```bash
npm install
npm run build
npm run dev -- --help
```

Run a command through the TypeScript entrypoint:

```bash
npm run dev -- changes
npm run dev -- restore-preview users/abc123 --from HEAD~1
```

Build and test the installed CLI path:

```bash
npm run build
npm link
firevault --help
```

## Emulator Tests

Run Firestore emulator integration tests:

```bash
npm run test:emulator
```

The test runner starts the local Firestore emulator through `firebase-tools`. Tests use temporary Git repositories and missing service account paths; they must not require real Firebase credentials or contact real Firebase.

## Commit Policy

AI agents must not create Git commits automatically. Human review and commits are required.

Before opening a pull request, run:

```bash
npm run build
npm run test:emulator
```

## Architecture Principles

- Keep Firevault CLI-first.
- Keep restore flows safe, explicit, and document-level first.
- Prefer deterministic JSON and readable Git history over custom storage.
- Do not add hosted services, dashboards, telemetry, auth systems, or collection restore without explicit design work.
- Keep implementation boring and maintainable.
