import af from "async-file";
import os from "os";
import * as pathutil from "path";
import { TouristError } from "./tourist-error";
import {
  AbsoluteTourStop,
  Config,
  Tour,
  TourError,
  TourFile,
  TourStop,
  TourStopEdit,
  TourStopPos,
} from "./types";

export default {
  add,
  check,
  dump,
  edit,
  init,
  move,
  refresh,
  remove,
  resolve,
  scramble,
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
): Promise<TourStop> {
  const cfg = config || await readTourConfig();
  let repository: string | null = null;
  let relPath: string | null = null;
  Object.entries(cfg).forEach(([repo, path]) => {
    if (stop.absPath.startsWith(path)) {
      repository = repo;
      relPath = pathutil.relative(path, stop.absPath);
    }
  });
  if (repository === null || relPath === null) {
    throw new TouristError("AbstractionFailed");
  }
  return {
    body: stop.body,
    column: stop.column,
    line: stop.line,
    relPath,
    repository,
    title: stop.title,
  };
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
  const relStop = await abstractStop(stop, config);
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
  tf.stops[index] = await abstractStop(stop, config);
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
  // TODO: Finish
  return tf.version === "1.0.0" ? [] : [{ msg: "Bad version" }];
}

async function refresh(path: string = "tour.json") {
  const tf = await readTourFile(path);
  // TODO: Finish
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