import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import fs from "fs-extra";
import { suite, test } from "mocha";
import os from "os";
import * as pathutil from "path";
import { Tourist } from "..";
import { AbsolutePath, RelativePath } from "../src/paths";
import { GitProvider } from "../src/versionProvider";
import { AbsoluteTourStop } from "../src/types";

chai.use(chaiAsPromised);
const expect = chai.expect;

const outputDir = pathutil.join(os.tmpdir(), "tourist-test-out");
const testDataDir = pathutil.join(__dirname, "data");
const repoDir = pathutil.join(outputDir, "repo");
const gp = new GitProvider();

async function copyFile(src: string, dest: string) {
  const buffer = await fs.readFile(src);
  await fs.writeFile(dest, buffer.toString());
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
    fileName = "my-file.txt";
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
    let contents = await fs
      .readFile(file)
      .toString()
      .split("\n");
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
    };

    const tf = await tourist.init();
    await tourist.add(tf, stop, null);

    let checkResults = await tourist.check(tf);
    expect(checkResults.length).to.equal(0);

    const newTf = tourist.deserializeTourFile(tourist.serializeTourFile(tf));
    checkResults = await tourist.check(newTf);
    expect(checkResults.length).to.equal(0);
    expect(newTf.repositories[0].commit === tf.repositories[0].commit);
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
    };
    const stop2 = {
      absPath: file2,
      body: "My test body",
      line: 1,
      title: "My test title",
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
});
