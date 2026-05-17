# GitHub Actions Automation Design

Firevault should help users create scheduled offsite Firestore snapshots using GitHub Actions.

This is Phase 2 automation awareness and setup. It should stay local and explicit.

## Goal

Enable this model:

```txt
my-app/
  .firevault/
    config.json
    firestore-backups/
    .git/
    .github/workflows/firevault-snapshot.yml
```

The `.firevault` workspace is its own Git repository. Users push that repository to a private GitHub repository for offsite recovery history.

The workflow should:

1. Run on a schedule.
2. Install Node.
3. Install Firevault.
4. Write service account JSON from a GitHub secret.
5. Run `firevault snapshot`.
6. Push a commit only if backup files changed.

## Command Name

Recommended command:

```bash
firevault setup-github-action
```

Reasoning:

- explicit that this is GitHub-specific,
- clear that it creates a GitHub Actions workflow,
- avoids implying broader automation support,
- leaves room for future commands like `setup-gitlab-ci` without hiding provider-specific behavior.

`firevault setup-action` is shorter, but too generic. Firevault should avoid multi-platform abstraction until the core recovery workflow is stable.

## Workflow Location

The workflow should be written inside the `.firevault` repository:

```txt
.firevault/.github/workflows/firevault-snapshot.yml
```

This keeps automation with the recovery repo, not the parent application repo.

## Firevault Version In Workflow

Default recommendation:

```bash
npm install -g firevault@next
```

For early prerelease dogfooding, `@next` matches the current publishing model and avoids silently installing an older stable line once one exists.

Later, setup can support:

- `--version exact` to pin the currently installed CLI version,
- `--tag next` as the default prerelease tag,
- `--tag latest` once Firevault has a stable release.

The generated workflow currently installs `firevault@next`.

## Secret Name

Recommended secret:

```txt
FIREVAULT_SERVICE_ACCOUNT_JSON
```

This name is specific enough to avoid collision with application secrets and clear enough for GitHub repository settings.

The workflow should write it to the configured service account path:

```bash
printf '%s' "$FIREVAULT_SERVICE_ACCOUNT_JSON" > .firevault/serviceAccountKey.json
```

In GitHub Actions syntax, prefer reading from `secrets.FIREVAULT_SERVICE_ACCOUNT_JSON` into an environment variable for one step only.

## Schedule

Default schedule:

```yaml
on:
  schedule:
    - cron: "0 3 * * *"
  workflow_dispatch:
```

Daily is the right default because:

- it is simple,
- it limits operational cost and noise,
- it is enough for initial dogfooding,
- users can run manually through `workflow_dispatch`.

Custom cron should be supported later with:

```bash
firevault setup-github-action --cron "0 */6 * * *"
```

Do not add cron customization in the first implementation unless it stays very small.

## Setup Behavior

Phase 2 setup should create only the local workflow file and print next steps.

It should not:

- create GitHub repositories,
- call GitHub APIs,
- create or set GitHub secrets,
- push,
- stage,
- commit,
- store secrets.

After writing the workflow, print concise next steps:

```txt
Created .firevault/.github/workflows/firevault-snapshot.yml

Next steps:
1. Push .firevault to a private GitHub repository.
2. Add GitHub secret FIREVAULT_SERVICE_ACCOUNT_JSON with the full service account JSON.
3. Review and commit the workflow file yourself.
4. Run the workflow manually once before relying on the schedule.
```

## Manual Commit Policy

Firevault should not commit the workflow automatically.

Rationale:

- this is infrastructure configuration,
- users must review secret handling,
- Firevault and AI agents must not create commits automatically,
- the current product posture keeps Git writes explicit.

## Secret Safety

The workflow must avoid exposing service account JSON.

Rules:

- never echo the secret,
- never print the generated credential file,
- write the secret directly to the configured service account path,
- ensure `.firevault/.gitignore` ignores the service account path,
- remove the credential file at the end of the job if practical,
- do not upload backup artifacts containing credentials,
- do not put the JSON in workflow YAML.

The setup command should validate only local file paths and text generation. It should not inspect or store the secret value.

## GitHub-Specific Without GitHub API Dependency

Keep this as a local workflow-file generator.

Provider-specific assumptions are acceptable in the generated YAML and command name, but Firevault should not depend on GitHub APIs for setup.

This means:

- no GitHub token required,
- no `gh` dependency,
- no repository creation,
- no secret creation,
- no workflow run polling.

## Push Logic

The workflow should commit and push only when backup files changed.

Sketch:

```yaml
- name: Run snapshot
  run: firevault snapshot

- name: Push backup commit
  run: |
    if git diff --quiet origin/main..HEAD; then
      echo "No new backup commit to push."
      exit 0
    fi

    git push
```

Implementation should be careful here because `firevault snapshot` may create a commit only when backup files changed. The workflow needs to distinguish:

- no changes: do nothing,
- local backup commit created: push,
- command failed: fail the workflow.

The exact push check should be verified in a temporary Git repository before shipping.

## Status Detection

`firevault status` should detect Phase 2 by local file existence first:

```txt
.firevault/.github/workflows/firevault-snapshot.yml
```

Phase 2 status awareness can later inspect workflow text and report:

- scheduled trigger present,
- `workflow_dispatch` present,
- `firevault snapshot` present,
- `FIREVAULT_SERVICE_ACCOUNT_JSON` referenced,
- workflow installed but not validated.

No GitHub API calls should be used by `status` in Phase 2.

## Initial Workflow Shape

Draft workflow:

```yaml
name: Firevault snapshot

on:
  schedule:
    - cron: "0 3 * * *"
  workflow_dispatch:

permissions:
  contents: write

jobs:
  snapshot:
    runs-on: ubuntu-latest

    steps:
      - name: Check out recovery repository
        uses: actions/checkout@v4
        with:
          path: .firevault
          fetch-depth: 0

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: "22"

      - name: Install Firevault
        run: npm install -g firevault@next

      - name: Write Firebase service account
        env:
          FIREVAULT_SERVICE_ACCOUNT_JSON: ${{ secrets.FIREVAULT_SERVICE_ACCOUNT_JSON }}
        run: |
          mkdir -p "$(dirname ".firevault/serviceAccountKey.json")"
          printf '%s' "$FIREVAULT_SERVICE_ACCOUNT_JSON" > ".firevault/serviceAccountKey.json"

      - name: Configure Git author
        working-directory: .firevault
        run: |
          git config user.name "firevault"
          git config user.email "firevault@users.noreply.github.com"

      - name: Run snapshot
        run: firevault snapshot

      - name: Push backup commit
        working-directory: .firevault
        run: |
          branch="$(git rev-parse --abbrev-ref HEAD)"

          if git rev-parse --verify "origin/$branch" >/dev/null 2>&1; then
            commits_to_push="$(git rev-list --count "origin/$branch..HEAD")"

            if [ "$commits_to_push" = "0" ]; then
              echo "No new backup commit to push."
              exit 0
            fi
          fi

          git push origin "HEAD:$branch"

      - name: Remove service account file
        if: always()
        run: rm -f ".firevault/serviceAccountKey.json"
```

The implementation avoids hardcoding `main` by using `git rev-parse --abbrev-ref HEAD` in the checked-out recovery repository.

## First Implementation Files

Likely files:

- `src/commands/setupGithubAction.ts`
- `src/index.ts`
- `package.json`
- `README.md`
- `docs/roadmap.md`
- `docs/status-design.md`

Tests should use temporary directories and local file reads only. No Firebase emulator is required for workflow generation.
