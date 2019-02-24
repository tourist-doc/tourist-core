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
    absPath: "/home/hgoldstein/Projects/hgoldstein95.github.io/index.md",
    column: 1,
    line: 1,
    title: "Tour Stop 1",
  });

  const tf = await tourist.dump(fname);
  print(JSON.stringify(tf, null, 2));
})();