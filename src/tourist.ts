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
} from "./types";
import {
  computeLineDelta,
  StableVersion,
  versionEq,
  getChangesForFile,
  getCurrentVersion,
} from "./version-control/stableVersion";
import { RelativePath, AbsolutePath } from "./paths";

export class Tourist {
  public readonly config: RepoIndex;

  constructor(config: RepoIndex = {}) {
    this.config = config;
  }

  /**
   * Creates a tour file object.
   *
   * @param title The name of the tour to be created.
   */
  public async init(title: string = "Tour"): Promise<TourFile> {
    return {
      repositories: [],
      stops: [],
      title,
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
    versionMode: string = "git",
  ) {
    // Make sure file exists and line is valid (might throw error)
    await this.verifyLocation(new AbsolutePath(stop.absPath), stop.line);

    // Get relative stop, current version of the repo (might throw error)
    const [relStop, version] = await this.abstractStop(stop, versionMode);

    // Find the appropriate repo version in the tour file
    const repoState = tf.repositories
      .find((st) => st.repository === relStop.repository);

    if (repoState && !versionEq(repoState.version, (version))) {
      // Repo already versioned, versions disagree
      throw new TouristError(
        203,
        `Mismatched versions. Repository ${repoState.repository} is checked` +
        ` out to the wrong version.`,
        repoState.repository,
      );
    } else if (!repoState) {
      // Repo not versioned, add version
      tf.repositories.push({
        repository: relStop.repository,
        version,
        versionMode,
      });
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
  public async edit(
    tf: TourFile,
    index: number,
    stopEdit: TourStopEdit,
  ) {
    if (index >= tf.stops.length) {
      throw new TouristError(0, "Index out of bounds.");
    }
    if (stopEdit.title) { tf.stops[index].title = stopEdit.title; }
    if (stopEdit.body) { tf.stops[index].body = stopEdit.body; }
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
  public async move(
    tf: TourFile,
    index: number,
    stopPos: TourStopPos,
    versionMode: string = "git",
  ) {
    if (index >= tf.stops.length) {
      throw new TouristError(0, "Index out of bounds.");
    }
    const stop = await this.resolveStop(tf.stops[index]) as AbsoluteTourStop;
    stop.absPath = stopPos.absPath;
    stop.line = stopPos.line;
    await this.add(tf, stop, index, versionMode);
    await this.remove(tf, index + 1);
  }

  /**
   * Generates a tour from a tour file.
   *
   * @param tf
   * @throws Error code(s): 200
   *  See the error-handling.md document for more information.
   */
  public async resolve(tf: TourFile): Promise<Tour> {
    const stops = await Promise.all(
      tf.stops.map((stop) => this.resolveStop(stop)),
    );
    return {
      stops,
      title: tf.title,
    };
  }

  /**
   * Checks a tour file for errors.
   *
   * The errors will not be thrown, but will instead be put into a list and
   * returned. The errors that check might return correspond to error codes:
   * 100, 101, 200, 203, 300
   *
   * @param tf
   */
  public async check(tf: TourFile): Promise<string[]> {
    const errors = [] as string[];

    await Promise.all(tf.stops.map(async (stop, i) => {
      const rel = new RelativePath(stop.repository, stop.relPath);
      const abs = rel.toAbsolutePath(this.config);

      try {
        if (!abs) {
          throw new TouristError(
            200, `Repository ${stop.repository} is not mapped to a path.`, stop.repository,
          );
        }

        await this.verifyLocation(abs, stop.line);  // might throw

        const state = tf.repositories
          .find((s) => s.repository === stop.repository);
        if (!state) {
          throw new TouristError(
            300, `No version for repository ${stop.repository}.`, stop.repository,
          );
        }

        const currVersion = await getCurrentVersion(
          state.versionMode,
          this.getRepoPath(state.repository),
        );
        if (!currVersion) {
          throw new TouristError(
            202,
            `Could not get current version for repository ${stop.repository}.`,
            stop.repository,
          );
        }
        if (!versionEq(state.version, currVersion)) {
          throw new TouristError(
            203,
            `Mismatched versions. Repository ${state.repository} is checked` +
            ` out to the wrong version.`,
            state.repository,
          );
        }
      } catch (e) {
        errors.push(`Stop ${i}: ${e.message}`);
      }
    }));

    return errors;
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
  public async refresh(tf: TourFile) {
    for (const stop of tf.stops) {
      const repoState = tf.repositories.find((st) =>
        st.repository === stop.repository,
      );  // safe to bang here since `check` covers case

      if (!repoState) {
        throw new TouristError(
          300, `No version for repository ${stop.repository}.`,
          stop.repository,
        );
      }

      // Find the path to the repo
      const repoPath = this.getRepoPath(repoState.repository);

      // Compute changes to the file
      const changes = await getChangesForFile(
        repoState.version,
        new RelativePath(stop.repository, stop.relPath),
        repoPath,
      );
      if (!changes) { continue; }

      // Apply the changes to the stop
      const newLine = computeLineDelta(changes, stop.line);
      if (newLine !== null) {
        stop.line = newLine;
        stop.relPath = changes.name;
      } else {
        stop.line = 0;
        stop.relPath = "";
      }
    }
    for (const repo of tf.repositories) {
      const repoPath = this.getRepoPath(repo.repository);
      const version = await getCurrentVersion(
        repo.versionMode,
        repoPath,
      );
      if (!version) {
        throw new TouristError(
          202,
          `Could not get current version for repository ${repo.repository}.`,
          repo.repository,
        );
      }
      repo.version = version;
    }
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
    return JSON.stringify(tf, null, 2);
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
    try {
      const data: Buffer = await af.readFile(path.path);
      if (line < 1 || line > data.toString().split("\n").length) {
        throw new TouristError(
          101, `Invalid location. No line ${line} in ${path.path}.`,
        );
      }
    } catch (e) {
      throw new TouristError(
        100, `Invalid location. Could not read ${path.path}.`,
      );
    }
  }

  private async resolveStop(
    stop: TourStop,
  ): Promise<AbsoluteTourStop | BrokenTourStop> {
    const relPath = new RelativePath(stop.repository, stop.relPath);
    const absPath = relPath.toAbsolutePath(this.config);
    if (!absPath) {
      throw new TouristError(
        200, `Repository ${stop.repository} is not mapped to a path.`, stop.repository,
      );
    }
    if (stop.line === 0 || absPath.path === "") {
      return { body: stop.body, title: stop.title };
    }
    return {
      absPath: absPath.path,
      body: stop.body,
      line: stop.line,
      title: stop.title,
    };
  }

  private async abstractStop(
    stop: AbsoluteTourStop,
    versionMode: string,
  ): Promise<[TourStop, StableVersion]> {
    const absPath = new AbsolutePath(stop.absPath);
    const relPath = absPath.toRelativePath(this.config);
    if (!relPath) {
      throw new TouristError(
        201, `Path ${absPath.path} is not mapped as a repository.`,
      );
    }

    const tourStop = {
      body: stop.body,
      line: stop.line,
      relPath: relPath.path,
      repository: relPath.repository,
      title: stop.title,
    };

    const repoPath = this.getRepoPath(relPath.repository);
    const version = await getCurrentVersion(versionMode, repoPath);
    if (!version) {
      throw new TouristError(
        202,
        `Could not get current version for repository ${relPath.repository}.`, relPath.repository,
      );
    }

    return [tourStop, version];
  }

  private getRepoPath(repo: string): AbsolutePath {
    const path = this.config[repo];
    if (!path) {
      throw new TouristError(
        200, `Repository ${repo} is not mapped to a path.`, repo,
      );
    }
    return new AbsolutePath(path);
  }
}
