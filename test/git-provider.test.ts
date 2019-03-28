import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { suite, test } from "mocha";
import fs from "fs";
import os from "os";
import * as pathutil from "path";
import { Repository, Signature, Oid, Reference } from "nodegit";
import { GitProvider, GitVersion } from "../src/version-provider/git-provider";
import { AbsolutePath, RelativePath } from "../src/paths";

chai.use(chaiAsPromised);
const expect = chai.expect;

const outputDir = pathutil.join(os.tmpdir(), "tourist-test-out");
const testDataDir = pathutil.join(__dirname, "data");
const repoDir = pathutil.join(outputDir, "repo");
const signature = Signature.now("Some Guy", "someguy@gmail.com");

let vp: GitProvider;

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
    vp = new GitProvider();
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
    const version = await vp.getCurrentVersion(new AbsolutePath(repoDir));
    expect(version.kind).to.equal("git");
  });

  test("type equal in same commit", async () => {
    fs.writeFileSync(file, "Hello, world!");
    await commitToRepo([fileName], "Initial commit");
    const version1 = await vp.getCurrentVersion(new AbsolutePath(repoDir));
    fs.writeFileSync(file, "Hello, world!\nHello world again!");
    const version2 = await vp.getCurrentVersion(new AbsolutePath(repoDir));
    expect(version1.equals(version2));
  });

  test("type not equal in different commits", async () => {
    fs.writeFileSync(file, "Hello, world!");
    await commitToRepo([fileName], "Initial commit");
    const version1 = await vp.getCurrentVersion(new AbsolutePath(repoDir));
    fs.writeFileSync(file, "Hello, world!\nHello world again!");
    await commitToRepo([fileName], "Second commit");
    const version2 = await vp.getCurrentVersion(new AbsolutePath(repoDir));
    // tslint:disable-next-line: no-unused-expression
    expect(version1.equals(version2)).to.be.false;
  });

  test("files change correctly: small file", async () => {
    fs.writeFileSync(file, "Hello, world!");
    const commit = await commitToRepo([fileName], "Initial commit");
    fs.writeFileSync(file, "Line before\nHello, world!\nLine after");
    await commitToRepo([fileName], "Second commit");

    const changes = await vp.getChangesForFile(
      new GitVersion(commit.tostrS()),
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

    const changes = await vp.getChangesForFile(
      new GitVersion(commit.tostrS()),
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

    const changes = await vp.getChangesForFile(
      new GitVersion(commit.tostrS()),
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

    const changes = await vp.getChangesForFile(
      new GitVersion(commit.tostrS()),
      new RelativePath("repo", fileName),
      new AbsolutePath(repoDir),
    );

    expect(changes).to.not.be.a("null");
    expect(changes!.name).to.equal("other-file.txt");
  });
});