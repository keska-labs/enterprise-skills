import { bucketCount, bucketStringLength } from "./skillManagerEvents";

describe("bucketCount", () => {
  it("buckets sizes", () => {
    expect(bucketCount(0)).toBe("0");
    expect(bucketCount(5)).toBe("1_10");
    expect(bucketCount(40)).toBe("11_50");
    expect(bucketCount(150)).toBe("51_200");
    expect(bucketCount(500)).toBe("201_1000");
    expect(bucketCount(2000)).toBe("1000_plus");
  });
});

describe("bucketStringLength", () => {
  it("buckets lengths", () => {
    expect(bucketStringLength(0)).toBe("0");
    expect(bucketStringLength(2)).toBe("1_2");
    expect(bucketStringLength(8)).toBe("3_8");
    expect(bucketStringLength(20)).toBe("9_24");
    expect(bucketStringLength(40)).toBe("25_64");
    expect(bucketStringLength(100)).toBe("65_plus");
  });
});
