import { describe, it, expect } from "vitest";
import {
  computeFieldMatches,
  computeAssessmentScore,
  buildFieldMatchInputs,
  TYPE_FIELD_CONFIG,
} from "@/lib/domain/labelAnalysis";

describe("computeFieldMatches", () => {
  it("marks blank inputs as 'no-input' and excludes them from totals", () => {
    const { fm, matches, total } = computeFieldMatches("BUD LIGHT 4.2% Alc./Vol.", {
      brand: "Bud Light",
      producer: "",
    });
    expect(fm.producer).toBe("no-input");
    expect(total).toBe(1);
    expect(matches).toBe(1);
    expect(fm.brand).toBe(true);
  });

  it("matches brand even with OCR noise between letters (flexible fallback)", () => {
    const { fm } = computeFieldMatches("B U D L I G H T 4.2%", { brand: "Bud Light" });
    expect(fm.brand).toBe(true);
  });

  it("rescues alcohol/net fields via the numeric value even without units", () => {
    const { fm } = computeFieldMatches("some noisy text 4.2 more noise", {
      alcohol: "4.2%",
    });
    expect(fm.alcohol).toBe(true);
  });

  it("does not match when neither the text nor numeric value appear", () => {
    const { fm, matches, total } = computeFieldMatches("Completely unrelated text", {
      brand: "Bud Light",
    });
    expect(fm.brand).toBe(false);
    expect(matches).toBe(0);
    expect(total).toBe(1);
  });

  it("rescues typeDesignation via loose keyword (e.g. 'BEER' for 'Malt Beverage')", () => {
    const { fm } = computeFieldMatches("ICE COLD BEER 12 FL OZ", {
      typeDesignation: "Malt Beverage",
    });
    expect(fm.typeDesignation).toBe(true);
  });

  it("rescues the government warning via fragment matching despite OCR misspellings", () => {
    const { fm } = computeFieldMatches("GOVEMMENT WARNLNG: (1) SURGEN GENRAL SAYS...", {
      warning: "GOVERNMENT WARNING: (1) ACCORDING TO THE SURGEON GENERAL...",
    });
    expect(fm.warning).toBe(true);
  });
});

describe("computeAssessmentScore", () => {
  it("returns null when there are no checkable fields", () => {
    expect(computeAssessmentScore(0, 0)).toBeNull();
  });

  it("rounds the percentage of matched fields", () => {
    expect(computeAssessmentScore(1, 3)).toBe(33);
    expect(computeAssessmentScore(2, 3)).toBe(67);
    expect(computeAssessmentScore(3, 3)).toBe(100);
  });
});

describe("buildFieldMatchInputs", () => {
  it("builds the base inputs from a submission row", () => {
    const inputs = buildFieldMatchInputs({
      type_designation: "Malt Beverage",
      brand: "Bud Light",
      alcohol_content: "4.2",
      net_contents: "12",
      net_contents_unit: "Fl. Oz",
      producer: "Anheuser-Busch, Inc.",
    });
    expect(inputs.brand).toBe("Bud Light");
    expect(inputs.typeDesignation).toBe("Malt Beverage");
    expect(inputs.alcohol).toBe("4.2%");
    expect(inputs.net).toBe("12 Fl. Oz");
    expect(inputs.producer).toBe("Anheuser-Busch, Inc.");
  });

  it("includes a Fl. Oz remainder for Pint/Quart/Gallon units", () => {
    const inputs = buildFieldMatchInputs({
      type_designation: "Malt Beverage",
      net_contents: "1",
      net_contents_unit: "Pint",
      net_contents_secondary: "4",
    });
    expect(inputs.net).toBe("1 Pint 4 Fl. Oz");
  });

  it("always includes required type-specific fields, even if blank", () => {
    const inputs = buildFieldMatchInputs({ type_designation: "Distilled Spirits" });
    expect(Object.keys(TYPE_FIELD_CONFIG["Distilled Spirits"].required)).toBeDefined();
    expect("ageStatement" in inputs).toBe(true);
    expect(inputs.ageStatement).toBe("");
  });

  it("only includes 'applicable' type-specific fields when they have a value", () => {
    const withValue = buildFieldMatchInputs({
      type_designation: "Wine",
      sulfite_declaration: "Contains Sulfites",
    });
    expect(withValue.sulfiteDeclaration).toBe("Contains Sulfites");

    const withoutValue = buildFieldMatchInputs({ type_designation: "Wine" });
    expect("sulfiteDeclaration" in withoutValue).toBe(false);
  });
});
