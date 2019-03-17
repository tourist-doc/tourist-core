import af from "async-file";
import { Commit, Repository } from "nodegit";
import os from "os";
import * as pathutil from "path";
import { TouristError } from "./tourist-error";
import {
  AbsoluteTourStop,
  Config,
  Tour,
  TourError, TourFile, TourStop,
  TourStopEdit,
  TourStopPos,
} from "./types";

export default {
  add,
  check,
  dump,
  edit,
  init,
  mapConfig,
  move,
  refresh,
  remove,
  resolve,
  scramble,
  unmapConfig,
};

async function readTourFile(path: string): Promise<TourFile> {
  try {
    const json = await af.readFile(path);
    return JSON.parse(json);
  } catch (_) {
    throw new TouristError("ReadFailure");
  }
}

async function writeTourFile(path: string, tf: TourFile) {
  try {
    return await af.writeFile(path, JSON.stringify(tf, null, 2));
  } catch (_) {
    throw new TouristError("WriteFailure");
  }
}

async function readTourConfig(): Promise<Config> {
  try {
    const config = process.env.TOURIST_CONFIG ?
      process.env.TOURIST_CONFIG : pathutil.join(os.homedir(), ".tourist");
    const json = await af.readFile(config);
    return JSON.parse(json);
  } catch (_) {
    throw new TouristError("NoConfig");
  }
}

async function writeTourConfig(obj: Config) {
  const config = process.env.TOURIST_CONFIG ?
    process.env.TOURIST_CONFIG : pathutil.join(os.homedir(), ".tourist");
  await af.writeFile(config, JSON.stringify(obj, null, 2));
}

async function resolveStop(
  stop: TourStop,
  config: Config | null,
): Promise<AbsoluteTourStop> {
  const cfg = config || await readTourConfig();
  return {
    absPath: pathutil.join(cfg[stop.repository], stop.relPath),
    body: stop.body,
    column: stop.column,
    line: stop.line,
    title: stop.title,
  };
}

async function abstractStop(
  stop: AbsoluteTourStop,
  config: Config | null,
): Promise<[TourStop, Commit]> {
  const cfg = config || await readTourConfig();

  // Sort in ascending path length order so we always choose the longest path
  const paths = Object.entries(cfg).sort((a, b) => a[1].length - b[1].length);

  // Find appropriate repo and relative path, create tour stop
  let repository: string | null = null;
  let relPath: string | null = null;
  let repoPath: string | null = null;
  for (const entry of paths) {
    const repo = entry[0];
    const path = entry[1];
    if (stop.absPath.startsWith(path)) {
      repository = repo;
      relPath = pathutil.relative(path, stop.absPath);
      repoPath = path;
      break;
    }
  }
  if (repository === null || relPath === null || repoPath === null) {
    throw new TouristError("AbstractionFailed");
  }
  const tourStop = {
    body: stop.body,
    column: stop.column,
    line: stop.line,
    relPath,
    repository,
    title: stop.title,
  };

  // Find the current commit of the found repository
  const commit: Commit =
    await Repository.open(repoPath).then((r) => r.getHeadCommit());
  if (!commit) {
    throw new TouristError("NotRepo");
  }

  return [tourStop, commit];
}

async function abstractAndUpdateCommit(
  tf: TourFile,
  stop: AbsoluteTourStop,
  config: Config | null,
): Promise<TourStop> {
  const [relStop, gitCommit] = await abstractStop(stop, config);
  const repoState =
    tf.repositories.find((st) => st.repository === relStop.repository);
  if (repoState) {
    if (repoState.commit !== gitCommit.sha()) {
      throw new TouristError("CommitMismatch");
    }
  } else {
    tf.repositories.push({
      commit: gitCommit.sha(),
      repository: relStop.repository,
    });
  }
  return relStop;
}

/* Tourist Operations */

async function init(path: string = "tour.json", title: string = "Tour") {
  if (await af.exists(path)) { throw new TouristError("AlreadyInitialized"); }
  await writeTourFile(path, {
    repositories: [],
    stops: [],
    title,
    version: "1.0.0",
  });
}

async function add(
  path: string = "tour.json",
  stop: AbsoluteTourStop,
  index: number | null = null,
  config: Config | null = null,
) {
  const tf = await readTourFile(path);
  const relStop = await abstractAndUpdateCommit(tf, stop, config);
  if (index !== null) {
    tf.stops.splice(index, 0, relStop);
  } else {
    tf.stops.push(relStop);
  }
  await writeTourFile(path, tf);
}

async function remove(path: string = "tour.json", index: number) {
  const tf = await readTourFile(path);
  tf.stops.splice(index, 1);
  await writeTourFile(path, tf);
}

async function edit(
  path: string = "tour.json",
  index: number,
  stopEdit: TourStopEdit,
) {
  const tf = await readTourFile(path);
  if (stopEdit.title) { tf.stops[index].title = stopEdit.title; }
  if (stopEdit.body) { tf.stops[index].body = stopEdit.body; }
  await writeTourFile(path, tf);
}

async function move(
  path: string = "tour.json",
  index: number,
  stopPos: TourStopPos,
  config: Config | null = null,
) {
  const tf = await readTourFile(path);
  const stop = await resolveStop(tf.stops[index], config);
  stop.absPath = stopPos.absPath;
  stop.column = stopPos.column;
  stop.line = stopPos.line;
  tf.stops[index] = await abstractAndUpdateCommit(tf, stop, config);
  await writeTourFile(path, tf);
}

async function resolve(
  path: string = "tour.json",
  config: Config | null = null,
): Promise<Tour> {
  const tf = await readTourFile(path);
  const stops = await Promise.all(
    tf.stops.map((stop) => resolveStop(stop, config)),
  );
  return {
    stops,
    title: tf.title,
  };
}

async function check(path: string = "tour.json"): Promise<TourError[]> {
  const tf = await readTourFile(path);
  // TODO: Make sure all repos have mappings, are checked out
  // TODO: Verify that all files/lines exist
  return tf.version === "1.0.0" ? [] : [{ msg: "Bad version" }];
}

async function refresh(path: string = "tour.json") {
  const tf = await readTourFile(path);
  // TODO: Make sure all repos have mappings, identify commit differences
  // TODO: For each file, try to update position based on line differences
  await writeTourFile(path, tf);
}

async function scramble(path: string = "tour.json", indices: number[]) {
  const tf = await readTourFile(path);
  tf.stops = indices.map((i) => tf.stops[i]);
  await writeTourFile(path, tf);
}

async function dump(path: string = "tour.json"): Promise<TourFile> {
  return await readTourFile(path);
}

async function mapConfig(repo: string, path: string) {
  let config;
  try { config = await readTourConfig(); } catch (_) { config = {} as Config; }
  if (Object.values(config).includes(path)) {
    throw new TouristError("MultipleMaps");
  }
  config[repo] = path;
  await writeTourConfig(config);
}

async function unmapConfig(repo: string) {
  try {
    const config = await readTourConfig();
    delete config[repo];
    await writeTourConfig(config);
  } catch (_) {
    return;
  }
}