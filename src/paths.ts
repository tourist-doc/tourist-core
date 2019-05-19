import { RepoIndex } from "./types";
import * as pathutil from "path";

export class RelativePath {
  public repository: string;
  public path: string;

  constructor(repository: string, path: string) {
    this.repository = repository;
    this.path = path;
  }

  public toAbsolutePath(config: RepoIndex): AbsolutePath | null {
    const repoPath = config[this.repository];
    if (repoPath === undefined) {
      return null;
    }
    return new AbsolutePath(pathutil.join(repoPath, this.path));
  }
}

export class AbsolutePath {
  public path: string;

  constructor(path: string) {
    this.path = path;
  }

  public toRelativePath(config: RepoIndex): RelativePath | null {
    // Sort in ascending path length order so we always choose the longest path
    const paths = Object.entries(config).sort(
      (a, b) => a[1].length - b[1].length,
    );

    // Find appropriate repo and relative path, create tour stop
    let repository: string | null = null;
    let relPath: string | null = null;
    for (const entry of paths) {
      const repo = entry[0];
      const repoRoot = entry[1];
      if (this.path.startsWith(repoRoot)) {
        repository = repo;
        relPath = pathutil.relative(repoRoot, this.path);
        break;
      }
    }
    if (repository === null || relPath === null) {
      return null;
    }

    return new RelativePath(repository, relPath);
  }
}
