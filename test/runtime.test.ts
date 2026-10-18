import assert from "node:assert/strict";
import { test } from "node:test";
import { BinaryWriter, WireType } from "@bufbuild/protobuf/wire";
import { Dinosaur, EdgeCases, Period } from "../examples/generated/wire.ts";
import { unknownFields } from "wire-typescript";

const empty = () => Dinosaur.ADAPTER.decode(new Uint8Array());

test("encodes the standard dinosaur wire representation", () => {
  const value = { ...empty(), name: "Stegosaurus", period: Period.JURASSIC };
  const bytes = Dinosaur.ADAPTER.encode(value);
  assert.equal(Buffer.from(bytes).toString("hex"), "0a0b537465676f7361757275732801");
  assert.deepEqual(Dinosaur.ADAPTER.decode(bytes), value);
});

test("applies proto3 defaults and preserves explicit presence", () => {
  assert.deepEqual(empty(), { name: "", picture_urls: [], period: 0, fossil: new Uint8Array(), measurements: {} });
  assert.equal(Object.hasOwn(empty(), "discovery_id"), false);
  const value = { ...empty(), discovery_id: 0n };
  assert.equal(Dinosaur.ADAPTER.decode(Dinosaur.ADAPTER.encode(value)).discovery_id, 0n);
  assert.deepEqual(Dinosaur.ADAPTER.encode(value), new Uint8Array([0x30, 0]));
});

test("round trips every scalar encoding, numeric limits, maps and repeated messages", () => {
  const child = { ...empty(), name: "化石 𐍈" };
  const value: EdgeCases = {
    ...EdgeCases.ADAPTER.decode(new Uint8Array()),
    int32_value: -2147483648,
    sint32_value: -2147483648,
    uint32_value: 4294967295,
    fixed32_value: 4294967295,
    sfixed32_value: -2147483648,
    int64_value: -9223372036854775808n,
    sint64_value: -9223372036854775808n,
    uint64_value: 18446744073709551615n,
    fixed64_value: 18446744073709551615n,
    sfixed64_value: -9223372036854775808n,
    float_value: 1.5,
    double_value: -123.25,
    bool_value: true,
    packed_values: [-1, 0, 2147483647],
    unpacked_values: [-1, 0, 2147483647],
    explicit_false: false,
    bool_keys: { true: child, false: empty() },
    int64_keys: { "-9223372036854775808": "min", "9223372036854775807": "max" },
    children: [child],
    ["__proto__"]: "safe",
    constructor: "also safe",
  };
  assert.deepEqual(EdgeCases.ADAPTER.decode(EdgeCases.ADAPTER.encode(value)), value);
});

test("round trips bytes, nested messages and both oneof variants", () => {
  for (const location of [
    { case: "museum", value: "" } as const,
    { case: "coordinates", value: { latitude: -23.55, longitude: -46.63 } } as const,
  ]) {
    const value: Dinosaur = { ...empty(), location, relative: empty(), fossil: new Uint8Array([0, 128, 255]) };
    assert.deepEqual(Dinosaur.ADAPTER.decode(Dinosaur.ADAPTER.encode(value)), value);
  }
});

test("retains unknown fields across decode, object spread and re-encode", () => {
  const suffix = new BinaryWriter().tag(100, WireType.Varint).uint32(42).finish();
  const decoded = Dinosaur.ADAPTER.decode(suffix);
  assert.equal(decoded[unknownFields]?.length, 1);
  const updated = { ...decoded, name: "new" };
  const encoded = Dinosaur.ADAPTER.encode(updated);
  assert.deepEqual(encoded.slice(-suffix.length), suffix);
  const nested = { ...empty(), relative: decoded };
  assert.deepEqual(Dinosaur.ADAPTER.decode(Dinosaur.ADAPTER.encode(nested)), nested);
});

test("retains unrecognized proto3 enum values", () => {
  const value = { ...empty(), period: 999 };
  assert.deepEqual(Dinosaur.ADAPTER.decode(Dinosaur.ADAPTER.encode(value)), value);
});

test("merges repeated occurrences of a singular nested message", () => {
  const first = Dinosaur.ADAPTER.encode({ ...empty(), name: "relative" });
  const second = Dinosaur.ADAPTER.encode({ ...empty(), picture_urls: ["photo"] });
  const bytes = new BinaryWriter().tag(8, WireType.LengthDelimited).bytes(first)
    .tag(8, WireType.LengthDelimited).bytes(second).finish();
  assert.deepEqual(Dinosaur.ADAPTER.decode(bytes).relative, { ...empty(), name: "relative", picture_urls: ["photo"] });
});

test("decodes expanded values for a packed field", () => {
  const bytes = new BinaryWriter().tag(14, WireType.Varint).sint32(-1)
    .tag(14, WireType.Varint).sint32(2).finish();
  assert.deepEqual(EdgeCases.ADAPTER.decode(bytes).packed_values, [-1, 2]);
});

test("handles prototype-shaped map keys without changing the object prototype", () => {
  const measurements = Object.fromEntries([["__proto__", 7], ["constructor", 8]]);
  const value = { ...empty(), measurements };
  const decoded = Dinosaur.ADAPTER.decode(Dinosaur.ADAPTER.encode(value));
  assert.deepEqual(decoded, value);
  assert.equal(Object.getPrototypeOf(decoded.measurements), Object.prototype);
});

test("rejects malformed bytes and invalid values at encoding boundaries", () => {
  assert.throws(() => Dinosaur.ADAPTER.decode(new Uint8Array([0x0a, 5, 1])));
  assert.throws(() => Dinosaur.ADAPTER.encode({ ...empty(), period: 1.5 }));
  assert.throws(() => Dinosaur.ADAPTER.encode({ ...empty(), discovery_id: -1n }));
  assert.throws(() => Dinosaur.ADAPTER.encode({ ...empty(), discovery_id: 18446744073709551616n }));
  assert.throws(() => Dinosaur.ADAPTER.encode({ ...empty(), picture_urls: "oops" } as unknown as Dinosaur));
  assert.throws(() => Dinosaur.ADAPTER.encode({ ...empty(), location: { case: "bad", value: "oops" } } as unknown as Dinosaur));
  assert.throws(() => EdgeCases.ADAPTER.encode({ ...EdgeCases.ADAPTER.decode(new Uint8Array()), bool_keys: { maybe: empty() } }));
  assert.throws(() => EdgeCases.ADAPTER.encode({ ...EdgeCases.ADAPTER.decode(new Uint8Array()), int64_keys: { "1.5": "bad" } }));
});

test("limits cyclic or excessively nested input", () => {
  const value = { ...empty() };
  Object.assign(value, { relative: value });
  assert.throws(() => Dinosaur.ADAPTER.encode(value), /nesting exceeds/);
});
