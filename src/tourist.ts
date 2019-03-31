import af from "async-file";
import {
  AbsoluteTourStop,
  RepoIndex,
  Tour,
  TourError, TourFile, TourStop,
  TourStopEdit,
  TourStopPos,
} from "./types";
import {
  computeLineDelta,
  RepoVersion,
  VersionProvider,
} from "./version-provider/version-provider";
import { RelativePath, AbsolutePath } from "./paths";
import { GitProvider } from "./version-provider/git-provider";

export class Tourist {

  /**
   * Static constructor for Tourist using `GitProvider`.
   */
  public static usingGit(): Tourist {
    return new Tourist(new GitProvider());
  }

  private config: RepoIndex;
  private versionProvider: VersionProvider;

  constructor(versionProvider: VersionProvider) {
    this.config = {};
    this.versionProvider = versionProvider;
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
   * Adds a stop to the tour.
   *
   * @param tf
   * @param stop The tour stop to add, specified with an absolute path.
   * @param index An index into the stop list, if `null` the stop will be
   *  appended to the end. If the index is greater than the length of the list,
   *  the stop is added at the end. A negative index counts from the end of the
   *  list.
   */
  public async add(
    tf: TourFile,
    stop: AbsoluteTourStop,
    index: number | null = null,
  ) {
    // Make sure file exists and line is valid (might throw error)
    this.verifyLocation(new AbsolutePath(stop.absPath), stop.line);

    // Get relative stop, current version of the repo (might throw error)
    const [relStop, version] = await this.abstractStop(stop);

    // Find the appropriate repo version in the tour file
    const repoState = tf.repositories
      .find((st) => st.repository === relStop.repository);

    if (repoState && !repoState.version.equals(version)) {
      // Repo already versioned, versions disagree
      throw new Error("Mismatched repository versions.");
    } else if (!repoState) {
      // Repo not versioned, add version
      tf.repositories.push({
        version,
        repository: relStop.repository,
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
   * @throws Throws an error if the `index` is out of bounds.
   */
  public async remove(tf: TourFile, index: number) {
    if (index >= tf.stops.length) { throw new Error("Index out of bounds."); }
    tf.stops.splice(index, 1);
  }

  /**
   * Edit the title or body of a tour stop.
   *
   * @param tf
   * @param index The index of the stop to be edited. A negative index counts
   *  from the end of the list.
   * @param stopEdit A delta to be applied to the stop.
   * @throws Throws an error if the `index` is out of bounds.
   */
  public async edit(
    tf: TourFile,
    index: number,
    stopEdit: TourStopEdit,
  ) {
    if (index >= tf.stops.length) { throw new Error("Index out of bounds."); }
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
   * @throws Throws an error if the `index` is out of bounds.
   */
  public async move(tf: TourFile, index: number, stopPos: TourStopPos) {
    if (index >= tf.stops.length) { throw new Error("Index out of bounds."); }
    const stop = await this.resolveStop(tf.stops[index]);
    stop.absPath = stopPos.absPath;
    stop.line = stopPos.line;
    await this.remove(tf, index);
    await this.add(tf, stop, index);
  }

  /**
   * Generates a tour from a tour file.
   *
   * @param tf
   */
  public async resolve(tf: TourFile): Promise<Tour> {
    if ((await this.check(tf)).length > 0) { throw new Error("check failed."); }

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
   * @param tf
   */
  public async check(tf: TourFile): Promise<TourError[]> {
    // Verifies that:
    // - Every stop has a repo that is mapped to both a directory and a version
    // - Locations in stops are valid

    const errors = [] as TourError[];

    tf.stops.forEach(async (stop, i) => {
      const rel = new RelativePath(stop.repository, stop.relPath);
      const abs = rel.toAbsolutePath(this.config);
      if (abs) {
        try {
          await this.verifyLocation(abs, stop.line);
        } catch (e) {
          errors.push({
            msg: `Stop ${i}: ${e.message}.`,
          });
        }
      } else {
        errors.push({
          msg: `Stop ${i}: Could not get concrete path.`,
        });
      }
      const repoVersion = tf.repositories
        .find((state) => state.repository === stop.repository);
      if (!repoVersion) {
        errors.push({
          msg: `Stop ${i}: Repository ${stop.repository} has no version.`,
        });
      }
    });

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
   */
  public async refresh(tf: TourFile) {
    if ((await this.check(tf)).length > 0) { throw new Error("check failed."); }

    for (const stop of tf.stops) {
      const repoState = tf.repositories.find((st) =>
        st.repository === stop.repository,
      )!;  // safe to bang here since `check` covers this case

      // Find the path to the repo; this could throw an error but it won't
      // because check passed
      const repoPath = this.getRepoPath(repoState.repository);

      // Compute changes to the file
      const changes = await this.versionProvider.getChangesForFile(
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
      repoState.version =
        await this.versionProvider.getCurrentVersion(repoPath);
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
   */
  public async scramble(tf: TourFile, indices: number[]) {
    if (indices.some((i) => i >= tf.stops.length)) {
      throw new Error("One or more indices out of bounds.");
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
   * @param json String that encods a tour file.
   */
  public deserializeTourFile(json: string): TourFile {
    try {
      return JSON.parse(json) as TourFile;
    } catch (_) {
      throw new Error("Invalid JSON string.");
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
    let provider: string;
    if (this.versionProvider instanceof GitProvider) {
      provider = "git";
    } else {
      throw new Error("Serialization not supported by provider.");
    }
    return JSON.stringify({
      provider,
      config: this.config,
    });
  }

  /**
   * Deserializes a tourist instance from a string;
   *
   * @param json The JSON string to convert from.
   */
  // tslint:disable-next-line: member-ordering
  public static deserialize(json: string): Tourist {
    let tourist: Tourist;
    let obj: { provider: string, config: RepoIndex };
    try {
      obj = JSON.parse(json);
    } catch (_) {
      throw new Error("Invalid JSON string.");
    }
    const { provider, config } = obj;
    if (provider === "git") {
      tourist = new Tourist(new GitProvider());
    } else {
      throw new Error("Deserialization not supported by provider.");
    }
    tourist.config = config;
    return tourist;
  }

  private async verifyLocation(path: AbsolutePath, line: number) {
    const exists = await af.exists(path.path);
    if (!exists) {
      throw new Error(`Invalid location.File ${path.path} does not exist.`);
    }
    const data: Buffer = await af.readFile(path.path);
    if (line > data.toString().split("\n").length) {
      throw new Error(
        `Invalid location.No line ${line} in file ${path.path}.`,
      );
    }
  }

  private async resolveStop(
    stop: TourStop,
  ): Promise<AbsoluteTourStop> {
    const relPath = new RelativePath(stop.repository, stop.relPath);
    const absPath = relPath.toAbsolutePath(this.config);
    if (!absPath) {
      throw new Error(
        `No available mapping for repository ${stop.repository}.`,
      );
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
  ): Promise<[TourStop, RepoVersion]> {
    const absPath = new AbsolutePath(stop.absPath);
    const relPath = absPath.toRelativePath(this.config);
    if (!relPath) {
      throw new Error(`No known repository for file ${absPath.path}.`);
    }

    const tourStop = {
      body: stop.body,
      line: stop.line,
      relPath: relPath.path,
      repository: relPath.repository,
      title: stop.title,
    };

    const repoPath = this.getRepoPath(relPath.repository);
    const version = await this.versionProvider.getCurrentVersion(repoPath);

    return [tourStop, version];
  }

  private getRepoPath(repo: string): AbsolutePath {
    const path = this.config[repo];
    if (!path) { throw new Error(`No available path for repository ${repo}.`); }
    return new AbsolutePath(path);
  }
}