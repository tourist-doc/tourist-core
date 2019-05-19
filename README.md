# Tourist

Tourist is a new approach to documentation that allows programmers to explain
low-level technical details of a system while simultaneously providing the
context of how those details fit into the broader architecture. It lets
programmers document code in the same way that they would explain it in
person: by walking the consumer step-by-step through the important parts of a
codebase.

A **tour** is a series of locations throughout a codebase, along with
accompanying prose that explains the importance each location in turn.

A maintainer of a project can more effectively introduce newcomers to the
project by setting up one or more tours for the codebase that highlight the
relevant functional components. A person implementing a complex feature or
workflow can use a tour to solicit feedback from other people who are
familiar to the codebase, but not that particular logical flow.

## Getting Started

As of now, Tourist only available as a node module and an associated
extension for Visual Studio Code. The extension can be found at
[hgoldstien95/tourist-vscode](https://github.com/hgoldstein95/tourist-vscode).
We plan on releasing a command-line tool in the near future that will provide
an API that other edtiors can more easily use.

## Building

The Tourist library can be built with

```bash
npm run build
```

and tested with

```bash
npm test
```

Make sure you've `npm install`ed the appropriate dependencies.

## Library Usage

The main way to interact with the Tourist library is via the `Tourist` class.

```typescript
import { Tourist } from "tourist";
const tourist = new Tourist();
```

Alternatively, if you already have a serialized version of a tourist instance,
you can construct a live instance with

```typescript
const str = tourist.serialize();
// ...
const newTourist = Tourist.deserialize(str);
```

Once you have a tourist instance, the first thing to do is set up some
repository mappings. Repository mappings are a simple abstraction that
tourist uses to make tours more portable -- rather than specify that a tour
goes to `/this/absolute/path/file.txt`, you can instead specify that a tour
stop is in `file.txt` in the `foo` repository. Each user then individually
tells tourist where `foo` is

```typescript
tourist.mapConfig("foo", "/this/absolute/path");
```

With mappings set, you can run

```typescript
const tourFile = tourist.init("My First Tour");
```

to create a new tour file, and then you're off to the races. You can use
commands like `add`, `remove`, `edit`, `move`, and `scramble` to manipulate tour
stops, and at the end you can use `resolve` to get a tour with absolute paths
that are easy for editors to understand.

### Refreshing a Tour

By default, a tour is linked to a particular git commit. (Actually, it's
linked to one commit per repository that the tour visits, but for simplicity
we'll assume your first tour will only touch one repository.) As your files
change and your code evolves, eventually a tour of an old version will stop
being very meaningful. Tourist makes it easy to update an old tour to a new
commit, using the `refresh` command.

Refresh is pretty smart under the covers, but its basic approach is to look
at the file changes between the tour's stable commit and the latest commit in
the repository and compute how each line might have changed. Usually it's as
simple as counting up the number of lines that were added above the line, and
subtracting the number of lines that was deleted, but in reality git's diff
output is a little more complicated than that. Refreshes also handle file
renaming, to the extent that git does.

Occasionally, refreshing a stop won't be possible. This is usually because
the target line (or even file) has been deleted or changed beyond
recognition. In these cases, the tour stop would likely need to be completely
changed anyway. When tourist fails to refresh a stop, the line of the stop is
set to 0, and the file path is set to `""`. When a broken stop like this is
`resolve`d, the result will be a `BrokenStop` with just a title and a body.

At the end of the refresh, the commit in the tour file is updated to the
currently checked out commit.
