# wire-ts

A [Square Wire](https://square.github.io/wire/)-inspired TypeScript protobuf prototype. Generate readable readonly models and binary adapters from `.proto` schemas using standard Buf/protoc descriptors.

The prototype uses [`@bufbuild/protobuf`](https://github.com/bufbuild/protobuf-es) for protobuf encoding and decoding. Its generator and adapter layer provide:

- Original proto field names, including `snake_case`.
- Readonly properties, arrays, and map records.
- Native `bigint` for 64-bit integers and `Uint8Array` for bytes.
- Discriminated unions for `oneof`, with explicit optional-field presence.
- Unknown binary fields and unrecognized proto3 enum values preserved across round trips.
- Root-based pruning of both generated models and embedded schema descriptors.

## Quick start

Use Node.js 24+ and Bun to install the committed lockfile:

```sh
git clone https://github.com/marcelsud/wire-ts.git
cd wire-ts
bun install --frozen-lockfile
npm run demo
```

`npm run demo` builds the plugin, generates the example models, and encodes and decodes a dinosaur. Buf is installed as a development dependency; a separate `protoc` installation is unnecessary for this workflow.

```ts
import { Dinosaur, Period } from "./examples/generated/wire.ts";

const dinosaur: Dinosaur = {
  name: "Stegosaurus",
  picture_urls: [],
  period: Period.JURASSIC,
  discovery_id: 18446744073709551615n,
  fossil: new Uint8Array([1, 2, 3]),
  measurements: { length_meters: 9 },
  location: { case: "museum", value: "Natural History Museum" },
};

const bytes = Dinosaur.ADAPTER.encode(dinosaur);
const restored = Dinosaur.ADAPTER.decode(bytes);
```

The example has also been run with Bun and Deno. The generator runs on Node; the runtime has no Node-specific imports.

## Generate models

The existing [`buf.yaml`](buf.yaml) selects `examples/proto` as the schema directory. Change that module path to use your own schemas, then configure [`buf.gen.yaml`](buf.gen.yaml):

```yaml
version: v2
plugins:
  - local: [node, dist/src/plugin.js]
    out: examples/generated
    strategy: all
    opt:
      - root=squareup.dinosaurs.Dinosaur
      - root=squareup.dinosaurs.EdgeCases
```

```sh
npm run generate
```

This produces one `wire.ts` module containing models, enum constants, adapters, and a compact embedded descriptor set. Generated modules import the local prototype package, currently named `wire-typescript` in `package.json`.

Plugin options:

| Option | Behavior |
| --- | --- |
| `root=<fully.qualified.Type>` | Retain the named message or enum and types reachable through its fields. Repeat for multiple roots. |
| `runtime=<module-specifier>` | Override the generated runtime import. Defaults to `wire-typescript`. |

Omit `root` options to generate all messages and enums in the input files, including their referenced dependencies. Unknown roots and options fail generation. In the example schema, `Unused` is removed from both the TypeScript output and the embedded descriptors.

The CLI implements the standard protobuf code-generation plugin protocol. Buf invokes the compiled plugin through `node dist/src/plugin.js`; the package also declares the `protoc-gen-wire-ts` executable for installations that expose package binaries.

## Message behavior

- Absent implicit proto3 scalars decode to their defaults; lists and maps decode to empty collections.
- Absent optional scalars, message fields, and `oneof` groups are omitted. Explicit default values on optional scalars retain their presence.
- Maps are string-keyed records, including maps with boolean or integer proto keys.
- Enum constants are named numbers; enum types accept unknown numeric values from newer schemas.
- Unknown binary fields are stored under the exported `unknownFields` symbol. Object spread preserves them; JSON serialization drops symbol properties.
- Readonly types are enforced by TypeScript. Objects and byte arrays are not frozen at runtime.

```ts
const updated: Dinosaur = { ...restored, name: "Updated name" };
const bytesWithUnknownFields = Dinosaur.ADAPTER.encode(updated);
```

## Validation

```sh
npm test           # Regenerate, type-check, and run the test suite
npm run test:wire  # Check interoperability against Square Wire 7.1.0
```

The tests cover scalar encodings and integer limits, optional presence, nested messages, repeated fields, maps, `oneof`, unknown fields and enums, malformed inputs, identifier collisions, and schema pruning. Type checks also verify readonly fields and `oneof` value types.

`test:wire` requires Java (verified with Java 21) and network access on its first run. It downloads pinned Square Wire and Eclipse Java compiler JARs from Maven Central into a temporary cache. It generates and compiles Java models from the same schemas, verifies that Square Wire decodes the TypeScript output, then checks that TypeScript decodes independently constructed Java messages.

## Prototype scope

This is a private development package, not an npm release. It supports proto3 message models and binary adapters in a single generated module. Proto2 and protobuf Editions are unsupported; proto2 models are rejected explicitly. RPC generation, JSON adapters, field-level pruning, version-based pruning, and bundle-size optimization are outside the current implementation.

The runtime uses reflection and embeds descriptors. Root pruning removes unreachable models, but the runtime dependency is not a standalone minimal wire codec.
