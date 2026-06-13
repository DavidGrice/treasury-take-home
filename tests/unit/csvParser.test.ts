import { describe, it, expect } from "vitest";
import { parseCSV, mapCsvRowToSubmissionFields } from "@/lib/domain/csvParser";

describe("parseCSV", () => {
  it("parses headers and rows", () => {
    const csv = "a,b,c\n1,2,3\n4,5,6\n";
    const { headers, rows } = parseCSV(csv);
    expect(headers).toEqual(["a", "b", "c"]);
    expect(rows).toEqual([
      { a: "1", b: "2", c: "3" },
      { a: "4", b: "5", c: "6" },
    ]);
  });

  it("handles quoted fields with embedded commas and escaped quotes", () => {
    const csv = 'name,note\n"Acme, Inc.","She said ""hi"""\n';
    const { rows } = parseCSV(csv);
    expect(rows).toEqual([{ name: "Acme, Inc.", note: 'She said "hi"' }]);
  });

  it("handles CRLF line endings and a leading BOM", () => {
    const csv = "﻿a,b\r\n1,2\r\n";
    const { headers, rows } = parseCSV(csv);
    expect(headers).toEqual(["a", "b"]);
    expect(rows).toEqual([{ a: "1", b: "2" }]);
  });

  it("drops trailing blank lines and returns empty result for empty input", () => {
    const csv = "a,b\n1,2\n\n";
    const { rows } = parseCSV(csv);
    expect(rows).toEqual([{ a: "1", b: "2" }]);

    expect(parseCSV("")).toEqual({ headers: [], rows: [] });
  });
});

describe("mapCsvRowToSubmissionFields", () => {
  const validRow: Record<string, string> = {
    image: "front.jpg",
    brand: "Example Brand",
    type_designation: "Malt Beverage",
    alcohol_content: "5.0",
    alcohol_unit: "Alc./Vol.",
    net_contents: "12",
    net_contents_unit: "Fl. Oz",
    net_contents_secondary: "",
    producer: "Example Producer",
    producer_city: "Anytown",
    producer_state: "California",
    is_imported: "No",
    country: "",
  };

  it("accepts a fully valid row with no errors", () => {
    const { values, images, errors } = mapCsvRowToSubmissionFields(validRow);
    expect(errors).toEqual([]);
    expect(images).toEqual(["front.jpg"]);
    expect(values.brand).toBe("Example Brand");
    expect(values.producer_city).toBe("Anytown");
    expect(values.producer_state).toBe("California");
  });

  it("supports multiple semicolon-separated images, up to the max", () => {
    const { images, errors } = mapCsvRowToSubmissionFields({ ...validRow, image: "a.jpg;b.jpg" });
    expect(errors).toEqual([]);
    expect(images).toEqual(["a.jpg", "b.jpg"]);
  });

  it("flags missing required fields", () => {
    const { errors } = mapCsvRowToSubmissionFields({ ...validRow, brand: "", producer_city: "", producer_state: "" });
    expect(errors).toContain("Missing required field: brand");
    expect(errors).toContain("Missing required field: producer_city");
    expect(errors).toContain("Missing required field: producer_state");
  });

  it("rejects an invalid producer_state not in the US states list", () => {
    const { errors } = mapCsvRowToSubmissionFields({ ...validRow, producer_state: "Atlantis" });
    expect(errors.some((e) => e.includes('Invalid producer_state "Atlantis"'))).toBe(true);
  });

  it("rejects an invalid type_designation", () => {
    const { errors } = mapCsvRowToSubmissionFields({ ...validRow, type_designation: "Beer" });
    expect(errors.some((e) => e.includes("Invalid type_designation"))).toBe(true);
  });

  it("requires country when is_imported = Yes, and clears country otherwise", () => {
    const missingCountry = mapCsvRowToSubmissionFields({ ...validRow, is_imported: "Yes", country: "" });
    expect(missingCountry.errors).toContain("Missing required field: country (required when is_imported = Yes)");

    const domestic = mapCsvRowToSubmissionFields({ ...validRow, is_imported: "No", country: "Canada" });
    expect(domestic.values.country).toBe("");
  });

  it("requires age_statement for Distilled Spirits", () => {
    const { errors } = mapCsvRowToSubmissionFields({ ...validRow, type_designation: "Distilled Spirits", age_statement: "" });
    expect(errors).toContain("Missing required field: age_statement (required for Distilled Spirits)");
  });

  it("flags too many images per row", () => {
    const tooMany = Array.from({ length: 11 }, (_, i) => `img${i}.jpg`).join(";");
    const { errors } = mapCsvRowToSubmissionFields({ ...validRow, image: tooMany });
    expect(errors.some((e) => e.includes("Too many images"))).toBe(true);
  });
});
