import { VersionProvider, RepoVersion, FileChanges } from "../src/version-provider/version-provider";
import { AbsolutePath, RelativePath } from "../src/paths";

export class MockVersion implements RepoVersion {
  public kind: "mock" = "mock";
  public version: number;
  constructor(version: number) {
    this.version = version;
  }

  public equals(other: RepoVersion): boolean {
    if (other.kind !== "mock") { return false; }
    return (other as MockVersion).version === this.version;
  }
}

export class MockProvider implements VersionProvider {
  public testDir: string;
  public counter: number;

  constructor(testDir: string) {
    this.testDir = testDir;
    this.counter = 0;
  }

  public async getCurrentVersion(_: AbsolutePath): Promise<RepoVersion> {
    return new MockVersion(this.counter);
  }

  public async getChangesForFile(
    { }: RepoVersion,
    { }: RelativePath,
    { }: AbsolutePath,
  ): Promise<FileChanges | null> {
    throw new Error("Unimplemented.");
  }
}