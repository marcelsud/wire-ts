import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { promisify } from "node:util";
import { Dinosaur, EdgeCases, Period } from "../examples/generated/wire.ts";

const run = promisify(execFile);
const cache = join(tmpdir(), "wire-typescript-interop-cache");
await mkdir(cache, { recursive: true });

async function artifact(path: string): Promise<string> {
  const file = join(cache, path.split("/").at(-1)!);
  try { await access(file); }
  catch {
    const response = await fetch(`https://repo.maven.apache.org/maven2/${path}`);
    if (!response.ok) throw new Error(`Downloading ${path}: ${response.status}`);
    await writeFile(`${file}.download`, new Uint8Array(await response.arrayBuffer()));
    await rename(`${file}.download`, file);
  }
  return file;
}

// The compiler's bundled runtime is also the classpath for generated Java models.
const compiler = await artifact("com/squareup/wire/wire-compiler/7.1.0/wire-compiler-7.1.0-jar-with-dependencies.jar");
const ecj = await artifact("org/eclipse/jdt/ecj/3.39.0/ecj-3.39.0.jar");
const work = await mkdtemp(join(tmpdir(), "wire-typescript-java-"));
try {
  await run("java", ["-jar", compiler, "--proto_path=examples/proto", `--java_out=${work}`, "dinosaur.proto", "geology.proto"]);
  const sources = (await readdir(work, { recursive: true })).filter((file) => file.endsWith(".java"));
  await run("java", ["-jar", ecj, "-17", "-nowarn", "-cp", compiler, "-d", work,
    ...sources.map((file) => join(work, file)), resolve("test/WireInterop.java")]);

  const empty = Dinosaur.ADAPTER.decode(new Uint8Array());
  const child = { ...empty, name: "baby" };
  const dinosaur: Dinosaur = {
    ...Dinosaur.ADAPTER.decode(new Uint8Array([0xa0, 0x06, 0x2a])),
    name: "Stegosaurus", picture_urls: ["photo"], period: Period.JURASSIC,
    discovery_id: 18446744073709551615n, fossil: new Uint8Array([0, 128, 255]),
    relative: child, measurements: { length_meters: 9 },
    location: { case: "coordinates", value: { latitude: 1.25, longitude: -2.5 } },
  };
  const edges: EdgeCases = {
    ...EdgeCases.ADAPTER.decode(new Uint8Array()),
    int32_value: -2147483648, sint32_value: -2147483648,
    uint32_value: 4294967295, fixed32_value: 4294967295, sfixed32_value: -2147483648,
    int64_value: -9223372036854775808n, sint64_value: -9223372036854775808n,
    uint64_value: 18446744073709551615n, fixed64_value: 18446744073709551615n,
    sfixed64_value: -9223372036854775808n,
    float_value: 1.5, double_value: -123.25, bool_value: true,
    packed_values: [-1, 0, 2147483647], unpacked_values: [-1, 0, 2147483647],
    explicit_false: false, bool_keys: { true: child, false: empty },
    int64_keys: { "-9223372036854775808": "min", "9223372036854775807": "max" },
    children: [child], ["__proto__"]: "safe", constructor: "also safe",
  };
  const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
  const { stdout } = await run("java", ["-cp", `${work}${delimiter}${compiler}`, "WireInterop",
    hex(Dinosaur.ADAPTER.encode(dinosaur)), hex(EdgeCases.ADAPTER.encode(edges))]);
  const [dinosaurHex, edgesHex] = stdout.trim().split(/\r?\n/);
  assert.ok(dinosaurHex && edgesHex, "Square Wire produced both independent fixtures");
  assert.deepEqual(Dinosaur.ADAPTER.decode(new Uint8Array(Buffer.from(dinosaurHex, "hex"))), dinosaur);
  assert.deepEqual(EdgeCases.ADAPTER.decode(new Uint8Array(Buffer.from(edgesHex, "hex"))), edges);
  console.log("Square Wire 7.1.0 interoperability passed in both directions (all scalar encodings, nesting, maps, oneof, optional presence, unknown fields).");
} finally {
  await rm(work, { recursive: true, force: true });
}
