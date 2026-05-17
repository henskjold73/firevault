import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { ConfigError, loadConfig } from "../config/loadConfig.js";

interface SetupGithubActionOptions {
  force?: boolean;
}

const workflowRelativePath = ".github/workflows/firevault-snapshot.yml";
const secretName = "FIREVAULT_SERVICE_ACCOUNT_JSON";

function normalizeWorkflowPath(configPath: string): string {
  const normalized = configPath.replaceAll("\\", "/").replace(/^\.\//, "");

  if (
    normalized === "" ||
    normalized.startsWith("/") ||
    normalized.startsWith("../") ||
    normalized.includes("/../")
  ) {
    throw new ConfigError(
      "Cannot generate GitHub Actions workflow: serviceAccountPath must stay inside .firevault.",
    );
  }

  return normalized;
}

function workflowYaml(serviceAccountPath: string): string {
  const actionServiceAccountPath = `.firevault/${serviceAccountPath}`;

  return `name: Firevault snapshot

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
          ${secretName}: \${{ secrets.${secretName} }}
        run: |
          mkdir -p "$(dirname "${actionServiceAccountPath}")"
          printf '%s' "$${secretName}" > "${actionServiceAccountPath}"

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
        run: rm -f "${actionServiceAccountPath}"
`;
}

export function runSetupGithubAction(options: SetupGithubActionOptions): void {
  const config = loadConfig();
  const serviceAccountPath = normalizeWorkflowPath(config.serviceAccountPath);
  const workflowPath = path.join(config.workspaceRoot, workflowRelativePath);

  if (existsSync(workflowPath) && !options.force) {
    throw new ConfigError(
      `${path.join(".firevault", workflowRelativePath)} already exists. Rerun with --force to overwrite it.`,
    );
  }

  mkdirSync(path.dirname(workflowPath), { recursive: true });
  writeFileSync(workflowPath, workflowYaml(serviceAccountPath));

  console.log("Created:");
  console.log(path.join(".firevault", workflowRelativePath));
  console.log("");
  console.log("Next steps:");
  console.log("1. Push the .firevault repo to GitHub");
  console.log("2. Create GitHub secret:");
  console.log(`   ${secretName}`);
  console.log("3. Add your Firebase service account JSON as the secret value");
  console.log("4. Review and commit the workflow file yourself");
  console.log("5. Run the workflow manually once before relying on the schedule");
}

export const setupGithubActionCommand = new Command("setup-github-action")
  .description("Create a local GitHub Actions workflow for scheduled Firevault snapshots")
  .option("--force", "Overwrite an existing Firevault snapshot workflow")
  .action((options: SetupGithubActionOptions) => {
    try {
      runSetupGithubAction(options);
    } catch (error) {
      if (error instanceof ConfigError) {
        console.error(error.message);
        process.exitCode = 1;
        return;
      }

      throw error;
    }
  });
