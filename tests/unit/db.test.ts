import { describe, it, expect } from "vitest";
import { generateSubmissionId, assignReviewer, generateCertificateNumber } from "@/app/api/submissions/db";
import { EMPLOYEES } from "@/lib/data/employees";

describe("generateSubmissionId", () => {
  it("returns a 14-digit numeric string starting with the 2-digit filing year", () => {
    const id = generateSubmissionId();
    expect(id).toMatch(/^\d{14}$/);
    const currentYear = new Date().getFullYear().toString().slice(-2);
    expect(id.slice(0, 2)).toBe(currentYear);
  });

  it("generates different IDs across calls (extremely unlikely to collide)", () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateSubmissionId()));
    expect(ids.size).toBeGreaterThan(1);
  });
});

describe("assignReviewer", () => {
  it("always returns a valid employee ID from the roster", () => {
    for (let i = 0; i < 20; i++) {
      expect(EMPLOYEES.map((e) => e.id)).toContain(assignReviewer());
    }
  });
});

describe("generateCertificateNumber", () => {
  it("returns a TTB-XXXXX-XXXXX style certificate number", () => {
    const cert = generateCertificateNumber();
    expect(cert).toMatch(/^TTB-[A-Z0-9]{5}-[A-Z0-9]{5}$/);
    // omits easily-confused characters
    expect(cert).not.toMatch(/[01OI]/);
  });
});
