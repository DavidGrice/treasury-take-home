"use client";

import React, { useState } from "react";
import Button from "./Button";
import SectionTitle from "./SectionTitle";
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

// per-field match badge - 'no-input' fields (nothing to compare yet) show nothing
function MatchBadge({ status }: { status: boolean | 'no-input' | undefined }) {
  if (status === undefined || status === 'no-input') return null;
  return (
    <span style={{ flexShrink: 0, fontSize: 12, whiteSpace: "nowrap", color: status ? '#166534' : '#991b1b' }}>
      {status ? '✓ matched' : '✗ not found'}
    </span>
  );
}

// shared layout for "value + unit dropdown" rows (alcohol content, net
// contents) - mirrors UploadForm's single-row pattern: one label, then one
// inline row of controls (value, optional "%", unit dropdown, optional
// secondary field), with a trailing match badge
function UnitFieldRow({
  label, value, onChange, unitValue, unitOptions, onUnitChange, matchStatus, percent, extra,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  unitValue: string;
  unitOptions: string[];
  onUnitChange: (value: string) => void;
  matchStatus: boolean | 'no-input' | undefined;
  percent?: boolean;
  extra?: React.ReactNode;
}) {
  return (
    <div className="form-row">
      <label className="text-sm">{label}</label>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <input className="input" style={{ width: 90 }} value={value} onChange={(e) => onChange(e.target.value)} />
        {percent && <span>%</span>}
        <select className="input" value={unitValue} onChange={(e) => onUnitChange(e.target.value)}>
          {unitOptions.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        {extra}
        <MatchBadge status={matchStatus} />
      </div>
    </div>
  );
}

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

      {row.image_url && (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <img src={row.image_url} alt="label" style={{ maxWidth: "100%", maxHeight: 240, objectFit: "contain", marginBottom: 12, border: "1px solid #eee" }} />
        </div>
      )}

      <div style={{ textAlign: "center", marginBottom: 16, fontSize: 18 }}>
        Score: <strong>{score === null ? "N/A" : `${score}%`}</strong>
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto" }}>

      <div className="form-row">
        <label className="text-sm">Brand</label>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input className="input" style={{ flex: 1, maxWidth: 480 }} value={fields.brand} onChange={(e) => setField("brand", e.target.value)} />
          <MatchBadge status={fieldMatches.brand} />
        </div>
      </div>

      <div className="form-row">
        <label className="text-sm">Class / Type designation</label>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <select className="input" style={{ flex: 1, maxWidth: 480 }} value={fields.type_designation} onChange={(e) => setField("type_designation", e.target.value)}>
            {TYPE_DESIGNATIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <MatchBadge status={fieldMatches.typeDesignation} />
        </div>
      </div>

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

      <div className="form-row">
        <label className="text-sm">Producer</label>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input className="input" style={{ flex: 1, maxWidth: 480 }} value={fields.producer} onChange={(e) => setField("producer", e.target.value)} />
          <MatchBadge status={fieldMatches.producer} />
        </div>
      </div>

      <div className="form-row">
        <label className="text-sm">Country of origin</label>
        <input className="input" style={{ maxWidth: 480 }} value={fields.country} onChange={(e) => setField("country", e.target.value)} />
      </div>

      {activeExtraKeys.map((key) => {
        const dbCol = EXTRA_FIELD_DB_COLUMNS[key];
        return (
          <div className="form-row" key={key}>
            <label className="text-sm">{FIELD_LABELS[key] || key}</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input className="input" style={{ flex: 1, maxWidth: 480 }} value={fields[dbCol] || ""} onChange={(e) => setField(dbCol, e.target.value)} />
              <MatchBadge status={fieldMatches[key]} />
            </div>
          </div>
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
