import af from "async-file";
import * as pathutil from "path";

export default {
  init,
};

async function init(path: string = "tour.json"): Promise<boolean> {
  if (await af.exists(path)) { return false; }
  af.mkdirp(pathutil.dirname(path));
  af.writeFile(path, `{ "tourist-version": "1.0.0" }`);
  return true;
}