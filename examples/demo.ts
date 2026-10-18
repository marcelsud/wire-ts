import { Dinosaur, Period } from "./generated/wire.ts";

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
console.log("Encoded:", Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(""));
console.dir(Dinosaur.ADAPTER.decode(bytes), { depth: null });
