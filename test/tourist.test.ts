import * as assert from "assert";
import * as del from "del";
import { mkdirSync, rmdirSync } from "fs";
import { after, afterEach, before, suite, test } from "mocha";
import { AbsoluteTourStop } from "..";
import tourist from "../src/tourist";
import { TouristError } from "../src/tourist-error";

const testDataFolder = "./test/data";
const tourPath = testDataFolder + "/test.tour";

suite("tour", () => {
  before("create test data folder", async () => {
    mkdirSync(testDataFolder);
  });

  after("delete test data folder", async () => {
    rmdirSync(testDataFolder);
  });

  afterEach("clear test data", async () => {
    del.sync(tourPath);
  });

  test("init", async () => {
    const title = "My test tour";

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
    const title = "My test tour";
    const config = { repo: "\\path\\to" };
    const stop = {
      absPath: "\\path\\to\\file.txt",
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
    const title = "My test tour";
    const config = { repo: "\\path\\to" };
    const stop = {
      absPath: "\\path\\to\\file.txt",
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
    const title = "My test tour";
    const config = { repo: "\\path\\to" };
    const stop = {
      absPath: "\\path\\to\\file.txt",
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
    const title = "My test tour";
    const config = { repo: "\\path\\to" };
    const stop = {
      absPath: "\\path\\to\\file.txt",
      body: "My test body",
      column: 1,
      line: 1,
      title: "My test title",
    };

    await tourist.init(tourPath, title);
    await tourist.add(tourPath, stop, null, config);
    await tourist.move(tourPath, 0, { absPath: "\\path\\to\\other_file.txt", column: 12, line: 51 }, config);
    const tour = await tourist.resolve(tourPath, config);

    assert.strictEqual(tour.stops[0].absPath, "\\path\\to\\other_file.txt");
    assert.strictEqual(tour.stops[0].column, 12);
    assert.strictEqual(tour.stops[0].line, 51);
  });

  test("scramble tourstops", async () => {
    const title = "My test tour";
    const config = { repo: "\\path\\to" };
    const stops: AbsoluteTourStop[] = ["snap", "crackle", "pop"].map((stopTitle, idx) => {
      return {
        absPath: `\\path\\to\\${stopTitle}.txt`,
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