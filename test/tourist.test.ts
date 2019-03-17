import * as assert from "assert";
import * as del from "del";
import { existsSync, mkdirSync, writeFileSync} from "fs";
import { after, afterEach, before, suite, test } from "mocha";
import { Repository, Signature } from "nodegit";
import { normalize } from "path";
import { cwd } from "process";
import { AbsoluteTourStop } from "..";
import tourist from "../src/tourist";
import { TouristError } from "../src/tourist-error";

const testDataFolder = normalize(cwd() + "/test/data/");
const tourPath = normalize(testDataFolder + "test.tour");
const repoPath = normalize(testDataFolder + "repo/");
const repoFiles = ["file1.txt", "file2.py", "file3.ts"].map(normalize);

const signature = Signature.now("Jason Fields", "jasonfields4@gmail.com");
const config = { repo: repoPath };
const title = "My test tour";

suite("tour", () => {
  before("create test data folder, initialize repo", async () => {
    if (!existsSync(testDataFolder)) {
      mkdirSync(testDataFolder);
      const repo = await Repository.init(repoPath, 0);
      repoFiles.forEach((path) => {
        writeFileSync(repoPath + path, "Test data");
      });
      await repo.createCommitOnHead(repoFiles, signature, signature, "Initial commit");
    }
  });

  after("delete test data folder", async () => {
    del.sync(testDataFolder + "/**");
  });

  afterEach("clear test data", async () => {
    del.sync(tourPath);
  });

  test("init", async () => {
    await tourist.init(tourPath, title);
    const tour = await tourist.resolve(tourPath);

    assert.deepStrictEqual(tour.stops, [] as AbsoluteTourStop[]);
    assert.strictEqual(tour.title, title);
  });

  test("init twice fails", async () => {
    await tourist.init(tourPath, "abc");
    assert.rejects(
      tourist.init(tourPath, "xyz"),
      TouristError,
    );
  });

  test("resolve nonexistent tour fails", async () => {
    assert.rejects(
      tourist.resolve("doesnotexist.tour"),
      TouristError,
    );
  });

  test("add a tourstop", async () => {
    const stop = {
      absPath: repoPath + repoFiles[0],
      body: "My test body",
      column: 1,
      line: 1,
      title: "My test title",
    };

    await tourist.init(tourPath, title);
    await tourist.add(tourPath, stop, null, config);
    const tour = await tourist.resolve(tourPath, config);

    assert.strictEqual(tour.stops.length, 1);
    assert.deepStrictEqual(tour.stops[0], stop);
  });

  test("remove a tourstop", async () => {
    const stop = {
      absPath: repoPath + repoFiles[0],
      body: "My test body",
      column: 1,
      line: 1,
      title: "My test title",
    };

    await tourist.init(tourPath, title);
    await tourist.add(tourPath, stop, null, config);
    await tourist.remove(tourPath, 0);
    const tour = await tourist.resolve(tourPath, config);

    assert.strictEqual(tour.stops.length, 0);
  });

  test("edit a tourstop", async () => {
    const stop = {
      absPath: repoPath + repoFiles[0],
      body: "My test body",
      column: 1,
      line: 1,
      title: "My test title",
    };

    await tourist.init(tourPath, title);
    await tourist.add(tourPath, stop, null, config);
    await tourist.edit(tourPath, 0, { body: "Edited body", title: "Edited title" });
    const tour = await tourist.resolve(tourPath, config);

    assert.deepStrictEqual(tour.stops[0].body, "Edited body");
    assert.deepStrictEqual(tour.stops[0].title, "Edited title");
  });

  test("move a tourstop", async () => {
    const stop = {
      absPath: repoPath + repoFiles[0],
      body: "My test body",
      column: 1,
      line: 1,
      title: "My test title",
    };

    await tourist.init(tourPath, title);
    await tourist.add(tourPath, stop, null, config);
    await tourist.move(tourPath, 0, { absPath: repoPath + repoFiles[1], column: 12, line: 51 }, config);
    const tour = await tourist.resolve(tourPath, config);

    assert.strictEqual(tour.stops[0].absPath, repoPath + repoFiles[1]);
    assert.strictEqual(tour.stops[0].column, 12);
    assert.strictEqual(tour.stops[0].line, 51);
  });

  test("scramble tourstops", async () => {
    const stops: AbsoluteTourStop[] = ["snap", "crackle", "pop"].map((stopTitle, idx) => {
      return {
        absPath: repoPath + repoFiles[idx],
        body: `Body of ${stopTitle}`,
        column: idx,
        line: idx,
        title: stopTitle,
      };
    });

    await tourist.init(tourPath, title);
    for (const stop of stops) {
      await tourist.add(tourPath, stop, null, config);
    }
    await tourist.scramble(tourPath, [1, 2, 0]);
    const tour = await tourist.resolve(tourPath, config);

    assert.deepStrictEqual(tour.stops[0], stops[1]);
    assert.deepStrictEqual(tour.stops[1], stops[2]);
    assert.deepStrictEqual(tour.stops[2], stops[0]);
  });
});