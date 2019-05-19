import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import fs from "fs";
import { suite, test } from "mocha";
import os from "os";
import * as pathutil from "path";
import { AbsoluteTourStop, Tourist } from "..";
import { isNotBroken } from "../src/types";
import { VersionProvider } from "../src/versionProvider";
import { AbsolutePath, RelativePath } from "../src/paths";
import { FileChanges } from "../src/fileChanges";

class MockProvider implements VersionProvider {
  // tslint:disable variable-name
  public async getCurrentVersion(_path: AbsolutePath): Promise<string | null> {
    return "VERSION";
  }
  public async getChangesForFile(
    // tslint:disable variable-name
    _version: string,
    // tslint:disable variable-name
    _path: RelativePath,
    // tslint:disable variable-name
    _repoPath: AbsolutePath,
  ): Promise<FileChanges | null> {
    return new FileChanges([], [], new Map(), "");
  }
}

chai.use(chaiAsPromised);
const expect = chai.expect;

const outputDir = pathutil.join(os.tmpdir(), "tourist-test-out");
const repoDir = pathutil.join(outputDir, "repo");
const tourist = new Tourist();
tourist.vp = new MockProvider();
tourist.mapConfig("repo", repoDir);

function deleteFolderRecursive(path: string) {
  if (fs.existsSync(path)) {
    fs.readdirSync(path).forEach((file) => {
      const curPath = pathutil.join(path, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        deleteFolderRecursive(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(path);
  }
}

suite("tourist", () => {
  before("make sure we're in a clean state", () => {
    deleteFolderRecursive(outputDir);
  });

  after("make sure we clean up", () => {
    deleteFolderRecursive(outputDir);
  });

  beforeEach("create necessary directories", () => {
    fs.mkdirSync(outputDir);
    fs.mkdirSync(repoDir);
  });

  afterEach("remove directories", () => {
    deleteFolderRecursive(outputDir);
  });

  test("init", async () => {
    const tour = await tourist.resolve(await tourist.init("A Tour"));

    expect(tour.stops).to.deep.equal([]);
    expect(tour.title).to.equal("A Tour");
  });

  test("serde", async () => {
    const oldTourist = new Tourist();
    oldTourist.mapConfig("hello", "world");
    const json = oldTourist.serialize();
    const newTourist = Tourist.deserialize(json);

    expect(oldTourist.dumpConfig()).to.deep.equal(newTourist.dumpConfig());
  });

  test("rename", async () => {
    const tf = await tourist.init("A Tour");
    expect(tf.title).to.equal("A Tour");

    tourist.rename(tf, "New name!");
    expect(tf.title).to.equal("New name!");
  });

  test("add a tourstop", async () => {
    const file = pathutil.join(repoDir, "my-file.txt");
    fs.writeFileSync(file, "Hello, world!");

    const stop = {
      absPath: file,
      body: "My test body",
      line: 1,
      title: "My test title",
    };

    const tf = await tourist.init();
    await tourist.add(tf, stop, null);
    const tour = await tourist.resolve(tf);

    expect(tour.stops[0]).to.deep.equal(stop);
    expect(tour.stops.length).to.equal(1);
  });

  test("add two tourstops", async () => {
    const file = pathutil.join(repoDir, "my-file.txt");
    fs.writeFileSync(file, "Hello, world!");

    const stop = {
      absPath: file,
      body: "My test body",
      line: 1,
      title: "My test title",
    };

    const tf = await tourist.init();
    await tourist.add(tf, stop, null);
    await tourist.resolve(tf);
    await tourist.add(tf, stop, null);
    const tour = await tourist.resolve(tf);

    expect(tour.stops[1]).to.deep.equal(stop);
    expect(tour.stops.length).to.equal(2);
  });

  test("remove a tourstop", async () => {
    const file = pathutil.join(repoDir, "my-file.txt");
    fs.writeFileSync(file, "Hello, world!");

    const stop = {
      absPath: file,
      body: "My test body",
      line: 1,
      title: "My test title",
    };

    const tf = await tourist.init();
    await tourist.add(tf, stop, null);
    await tourist.remove(tf, 0);
    const tour = await tourist.resolve(tf);

    expect(tour.stops.length).to.equal(0);
  });

  test("edit a tourstop", async () => {
    const file = pathutil.join(repoDir, "my-file.txt");
    fs.writeFileSync(file, "Hello, world!");

    const stop = {
      absPath: file,
      body: "My test body",
      line: 1,
      title: "My test title",
    };

    const tf = await tourist.init();
    await tourist.add(tf, stop, null);
    await tourist.edit(tf, 0, { body: "Edited body", title: "Edited title" });
    const tour = await tourist.resolve(tf);

    expect(tour.stops[0].body).to.equal("Edited body");
    expect(tour.stops[0].title).to.equal("Edited title");
  });

  test("move a tourstop", async () => {
    const file = pathutil.join(repoDir, "my-file.txt");
    fs.writeFileSync(file, "Hello, world!\nHello, world!\nHello, world!");

    const stop = {
      absPath: file,
      body: "My test body",
      line: 1,
      title: "My test title",
    };

    const tf = await tourist.init();
    await tourist.add(tf, stop, null);
    await tourist.move(tf, 0, { absPath: file, line: 3 });
    const tour = await tourist.resolve(tf);

    expect(isNotBroken(tour.stops[0]));
    expect((tour.stops[0] as AbsoluteTourStop).absPath).to.equal(file);
    expect((tour.stops[0] as AbsoluteTourStop).line).to.equal(3);
  });

  test("move to bad location is OK", async () => {
    const file = pathutil.join(repoDir, "my-file.txt");
    fs.writeFileSync(file, "Hello, world!\nHello, world!\nHello, world!");

    const stop = {
      absPath: file,
      body: "My test body",
      line: 1,
      title: "My test title",
    };

    const tf = await tourist.init();
    await tourist.add(tf, stop, null);
    try {
      await tourist.move(tf, 0, { absPath: file, line: 42 });
      expect(false);
    } catch (e) {
      expect(e.message).to.contain("Invalid");
    }
    const tour = await tourist.resolve(tf);

    expect(isNotBroken(tour.stops[0]));
    expect((tour.stops[0] as AbsoluteTourStop).absPath).to.equal(file);
    expect((tour.stops[0] as AbsoluteTourStop).line).to.equal(1);
  });

  test("scramble tourstops", async () => {
    const files = [
      pathutil.join(repoDir, "my-file-1.txt"),
      pathutil.join(repoDir, "my-file-2.txt"),
      pathutil.join(repoDir, "my-file-3.txt"),
    ];
    for (const file of files) {
      fs.writeFileSync(file, "Hello, world!\nHello, world!\nHello, world!");
    }
    const stops: AbsoluteTourStop[] = ["snap", "crackle", "pop"].map(
      (stopTitle, idx) => {
        return {
          absPath: files[idx],
          body: `Body of ${stopTitle}`,
          line: idx + 1,
          title: stopTitle,
        };
      },
    );

    const tf = await tourist.init();
    for (const stop of stops) {
      await tourist.add(tf, stop, null);
    }
    await tourist.scramble(tf, [1, 2, 0]);
    const tour = await tourist.resolve(tf);

    expect(tour.stops[0]).to.deep.equal(stops[1]);
    expect(tour.stops[1]).to.deep.equal(stops[2]);
    expect(tour.stops[2]).to.deep.equal(stops[0]);
  });
});
