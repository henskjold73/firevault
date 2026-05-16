import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "../..");
const firebaseBin = path.join(projectRoot, "node_modules/.bin/firebase");

if (!existsSync(firebaseBin)) {
  console.error(
    "Firebase emulator tooling is missing. Run `npm install`, then run `npm run test:emulator` again.",
  );
  process.exit(1);
}

execFileSync(
  firebaseBin,
  [
    "emulators:exec",
    "--project",
    "demo-firevault-test",
    "--only",
    "firestore",
    "tsx --test test/integration/firestore-emulator.test.ts",
  ],
  {
    cwd: projectRoot,
    stdio: "inherit",
  },
);
