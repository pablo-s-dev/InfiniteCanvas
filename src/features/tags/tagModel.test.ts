import { describe, expect, it } from "vitest";
import { CompositeTag, flattenCompositeTags } from "./tagModel";

describe("CompositeTag", () => {
  it("flattens nested values without duplicates", () => {
    const root = new CompositeTag({
      name: "Work",
      value: [
        new CompositeTag({ name: "Design" }),
        new CompositeTag({ name: "Design" }),
        new CompositeTag({ name: "Review" }),
      ],
    });

    expect(root.flattenValues()).toEqual(["Work", "Design", "Review"]);
    expect(root.includes(" design ")).toBe(true);
  });

  it("round-trips through JSON", () => {
    const original = new CompositeTag({
      name: "Project",
      value: [new CompositeTag({ name: "Sketch" })],
    });

    const revived = CompositeTag.fromJSON(original.toJSON());

    expect(revived.name).toBe("Project");
    expect(revived.flattenValues()).toEqual(["Project", "Sketch"]);
  });

  it("flattens multiple composite tags", () => {
    const tags = [
      new CompositeTag({ name: "A", value: [new CompositeTag({ name: "B" })] }),
      new CompositeTag({ name: "B" }),
    ];

    expect(flattenCompositeTags(tags)).toEqual(["A", "B"]);
  });
});
