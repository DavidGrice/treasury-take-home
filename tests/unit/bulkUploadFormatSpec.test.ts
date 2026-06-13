import { describe, it, expect } from "vitest";
import { BULK_UPLOAD_FORMAT_SPEC, EXAMPLE_ROW, buildCsvTemplate } from "@/lib/domain/bulkUploadFormatSpec";
import { parseCSV, mapCsvRowToSubmissionFields } from "@/lib/domain/csvParser";

describe("buildCsvTemplate", () => {
  it("produces a header row matching the format spec column order, plus one example row", () => {
    const csv = buildCsvTemplate();
    const { headers, rows } = parseCSV(csv);
    const expectedNames = BULK_UPLOAD_FORMAT_SPEC.csvColumns.map((c) => c.name);
    expect(headers).toEqual(expectedNames);
    expect(rows).toHaveLength(1);
    for (const name of expectedNames) {
      expect(rows[0][name]).toBe(EXAMPLE_ROW[name] ?? "");
    }
  });

  it("the example row passes CSV row validation (modulo the image filename match)", () => {
    const csv = buildCsvTemplate();
    const { rows } = parseCSV(csv);
    const { errors } = mapCsvRowToSubmissionFields(rows[0]);
    expect(errors).toEqual([]);
  });
});
