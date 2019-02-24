import af from "async-file";
import * as pathutil from "path";
import { TouristError } from "./tourist-error";

export default {
  add,
  check,
  edit,
  get,
  init,
  move,
  refresh,
  remove,
  resolve,
  scramble,
};

export interface TourStop {
  body?: string;
  column: number;
  file: string;
  line: number;
  title: string;
}

export interface TourStopPos {
  column: number;
  line: number;
}

export interface TourStopEdit {
  body?: string;
  title?: string;
}

export interface TourFile {
  stamp: number;
  concrete: boolean;
  stops: TourStop[];
  title: string;
  version: string;
}

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

function checkTourFile(_: TourFile): boolean {
  return true; // TODO
}

/* Tourist Operations */

async function init(path: string = "tour.json", title: string = "Tour") {
  if (await af.exists(path)) { throw new TouristError("AlreadyInitialized"); }
  await af.mkdirp(pathutil.dirname(path));
  await writeTourFile(path, {
    concrete: false,
    stamp: 0,
    stops: [],
    title,
    version: "1.0.0",
  });
}

async function add(
  path: string = "tour.json",
  stop: TourStop,
  index: number | null = null,
) {
  const tf: TourFile = await readTourFile(path);
  if (index) {
    tf.stops.splice(index, 0, stop);
  } else {
    tf.stops.push(stop);
  }
  await writeTourFile(path, tf);
}

async function remove(path: string = "tour.json", index: number) {
  const tf: TourFile = await readTourFile(path);
  tf.stops.splice(index, 1);
  await writeTourFile(path, tf);
}

async function edit(
  path: string = "tour.json",
  index: number,
  stopEdit: TourStopEdit,
) {
  const tf: TourFile = await readTourFile(path);
  if (stopEdit.body) { tf.stops[index].body = stopEdit.body; }
  if (stopEdit.title) { tf.stops[index].title = stopEdit.title; }
  await writeTourFile(path, tf);
}

async function move(
  path: string = "tour.json",
  index: number,
  stopPos: TourStopPos,
) {
  const tf: TourFile = await readTourFile(path);
  tf.stops[index].line = stopPos.line;
  tf.stops[index].column = stopPos.column;
  await writeTourFile(path, tf);
}

async function resolve(path: string = "tour.json"): Promise<TourFile> {
  const tf: TourFile = await readTourFile(path);
  tf.concrete = true; // TODO
  return tf;
}

async function check(path: string = "tour.json"): Promise<boolean> {
  const tf: TourFile = await readTourFile(path);
  return checkTourFile(tf);
}

async function refresh(path: string = "tour.json") {
  const tf: TourFile = await readTourFile(path);

  const valid = checkTourFile(tf);
  if (!valid) { throw new TouristError("CheckFailed"); }
  tf.stamp++; // TODO

  await writeTourFile(path, tf);
}

async function get(
  path: string = "tour.json",
  index: number,
): Promise<TourStop> {
  const tf: TourFile = await readTourFile(path);
  return tf.stops[index];
}

async function scramble(path: string = "tour.json", indices: number[]) {
  const tf: TourFile = await readTourFile(path);
  tf.stops = indices.map((idx) => tf.stops[idx]);
  await writeTourFile(path, tf);
}