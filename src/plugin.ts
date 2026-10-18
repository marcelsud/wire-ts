#!/usr/bin/env node
import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import {
  CodeGeneratorRequestSchema,
  CodeGeneratorResponseSchema,
  type CodeGeneratorResponse,
} from "@bufbuild/protobuf/wkt/google/protobuf/compiler/plugin_pb.js";
import { generate } from "./generator.js";

const chunks: Buffer[] = [];
for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
const request = fromBinary(CodeGeneratorRequestSchema, Buffer.concat(chunks));
let response: CodeGeneratorResponse;
try {
  response = generate(request);
} catch (error) {
  response = create(CodeGeneratorResponseSchema, {
    error: error instanceof Error ? error.message : String(error),
  });
}
process.stdout.write(toBinary(CodeGeneratorResponseSchema, response));
