import child_process from "child_process";
import parseDiff from "parse-diff";
import util from "util";
import { AbsolutePath, RelativePath } from "./paths";
import { FileChanges } from "./fileChanges";

// This is sort of a hack, but it works
const exec = (util as any).promisify(child_process.exec);

/* The application currently uses `child_process.exec` to call git, which means
 * that the output of the git script is buffered by node. This is not ideal, so
 * we plan to switch to `child_process.spawn`, but until then we need to pick a
 * buffer size.
 *
 * 10 Mb felt reasonable. We don't really have justification beyond that.
 */
const BUFFER_SIZE = 1024 * 1024 * 10;

export interface VersionProvider {
  getCurrentVersion(path: AbsolutePath): Promise<string | null>;
  getChangesForFile(
    version: string,
    path: RelativePath,
    repoPath: AbsolutePath,
  ): Promise<FileChanges | null>;
  getDirtyChangesForFile(
    version: string,
    path: RelativePath,
    repoPath: AbsolutePath,
  ): Promise<FileChanges | null>;
}

export class GitProvider implements VersionProvider {
  public async getCurrentVersion(path: AbsolutePath): Promise<string | null> {
    try {
      const commit = await this.git(path, "rev-parse", ["HEAD"]);
      return commit.trim();
    } catch (_) {
      return null;
    }
  }

  public async git(
    path: AbsolutePath,
    command: string,
    args: string[],
  ): Promise<string> {
    const fullCommand = `git -C ${path.path} ${command} ${args.join(" ")}`;
    const res = await exec(fullCommand, { maxBuffer: BUFFER_SIZE });
    if (res.stderr && !res.stderr.startsWith("warning: LF")) {
      throw new Error(res.stderr);
    }
    return res.stdout;
  }

  public async getDirtyChangesForFile(
    commit: string,
    path: RelativePath,
    repoPath: AbsolutePath,
  ): Promise<FileChanges | null> {
    return await this.getGenericChangesForFile(commit, path, repoPath, true);
  }

  public async getChangesForFile(
    commit: string,
    path: RelativePath,
    repoPath: AbsolutePath,
  ): Promise<FileChanges | null> {
    return await this.getGenericChangesForFile(commit, path, repoPath, false);
  }

  private async getGenericChangesForFile(
    commit: string,
    path: RelativePath,
    repoPath: AbsolutePath,
    includeWorkingCopy: boolean,
  ): Promise<FileChanges | null> {
    const diff = await (includeWorkingCopy
      ? this.diffWithWorkingCopy(commit, repoPath)
      : this.diffWithHead(commit, repoPath));

    const file = parseDiff(diff).find((f) => f.from === path.path);

    const moves = new Map();
    const additions = [] as number[];
    const deletions = [] as number[];

    if (file === undefined || file.from !== path.path) {
      return new FileChanges(additions, deletions, moves, path.path);
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

    return new FileChanges(additions, deletions, moves, file.to || file.from);
  }

  private async diffWithHead(
    commit: string,
    repoPath: AbsolutePath,
  ): Promise<string> {
    return this.git(repoPath, "diff", [
      "--minimal",
      "--ignore-space-at-eol",
      "-M",
      `${commit}...`,
      "--",
      ".",
    ]);
  }

  private async diffWithWorkingCopy(
    commit: string,
    repoPath: AbsolutePath,
  ): Promise<string> {
    return this.git(repoPath, "diff", [
      "--minimal",
      "--ignore-space-at-eol",
      "-M",
      `${commit}`,
      "--",
      ".",
    ]);
  }
}
