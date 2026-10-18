import {
  createFileRegistry,
  fromBinary,
  toBinary,
  ScalarType,
  type DescMessage,
  type Registry,
  type UnknownField,
} from "@bufbuild/protobuf";
import {
  reflect,
  isReflectList,
  isReflectMap,
  isReflectMessage,
  type ReflectMessage,
} from "@bufbuild/protobuf/reflect";
import { FileDescriptorSetSchema } from "@bufbuild/protobuf/wkt";
import { base64Decode } from "@bufbuild/protobuf/wire";

/** Enumerable so object spread preserves fields from newer schema versions. */
export const unknownFields: unique symbol = Symbol("wire.unknownFields");

export interface WireMessage {
  readonly [unknownFields]?: readonly UnknownField[];
}

export interface ProtoAdapter<T> {
  readonly typeName: string;
  encode(value: T): Uint8Array;
  decode(bytes: Uint8Array): T;
}

/** Used by generated modules; the embedded descriptor contains only retained types. */
export function defineSchema(base64: string): Registry {
  return createFileRegistry(fromBinary(FileDescriptorSetSchema, base64Decode(base64)));
}

export function createAdapter<T extends WireMessage>(
  registry: Registry,
  typeName: string,
): ProtoAdapter<T> {
  const desc = registry.getMessage(typeName);
  if (!desc) throw new Error(`Unknown protobuf message: ${typeName}`);
  return {
    typeName,
    encode: (value) => toBinary(desc, toMessage(desc, value, 0).message),
    decode: (bytes) => toObject(reflect(desc, fromBinary(desc, bytes)), 0) as T,
  };
}

function record(value: unknown): Record<PropertyKey, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Expected a protobuf message or map object");
  }
  return value as Record<PropertyKey, unknown>;
}

function checkDepth(depth: number): void {
  if (depth > 100) throw new RangeError("Protobuf message nesting exceeds 100 levels");
}

function toMessage(desc: DescMessage, value: unknown, depth: number): ReflectMessage {
  checkDepth(depth);
  const input = record(value);
  const message = reflect(desc);
  for (const field of desc.fields) {
    let item: unknown;
    if (field.oneof) {
      const group = Object.hasOwn(input, field.oneof.name) ? input[field.oneof.name] : undefined;
      if (group === undefined) continue;
      const selection = record(group);
      if (!field.oneof.fields.some((f) => f.name === selection.case)) {
        throw new TypeError(`Invalid case for ${desc.typeName}.${field.oneof.name}`);
      }
      if (selection.case !== field.name) continue;
      item = selection.value;
      if (item === undefined) throw new TypeError(`Missing oneof value: ${field.name}`);
    } else {
      item = Object.hasOwn(input, field.name) ? input[field.name] : undefined;
      if (item === undefined) continue;
    }
    if (field.fieldKind === "list") {
      if (!Array.isArray(item)) throw new TypeError(`Expected array: ${field.name}`);
      const list = message.get(field);
      for (const entry of item) {
        list.add(field.message ? toMessage(field.message, entry, depth + 1) : entry);
      }
    } else if (field.fieldKind === "map") {
      const map = message.get(field);
      for (const [key, entry] of Object.entries(record(item))) {
        let mapKey: string | boolean | number | bigint = key;
        if (field.mapKey === ScalarType.BOOL) {
          if (key !== "true" && key !== "false") throw new TypeError(`Invalid bool map key: ${key}`);
          mapKey = key === "true";
        } else if (field.mapKey !== ScalarType.STRING) {
          if (!/^-?(0|[1-9][0-9]*)$/.test(key)) throw new TypeError(`Invalid integer map key: ${key}`);
          mapKey = [ScalarType.INT64, ScalarType.UINT64, ScalarType.SINT64, ScalarType.FIXED64, ScalarType.SFIXED64]
            .includes(field.mapKey) ? BigInt(key) : Number(key);
        }
        map.set(mapKey, field.message ? toMessage(field.message, entry, depth + 1) : entry);
      }
    } else {
      message.set(field, field.message ? toMessage(field.message, item, depth + 1) : item);
    }
  }
  const unknown = input[unknownFields];
  if (unknown !== undefined) message.setUnknown(unknown as UnknownField[]);
  return message;
}

function toObject(message: ReflectMessage, depth: number): WireMessage {
  checkDepth(depth);
  const entries: [PropertyKey, unknown][] = [];
  for (const member of message.members) {
    if (member.kind === "oneof") {
      const selected = message.oneofCase(member);
      if (selected) {
        entries.push([member.name, {
          case: selected.name,
          value: plainValue(message.get(selected), depth),
        }]);
      }
    } else {
      if (member.fieldKind !== "list" && member.fieldKind !== "map" &&
          member.presence !== 2 && !message.isSet(member)) continue;
      entries.push([member.name, plainValue(message.get(member), depth)]);
    }
  }
  const unknown = message.getUnknown();
  if (unknown?.length) entries.push([unknownFields, unknown]);
  return Object.fromEntries(entries);
}

function plainValue(value: unknown, depth: number): unknown {
  if (isReflectMessage(value)) return toObject(value, depth + 1);
  if (isReflectList(value)) return Array.from(value, (entry) => plainValue(entry, depth));
  if (isReflectMap(value)) {
    return Object.fromEntries(Array.from(value, ([key, entry]) => [String(key), plainValue(entry, depth)]));
  }
  return value;
}
