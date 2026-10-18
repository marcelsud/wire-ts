import type { Dinosaur } from "../examples/generated/wire.ts";

// Checked by tsc; never executed.
function typeContract(value: Dinosaur): void {
  // @ts-expect-error Model properties are readonly.
  value.name = "changed";
  // @ts-expect-error Repeated fields are readonly.
  value.picture_urls.push("photo");
  // @ts-expect-error 64-bit integers use bigint.
  const badInteger: Dinosaur = { ...value, discovery_id: 123 };
  // @ts-expect-error A oneof case determines its value type.
  const badOneof: Dinosaur = { ...value, location: { case: "coordinates", value: "museum" } };
  const good: Dinosaur = { ...value, location: { case: "coordinates", value: { latitude: 0, longitude: 0 } } };
  void [badInteger, badOneof, good];
}
void typeContract;
