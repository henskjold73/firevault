# firevault doctor Design

`firevault doctor` should answer:

> Is my Firevault setup correctly configured?

This is different from `firevault status`.

- `status` is the current operational state: compact, confidence-oriented, and useful for quick checks.
- `doctor` is validation: more detailed, actionable, and focused on fixes.

## Scope

First version: local validation only.

Doctor must not:

- contact Firebase,
- call GitHub APIs,
- use the network,
- write files,
- stage,
- commit,
- push,
- print secrets.

## Output Shape

Output should be grouped but still compact:

```txt
Firevault doctor

OK    Workspace found
OK    Config valid
WARN  No Git remote origin configured
FAIL  Service account file missing

Next fixes:
1. Save your Firebase service account JSON to .firevault/serviceAccountKey.json
2. Add Git remote:
   git -C .firevault remote add origin <private-repo-url>
```

Use clear severity:

- `OK`: check passed.
- `INFO`: supported setup choice or useful context.
- `WARN`: setup can work locally but recovery posture is weaker.
- `FAIL`: setup is incomplete or unsafe enough that normal recovery workflows may fail.

Exit codes:

- `0` if all checks are `OK`.
- `1` if warnings are present and no checks fail.
- `2` if any `FAIL`.

`INFO` checks do not affect the exit code.

## Checks

### Workspace

Checks:

- `.firevault/config.json` can be discovered from the current directory.

Result:

- `OK Workspace found`
- `FAIL Workspace not found`

Fix:

```txt
Run `firevault init`
```

### Config

Checks:

- config file exists,
- JSON parses,
- required fields are present:
  - `projectId`,
  - `serviceAccountPath`,
  - `outputDir`,
  - `collections`,
- `collections` is a non-empty string array.

Reuse `loadConfig()` for validation.

Result:

- `OK Config valid`
- `FAIL Config invalid`

Fix:

```txt
Edit .firevault/config.json or rerun `firevault init --force`
```

### Service Account File

Checks:

- configured `serviceAccountPath` may resolve inside or outside `.firevault`,
- file exists when the path is inside `.firevault`.

External credential paths are supported. A service account file outside `.firevault` is not inherently unsafe because users may keep credentials in secure locations such as `~/.config`, password-manager mounted paths, or shared secret directories.

Do not parse the service account JSON in the first version. Parsing is local, but it starts pulling doctor toward credential validation. Save that for a later `--verify` mode.

Result:

- `INFO Service account path is outside .firevault`
- `OK Service account file present`
- `FAIL Service account file missing`

Message for external paths:

```txt
External credential paths are supported. Ensure the file is securely managed and excluded from Git.
```

Fix:

```txt
Save your Firebase service account JSON to .firevault/serviceAccountKey.json
```

Use the actual configured relative path in output. Never print file contents.

### Backup Output Directory

Checks:

- configured output directory exists, or
- parent workspace exists and the path could be created by normal backup flow.

Because doctor is read-only, it should not create the directory.

Result:

- `OK Backup output directory exists`
- `WARN Backup output directory has not been created yet`
- `FAIL Backup output path is unsafe or outside .firevault`

Fix:

```txt
Run `firevault snapshot`
```

### Workspace Git Repository

Checks:

- `.firevault` is a Git repository.

Result:

- `OK .firevault Git repository found`
- `FAIL .firevault is not a Git repository`

Fix:

```txt
git -C .firevault init
```

### Remote Origin

Checks:

- `.firevault` has `origin` configured.

Do not call `git fetch`.

Result:

- `OK Git remote origin configured`
- `WARN No Git remote origin configured`

Fix:

```txt
git -C .firevault remote add origin <private-repo-url>
```

### GitHub Actions Workflow

Checks:

- `.firevault/.github/workflows/firevault-snapshot.yml` exists,
- contains `schedule:`,
- contains `workflow_dispatch:`,
- contains `FIREVAULT_SERVICE_ACCOUNT_JSON`,
- contains `firevault snapshot`.

This should remain text-based in the first version. A YAML parser is not required yet unless false positives become a problem.

Result:

- `OK GitHub Actions workflow configured`
- `WARN GitHub Actions workflow missing`
- `WARN GitHub Actions workflow missing schedule trigger`
- `WARN GitHub Actions workflow missing manual dispatch`
- `WARN GitHub Actions workflow missing FIREVAULT_SERVICE_ACCOUNT_JSON`
- `WARN GitHub Actions workflow missing firevault snapshot`

