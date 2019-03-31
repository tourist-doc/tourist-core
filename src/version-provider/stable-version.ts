import { AbsolutePath, RelativePath } from "../paths";

export interface StableVersion {
  kind: string;
  serialize(): any;
  setFromSerialized(data: any): void;
  setToCurrentVersion(repoPath: AbsolutePath): Promise<void>;
  getChangesForFile(
    path: RelativePath,
    repoPath: AbsolutePath,
  ): Promise<FileChanges | null>;
  equals(other: StableVersion): boolean;
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
