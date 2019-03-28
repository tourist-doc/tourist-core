import af from "async-file";
import * as err from "./tourist-error";
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
    const [relStop, version] = await this.abstractStop(stop);
    const repoState =
      tf.repositories.find((st) => st.repository === relStop.repository);

    if (repoState && !repoState.commit.equals(version)) {
      throw new err.CommitMismatchError();
    } else if (repoState) {
      repoState.commit = version;
    } else {
      tf.repositories.push({
        commit: version,
        repository: relStop.repository,
      });
    }

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
   * @param index The index of the stop to be removed. If the index is greater
   *  than the length of the list, nothing happens. A negative index counts from
   *  the end of the list.
   */
  public async remove(tf: TourFile, index: number) {
    tf.stops.splice(index, 1);
  }

  /**
   * Edit the title or body of a tour stop.
   *
   * @param tf
   * @param index The index of the stop to be removed. A negative index counts
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
   * Move the path, line, or column of a tour stop.
   *
   * @param tf
   * @param index The index of the stop to be removed. A negative index counts
   *  from the end of the list.
   * @param stopPos A delta to be applied to the stop.
   * @throws Throws an error if the `index` is out of bounds.
   */
  public async move(tf: TourFile, index: number, stopPos: TourStopPos) {
    const stop = await this.resolveStop(tf.stops[index]);
    stop.absPath = stopPos.absPath;
    stop.column = stopPos.column;
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
    const stops = await Promise.all(
      tf.stops.map((stop) => this.resolveStop(stop)),
    );
    return {
      stops,
      title: tf.title,
    };
  }

  /**
   * Checks a tour file for errors. TODO: Specify.
   *
   * @param tf
   */
  public async check(tf: TourFile): Promise<TourError[]> {
    // TODO: Make sure all repos have mappings, are checked out
    // TODO: Verify that all files/lines exist
    return tf.version === "1.0.0" ? [] : [{ msg: "Bad version" }];
  }

  /**
   * Updates all stops in a tour file based on changes to the repository state.
   *
   * If any files have been deleted or if the target lines themselves have been
   * deleted or completely changed, the stop will be left in an error state.
   * Specifically, the line and column are set to 0 and the file name is set to
   * `""`.
   *
   * @param tf
   */
  public async refresh(tf: TourFile) {
    for (const stop of tf.stops) {
      const repoState =
        tf.repositories.find((st) => st.repository === stop.repository);
      if (!repoState) { throw new err.NotRepoError(); }
      const repoPath = this.getRepoPath(repoState.repository);

      const changes = await this.versionProvider.getChangesForFile(
        repoState.commit,
        new RelativePath(stop.repository, stop.relPath),
        repoPath,
      );
      if (!changes) { return; }

      const newLine = computeLineDelta(changes, stop.line);
      if (newLine !== null) {
        stop.line = newLine;
        stop.relPath = changes.name;
      } else {
        stop.line = 0;
        stop.column = 0;
        stop.relPath = "";
      }
      repoState.commit = await this.versionProvider.getCurrentVersion(repoPath);
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
    tf.stops = indices
      .map((i) => i < tf.stops.length ? tf.stops[i] : null)
      .filter((x) => x !== null)
      .map((x) => x!);
  }

  /**
   * Reads a tour file object from a file.
   *
   * @param path The path to save the file to.
   * @throws Throws an error if there is an IO issue (e.g. `path` is not a valid
   *  file).
   */
  public async readTourFile(path: string): Promise<TourFile> {
    try {
      const json = await af.readFile(path);
      return JSON.parse(json);
    } catch (_) {
      throw new err.ReadFailureError();
    }
  }

  /**
   * Writes a tour file object to a file.
   *
   * @param tf
   * @param path The path to write the file to.
   * @throws Throws an error if there is an IO issue.
   */
  public async writeTourFile(path: string, tf: TourFile) {
    try {
      return await af.writeFile(path, JSON.stringify(tf, null, 2));
    } catch (_) {
      throw new err.WriteFailureError();
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
      throw new Error("Serialization not supported for your provider.");
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
    const { provider, config } = JSON.parse(json);
    if (provider === "git") {
      tourist = new Tourist(new GitProvider());
    } else {
      throw new Error("Deserialization not supported for your provider.");
    }
    tourist.config = config;
    return tourist;
  }

  private async resolveStop(
    stop: TourStop,
  ): Promise<AbsoluteTourStop> {
    const relPath = new RelativePath(stop.repository, stop.relPath);
    const absPath = relPath.toAbsolutePath(this.config);
    if (!absPath) { throw new err.NotRepoError(); }
    return {
      absPath: absPath.path,
      body: stop.body,
      column: stop.column,
      line: stop.line,
      title: stop.title,
    };
  }

  private async abstractStop(
    stop: AbsoluteTourStop,
  ): Promise<[TourStop, RepoVersion]> {
    const absPath = new AbsolutePath(stop.absPath);
    const relPath = absPath.toRelativePath(this.config);
    if (!relPath) { throw new err.AbstractionFailedError(); }

    const tourStop = {
      body: stop.body,
      column: stop.column,
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
    if (!path) { throw new err.NotRepoError(); }
    return new AbsolutePath(path);
  }
}