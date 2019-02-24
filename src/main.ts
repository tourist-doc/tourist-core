import * as fs from "fs";
import tourist from "./tourist";

function print(msg: string | number | boolean | Buffer) {
  if (typeof msg ===  "number" || typeof msg === "boolean") {
    msg = msg.toString();
  }
  process.stdout.write(msg + "\n");
}

const fname = "out/tour.json";

if (fs.existsSync(fname)) {
  fs.unlinkSync(fname);
}
(async () => {
  await tourist.init(fname);
  await tourist.add(fname, {
    column: 20,
    file: "path/to/file",
    line: 4,
    title: "Tour Stop 1",
  });
  await tourist.add(fname, {
    column: 20,
    file: "path/to/file",
    line: 4,
    title: "Tour Stop 2",
  });
  await tourist.add(fname, {
    column: 20,
    file: "path/to/file",
    line: 4,
    title: "Tour Stop 3",
  });
  await tourist.edit(fname, 0, { title: "First Tour Stop" });
  await tourist.remove(fname, 1);
  await tourist.scramble(fname, [1, 0, 0]);
  const res = await tourist.resolve(fname);
  print(JSON.stringify(res, null, 2));
})();