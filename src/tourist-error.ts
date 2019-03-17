export type ErrorCase =
    "AlreadyInitialized"
  | "ReadFailure"
  | "WriteFailure"
  | "CheckFailed"
  | "AbstractionFailed"
  | "NoConfig"
  | "CommitMismatch"
  | "MultipleMaps";

export class TouristError extends Error {
  constructor(err: ErrorCase) {
    super(err);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}