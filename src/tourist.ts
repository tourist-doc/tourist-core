import * as af from "async-file";
import {
  AbsoluteTourStop,
  RepoIndex,
  Tour,
  TourFile,
  TourStop,
  TourStopEdit,
  TourStopPos,
  BrokenTourStop,
  validTourFile,
  TouristError,
  RepoState,
  BrokenError,
} from "./types";
import { VersionProvider, GitProvider, DiffCache } from "./versionProvider";
import { RelativePath, AbsolutePath } from "./paths";
import { FileChanges } from "./fileChanges";

export class Tourist {
  public readonly config: RepoIndex;
  public vp: VersionProvider;

  constructor(config: RepoIndex = {}) {
    this.config = config;
    this.vp = new GitProvider();
  }

  /**
   * Creates a tour file object.
   *
   * @param title The name of the tour to be created.
   */
  public async init(
    title: string = "Tour",
    description: string = "",
  ): Promise<TourFile> {
    return {
      protocolVersion: "1.0",
      id: title,
      repositories: [],
      stops: [],
      title,
      description,
      version: "0.10.0",
    };
  }

  /**
   * Renames a tour.
   *
   * @param tf
   * @param name The new name for the tour.
   */
  public async rename(tf: TourFile, name: string) {
    tf.title = name;
  }

  /**
   * Edits a tour's description.
   * @param tf
   * @param description The new description for the tour.
   */
  public async editDescription(tf: TourFile, description: string) {
    tf.description = description;
  }

  /**
   * Adds a stop to the tour.
   *
   * @param tf
   * @param stop The tour stop to add, specified with an absolute path.
   * @param index An index into the stop list, if `null` the stop will be
   *  appended to the end. If the index is greater than the length of the list,
   *  the stop is added at the end. A negative index counts from the end of the
   *  list.
   * @param versionMode Here be dragons. Don't mess with this unless you really
   *  know you want to. This will be used down the line to allow for more
   *  supported version providers, but for now git is the only one.
   * @throws Error code(s): 100, 101, 200, 201, 202, 203
   *  See the error-handling.md document for more information.
   */
  public async add(
    tf: TourFile,
    stop: AbsoluteTourStop,
    index: number | null = null,
  ) {
    const absPath = new AbsolutePath(stop.absPath);
    // Make sure file exists and line is valid (might throw error)
    await this.verifyLocation(absPath, stop.line);
    for (const repo of tf.repositories) {
      await this.refresh(tf, repo.repository);
    }

    const relPath = absPath.toRelativePath(this.config);
    if (!relPath) {
      throw new TouristError(204, "No known repository in this tree.");
    }

    // Find the appropriate repo version in the tour file
    const repoState = tf.repositories.find(
      (st) => st.repository === relPath.repository,
    );

    const repoPath = this.getRepoPath(relPath.repository);
    const version = await this.vp.getCurrentVersion(repoPath);
    if (!version) {
      throw new TouristError(
        202,
        `Could not get current version for repository ${relPath.repository}.`,
        relPath.repository,
      );
    }
    if (!repoState) {
      // Repo not versioned, add version
      tf.repositories.push({
        repository: relPath.repository,
        commit: version,
      });
    }

    // Get relative stop, current version of the repo (might throw error)
    const relStop = await this.abstractStop(tf, stop, repoState);

    if (repoState && repoState.commit !== version) {
      // Repo already versioned, versions disagree
      throw new TouristError(
        203,
        `Mismatched versions. Repository ${repoState.repository} is checked` +
          ` out to the wrong version.`,
        repoState.repository,
      );
    }

    // Insert stop into list
    if (index !== null) {
      tf.stops.splice(index, 0, relStop);
    } else {
      tf.stops.push(relStop);
    }
  }

  /**
   * Removes a stop from the tour.
   *
   * @param tf
   * @param index The index of the stop to be removed. A negative index counts
   *  from the end of the list.
   * @throws Error code(s): 0
   *  See the error-handling.md document for more information.
   */
  public async remove(tf: TourFile, index: number) {
    if (index >= tf.stops.length) {
      throw new TouristError(0, "Index out of bounds.");
    }
    tf.stops.splice(index, 1);

    // Prune any repositories that are no longer relevant to this tour
    const remainingRepos = new Set<string>();
    for (const stop of tf.stops) {
      remainingRepos.add(stop.repository);
    }
    tf.repositories = tf.repositories.filter((repo) => {
      return remainingRepos.has(repo.repository);
    });
  }

  /**
   * Edit the title or body of a tour stop.
   *
   * @param tf
   * @param index The index of the stop to be edited. A negative index counts
   *  from the end of the list.
   * @param stopEdit A delta to be applied to the stop.
   * @throws Error code(s): 0
   *  See the error-handling.md document for more information.
   */
  public async edit(tf: TourFile, index: number, stopEdit: TourStopEdit) {
    if (index >= tf.stops.length) {
      throw new TouristError(0, "Index out of bounds.");
    }
    if (stopEdit.title !== undefined) {
      tf.stops[index].title = stopEdit.title;
    }
    if (stopEdit.body !== undefined) {
      tf.stops[index].body = stopEdit.body;
    }
  }

