"use client";

import React, { useState } from "react";
import Button from "@/components/ui/Button";
import SectionTitle from "@/components/ui/SectionTitle";
import EditableFieldRow from "@/components/ui/EditableFieldRow";
import UnitFieldRow from "@/components/ui/UnitFieldRow";
import ImageGallery from "@/components/ui/ImageGallery";
import {
  computeFieldMatches,
  computeAssessmentScore,
  buildFieldMatchInputs,
  TYPE_FIELD_CONFIG,
  EXTRA_FIELD_DB_COLUMNS,
  type FieldMatches,
} from "@/lib/domain/labelAnalysis";
import { TYPE_DESIGNATIONS, ALCOHOL_UNITS, NET_CONTENTS_UNITS } from "@/lib/constants/units";
import { SUBMISSION_STATUSES } from "@/lib/constants/statuses";

const FIELD_LABELS: Record<string, string> = {
  brand: "Brand", typeDesignation: "Class / Type designation", alcohol: "Alcohol content", net: "Net contents", producer: "Producer",
  ageStatement: "Age statement", colorDisclosure: "Color additive / ingredient disclosure",
  sulfiteAspartame: "Sulfite and aspartame declarations", sulfiteDeclaration: "Sulfite declaration",
  commodityStatement: "Commodity statement", appellationOfOrigin: "Appellation of origin",
  percentageForeignWine: "% foreign wine",
};

