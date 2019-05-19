import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import fs from "fs";
import { suite, test } from "mocha";
import os from "os";
import * as pathutil from "path";
import { Tourist } from "..";
import { AbsolutePath, RelativePath } from "../src/paths";
import { GitProvider } from "../src/versionProvider";

chai.use(chaiAsPromised);
const expect = chai.expect;

const outputDir = pathutil.join(os.tmpdir(), "tourist-test-out");
const testDataDir = pathutil.join(__dirname, "data");
const repoDir = pathutil.join(outputDir, "repo");
const gp = new GitProvider();

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

  before("make sure we're in a clean state", () => {
    deleteFolderRecursive(outputDir);
  });

  after("make sure we clean up", () => {
    deleteFolderRecursive(outputDir);
  });

  beforeEach("create necessary directories", async () => {
    fs.mkdirSync(outputDir);
    fs.mkdirSync(repoDir);

    repository = new AbsolutePath(repoDir);
    await gp.git(repository, "init", []);
    fileName = "my-file.txt";
    file = pathutil.join(repoDir, fileName);
  });

  afterEach("remove directories", () => {
    deleteFolderRecursive(outputDir);
  });

  test("type equal in same commit", async () => {
    fs.writeFileSync(file, "Hello, world!");
    await commitToRepo("Initial commit");
    const version1 = await gp.getCurrentVersion(new AbsolutePath(repoDir));
    fs.writeFileSync(file, "Hello, world!\nHello world again!");
    const version2 = await gp.getCurrentVersion(new AbsolutePath(repoDir));
    expect(version1! === version2!);
  });

  test("type not equal in different commits", async () => {
    fs.writeFileSync(file, "Hello, world!");
    await commitToRepo("Initial commit");
    const version1 = await gp.getCurrentVersion(new AbsolutePath(repoDir));
    fs.writeFileSync(file, "Hello, world!\nHello world again!");
    await commitToRepo("Second commit");
    const version2 = await gp.getCurrentVersion(new AbsolutePath(repoDir));
    // tslint:disable-next-line: no-unused-expression
    expect(version1! === version2!).to.be.false;
  });

  test("files change correctly: small file", async () => {
    fs.writeFileSync(file, "Hello, world!");
    const commit = await commitToRepo("Initial commit");
    fs.writeFileSync(file, "Line before\nHello, world!\nLine after");
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
    fs.copyFileSync(pathutil.join(testDataDir, "many-lines.txt"), file);
    const commit = await commitToRepo("Initial commit");
    let contents = fs
      .readFileSync(file)
      .toString()
      .split("\n");
    contents = ["A new line!", ...contents];
    fs.writeFileSync(file, contents.join("\n"));
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
    fs.copyFileSync(pathutil.join(testDataDir, "target-in-middle.txt"), file);
    const commit = await commitToRepo("Initial commit");
    fs.copyFileSync(
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
    fs.writeFileSync(file, "Hello, world!");
    const commit = await commitToRepo("Initial commit");
    fs.renameSync(file, otherFile);
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

    let checkResults = await tourist.check(tf);
    expect(checkResults.length).to.equal(0);

    const newTf = tourist.deserializeTourFile(tourist.serializeTourFile(tf));
    checkResults = await tourist.check(newTf);
    expect(checkResults.length).to.equal(0);
    expect(newTf.repositories[0].commit === tf.repositories[0].commit);
  });

  test("add must be done on same commit", async () => {
    fs.writeFileSync(file, "Hello, world!");
    await commitToRepo("Initial commit");
    const file1 = pathutil.join(repoDir, "my-file-1.txt");
    fs.writeFileSync(file1, "Hello, world!");
    const file2 = pathutil.join(repoDir, "my-file-2.txt");
    fs.writeFileSync(file2, "Hello, world!");

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
});
