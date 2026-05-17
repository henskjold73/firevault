# Security

Firevault is local operational recovery tooling for Firestore.

## Data Handling

Firevault does not transmit Firestore data to a Firevault service. There is no hosted Firevault backend, telemetry pipeline, dashboard, or account system.

Data flow is local:

```txt
Firestore -> .firevault/firestore-backups -> .firevault Git repository
```

`restore-firestore` writes directly from your local Git-backed backup data to the Firestore project configured in `.firevault/config.json`.

## Service Accounts

Firevault uses a Firebase service account file specified by `serviceAccountPath`.

Expectations:

- keep service account files out of Git,
- prefer least-privilege credentials where possible,
- rotate credentials if they are exposed,
- do not publish `serviceAccountKey.json` to npm or GitHub.
- when using GitHub Actions, store the full service account JSON only in the repository secret `FIREVAULT_SERVICE_ACCOUNT_JSON`.

Recommended `.gitignore` entries:

Parent app repo:

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

## Backup Repository Security

Firestore exports may contain sensitive application data. Users are responsible for securing the `.firevault` repository, local machines, CI logs, and any remote Git hosting used for backup history.

Recommended practices:

- use private repositories for backup history,
- restrict access to backup repos,
- review what collections are configured for export,
- avoid pushing backup data until repository access controls are clear,
- treat backup JSON with the same sensitivity as production database contents.

## GitHub Actions

`firevault setup-github-action` generates a local workflow file only. Firevault does not create GitHub repositories, call GitHub APIs, create secrets, broker credentials, or store service account JSON.

The generated workflow writes `FIREVAULT_SERVICE_ACCOUNT_JSON` to the configured service account path for the job, runs `firevault snapshot`, and removes the credential file at the end of the job. Do not paste service account JSON into workflow YAML or commit credential files.

## Reporting Security Issues

Do not open a public issue for secrets exposure or a vulnerability. Contact the maintainer privately through the repository owner profile until a dedicated security contact is published.
