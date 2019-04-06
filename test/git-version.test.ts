import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import fs from "fs";
import { suite, test } from "mocha";
import { Oid, Reference, Repository, Signature } from "nodegit";
import os from "os";
import * as pathutil from "path";
import { Tourist } from "..";
import { AbsolutePath, RelativePath } from "../src/paths";
import {
  getChangesForFile,
  getCurrentVersion,
  StableVersion,
  versionEq,
} from "../src/version-control/stable-version";

chai.use(chaiAsPromised);
const expect = chai.expect;

const outputDir = pathutil.join(os.tmpdir(), "tourist-test-out");
const testDataDir = pathutil.join(__dirname, "data");
const repoDir = pathutil.join(outputDir, "repo");
const signature = Signature.now("Some Guy", "someguy@gmail.com");

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
  let repository: Repository;
  let fileName: string;
  let file: string;

  async function commitToRepo(files: string[], message: string): Promise<Oid> {
    return await repository.createCommitOnHead(
      files, signature, signature, message,
    );
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

    repository = await Repository.init(repoDir, 0);
    fileName = "my-file.txt";
    file = pathutil.join(repoDir, fileName);
  });

  afterEach("remove directories", () => {
    deleteFolderRecursive(outputDir);
  });

  test("version kind is correct", async () => {
    fs.writeFileSync(file, "Hello, world!");
    await commitToRepo([fileName], "Initial commit");
    const version = await getCurrentVersion("git", new AbsolutePath(repoDir));
    expect(version.kind).to.equal("git");
  });

  test("type equal in same commit", async () => {
    fs.writeFileSync(file, "Hello, world!");
    await commitToRepo([fileName], "Initial commit");
    const version1 = await getCurrentVersion("git", new AbsolutePath(repoDir));
    fs.writeFileSync(file, "Hello, world!\nHello world again!");
    const version2 = await getCurrentVersion("git", new AbsolutePath(repoDir));
    expect(versionEq(version1, version2));
  });

  test("type not equal in different commits", async () => {
    fs.writeFileSync(file, "Hello, world!");
    await commitToRepo([fileName], "Initial commit");
    const version1 = await getCurrentVersion("git", new AbsolutePath(repoDir));
    fs.writeFileSync(file, "Hello, world!\nHello world again!");
    await commitToRepo([fileName], "Second commit");
    const version2 = await getCurrentVersion("git", new AbsolutePath(repoDir));
    // tslint:disable-next-line: no-unused-expression
    expect(versionEq(version1, version2)).to.be.false;
  });

  test("files change correctly: small file", async () => {
    fs.writeFileSync(file, "Hello, world!");
    const commit = await commitToRepo([fileName], "Initial commit");
    fs.writeFileSync(file, "Line before\nHello, world!\nLine after");
    await commitToRepo([fileName], "Second commit");

    const version = { kind: "git" as "git", commit: commit.tostrS() };
    const changes = await getChangesForFile(
      version,
      new RelativePath("repo", fileName),
      new AbsolutePath(repoDir),
    );

    expect(changes).to.not.be.a("null");
    expect(changes!.additions).to.deep.equal([1, 3]);
    expect(changes!.moves.get(1)).to.equal(2);
  });

  test("files change correctly: bigger file", async () => {
    fs.copyFileSync(pathutil.join(testDataDir, "many-lines.txt"), file);
    const commit = await commitToRepo([fileName], "Initial commit");
    let contents = fs.readFileSync(file).toString().split("\n");
    contents = ["A new line!", ...contents];
    fs.writeFileSync(file, contents.join("\n"));
    await commitToRepo([fileName], "Second commit");

    const version = { kind: "git" as "git", commit: commit.tostrS() };
    const changes = await getChangesForFile(
      version,
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
    const commit = await commitToRepo([fileName], "Initial commit");
    fs.copyFileSync(
      pathutil.join(testDataDir, "target-in-middle-after.txt"), file,
    );
    await commitToRepo([fileName], "Second commit");

    const version = { kind: "git" as "git", commit: commit.tostrS() };
    const changes = await getChangesForFile(
      version,
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
    const commit = await commitToRepo([fileName], "Initial commit");
    fs.renameSync(file, otherFile);

    const index = await repository.index();
    await index.remove(fileName, 0);
    await index.addByPath(otherFileName);
    index.write();
    const oid = await index.writeTree();
    const head = await Reference.nameToId(repository, "HEAD");
    const parent = await repository.getCommit(head);
    await repository.createCommit(
      "HEAD",
      signature,
      signature,
      "Second Commit",
      oid,
      [parent],
    );

    const version = { kind: "git" as "git", commit: commit.tostrS() };
    const changes = await getChangesForFile(
      version,
      new RelativePath("repo", fileName),
      new AbsolutePath(repoDir),
    );

    expect(changes).to.not.be.a("null");
    expect(changes!.name).to.equal("other-file.txt");
  });

  test("safe to serialize", async () => {
    await commitToRepo([], "Initial commit");

    const version = await getCurrentVersion("git", new AbsolutePath(repoDir));
    const newVersion: StableVersion = JSON.parse(JSON.stringify(version));
    expect(version).to.deep.equal(newVersion);
    expect(versionEq(newVersion, version));
  });

  test("serde git tour file", async () => {
    fs.writeFileSync(file, "Hello, world!");
    await commitToRepo([fileName], "Initial commit");

    const tourist = new Tourist();
    tourist.mapConfig("repo", repoDir);

    const stop = {
      absPath: file,
      body: "My test body",
      line: 1,
      title: "My test title",
    };

    const tf = await tourist.init();
    await tourist.add(tf, stop, null, "git");

    let checkResults = await tourist.check(tf);
    expect(checkResults.length).to.equal(0);

    const newTf = tourist.deserializeTourFile(tourist.serializeTourFile(tf));
    checkResults = await tourist.check(newTf);
    expect(checkResults.length).to.equal(0);
    expect(versionEq(
      newTf.repositories[0].version,
      tf.repositories[0].version,
    ));
  });

  test("add must be done on same commit", async () => {
    await commitToRepo([], "Initial commit");
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
    await tourist.add(tf, stop1, null, "git");

    await commitToRepo([], "Second commit");

    try {
      await tourist.add(tf, stop2, null, "git");
      expect(false);
    } catch (e) {
      expect(e.message).to.contain("Mismatched");
    }
  });
});
