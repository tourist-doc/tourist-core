import { StableVersion } from "./version-provider/version-provider";

export interface TourStop {
  body?: string;
  line: number;
  relPath: string;
  repository: string;
  title: string;
}

export interface AbsoluteTourStop {
  absPath: string;
  body?: string;
  line: number;
  title: string;
}

export interface TourStopPos {
  absPath: string;
  line: number;
}

export interface TourStopEdit {
  body?: string;
  title?: string;
}

export interface RepoState {
  repository: string;
  version: StableVersion;
  versionMode: string;
}

export interface TourFile {
  repositories: RepoState[];
  stops: TourStop[];
  title: string;
  version: string;
}

export interface Tour {
  stops: AbsoluteTourStop[];
  title: string;
}

export interface TourError {
  msg: string;
}

export interface RepoIndex {
  [key: string]: string;
}
