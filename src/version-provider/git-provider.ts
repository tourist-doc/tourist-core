import { Commit, Diff, Repository } from "nodegit";
import * as err from "../tourist-error";
import {
  FileChanges,
  RepoVersion,
  VersionProvider,
} from "./version-provider";
import { RelativePath, AbsolutePath } from "../paths";

export class GitVersion implements RepoVersion {
  public kind: "git" = "git";
  public commit: string;
  constructor(commit: string) {
    this.commit = commit;
  }

  public equals(other: RepoVersion): boolean {
    if (other.kind !== "git") { return false; }
    return (other as GitVersion).commit === this.commit;
  }
}

export class GitProvider implements VersionProvider {
  public async getCurrentVersion(repoPath: AbsolutePath): Promise<RepoVersion> {
    const commit: Commit =
      await Repository.open(repoPath.path).then((r) => r.getHeadCommit());
    if (!commit) { throw new err.NotRepoError(); }
    return new GitVersion(commit.sha());
  }

  public async getChangesForFile(
    version: RepoVersion,
    path: RelativePath,
    repoPath: AbsolutePath,
  ): Promise<FileChanges | null> {
    if (version.kind !== "git") { return null; }

    const repository = await Repository.open(repoPath.path);

    const oldTree =
      await Commit.lookup(repository, (version as GitVersion).commit)
        .then((commit: Commit) => commit.getTree());
    const newTree = await repository.getHeadCommit()
      .then((commit: Commit) => commit.getTree());

    const diff = await Diff.treeToTree(
      repository,
      oldTree,
      newTree,
      {
        // tslint:disable-next-line: no-bitwise
        flags: Diff.OPTION.IGNORE_WHITESPACE_EOL |
          Diff.OPTION.MINIMAL |
          Diff.OPTION.SHOW_UNMODIFIED |
          Diff.OPTION.INCLUDE_UNMODIFIED,
      },
    );

    await diff.findSimilar({ flags: Diff.FIND.RENAMES });

    const moves = new Map();
    const additions = [] as number[];
    const deletions = [] as number[];

    const patch = (await diff.patches())
      .find((p) => p.oldFile().path() === path.path);
    if (!patch) { return { moves, additions, deletions, name: path.path }; }

    for (const hunk of await patch.hunks()) {
      for (const line of await hunk.lines()) {
        if (line.oldLineno() === -1) {
          if (!additions.find((l) => l === line.newLineno())) {
            additions.push(line.newLineno());
          }
        } else if (line.newLineno() === -1) {
          if (!deletions.find((l) => l === line.oldLineno())) {
            deletions.push(line.oldLineno());
          }
        } else {
          moves.set(line.oldLineno(), line.newLineno());
        }
      }
    }

    return { moves, additions, deletions, name: patch.newFile().path() };
  }
}