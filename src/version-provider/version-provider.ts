import { AbsolutePath, RelativePath } from "../paths";

export interface RepoVersion {
  kind: string;
  equals(other: RepoVersion): boolean;
}

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

export interface VersionProvider {
  getCurrentVersion(repoPath: AbsolutePath): Promise<RepoVersion>;
  getChangesForFile(
    version: RepoVersion,
    path: RelativePath,
    repoPath: AbsolutePath,
  ): Promise<FileChanges | null>;
}