Fix:

```txt
Run `firevault setup-github-action`
```

If the file exists but is incomplete:

```txt
Review .firevault/.github/workflows/firevault-snapshot.yml or rerun `firevault setup-github-action --force`
```

### Service Account Ignored

Checks:

- `.firevault/.gitignore` exists,
- configured service account path is ignored by Git when the path is inside `.firevault`.

If the configured service account path is outside `.firevault`, skip `.firevault/.gitignore` enforcement and report an informational check instead. External credential paths should be managed by the external location's security and Git ignore policy.

Best check:

```bash
git -C .firevault check-ignore <serviceAccountPath>
```

Fallback:

- read `.firevault/.gitignore`,
- look for exact configured service account path or basename.

Result:

- `OK Service account file ignored`
- `FAIL Service account file is not ignored`

Fix:

```txt
Add serviceAccountKey.json to .firevault/.gitignore
```

Use configured path in output.

### Parent App Repo Ignores .firevault

Checks:

- parent app repo exists,
- parent app repo ignores `.firevault/`.

Best check:

```bash
git -C <app-root> check-ignore .firevault
```

If parent app is not a Git repo, this can be a warning rather than failure.

Result:

- `OK Parent app repo ignores .firevault/`
- `WARN Parent app directory is not a Git repository`
- `FAIL Parent app repo does not ignore .firevault/`

Fix:

```txt
Add .firevault/ to .gitignore
```

### Secret Files Tracked By Git

Checks:

- no obvious credential or environment files are tracked in `.firevault` Git.

Candidate tracked paths:

- configured `serviceAccountPath`,
- `serviceAccountKey.json`,
- `service-account.json`,
- `firebase-service-account.json`,
- `credentials/firebase.json`,
- `.env`,
- `.env.*`,
- `*.pem`,
- `*.key`.

Use local Git only:

```bash
git -C .firevault ls-files
```

Result:

- `OK No obvious secret files tracked`
- `FAIL Possible secret files tracked`

Fix:

```txt
Remove tracked secret files from Git history and rotate exposed credentials.
```

Be careful not to print secret contents. Printing suspicious file paths is acceptable.

### Backup Directory Not Ignored

Checks:

- configured backup output directory is not ignored inside `.firevault`.

Use:

```bash
git -C .firevault check-ignore <outputDir>
```

Result:

- `OK Backup directory is trackable`
- `FAIL Backup directory is ignored`

Fix:

```txt
Remove firestore-backups/ from .firevault/.gitignore
```

Use configured path in output.

### Working Tree State

Checks:

- `.firevault` working tree clean or dirty,
- uncommitted backup changes under `outputDir`.

Result:

- `OK Working tree clean`
- `WARN Working tree has uncommitted changes`
- `WARN Backup output has uncommitted changes`

Fix:

```txt
Run `firevault commit` after reviewing changes
```

Doctor should report dirty state clearly but not treat it as a failure.

## Suggested Implementation Shape

Likely files:

- `src/commands/doctor.ts`
- `src/index.ts`
- `src/git/git.ts`
- `package.json`
- `README.md`
- `docs/roadmap.md`
- `docs/doctor-design.md`

Useful shared types:

```ts
type DoctorSeverity = "OK" | "WARN" | "FAIL";

interface DoctorCheck {
  severity: DoctorSeverity;
  label: string;
  fix?: string;
}
```

Formatting should be intentionally simple:

```txt
OK    Config valid
WARN  No Git remote origin configured
FAIL  Service account file missing
```

## Relationship To status

`status` should stay compact and operational.

`doctor` can be more explicit:

- reports all setup issues,
- lists fixes,
- may have more checks,
- can return non-zero when failures exist.

`status` should not grow into doctor.

## Future Extensions

Later versions can add:

- `firevault doctor --verify`
  - parse service account JSON,
  - connect to Firestore,
  - verify configured collections exist,
  - verify read permissions,
  - never write to Firestore.
- GitHub API-backed checks:
  - repository visibility,
  - Actions enabled,
  - secret exists,
  - latest workflow run status.
- structured output:
  - `firevault doctor --json`.

These should not be part of the first doctor implementation.
