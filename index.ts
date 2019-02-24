import tourist from "./src/tourist";
import {
  AbsoluteTourStop,
  Config,
  Tour,
  TourError,
  TourFile,
  TourStop,
  TourStopEdit,
  TourStopPos,
} from "./src/types";

export default {
  add: tourist.add,
  check: tourist.check,
  edit: tourist.edit,
  init: tourist.init,
  move: tourist.move,
  refresh: tourist.refresh,
  remove: tourist.remove,
  resolve: tourist.resolve,
  scramble: tourist.scramble,
};

export type AbsoluteTourStop = AbsoluteTourStop;
export type Config = Config;
export type Tour = Tour;
export type TourError = TourError;
export type TourFile = TourFile;
export type TourStop = TourStop;
export type TourStopEdit = TourStopEdit;
export type TourStopPos = TourStopPos;