// lightweight correction form for "Batch Needs Review" rows: lets a reviewer
// fix field values, recompute matches against the stored OCR text (no
// re-running OCR), and resubmit to the gov queue
export default function BatchCorrectionForm({ row, onDone }: { row: any; onDone: () => void }) {
  const [fields, setFields] = useState<Record<string, string>>({
    brand: row.brand || "",
    type_designation: row.type_designation || "",
    alcohol_content: row.alcohol_content || "",
    alcohol_unit: row.alcohol_unit || ALCOHOL_UNITS[0],
    net_contents: row.net_contents || "",
    net_contents_unit: row.net_contents_unit || NET_CONTENTS_UNITS[0],
    net_contents_secondary: row.net_contents_secondary || "",
    producer: row.producer || "",
    country: row.country || "",
    age_statement: row.age_statement || "",
    color_disclosure: row.color_disclosure || "",
    sulfite_aspartame: row.sulfite_aspartame || "",
    sulfite_declaration: row.sulfite_declaration || "",
    commodity_statement: row.commodity_statement || "",
    appellation_of_origin: row.appellation_of_origin || "",
    percentage_foreign_wine: row.percentage_foreign_wine || "",
  });
  const [fieldMatches, setFieldMatches] = useState<FieldMatches>(row.assessment_field_matches || {});
  const [score, setScore] = useState<number | null>(row.assessment_score ?? null);
  const [saving, setSaving] = useState(false);

  const ocrRaw: string = row.assessment_ocr_raw || "";
  const typeConfig = TYPE_FIELD_CONFIG[fields.type_designation] || { required: [], applicable: [] };

  const setField = (key: string, value: string) => setFields((f) => ({ ...f, [key]: value }));

  const recompute = () => {
    const inputs = buildFieldMatchInputs(fields);
    const { fm, matches, total } = computeFieldMatches(ocrRaw, inputs);
    const newScore = computeAssessmentScore(matches, total);
    setFieldMatches(fm);
    setScore(newScore);
    return { fm, score: newScore };
  };

  const resubmit = async () => {
    setSaving(true);
    try {
      const { fm, score: newScore } = recompute();
      await fetch(`/api/submissions/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: SUBMISSION_STATUSES.SUBMITTED,
          fields,
          assessment: { score: newScore, fieldMatches: fm },
        }),
      });
      onDone();
    } finally {
      setSaving(false);
    }
  };

  // extra Class/Type-specific fields applicable to this row's type
  const activeExtraKeys = [...typeConfig.required, ...typeConfig.applicable];

  return (
    <div style={{ width: "100%" }}>
      <SectionTitle>Correct &amp; Resubmit — {row.id}</SectionTitle>

      <div style={{ marginBottom: 12 }}>
        <ImageGallery
          imageUrls={Array.isArray(row.image_urls) && row.image_urls.length > 0 ? row.image_urls : (row.image_url ? [row.image_url] : [])}
          enlargeable
        />
      </div>

      <div style={{ textAlign: "center", marginBottom: 16, fontSize: 18 }}>
        Score: <strong>{score === null ? "N/A" : `${score}%`}</strong>
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto" }}>

      <EditableFieldRow label="Brand" matchStatus={fieldMatches.brand}>
        <input className="input" style={{ flex: 1, maxWidth: 480 }} value={fields.brand} onChange={(e) => setField("brand", e.target.value)} />
      </EditableFieldRow>

      <EditableFieldRow label="Class / Type designation" matchStatus={fieldMatches.typeDesignation}>
        <select className="input" style={{ flex: 1, maxWidth: 480 }} value={fields.type_designation} onChange={(e) => setField("type_designation", e.target.value)}>
          {TYPE_DESIGNATIONS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </EditableFieldRow>

      <UnitFieldRow
        label="Alcohol content"
        value={fields.alcohol_content}
        onChange={(v) => setField("alcohol_content", v)}
        unitValue={fields.alcohol_unit}
        unitOptions={ALCOHOL_UNITS}
        onUnitChange={(v) => setField("alcohol_unit", v)}
        matchStatus={fieldMatches.alcohol}
        percent
      />

      <UnitFieldRow
        label="Net contents"
        value={fields.net_contents}
        onChange={(v) => setField("net_contents", v)}
        unitValue={fields.net_contents_unit}
        unitOptions={NET_CONTENTS_UNITS}
        onUnitChange={(v) => setField("net_contents_unit", v)}
        matchStatus={fieldMatches.net}
        extra={["Pint", "Quart", "Gallon"].includes(fields.net_contents_unit) && (
          <>
            <input className="input" style={{ width: 90 }} value={fields.net_contents_secondary} onChange={(e) => setField("net_contents_secondary", e.target.value)} />
            <span>Fl. Oz</span>
          </>
        )}
      />

      <EditableFieldRow label="Producer" matchStatus={fieldMatches.producer}>
        <input className="input" style={{ flex: 1, maxWidth: 480 }} value={fields.producer} onChange={(e) => setField("producer", e.target.value)} />
      </EditableFieldRow>

      <div className="form-row">
        <label className="text-sm">Country of origin</label>
        <input className="input" style={{ maxWidth: 480 }} value={fields.country} onChange={(e) => setField("country", e.target.value)} />
      </div>

      {activeExtraKeys.map((key) => {
        const dbCol = EXTRA_FIELD_DB_COLUMNS[key];
        return (
          <EditableFieldRow key={key} label={FIELD_LABELS[key] || key} matchStatus={fieldMatches[key]}>
            <input className="input" style={{ flex: 1, maxWidth: 480 }} value={fields[dbCol] || ""} onChange={(e) => setField(dbCol, e.target.value)} />
          </EditableFieldRow>
        );
      })}

      <details style={{ marginTop: 12 }}>
        <summary className="text-sm" style={{ cursor: "pointer", display: "inline-block", width: "fit-content" }}>OCR text (read-only)</summary>
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, background: "#f9fafb", border: "1px solid #eee", borderRadius: 6, padding: 8, maxHeight: 160, overflowY: "auto" }}>
          {ocrRaw || "(no OCR text)"}
        </pre>
      </details>

      <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
        <Button onClick={resubmit} disabled={saving}>{saving ? "Resubmitting..." : "Resubmit"}</Button>
      </div>

      </div>
    </div>
  );
}
