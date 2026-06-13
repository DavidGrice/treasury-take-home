import { describe, it, expect } from "vitest";
import { fieldValue, netContentsDisplay, getImageUrls, scoreLabel, deriveFilterOptions, applicableExtraFields } from "@/lib/domain/submissionFields";

describe("fieldValue", () => {
  const base = {
    brand: "Bud Light",
    alcohol_content: "4.2",
    alcohol_unit: "Alc./Vol.",
    net_contents: "12",
    net_contents_unit: "Fl. Oz",
    net_contents_secondary: "",
    producer: "Anheuser-Busch, Inc.",
    producer_city: "St. Louis",
    producer_state: "Missouri",
    is_imported: "No",
    country: "",
  };

  it("formats alcohol content with its unit", () => {
    expect(fieldValue(base, "alcohol_content")).toBe("4.2% Alc./Vol.");
  });

  it("returns the net contents display string", () => {
    expect(fieldValue(base, "net_contents")).toBe("12 Fl. Oz");
  });

  it("combines producer, city, and state into a single value", () => {
    expect(fieldValue(base, "producer")).toBe("Anheuser-Busch, Inc., St. Louis, Missouri");
  });

  it("shows 'N/A (domestic)' for country when not imported, and the country when imported", () => {
    expect(fieldValue(base, "country")).toBe("N/A (domestic)");
    expect(fieldValue({ ...base, is_imported: "Yes", country: "Mexico" }, "country")).toBe("Mexico");
  });

  it("falls back to the raw column value for other keys", () => {
    expect(fieldValue(base, "brand")).toBe("Bud Light");
  });
});

describe("netContentsDisplay", () => {
  it("appends a Fl. Oz remainder only when present and positive", () => {
    expect(netContentsDisplay({ net_contents: "1", net_contents_unit: "Pint", net_contents_secondary: "4" })).toBe("1 Pint 4 Fl. Oz");
    expect(netContentsDisplay({ net_contents: "1", net_contents_unit: "Pint", net_contents_secondary: "0" })).toBe("1 Pint");
    expect(netContentsDisplay({ net_contents: "12", net_contents_unit: "Fl. Oz" })).toBe("12 Fl. Oz");
  });
});

describe("getImageUrls", () => {
  it("prefers image_urls when present", () => {
    expect(getImageUrls({ image_urls: ["a.jpg", "b.jpg"], image_url: "legacy.jpg" })).toEqual(["a.jpg", "b.jpg"]);
  });

  it("falls back to image_url when image_urls is empty/missing", () => {
    expect(getImageUrls({ image_urls: [], image_url: "legacy.jpg" })).toEqual(["legacy.jpg"]);
    expect(getImageUrls({})).toEqual([]);
  });
});

describe("scoreLabel", () => {
  it("returns 'N/A' when assessment_score is null/undefined, else '<n>%'", () => {
    expect(scoreLabel({ assessment_score: null })).toBe("N/A");
    expect(scoreLabel({ assessment_score: undefined })).toBe("N/A");
    expect(scoreLabel({ assessment_score: 87 })).toBe("87%");
  });
});

describe("applicableExtraFields", () => {
  it("only returns extra fields that have a non-empty value", () => {
    const submission = { age_statement: "Aged 4 years", color_disclosure: "", warning: "GOVERNMENT WARNING..." };
    const keys = applicableExtraFields(submission).map((f) => f.key);
    expect(keys).toContain("age_statement");
    expect(keys).toContain("warning");
    expect(keys).not.toContain("color_disclosure");
  });
});

describe("deriveFilterOptions", () => {
  it("derives unique, sorted filter option lists from a set of forms", () => {
    const forms = [
      { id: "2", brand: "Beta", assessment_score: 80, submitted_at: "2026-01-02T00:00:00Z" },
      { id: "1", brand: "Alpha", assessment_score: null, submitted_at: "2026-01-01T00:00:00Z" },
      { id: "1", brand: "Alpha", assessment_score: 80, submitted_at: "2026-01-01T00:00:00Z" },
    ];
    const { idOptions, brandOptions, scoreOptions } = deriveFilterOptions(forms);
    expect(idOptions).toEqual(["1", "2"]);
    expect(brandOptions).toEqual(["Alpha", "Beta"]);
    // N/A sorts last, numeric scores sort descending
    expect(scoreOptions).toEqual(["80%", "N/A"]);
  });
});
