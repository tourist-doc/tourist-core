import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import fs from "fs";
import { suite, test } from "mocha";
import os from "os";
import * as pathutil from "path";
import { AbsoluteTourStop, Tourist } from "..";
import * as err from "../src/tourist-error";
import { MockProvider } from "./mock-provider";
import { GitProvider } from "../src/version-provider/git-provider";

chai.use(chaiAsPromised);
const expect = chai.expect;

const outputDir = pathutil.join(os.tmpdir(), "tourist-test-out");
const repoDir = pathutil.join(outputDir, "repo");
const tourist = new Tourist(new MockProvider(outputDir));
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
    const oldTourist = new Tourist(new GitProvider());
    oldTourist.mapConfig("hello", "world");
    const json = oldTourist.serialize();
    const newTourist = Tourist.deserialize(json);

    expect(oldTourist.dumpConfig()).to.deep.equal(newTourist.dumpConfig());
  });

  test("add a tourstop", async () => {
    const file = pathutil.join(repoDir, "my-file.txt");

    const stop = {
      absPath: file,
      body: "My test body",
      column: 1,
      line: 1,
      title: "My test title",
    };

    const tf = await tourist.init();
    await tourist.add(tf, stop, null);
    const tour = await tourist.resolve(tf);

    expect(tour.stops[0]).to.deep.equal(stop);
    expect(tour.stops.length).to.equal(1);
  });

  test("remove a tourstop", async () => {
    const file = pathutil.join(repoDir, "my-file.txt");

    const stop = {
      absPath: file,
      body: "My test body",
      column: 1,
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

    const stop = {
      absPath: file,
      body: "My test body",
      column: 1,
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

    const stop = {
      absPath: file,
      body: "My test body",
      column: 1,
      line: 1,
      title: "My test title",
    };

    const tf = await tourist.init();
    await tourist.add(tf, stop, null);
    await tourist.move(
      tf,
      0,
      { absPath: file, column: 12, line: 51 },
    );
    const tour = await tourist.resolve(tf);

    expect(tour.stops[0].absPath).to.equal(file);
    expect(tour.stops[0].column).to.equal(12);
    expect(tour.stops[0].line).to.equal(51);
  });

  test("scramble tourstops", async () => {
    const files = [
      pathutil.join(repoDir, "my-file-1.txt"),
      pathutil.join(repoDir, "my-file-2.txt"),
      pathutil.join(repoDir, "my-file-3.txt"),
    ];
    const stops: AbsoluteTourStop[] =
      ["snap", "crackle", "pop"].map((stopTitle, idx) => {
        return {
          absPath: files[idx],
          body: `Body of ${stopTitle}`,
          column: idx,
          line: idx,
          title: stopTitle,
        };
      });

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

  test("add must be done on same commit", async () => {
    const file1 = pathutil.join(repoDir, "my-file-1.txt");
    const file2 = pathutil.join(repoDir, "my-file-2.txt");
    const provider: MockProvider = (tourist as any).versionProvider;

    const stop1 = {
      absPath: file1,
      body: "My test body",
      column: 1,
      line: 1,
      title: "My test title",
    };
    const stop2 = {
      absPath: file2,
      body: "My test body",
      column: 1,
      line: 1,
      title: "My test title",
    };

    const tf = await tourist.init();
    await tourist.add(tf, stop1, null);

    provider.counter++;  // simulate a new commit between adds

    expect(tourist.add(tf, stop2, null))
      .to.eventually.be.rejectedWith(err.CommitMismatchError);
  });
});