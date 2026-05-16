import path from "node:path";

export interface NormalizedHistoryPath {
  path: string;
  isCollection: boolean;
}

export function normalizeSlashes(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.?\//, "").replace(/\/+$/, "");
}

export function normalizeHistoryPath(
  input: string,
  outputDir: string,
): NormalizedHistoryPath {
  const normalizedInput = normalizeSlashes(input);
  const normalizedOutputDir = normalizeSlashes(outputDir);

  if (
    normalizedInput === normalizedOutputDir ||
    normalizedInput.startsWith(`${normalizedOutputDir}/`)
  ) {
    return {
      path: normalizedInput,
      isCollection: !normalizedInput.endsWith(".json"),
    };
  }

  const parts = normalizedInput.split("/");

  if (parts.length === 1) {
    return {
      path: path.posix.join(normalizedOutputDir, parts[0]),
      isCollection: true,
    };
  }

  return {
    path: path.posix.join(
      normalizedOutputDir,
      parts[0],
      `${parts.slice(1).join("/")}.json`,
    ),
    isCollection: false,
  };
}

export function normalizeDocumentPath(input: string, outputDir: string): string {
  const normalizedInput = normalizeSlashes(input);
  const normalizedOutputDir = normalizeSlashes(outputDir);

  if (normalizedInput.startsWith(`${normalizedOutputDir}/`)) {
    return normalizedInput;
  }

  const parts = normalizedInput.split("/");

  return path.posix.join(
    normalizedOutputDir,
    parts[0],
    `${parts.slice(1).join("/")}.json`,
  );
}
