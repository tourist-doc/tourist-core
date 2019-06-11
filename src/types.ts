export interface StopLink {
  tour: string;
  stop: string;
}

export interface TourStop {
  title: string;
  body: string;
  line: number;
  relPath: string;
  repository: string;
  children: StopLink[];
  id: string;
}

export interface AbsoluteTourStop {
  title: string;
  body: string;
  absPath: string;
  line: number;
  children: StopLink[];
  id: string;
}

export interface BrokenTourStop {
  title: string;
  body: string;
  children: StopLink[];
  id: string;
}

export function isNotBroken(
  obj: AbsoluteTourStop | BrokenTourStop,
): obj is AbsoluteTourStop {
  return (obj as AbsoluteTourStop).absPath !== undefined;
}

export interface TourStopPos {
  absPath: string;
  line: number;
}

export interface TourStopEdit {
  body?: string;
  title?: string;
}

export interface TourFile {
  title: string;
  body: string;
  id: string;
  repositories: Map<string, string>;
  stops: TourStop[];
}

export interface Tour {
  stops: Array<AbsoluteTourStop | BrokenTourStop>;
  title: string;
}

export interface RepoIndex {
  index: Map<string, string>;
}

export class TouristError extends Error {
  public code: number;
  public message: string;

  public repoName?: string;

  constructor(code: number, message: string, repoName?: string) {
    super(message);
    Object.setPrototypeOf(this, TouristError.prototype);
    this.code = code;
    this.message = message;
    this.repoName = repoName;
  }
}
