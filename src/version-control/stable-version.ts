import { AbsolutePath, RelativePath } from "../paths";
import { headCommit, gitDiffFile } from "./git-utils";

export interface FileChanges {
  additions: number[];
  deletions: number[];
  moves: Map<number, number>;
  name: string;
}

export function computeLineDelta(
  changes: FileChanges,
  line: number,
): number | null {
  if (changes.deletions.includes(line)) { return null; }
  if (changes.moves.has(line)) { return changes.moves.get(line)!; }

  for (const rm of changes.deletions.sort()) {
    if (rm < line) { line--; } else { break; }
  }
  for (const add of changes.additions.sort()) {
    if (add < line) { line++; } else { break; }
  }
  return line;
}

export type StableVersion =
  { kind: "unversioned" } |
  { kind: "git", commit: string };

export function validStableVersion(obj: any): obj is StableVersion {
  try {
    switch (obj.kind) {
      case "git":
        return typeof obj.commit === "string";
      case "unversioned":
        return true;
      default:
        return false;
    }
  } catch (_) {
    return false;
  }
}

export async function getCurrentVersion(
  mode: string,
  path: AbsolutePath,
): Promise<StableVersion> {
  switch (mode) {
    case "git":
      return await headCommit(path);
    default:
      return { kind: "unversioned" };
  }
}

export async function getChangesForFile(
  version: StableVersion,
  path: RelativePath,
  repoPath: AbsolutePath,
): Promise<FileChanges | null> {
  switch (version.kind) {
    case "git":
      return await gitDiffFile(version.commit, path, repoPath);
    case "unversioned":
      return {
        additions: [],
        deletions: [],
        moves: new Map(),
        name: path.path,
      };
  }
}

export function versionEq(v1: StableVersion, v2: StableVersion): boolean {
  if (v1.kind !== v2.kind) { return false; }
  switch (v1.kind) {
    case "git":
      return v1.commit === (v2 as any).commit;
    case "unversioned":
      return true;
  }
}