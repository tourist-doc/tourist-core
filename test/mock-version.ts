import {
  StableVersion,
  FileChanges,
} from "../src/version-provider/stable-version";
import { AbsolutePath, RelativePath } from "../src/paths";

export class MockVersion implements StableVersion {
  public kind: "mock" = "mock";
  public version: number = 0;

  public serialize(): any {
    return {};
  }

  // tslint:disable-next-line: no-empty
  public setFromSerialized({ }: any) { }

  public async setToCurrentVersion({ }: AbsolutePath) {
    this.version = 0;
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