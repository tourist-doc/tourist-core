import tourist, {
  TourFile,
  TourStop,
  TourStopEdit,
  TourStopPos,
} from "./src/tourist";

export default {
  add: tourist.add,
  check: tourist.check,
  edit: tourist.edit,
  get: tourist.get,
  init: tourist.init,
  move: tourist.move,
  refresh: tourist.refresh,
  remove: tourist.remove,
  resolve: tourist.resolve,
  scramble: tourist.scramble,
};

export type TourFile = TourFile;
export type TourStop = TourStop;
export type TourStopEdit = TourStopEdit;
export type TourStopPos = TourStopPos;