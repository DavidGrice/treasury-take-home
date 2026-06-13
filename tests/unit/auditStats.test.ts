import { describe, it, expect } from "vitest";
import {
  buildRejectionReasonBreakdown,
  buildAssessmentChecklistStats,
  buildFieldMatchRates,
  buildRejectionCommentThemes,
  buildRejectionCommentKeywords,
} from "@/lib/domain/auditStats";

describe("buildRejectionReasonBreakdown", () => {
  it("counts rejection reasons across submissions, most-common first", () => {
    const rejected = [
      { rejection_reasons: ["Blurry image", "Brand name"] },
      { rejection_reasons: ["Brand name"] },
      { rejection_reasons: [] },
    ];
    expect(buildRejectionReasonBreakdown(rejected)).toEqual([
      { reason: "Brand name", count: 2 },
      { reason: "Blurry image", count: 1 },
    ]);
  });
});

describe("buildAssessmentChecklistStats", () => {
  it("returns nulls when no submissions have assessment data", () => {
    const stats = buildAssessmentChecklistStats([{ brand: "X" }]);
    expect(stats.sampleSize).toBe(0);
    expect(stats.avgScore).toBeNull();
    expect(stats.blurryRate).toBeNull();
  });

  it("aggregates averages and rates across assessed submissions", () => {
    const forms = [
      { assessment_score: 80, assessment_ocr_confidence: 90, assessment_blurry: true, assessment_flash: false, assessment_warning_present: true, assessment_surgeon_general: true },
      { assessment_score: 60, assessment_ocr_confidence: 70, assessment_blurry: false, assessment_flash: false, assessment_warning_present: false, assessment_surgeon_general: false },
    ];
    const stats = buildAssessmentChecklistStats(forms);
    expect(stats.sampleSize).toBe(2);
    expect(stats.avgScore).toBe(70);
    expect(stats.avgOcrConfidence).toBe(80);
    expect(stats.blurryRate).toBe(50);
    expect(stats.flashRate).toBe(0);
    expect(stats.missingWarningRate).toBe(50);
    expect(stats.missingSurgeonGeneralRate).toBe(50);
  });
});

describe("buildFieldMatchRates", () => {
  it("tallies matched/not-matched/no-input per field across submissions", () => {
    const forms = [
      { assessment_field_matches: { brand: true, producer: false } },
      { assessment_field_matches: { brand: true, producer: "no-input" as const } },
      { assessment_field_matches: null },
    ];
    const rows = buildFieldMatchRates(forms);
    const brand = rows.find((r) => r.field === "Brand")!;
    expect(brand).toMatchObject({ matched: 2, notMatched: 0, noInput: 0 });

    const producer = rows.find((r) => r.field === "Producer")!;
    expect(producer).toMatchObject({ matched: 0, notMatched: 1, noInput: 1 });
  });
});

describe("buildRejectionCommentThemes", () => {
  it("matches comments against known themes and counts an 'other' bucket", () => {
    const rejected = [
      { rejection_comment: "The image is too blurry to read." },
      { rejection_comment: "Net contents don't match the label." },
      { rejection_comment: "Something unrelated entirely." },
      { rejection_comment: "" },
    ];
    const { totalWithComment, themes, other } = buildRejectionCommentThemes(rejected);
    expect(totalWithComment).toBe(3);
    expect(themes.find((t) => t.label.includes("Image quality"))?.count).toBe(1);
    expect(themes.find((t) => t.label.includes("Net contents"))?.count).toBe(1);
    expect(other).toBe(1);
  });
});

describe("buildRejectionCommentKeywords", () => {
  it("counts frequent 4+ letter non-stopword tokens", () => {
    const rejected = [
      { rejection_comment: "Brand name does not match the label, brand looks wrong." },
      { rejection_comment: "Brand spelling is off." },
    ];
    const keywords = buildRejectionCommentKeywords(rejected, 5);
    const brand = keywords.find((k) => k.word === "brand");
    expect(brand?.count).toBe(3);
  });
});
