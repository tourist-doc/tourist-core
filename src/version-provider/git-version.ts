import { Commit, Diff, Repository } from "nodegit";
import {
  FileChanges,
  StableVersion,
} from "./stable-version";
import { RelativePath, AbsolutePath } from "../paths";

export class GitVersion implements StableVersion {
  public kind: "git" = "git";
  public commit: string | undefined;

  public async setCommit(commit: string) {
    this.commit = commit;
  }

  public serialize(): any {
    return { kind: this.kind, commit: this.commit! };
  }

  public setFromSerialized(data: any) {
    this.kind = data.kind;
    this.commit = data.commit;
  }

  public async setToCurrentVersion(repoPath: AbsolutePath) {
    const currCommit: Commit | null = await Repository.open(repoPath.path)
      .then((r) => r.getHeadCommit())
      .catch((_) => {
        throw new Error(`Problem finding HEAD for ${repoPath.path}.`);
      });
    if (!currCommit) {
      throw new Error(`Problem finding HEAD for ${repoPath.path}.`);
    }
    this.commit = currCommit.sha();
  }

  public async getChangesForFile(
    path: RelativePath,
    repoPath: AbsolutePath,
  ): Promise<FileChanges | null> {
    if (!this.commit) {
      throw new Error("No commit set for this version.");
    }

    const repository = await Repository.open(repoPath.path);

    const oldTree =
      await Commit.lookup(repository, this.commit)
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

  public equals(other: StableVersion): boolean {
    if (other.kind !== "git") { return false; }
    return (other as GitVersion).commit === this.commit;
  }
}