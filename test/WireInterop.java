import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;
import okio.ByteString;
import squareup.dinosaurs.Dinosaur;
import squareup.dinosaurs.EdgeCases;
import squareup.geology.Period;

/** Independent fixtures built with Square Wire 7.1.0-generated Java models. */
public final class WireInterop {
  public static void main(String[] args) throws Exception {
    Dinosaur child = new Dinosaur.Builder().name("baby").build();
    Map<String, Integer> measurements = new LinkedHashMap<>();
    measurements.put("length_meters", 9);
    Dinosaur dinosaur = new Dinosaur.Builder()
        .name("Stegosaurus")
        .picture_urls(Arrays.asList("photo"))
        .period(Period.JURASSIC)
        .discovery_id(-1L)
        .fossil(ByteString.decodeHex("0080ff"))
        .relative(child)
        .measurements(measurements)
        .coordinates(new Dinosaur.Coordinates.Builder().latitude(1.25).longitude(-2.5).build())
        .addUnknownFields(ByteString.decodeHex("a0062a"))
        .build();

    Map<Boolean, Dinosaur> boolKeys = new LinkedHashMap<>();
    boolKeys.put(true, child);
    boolKeys.put(false, new Dinosaur.Builder().build());
    Map<Long, String> int64Keys = new LinkedHashMap<>();
    int64Keys.put(Long.MIN_VALUE, "min");
    int64Keys.put(Long.MAX_VALUE, "max");
    EdgeCases edges = new EdgeCases.Builder()
        .int32_value(Integer.MIN_VALUE).sint32_value(Integer.MIN_VALUE)
        .uint32_value(-1).fixed32_value(-1).sfixed32_value(Integer.MIN_VALUE)
        .int64_value(Long.MIN_VALUE).sint64_value(Long.MIN_VALUE)
        .uint64_value(-1L).fixed64_value(-1L).sfixed64_value(Long.MIN_VALUE)
        .float_value(1.5f).double_value(-123.25).bool_value(true)
        .packed_values(Arrays.asList(-1, 0, Integer.MAX_VALUE))
        .unpacked_values(Arrays.asList(-1, 0, Integer.MAX_VALUE))
        .explicit_false(false).bool_keys(boolKeys).int64_keys(int64Keys)
        .children(Arrays.asList(child)).__proto__("safe").constructor("also safe")
        .build();

    if (!Dinosaur.ADAPTER.decode(ByteString.decodeHex(args[0])).equals(dinosaur)) {
      throw new AssertionError("Square Wire decoded a different Dinosaur");
    }
    if (!EdgeCases.ADAPTER.decode(ByteString.decodeHex(args[1])).equals(edges)) {
      throw new AssertionError("Square Wire decoded different EdgeCases");
    }
    System.out.println(ByteString.of(Dinosaur.ADAPTER.encode(dinosaur)).hex());
    System.out.println(ByteString.of(EdgeCases.ADAPTER.encode(edges)).hex());
  }
}
