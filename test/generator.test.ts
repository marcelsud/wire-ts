import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test } from "node:test";
import { create, fromBinary } from "@bufbuild/protobuf";
import { FileDescriptorProtoSchema, FileDescriptorSetSchema } from "@bufbuild/protobuf/wkt";
import { CodeGeneratorRequestSchema } from "@bufbuild/protobuf/wkt/google/protobuf/compiler/plugin_pb.js";
import { generate } from "../src/generator.ts";
import { defineSchema } from "../src/runtime.ts";

const { stdout } = await promisify(execFile)("buf", ["build", "--as-file-descriptor-set", "-o", "-"], { encoding: "buffer" });
const descriptors = fromBinary(FileDescriptorSetSchema, stdout);

function output(parameter = "root=squareup.dinosaurs.Dinosaur") {
  const request = create(CodeGeneratorRequestSchema, {
    fileToGenerate: ["dinosaur.proto", "geology.proto"], protoFile: descriptors.file, parameter,
  });
  return generate(request).file[0]!.content;
}

function embedded(content: string) {
  const match = content.match(/const schema = defineSchema\("([A-Za-z0-9+/=]+)"\)/);
  assert.ok(match, "generated module contains a runtime descriptor");
  return defineSchema(match[1]!);
}

test("root pruning removes unreachable models and their embedded descriptors", () => {
  const content = output();
  assert.doesNotMatch(content, /export interface Unused|export interface EdgeCases/);
  const registry = embedded(content);
  assert.ok(registry.getMessage("squareup.dinosaurs.Dinosaur"));
  assert.ok(registry.getMessage("squareup.dinosaurs.Dinosaur.Coordinates"));
  assert.ok(registry.getEnum("squareup.geology.Period"));
  assert.equal(registry.getMessage("squareup.dinosaurs.Unused"), undefined);
  assert.equal(registry.getMessage("squareup.dinosaurs.EdgeCases"), undefined);
});

test("supports multiple roots and generation without root selection", () => {
  assert.ok(embedded(output("root=squareup.dinosaurs.Dinosaur,root=squareup.dinosaurs.EdgeCases"))
    .getMessage("squareup.dinosaurs.EdgeCases"));
  assert.ok(embedded(output("")).getMessage("squareup.dinosaurs.Unused"));
});

test("nested roots retain only a containing descriptor shell", () => {
  const content = output("root=squareup.dinosaurs.Dinosaur.Coordinates");
  assert.doesNotMatch(content, /export interface Dinosaur extends/);
  const registry = embedded(content);
  assert.equal(registry.getMessage("squareup.dinosaurs.Dinosaur")?.fields.length, 0);
  assert.ok(registry.getMessage("squareup.dinosaurs.Dinosaur.Coordinates"));
});

test("fails clearly on misspelled roots and options", () => {
  assert.throws(() => output("root=missing.Message"), /Unknown root/);
  assert.throws(() => output("roots=squareup.dinosaurs.Dinosaur"), /Unknown plugin option/);
  assert.throws(() => output("root="), /Invalid plugin option/);
});

test("escapes reserved identifiers and disambiguates package collisions", () => {
  const files = ["one", "two"].map((name) => create(FileDescriptorProtoSchema, {
    name: `${name}.proto`, package: name, syntax: "proto3",
    messageType: [{ name: "Shared" }, { name: "class" }, { name: "Record" }],
  }));
  const request = create(CodeGeneratorRequestSchema, {
    fileToGenerate: files.map((f) => f.name), protoFile: files,
  });
  const content = generate(request).file[0]!.content;
  assert.match(content, /interface Shared extends/);
  assert.match(content, /interface Shared_2 extends/);
  assert.match(content, /interface class_2 extends/);
  assert.match(content, /interface Record_2 extends/);
  assert.doesNotMatch(content, /interface class extends/);
});

test("rejects proto2 instead of silently changing its semantics", () => {
  const request = create(CodeGeneratorRequestSchema, {
    fileToGenerate: ["legacy.proto"], protoFile: [create(FileDescriptorProtoSchema, {
      name: "legacy.proto", syntax: "proto2", messageType: [{ name: "Legacy" }],
    })],
  });
  assert.throws(() => generate(request), /Only proto3 is supported/);
});

test("rejects malformed descriptor names instead of looping during name allocation", () => {
  const request = create(CodeGeneratorRequestSchema, {
    fileToGenerate: ["invalid.proto"], protoFile: [create(FileDescriptorProtoSchema, {
      name: "invalid.proto", syntax: "proto3", messageType: [{ name: "Invalid-Name" }],
    })],
  });
  assert.throws(() => generate(request), /Invalid protobuf identifier/);
});

test("Buf receives a useful error from the plugin for a misspelled root", async () => {
  const template = JSON.stringify({
    version: "v2",
    plugins: [{ local: ["node", "dist/src/plugin.js"], out: "dist/invalid", opt: ["root=missing.Message"] }],
  });
  await assert.rejects(promisify(execFile)("buf", ["generate", "--template", template]),
    /Unknown root message or enum: missing.Message/);
});
