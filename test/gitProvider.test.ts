import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import fs from "fs-extra";
import { suite, test } from "mocha";
import os from "os";
import * as pathutil from "path";
import { Tourist } from "..";
import { AbsolutePath, RelativePath } from "../src/paths";
import { GitProvider } from "../src/versionProvider";
import {
  AbsoluteTourStop,
  isNotBroken,
  validTourFile,
  BrokenTourStop,
} from "../src/types";

chai.use(chaiAsPromised);
const expect = chai.expect;

const outputDir = pathutil.join(os.tmpdir(), "tourist-test-out");
const testDataDir = pathutil.join(__dirname, "data");
const repoDir = pathutil.join(outputDir, "repo");
const gp = new GitProvider();

async function copyFile(src: string, dest: string) {
  const s: string = await fs.readFile(src, "UTF-8");
  await fs.writeFile(dest, s, "UTF-8");
}

suite("git-provider", () => {
  let repository: AbsolutePath;
  let fileName: string;
  let file: string;

  async function commitToRepo(message: string): Promise<string> {
    await gp.git(repository, "add", ["-A"]);
    await gp.git(repository, "commit", [`-m "${message}"`]);
    return await gp
      .git(repository, "rev-parse", ["HEAD"])
      .then((x) => x.trim());
  }

  before("make sure we're in a clean state", async () => {
    await fs.remove(outputDir);
  });

  after("make sure we clean up", async () => {
    await fs.remove(outputDir);
  });

  beforeEach("create necessary directories", async () => {
    await fs.mkdir(outputDir);
    await fs.mkdir(repoDir);

    repository = new AbsolutePath(repoDir);
    await gp.git(repository, "init", []);
    const fileDir = pathutil.join("some", "dir");
    await fs.mkdirs(pathutil.join(repoDir, fileDir));

    fileName = pathutil.join(fileDir, "my-file.txt");
    file = pathutil.join(repoDir, fileName);
  });

  afterEach("remove directories", async () => {
    await fs.remove(outputDir);
  });

  test("type equal in same commit", async () => {
    await fs.writeFile(file, "Hello, world!");
    await commitToRepo("Initial commit");
    const version1 = await gp.getCurrentVersion(new AbsolutePath(repoDir));
    await fs.writeFile(file, "Hello, world!\nHello world again!");
    const version2 = await gp.getCurrentVersion(new AbsolutePath(repoDir));
    expect(version1! === version2!);
  });

  test("type not equal in different commits", async () => {
    await fs.writeFile(file, "Hello, world!");
    await commitToRepo("Initial commit");
    const version1 = await gp.getCurrentVersion(new AbsolutePath(repoDir));
    await fs.writeFile(file, "Hello, world!\nHello world again!");
    await commitToRepo("Second commit");
    const version2 = await gp.getCurrentVersion(new AbsolutePath(repoDir));
    // tslint:disable-next-line: no-unused-expression
    expect(version1! === version2!).to.be.false;
  });

  test("files change correctly: small file", async () => {
    await fs.writeFile(file, "Hello, world!");
    const commit = await commitToRepo("Initial commit");
    await fs.writeFile(file, "Line before\nHello, world!\nLine after");
    await commitToRepo("Second commit");

    const changes = await gp.getChangesForFile(
      commit,
      new RelativePath("repo", fileName),
      new AbsolutePath(repoDir),
    );

    expect(changes).to.not.be.a("null");
    expect(changes!.additions).to.deep.equal([1, 3]);
    expect(changes!.moves.get(1)).to.equal(2);
  });

  test("files change correctly: bigger file", async () => {
    await copyFile(pathutil.join(testDataDir, "many-lines.txt"), file);
    const commit = await commitToRepo("Initial commit");
    let contents = (await fs.readFile(file, "UTF-8")).split("\n");
    contents = ["A new line!", ...contents];
    await fs.writeFile(file, contents.join("\n"));
    await commitToRepo("Second commit");

    const changes = await gp.getChangesForFile(
      commit,
      new RelativePath("repo", fileName),
      new AbsolutePath(repoDir),
    );

    // tslint:disable-next-line: no-unused-expression
    expect(changes).to.not.be.null;
    expect(changes!.additions).to.deep.equal([1]);
    expect(changes!.moves.get(1)).to.equal(2);
    expect(changes!.moves.get(2)).to.equal(3);
  });

  test("files change correctly: target-in-middle", async () => {
    await copyFile(pathutil.join(testDataDir, "target-in-middle.txt"), file);
    const commit = await commitToRepo("Initial commit");
    await copyFile(
      pathutil.join(testDataDir, "target-in-middle-after.txt"),
      file,
    );
    await commitToRepo("Second commit");

    const changes = await gp.getChangesForFile(
      commit,
      new RelativePath("repo", fileName),
      new AbsolutePath(repoDir),
    );

    expect(changes).to.not.be.a("null");
    expect(changes!.additions.filter((x) => x < 11).length).to.equal(4);
    expect(changes!.deletions.filter((x) => x < 11).length).to.equal(3);
  });

  test("renames work", async () => {
    const otherFileName = "other-file.txt";
    const otherFile = pathutil.join(repoDir, otherFileName);
    await fs.writeFile(file, "Hello, world!");
    const commit = await commitToRepo("Initial commit");
    await fs.rename(file, otherFile);
    await commitToRepo("Second commit");

    const changes = await gp.getChangesForFile(
      commit,
      new RelativePath("repo", fileName),
      new AbsolutePath(repoDir),
    );

    expect(changes).to.not.be.a("null");
    expect(changes!.name).to.equal("other-file.txt");
  });

  test("serde git tour file", async () => {
    await fs.writeFile(file, "Hello, world!");
    await commitToRepo("Initial commit");

    const tourist = new Tourist();
    tourist.mapConfig("repo", repoDir);

    const stop = {
      absPath: file,
      body: "My test body",
      line: 1,
      title: "My test title",
      childStops: [
        {
          tourId: "something",
          stopNum: 2,
        },
      ],
    };

    const tf = await tourist.init();
    await tourist.add(tf, stop, null);

    expect(validTourFile(tf));

    const newTf = tourist.deserializeTourFile(tourist.serializeTourFile(tf));
    expect(validTourFile(newTf));
    expect(newTf).to.deep.equal(tf);
  });

  test("add must be done on same commit", async () => {
    await fs.writeFile(file, "Hello, world!");
    await commitToRepo("Initial commit");
    const file1 = pathutil.join(repoDir, "my-file-1.txt");
    await fs.writeFile(file1, "Hello, world!");
    const file2 = pathutil.join(repoDir, "my-file-2.txt");
    await fs.writeFile(file2, "Hello, world!");

    const stop1 = {
      absPath: file1,
      body: "My test body",
      line: 1,
      title: "My test title",
      childStops: [],
    };
    const stop2 = {
      absPath: file2,
      body: "My test body",
      line: 1,
      title: "My test title",
      childStops: [],
    };

    const tourist = new Tourist();
    tourist.mapConfig("repo", repoDir);

    const tf = await tourist.init();
    await tourist.add(tf, stop1, null);

    await commitToRepo("Second commit");

    try {
      await tourist.add(tf, stop2, null);
      expect(false);
    } catch (e) {
      expect(e.message).to.contain("Mismatched");
    }
  });

  test("deltas work correctly", async () => {
    await fs.writeFile(file, "Hello, world!");
    await commitToRepo("Initial commit");

    const tourist = new Tourist();
    tourist.mapConfig("repo", repoDir);

    const stop = {
      absPath: file,
      body: "My test body",
      line: 1,
      title: "My test title",
      childStops: [],
    };

    const tf = await tourist.init();
    await tourist.add(tf, stop, null);

    {
      const tour = await tourist.resolve(tf);
      expect((tour.stops[0] as AbsoluteTourStop).line).to.equal(1);
    }

    await fs.writeFile(file, "Some new stuff\nother stuff\nHello, world!");

    {
      const tour = await tourist.resolve(tf);
      expect((tour.stops[0] as AbsoluteTourStop).line).to.equal(3);
    }

    await fs.writeFile(file, "Hello, world!\nSome other stuff");

    {
      const tour = await tourist.resolve(tf);
      expect((tour.stops[0] as AbsoluteTourStop).line).to.equal(1);
    }
  });

  test("more delta tests", async () => {
    fs.writeFileSync(file, "Hello, world!");
    await commitToRepo("Initial commit");

    const tourist = new Tourist();
    tourist.mapConfig("repo", repoDir);

    const stop = {
      absPath: file,
      body: "My test body",
      line: 1,
      title: "My test title",
      childStops: [],
    };

    const tf = await tourist.init();
    await tourist.add(tf, stop, null);

    fs.writeFileSync(file, "");

    {
      const tour = await tourist.resolve(tf);
      // tslint:disable-next-line: no-unused-expression
      expect((tour.stops[0] as AbsoluteTourStop).line).to.be.undefined;
    }

    fs.writeFileSync(file, "\n\n\n\n\n\n\nHello, world!");

    {
      const tour = await tourist.resolve(tf);
      expect((tour.stops[0] as AbsoluteTourStop).line).to.equal(8);
    }
  });

  test("adding to a dirty file works", async () => {
    fs.writeFileSync(file, "Hello, world!\nGoodbye world!");
    await commitToRepo("Initial commit");

    const tourist = new Tourist();
    tourist.mapConfig("repo", repoDir);

    fs.writeFileSync(file, "\n\n\n\n\n\n\nHello, world!");

    const stop = {
      absPath: file,
      body: "My test body",
      line: 8,
      title: "My test title",
      childStops: [],
    };

    const tf = await tourist.init();
    await tourist.add(tf, stop, null);

    {
      const tour = await tourist.resolve(tf);
      expect((tour.stops[0] as AbsoluteTourStop).line).to.equal(8);
    }

    fs.writeFileSync(file, "Hello, world!\nGoodbye world!");

    {
      const tour = await tourist.resolve(tf);
      expect((tour.stops[0] as AbsoluteTourStop).line).to.equal(1);
    }
  });

  test("deleting a stop's line results in BrokenTourStop", async () => {
    fs.writeFileSync(file, "Above deleted\nDELETE ME\nBelow deleted");
    await commitToRepo("Initial commit");

    const tourist = new Tourist();
    tourist.mapConfig("repo", repoDir);

    const stop = {
      absPath: file,
      body: "This is about to be deleted",
      line: 2,
      title: "Delete me!",
      childStops: [],
    };

    const tf = await tourist.init();
    await tourist.add(tf, stop, null);

    fs.writeFileSync(file, "Above deleted\nBelow deleted");

    {
      const tour = await tourist.resolve(tf);
      expect(isNotBroken(tour.stops[0])).to.equal(
        false,
        "stop should be broken before commit",
      );
      expect((tour.stops[0] as BrokenTourStop).errors).to.deep.equal([
        "LineNotFound",
      ]);
    }

    await commitToRepo("Deleted tourstop");

    {
      const tour = await tourist.resolve(tf);
      expect(isNotBroken(tour.stops[0])).to.equal(
        false,
        "stop should be broken after commit",
      );
    }
  });

  test("deleting a stop's file has correct error message", async () => {
    fs.writeFileSync(file, "Some content");
    await commitToRepo("Initial commit");

    const tourist = new Tourist();
    tourist.mapConfig("repo", repoDir);

    const stop = {
      absPath: file,
      body: "This is about to be deleted",
      line: 1,
      title: "Delete me!",
      childStops: [],
    };

    const tf = await tourist.init();
    await tourist.add(tf, stop, null);

    fs.removeSync(file);

    {
      const tour = await tourist.resolve(tf);
      expect(isNotBroken(tour.stops[0])).to.equal(
        false,
        "stop should be broken before commit",
      );
      expect((tour.stops[0] as BrokenTourStop).errors).to.deep.equal([
        "FileNotFound",
      ]);
    }

    await commitToRepo("Deleted tourstop");

    {
      const tour = await tourist.resolve(tf);
      expect(isNotBroken(tour.stops[0])).to.equal(
        false,
        "stop should be broken after commit",
      );
    }
  });

  test("linking a tour", async () => {
    fs.writeFileSync(file, "Hello, world!");
    await commitToRepo("Initial commit");

    const tourist = new Tourist();
    tourist.mapConfig("repo", repoDir);

    const stop = {
      absPath: file,
      body: "body",
      line: 1,
      title: "title",
      childStops: [],
    };

    const tf1 = await tourist.init("tour1");
    const stopId = await tourist.add(tf1, stop, null);

    const tf2 = await tourist.init("tour2");

    await tourist.link(tf1, stopId, {
      tourId: "tour2",
      stopNum: 0,
    });

    const tour = await tourist.resolve(tf1);
    expect(tour.stops[0].childStops.length).to.equal(1);
    expect(tour.stops[0].childStops[0].tourId).to.equal(tf2.id);
    expect(tour.stops[0].childStops[0].stopNum).to.equal(0);
  });
});
