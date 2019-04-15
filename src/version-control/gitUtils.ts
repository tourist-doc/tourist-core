import {
  StableVersion,
  FileChanges,
} from "./stableVersion";
import { RelativePath, AbsolutePath } from "../paths";
import child_process from "child_process";
import util from "util";
import parseDiff from "parse-diff";

// This is sort of a hack, but it works
const exec = (util as any).promisify(child_process.exec);

export async function git(
  path: AbsolutePath,
  command: string,
  args: string[],
): Promise<string> {
  const fullCommand =
    `git -C ${path.path} ${command} ${args.join(" ")}`;
  const res = await exec(fullCommand);
  if (res.stderr) { throw new Error(res.stderr); }
  return res.stdout;
}

export async function headCommit(
  repoPath: AbsolutePath,
): Promise<StableVersion | null> {
  try {
    const commit = await git(repoPath, "rev-parse", ["HEAD"]);
    return { kind: "git", commit: commit.trim() };
  } catch (_) {
    return null;
  }
}

export async function gitDiffFile(
  commit: string,
  path: RelativePath,
  repoPath: AbsolutePath,
): Promise<FileChanges | null> {
  const diff = await git(repoPath, "diff", [
    "--minimal",
    "--ignore-space-at-eol",
    "-M",
    `${commit}...`,
    "--",
    ".",
  ]);
  const file = parseDiff(diff).find((f) => f.from === path.path);

  const moves = new Map();
  const additions = [] as number[];
  const deletions = [] as number[];

  if (!file || file.from !== path.path) {
    return { moves, additions, deletions, name: path.path };
  }

  for (const chunk of await file.chunks) {
    for (const change of await chunk.changes) {
      switch (change.type) {
        case "add":
          if (!additions.find((x) => change.ln === x)) {
            additions.push(change.ln);
          }
          break;
        case "del":
          if (!deletions.find((x) => change.ln === x)) {
            deletions.push(change.ln);
          }
          break;
        case "normal":
          moves.set(change.ln1, change.ln2);
          break;
      }
    }
  }

  return { moves, additions, deletions, name: file.to || file.from };
}