  /**
   * Move the path or line of a tour stop.
   *
   * @param tf
   * @param index The index of the stop to be removed. A negative index counts
   *  from the end of the list.
   * @param stopPos A delta to be applied to the stop.
   * @param versionMode Here be dragons. Don't mess with this unless you really
   *  know you want to. This will be used down the line to allow for more
   *  supported version providers, but for now git is the only one.
   * @throws Error code(s): 0, 100, 101, 200, 201, 202, 203
   *  See the error-handling.md document for more information.
   */
  public async move(tf: TourFile, index: number, stopPos: TourStopPos) {
    if (index >= tf.stops.length) {
      throw new TouristError(0, "Index out of bounds.");
    }
    const stop = (await this.resolveStop(
      tf,
      tf.stops[index],
    )) as AbsoluteTourStop;
    stop.absPath = stopPos.absPath;
    stop.line = stopPos.line;
    await this.add(tf, stop, index);
    await this.remove(tf, index + 1);
  }

  public async link(
    tf: TourFile,
    index: number,
    childStop: { tourId: string; stopNum: number },
  ) {
    tf.stops[index].childStops.push(childStop);
  }

  /**
   * Generates a tour from a tour file.
   *
   * @param tf
   * @throws Error code(s): 200
   *  See the error-handling.md document for more information.
   */
  public async resolve(tf: TourFile): Promise<Tour> {
    const cache = DiffCache.getInstance();
    cache.start();
    const stops = await Promise.all(
      tf.stops.map((stop) => this.resolveStop(tf, stop)),
    );
    cache.invalidate();
    return {
      stops,
      title: tf.title,
    };
  }

  /**
   * Updates all stops in a tour file based on changes to the repository state.
   *
   * If any files have been deleted or if the target lines themselves have been
   * deleted or completely changed, the stop will be left in an error state.
   * Specifically, the line is set to 0 and the file name is set to
   * `""`.
   *
   * @param tf
   * @throws Error code(s): 200, 300
   *  See the error-handling.md document for more information.
   */
  public async refresh(tf: TourFile, repository: string) {
    const repoPath = this.getRepoPath(repository);

    // Find the version of the repo in the file system
    const currVersion = await this.vp.getCurrentVersion(repoPath);
    if (!currVersion) {
      throw new TouristError(
        202,
        `Could not get current version for repository ${repository}.`,
        repository,
      );
    }

    // Find the state of the repository in the tour file
    const repoState = tf.repositories.find(
      (st) => st.repository === repository,
    );
    if (!repoState) {
      throw new TouristError(
        300,
        `No version for repository ${repository}.`,
        repository,
      );
    } else if (repoState.commit === currVersion) {
      // If repository is already up to date, don't do anything
      return;
    }

    const cache = DiffCache.getInstance();
    cache.start();
    for (const stop of tf.stops) {
      // Skip if the stop isn't in this repository
      if (stop.repository !== repository) {
        continue;
      }

      // Compute changes to the file
      const changes: FileChanges | null = await this.vp.getChangesForFile(
        repoState.commit,
        new RelativePath(stop.repository, stop.relPath),
        repoPath,
      );
      if (!changes) {
        continue;
      }

      // Apply the changes to the stop
      const newLine = changes.computeDelta(stop.line);
      if (newLine !== null) {
        stop.line = newLine;
        stop.relPath = changes.name;
      } else {
        stop.line = 0;
        stop.relPath = "";
      }
    }
    cache.invalidate();

    repoState.commit = currVersion;
  }

  /**
   * Scrambles the stops in the tour.
   *
   * The passing indices `[1, 1, 2]` means that the new stops will be:
   * `[stops[1], stops[1], stops[2]]`.
   *
   * @param tf
   * @param indices Indices to use for scrambling.
   * @throws Error code(s): 1
   *  See the error-handling.md document for more information.
   */
  public async scramble(tf: TourFile, indices: number[]) {
    if (indices.some((i) => i >= tf.stops.length)) {
      throw new TouristError(1, "One or more indices out of bounds.");
    }
    tf.stops = indices.map((i) => tf.stops[i]);
  }

  /**
   * Creates a string representation of a tour file.
   *
   * @param tf The tour file to serialize.
   */
  public serializeTourFile(tf: TourFile): string {
    const replacer = [
      "body",
      "childStops",
      "commit",
      "description",
      "generator",
      "id",
      "line",
      "protocolVersion",
      "relPath",
      "repositories",
      "repository",
      "stopNum",
      "stops",
      "title",
      "tourId",
      "version",
    ];
    return JSON.stringify(tf, replacer, 2);
  }

  /**
   * Create a tour file from a string representation.
   *
   * @param json String that encodes a tour file.
   * @throws Error code(s): 400, 401
   *  See the error-handling.md document for more information.
   */
  public deserializeTourFile(json: string): TourFile {
    try {
      const obj = JSON.parse(json);
      if (!validTourFile(obj)) {
        throw new TouristError(401, "Object is not a valid TourFile.");
      }
      return obj;
    } catch (_) {
      throw new TouristError(400, "Invalid JSON string.");
    }
  }

