import tourist from "./tourist";

function print(msg: string | number | boolean) {
  if (typeof msg ===  "number" || typeof msg === "boolean") {
    msg = msg.toString();
  }
  process.stdout.write(msg);
}

tourist.init("out/tour.json").then((res) => print(res));