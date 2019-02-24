export interface Config {
  [key: string]: string;
}

export interface TourStop {
  body?: string;
  column: number;
  line: number;
  relPath: string;
  repository: string;
  title: string;
}

export interface AbsoluteTourStop {
  absPath: string;
  body?: string;
  column: number;
  line: number;
  title: string;
}

export interface TourStopPos {
  absPath: string;
  column: number;
  line: number;
}

export interface TourStopEdit {
  body?: string;
  title?: string;
}

export interface RepoState {
  commit: string;
  repository: string;
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