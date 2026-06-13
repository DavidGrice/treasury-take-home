import { describe, it, expect } from "vitest";
import { sortSubmissions } from "@/lib/domain/sortSubmissions";

const forms = [
  { id: "3", brand: "Charlie", assessment_score: null, submitted_at: "2026-01-03T00:00:00Z" },
  { id: "1", brand: "Alpha", assessment_score: 90, submitted_at: "2026-01-01T00:00:00Z" },
  { id: "2", brand: "bravo", assessment_score: 50, submitted_at: "2026-01-02T00:00:00Z" },
];

describe("sortSubmissions", () => {
  it("sorts by a string column case-insensitively", () => {
    const asc = sortSubmissions(forms, "brand", "asc").map((f) => f.brand);
    expect(asc).toEqual(["Alpha", "bravo", "Charlie"]);

    const desc = sortSubmissions(forms, "brand", "desc").map((f) => f.brand);
    expect(desc).toEqual(["Charlie", "bravo", "Alpha"]);
  });

  it("sorts by submitted_at chronologically", () => {
    const asc = sortSubmissions(forms, "submitted_at", "asc").map((f) => f.id);
    expect(asc).toEqual(["1", "2", "3"]);
  });

  it("sorts null assessment_score as the lowest value", () => {
    const asc = sortSubmissions(forms, "assessment_score", "asc").map((f) => f.id);
    expect(asc[0]).toBe("3"); // null treated as -Infinity

    const desc = sortSubmissions(forms, "assessment_score", "desc").map((f) => f.id);
    expect(desc[0]).toBe("1"); // 90 is highest
  });

  it("does not mutate the original array", () => {
    const copy = [...forms];
    sortSubmissions(forms, "brand", "asc");
    expect(forms).toEqual(copy);
  });
});