  /**
   * Maps a repository name to its absolute path.
   *
   * @param repo The repository key.
   * @param path The path value.
   */
  public mapConfig(repo: string, path: string) {
    this.config[repo] = path;
  }

  /**
   * Removes a repository mapping.
   *
   * @param repo The repository key.
   */
  public unmapConfig(repo: string) {
    delete this.config[repo];
  }

  /**
   * Dumps the current mapping of repositories to absolute paths.
   */
  public dumpConfig(): Map<string, string> {
    return new Map(Object.entries(this.config));
  }

  /**
   * Serializes this tourist instance to a string.
   */
  public serialize(): string {
    return JSON.stringify(this.config);
  }

  /**
   * Deserializes a tourist instance from a string;
   *
   * @param json The JSON string to convert from.
   * @throws Error code(s): 400
   *  See the error-handling.md document for more information.
   */
  // tslint:disable-next-line: member-ordering
  public static deserialize(json: string): Tourist {
    let config: RepoIndex;
    try {
      config = JSON.parse(json);
    } catch (_) {
      throw new TouristError(400, "Invalid JSON string.");
    }
    const tourist = new Tourist(config);
    return tourist;
  }

  private async verifyLocation(path: AbsolutePath, line: number) {
    let data: Buffer;
    try {
      data = await af.readFile(path.path);
    } catch (e) {
      throw new TouristError(
        100,
        `Invalid location. Could not read ${path.path}.`,
      );
    }
    if (line < 1 || line > data.toString().split("\n").length) {
      throw new TouristError(
        101,
        `Invalid location. No line ${line} in ${path.path}.`,
      );
    }
  }

  private async resolveStop(
    tf: TourFile,
    stop: TourStop,
  ): Promise<AbsoluteTourStop | BrokenTourStop> {
    const repoPath = await this.getRepoPath(stop.repository);
    const repoState = tf.repositories.find(
      (st) => st.repository === stop.repository,
    );
    if (!repoState) {
      throw new TouristError(
        300,
        `No version for repository ${stop.repository}.`,
        stop.repository,
      );
    }
    const baseFields = {
      id: stop.id,
      body: stop.body,
      title: stop.title,
      childStops: stop.childStops,
    };
    const makeBroken = (errors: BrokenError[]) => ({
      errors,
      ...baseFields,
    });
    const changes = await this.vp.getDirtyChangesForFile(
      repoState.commit,
      new RelativePath(stop.repository, stop.relPath),
      repoPath,
    );
    if (!changes) {
      return makeBroken(["FileNotFound"]);
    }

    const absPath = new RelativePath(
      stop.repository,
      changes.name,
    ).toAbsolutePath(this.config);
    if (!absPath) {
      throw new TouristError(
        200,
        `Repository ${stop.repository} is not mapped to a path.`,
        stop.repository,
      );
    }
    try {
      await af.readFile(absPath.path);
    } catch (e) {
      return makeBroken(["FileNotFound"]);
    }

    const newLine = await changes.computeDelta(stop.line);
    if (!newLine || newLine <= 0) {
      return makeBroken(["LineNotFound"]);
    }

    return {
      absPath: absPath.path,
      line: newLine,
      ...baseFields,
    };
  }

  private async abstractStop(
    tf: TourFile,
    stop: AbsoluteTourStop,
    repoState?: RepoState,
  ): Promise<TourStop> {
    const absPath = new AbsolutePath(stop.absPath);
    const relPath = absPath.toRelativePath(this.config);
    if (!relPath) {
      throw new TouristError(
        201,
        `Path ${absPath.path} is not mapped as a repository.`,
      );
    }

    const repoPath = this.getRepoPath(relPath.repository);
    let commit = repoState ? repoState.commit : undefined;
    if (!repoState) {
      const rs = await this.vp.getCurrentVersion(repoPath);
      if (rs) {
        commit = rs;
      }
    }

    if (commit) {
      // Compute changes to the file
      const changes = await this.vp.getDirtyChangesForFile(
        commit,
        new RelativePath(relPath.repository, relPath.path),
        repoPath,
      );
      if (changes) {
        stop.line = changes.undoDelta(stop.line)!;
      }
    }

    let id;
    if (stop.id) {
      id = stop.id;
    } else {
      if (!tf.generator) {
        tf.generator = 0;
      }
      id = `${tf.id}:${tf.generator.toString()}`;
      tf.generator++;
    }

    return {
      id,
      body: stop.body,
      line: stop.line,
      relPath: relPath.path,
      repository: relPath.repository,
      title: stop.title,
      childStops: stop.childStops,
    };
  }

  private getRepoPath(repo: string): AbsolutePath {
    const path = this.config[repo];
    if (!path) {
      throw new TouristError(
        200,
        `Repository ${repo} is not mapped to a path.`,
        repo,
      );
    }
    return new AbsolutePath(path);
  }
}
