# firevault status Design

`firevault status` should answer one operational question:

> Am I protected right now?

It should be compact, local-first, and confidence-oriented. It should not become a broad diagnostic dump.

## Scope

Phase 1 should use local filesystem and local Git metadata only.

Phase 1 must not:

- contact Firebase,
- call GitHub APIs,
- require network access,
- write files,
- stage or commit,
- push,
- create GitHub repositories.

## Existing Code To Reuse

- `src/config/loadConfig.ts`
  - `findWorkspaceRoot()` already walks upward and finds `.firevault/config.json`.
  - `loadConfig()` validates config and returns:
    - `workspaceRoot`,
    - `configPath`,
    - config-relative `outputDir`,
    - absolute `outputDirPath`,
    - config-relative and absolute service account paths.
- `src/git/git.ts`
  - `isInsideGitRepository(cwd)` checks whether `.firevault` is a Git repo.
  - `hasWorkingTreeChanges(cwd)` checks dirty state.
  - `hasChangesUnder(path, cwd)` can report uncommitted backup changes under `outputDir`.
  - existing Git functions already accept `cwd`, which lets status keep all Git checks scoped to `.firevault`.
- Existing command error style:
  - user-facing config and Git errors are printed without stack traces.

## Smallest Phase 1 Implementation

Add `firevault status` as a read-only command that:

1. Discovers the workspace from the current directory.
2. Reads and validates `.firevault/config.json`.
3. Checks local backup and Git state under `.firevault`.
4. Prints a short grouped summary.

Suggested initial output:

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

If something is missing, keep the output readable and specific:

```txt
Firevault status

Workspace:
  Path: not found
  Config: missing

Next step:
  Run `firevault init`
```

## Phase 1 Checks

Workspace:

- whether `.firevault/config.json` can be discovered,
- display workspace path relative to the current directory where practical,
- config status: `OK`, `missing`, or `invalid`.

Firestore:

- configured project ID,
- configured collection count.

Backups:

- configured output directory,
- whether `.firevault/<outputDir>` exists,
- whether there are uncommitted changes under `outputDir`,
- latest backup commit if any.

Latest backup commit should come from local Git history under the configured `outputDir`, for example:

```bash
git log -1 --format=%cI -- firestore-backups
```

Git:

- whether `.firevault` is a Git repo,
- current branch,
- clean or dirty working tree,
- whether remote `origin` is configured,
- ahead/behind if cheaply available from local Git metadata.

Automation:

- whether a local workflow file exists at `.github/workflows/firevault-snapshot.yml` in the parent app repo.
- Do not validate workflow contents in Phase 1.

## Git Helper Additions

`src/git/git.ts` should expose small read-only helpers rather than putting `execFileSync` calls directly in `status.ts`.

Likely helpers:

- `getCurrentBranch(cwd): string | undefined`
  - use `git branch --show-current`,
  - fall back to `detached` or `unknown` if needed.
- `getRemoteUrl(name, cwd): string | undefined`
  - use `git remote get-url origin`.
- `getLatestCommitDate(path, cwd): string | undefined`
  - use `git log -1 --format=%cI -- <path>`.
- `getAheadBehind(cwd): { ahead: number; behind: number } | undefined`
  - use local upstream metadata only.

## Ahead/Behind Risk

Ahead/behind detection can be misleading if implemented with network calls or stale remote refs.

Phase 1 should avoid `git fetch` because status must be fast, local, and network-free. That means ahead/behind can only reflect locally known upstream refs.

Recommended behavior:

- if no upstream exists: `Remote sync: no upstream`,
- if upstream exists and local metadata is available: `Remote sync: ahead N, behind M`,
- if metadata is unavailable: `Remote sync: unknown`,
- do not imply offsite recovery is current unless remote refs prove it locally.

This keeps the distinction clear:

- local Git history means local rollback,
- pushed remote history means offsite recovery,
- Phase 1 can only inspect local evidence of remote setup.

## Workflow Detection

Phase 1 can check only for local file existence:

```txt
<app root>/.github/workflows/firevault-snapshot.yml
```

The app root can be derived as `path.dirname(config.workspaceRoot)`.

Phase 2 should validate:

- a scheduled trigger exists,
- the workflow runs `firevault snapshot`,
- required secret names are present.

## Likely Files To Change

Phase 1 implementation will likely change:

- `src/commands/status.ts`
  - new command implementation and formatter.
- `src/index.ts`
  - register `statusCommand`.
- `src/git/git.ts`
  - add read-only helper functions.
- `package.json`
  - add `"status": "tsx src/index.ts status"` script.
- `README.md`
  - document `firevault status` and example output.
- `docs/architecture.md`
  - document the status boundary and local-only Phase 1 behavior.
- `docs/roadmap.md`
  - mark local recovery state status as the current milestone.
- `test/integration/firestore-emulator.test.ts` or a new non-emulator test file
  - test workspace discovery and Git state without contacting Firebase.

## Testing Plan

Phase 1 can be tested without Firebase:

- no workspace: prints missing workspace and suggests `firevault init`,
- valid `.firevault/config.json` without `.firevault/.git`: reports Git repo missing,
- workspace Git repo with no commits: reports no latest snapshot,
- backup output exists with uncommitted backup files: reports uncommitted backup changes,
- clean workspace with one backup commit: reports latest snapshot date,
- remote origin configured but no upstream: reports origin configured and sync unknown/no upstream,
- workflow file missing: reports not configured,
- workflow file present: reports configured.

Emulator tests are not required for Phase 1 because `status` should not contact Firebase.
