import {
  StableVersion,
  FileChanges,
} from "../src/version-provider/version-provider";
import { AbsolutePath, RelativePath } from "../src/paths";

export class MockVersion implements StableVersion {
  public static async fromCurrentVersion(
    { }: AbsolutePath,
  ): Promise<MockVersion> {
    return new MockVersion(0);
  }

  public kind: "mock" = "mock";
  public version: number;
  constructor(version: number) {
    this.version = version;
  }

  public async getChangesForFile(
    { }: RelativePath,
    { }: AbsolutePath,
  ): Promise<FileChanges | null> {
    throw new Error("Unimplemented.");
  }

  public equals(other: StableVersion): boolean {
    if (other.kind !== "mock") { return false; }
    return (other as MockVersion).version === this.version;
  }
}