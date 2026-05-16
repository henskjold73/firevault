# Roadmap

Firevault is currently in Foundation / Phase 0. The roadmap is intentionally incremental: make the undo button for Firestore trustworthy before adding broader recovery workflows.

## Foundation

Goal: provide a safe document-level recovery loop backed by deterministic local snapshots and Git history.

Status:

- TypeScript CLI scaffold exists.
- Commander command wiring exists.
- Config loading exists.
- Firebase Admin initialization exists.
- Stable JSON serializer exists.
- Backup command exports configured collections.
- Documents are written one file per document.
- Local Git snapshot workflow exists through separate `backup`, `commit`, and `snapshot` commands.
- File-level change inspection exists through `changes` and `changes --last <window>`.
- Document and collection history inspection exists through `history <path>`.
- Dry-run recovery inspection exists through `restore-preview <path> --from <commit>`.
- Local backup-file recovery exists through `restore-local <path> --from <commit> --confirm`.
- Single-document Firestore overwrite restore exists through `restore-firestore <path> --from <commit> --confirm`.
- Firestore emulator integration tests cover backup and document restore safety paths.
- CLI packaging runs from compiled `dist/index.js`.
- npm prerelease packaging is guarded by package file whitelisting and pack verification.
- Public GitHub release docs cover quick start, security, contributing, and issue triage.
- Guided `firevault init` validates setup input, checks Git state, and applies `.gitignore` safety entries.

Next work:

- Decide how to represent Firestore special value types.
- Decide how to handle subcollections.
- Add broader error handling around Firestore export failures.
- Add non-emulator unit tests for pure path and Git parsing helpers.
- Review first npm prerelease feedback before widening restore scope.
- Dogfood against real non-critical Firestore projects before expanding restore behavior.

## MVP

Goal: make Git-style history, inspection, and rollback useful for real Firestore recovery work.

Expected capabilities:

- `firevault backup` reliably exports configured collections.
- Clear output summary after backup.
- Local Git snapshot command for backup plus scoped commit.
- Git status integration showing changed, added, and deleted backup files.
- History helpers for document and collection paths.
- Restore preview helpers for document paths.
- Local document restore into backup files only.
- Firestore document restore with explicit confirmation.
- Diff helpers for document paths.
- Document path addressing such as `users/abc123`.
- Basic change inspection workflows.
- Documentation for a safe backup cadence.

Example commands:

```bash
firevault backup
firevault commit
firevault snapshot
firevault history users/abc123
firevault restore-preview users/abc123 --from HEAD~3
firevault restore-local users/abc123 --from HEAD~3 --confirm
firevault restore-firestore users/abc123 --from HEAD~3 --confirm
firevault diff users/abc123
firevault changes
```

## Semi-Production

Goal: introduce safe document-level recovery without broad destructive operations.

Expected capabilities:

- Safer document-level restore from a Git revision.
- Dry-run preview before destructive restore.
- Required confirmation for writes.
- Diff preview before restore.
- Better Firestore type handling.
- Clear failure modes and exit codes.
- Tests for restore safety behavior.
- Guidance for CI or scheduled backup jobs.

Example command:

```bash
firevault restore users/abc123 --from HEAD~3
```

## Production

Goal: make Firevault dependable for teams that need disaster recovery workflows.

Expected capabilities:

- Robust recursive export design if subcollections are supported.
- Delete detection and explicit delete handling.
- Restore audit output.
- Backup validation command.
- Safer configuration validation.
- Larger collection handling with pagination and progress.
- Better handling of rate limits and transient Firebase failures.
- Release packaging and installation story.
- Security guidance for credentials and least-privilege service accounts.

## Polished

Goal: refine the CLI experience after the core workflows are proven.

Possible capabilities:

- Better command UX and help text.
- Human-readable change summaries.
- Time-window helpers such as `firevault changes --last 24h`.
- Guided Git workflow prompts that still leave commits to humans.
- Optional machine-readable output for automation.
- Richer docs and recovery playbooks.
- AI-assisted development recovery positioning once the operational core is stable.

## Guardrails

Do not build these during early phases:

- SaaS,
- web UI,
- hosted infrastructure,
- billing,
- auth systems,
- collaboration features,
- generalized multi-cloud backup platform.

The core workflow must remain:

```txt
Firestore -> stable JSON files -> Git history -> safe diff/restore workflows
```
