import { Commit, Diff, Repository } from "nodegit";
import {
  StableVersion,
  FileChanges,
} from "./stable-version";
import { RelativePath, AbsolutePath } from "../paths";

export async function headCommit(
  repoPath: AbsolutePath,
): Promise<StableVersion | null> {
  try {
    const currCommit: Commit | null = await Repository.open(repoPath.path)
      .then((r) => r.getHeadCommit());
    if (!currCommit) {
      return null;
    }
    return { kind: "git", commit: currCommit.sha() };
  } catch (_) {
    return null;
  }
}

export async function gitDiffFile(
  commit: string,
  path: RelativePath,
  repoPath: AbsolutePath,
): Promise<FileChanges | null> {
  const repository = await Repository.open(repoPath.path);

  const oldTree =
    await Commit.lookup(repository, commit)
      .then((c: Commit) => c.getTree());
  const newTree = await repository.getHeadCommit()
    .then((c: Commit) => c.getTree());

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