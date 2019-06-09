export class FileChanges {
  public additions: number[];
  public deletions: number[];
  public moves: Map<number, number>;
  public name: string;

  constructor(
    additions: number[],
    deletions: number[],
    moves: Map<number, number>,
    name: string,
  ) {
    this.additions = additions;
    this.deletions = deletions;
    this.moves = moves;
    this.name = name;
  }

  public computeDelta(line: number): number | null {
    if (this.deletions.includes(line)) {
      return null;
    }
    if (this.moves.has(line)) {
      return this.moves.get(line)!;
    }

    line -= this.deletions.length;
    for (const add of this.additions.sort()) {
      if (add < line) {
        line++;
      } else {
        break;
      }
    }
    return line;
  }

  public undoDelta(line: number): number | null {
    if (this.additions.includes(line)) {
      return null;
    }

    const moves = new Map<number, number>();
    this.moves.forEach((before, after) => {
      moves.set(after, before);
    });
    if (moves.has(line)) {
      return moves.get(line)!;
    }

    line -= this.additions.filter((add) => add < line).length;
    for (const del of this.deletions.sort()) {
      if (del < line) {
        line++;
      } else {
        break;
      }
    }

    return line;
  }
}
