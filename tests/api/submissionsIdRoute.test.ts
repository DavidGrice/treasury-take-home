import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// `@vercel/postgres`'s `sql` is used both as a tagged template
// (`sql\`...\``) and as a plain function with a `.query(text, params)`
// method. We mock both forms; `sql.query` records calls so tests can assert
// on the generated SQL/params, while the tagged-template form just resolves
// to an empty result (it's used for ensureTable/ensureHistoryTables DDL and
// for the final DELETE statements, none of which we need to inspect here).
const queryMock = vi.fn(async (text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number }> => {
  void text;
  void params;
  return { rows: [], rowCount: 0 };
});
const sqlTemplateMock = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
  void strings;
  void values;
  return { rows: [], rowCount: 1 };
});
const sqlMock = sqlTemplateMock as typeof sqlTemplateMock & { query: typeof queryMock };
sqlMock.query = queryMock;

vi.mock("@vercel/postgres", () => ({ sql: sqlMock }));

// import after the mock is registered
const { PATCH } = await import("@/app/api/submissions/[id]/route");

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/submissions/123", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const baseRow = {
  id: "26000000000001",
  brand: "Bud Light",
  type_designation: "Malt Beverage",
  alcohol_content: "4.2",
  net_contents: "12",
  producer: "Anheuser-Busch, Inc.",
  country: "",
  warning: "GOVERNMENT WARNING...",
  assessment_score: 90,
  image_url: "/uploads/img.jpg",
  image_urls: ["/uploads/img.jpg"],
  status: "Submitted",
  submitted_at: "2026-01-01T00:00:00.000Z",
  is_imported: "No",
  producer_city: "St. Louis",
  producer_state: "Missouri",
  age_statement: null,
  color_disclosure: null,
  sulfite_aspartame: null,
  sulfite_declaration: null,
  commodity_statement: null,
  appellation_of_origin: null,
  percentage_foreign_wine: null,
  alcohol_unit: "Alc./Vol.",
  net_contents_unit: "Fl. Oz",
  net_contents_secondary: null,
  assessment_blurry: false,
  assessment_flash: false,
  assessment_warning_present: true,
  assessment_surgeon_general: true,
  assessment_ocr_confidence: 95,
  assessment_field_matches: { brand: true },
  assigned_to: "TTB-10234",
  batch_id: null,
};

beforeEach(() => {
  queryMock.mockReset();
  sqlMock.mockReset();
  sqlMock.mockResolvedValue({ rows: [], rowCount: 1 });
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("PATCH /api/submissions/[id]", () => {
  it("rejects an invalid status", async () => {
    const res = await PATCH(makeRequest({ status: "Bogus" }), { params: Promise.resolve({ id: "123" }) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid status" });
  });

  it("returns 404 when the submission does not exist", async () => {
    queryMock.mockImplementation(async (text: string) => {
      if (text.includes("WHERE s.id = $1")) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    });

    const res = await PATCH(makeRequest({ status: "Approved" }), { params: Promise.resolve({ id: "123" }) });
    expect(res.status).toBe(404);
  });

  it("approves a submission: moves it to approved_submissions with all fields (incl. producer_city/state) and stamps a certificate number", async () => {
    queryMock.mockImplementation(async (text: string) => {
      if (text.includes("WHERE s.id = $1")) return { rows: [baseRow], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    const res = await PATCH(makeRequest({ status: "Approved" }), { params: Promise.resolve({ id: baseRow.id }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("Approved");
    expect(json.certificate_number).toMatch(/^TTB-[A-Z0-9]{5}-[A-Z0-9]{5}$/);
    expect(json.decided_by).toBe(baseRow.assigned_to);

    // the INSERT into approved_submissions carries producer_city/producer_state through
    const insertCall = queryMock.mock.calls.find(([text]) => text.includes("INSERT INTO approved_submissions"));
    expect(insertCall).toBeDefined();
    const [insertText, insertParams] = insertCall!;
    const cityIdx = insertText.indexOf("producer_city");
    const stateIdx = insertText.indexOf("producer_state");
    expect(cityIdx).toBeGreaterThan(-1);
    expect(stateIdx).toBeGreaterThan(cityIdx);
    expect(insertParams).toContain(baseRow.producer_city);
    expect(insertParams).toContain(baseRow.producer_state);

    // active queue rows are removed via tagged-template DELETEs
    const deleteCalls = sqlMock.mock.calls.filter(([strings]) => strings.join("").includes("DELETE FROM"));
    expect(deleteCalls.length).toBe(2);
  });

  it("rejects a submission: stores rejection reasons/comment and moves it to rejected_submissions", async () => {
    queryMock.mockImplementation(async (text: string) => {
      if (text.includes("WHERE s.id = $1")) return { rows: [baseRow], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    const res = await PATCH(
      makeRequest({ status: "Rejected", rejectionReasons: ["Blurry image"], rejectionComment: "Please retake the photo." }),
      { params: Promise.resolve({ id: baseRow.id }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("Rejected");
    expect(json.rejection_reasons).toEqual(["Blurry image"]);
    expect(json.rejection_comment).toBe("Please retake the photo.");

    const insertCall = queryMock.mock.calls.find(([text]) => text.includes("INSERT INTO rejected_submissions"));
    expect(insertCall).toBeDefined();
    const [, insertParams] = insertCall!;
    expect(insertParams).toContain(JSON.stringify(["Blurry image"]));
    expect(insertParams).toContain("Please retake the photo.");
  });

  it("resubmitting from 'Batch Needs Review' only applies corrections for allowlisted fields", async () => {
    queryMock.mockImplementation(async (text: string) => {
      if (text.includes("WHERE s.id = $1")) return { rows: [{ ...baseRow, status: "Batch Needs Review" }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    await PATCH(
      makeRequest({
        status: "Submitted",
        fields: { producer_city: "Chicago", producer_state: "Illinois", id: "hacked-id", status: "Approved" },
      }),
      { params: Promise.resolve({ id: baseRow.id }) }
    );

    const updateCall = queryMock.mock.calls.find(([text]) => /^UPDATE submissions SET/.test(text));
    expect(updateCall).toBeDefined();
    const [updateText, updateParams] = updateCall!;
    expect(updateText).toContain("producer_city = $1");
    expect(updateText).toContain("producer_state = $2");
    // disallowed keys are never interpolated into the SET clause
    expect(updateText).not.toContain("id = $1");
    expect(updateText).not.toContain("id = $2");
    expect(updateText).not.toContain("status =");
    expect(updateParams).toEqual(["Chicago", "Illinois", baseRow.id]);
  });
});
