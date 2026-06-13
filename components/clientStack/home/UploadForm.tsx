"use client";
import React, { useState, useRef, useEffect } from "react";
import Button from "@/components/ui/Button";
import SecondaryButton from "@/components/ui/SecondaryButton";
import ImageAnnotator from "@/components/ui/ImageAnnotator";
import Modal from "@/components/ui/Modal";
import Spinner from "@/components/ui/Spinner";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { COUNTRIES } from "@/lib/data/countries";
import US_STATES from "@/lib/data/usStates.json";
import { ChecklistItem, getChecklistItems } from "@/lib/data/checklistData";
import SectionTitle from "@/components/ui/SectionTitle";
import { TYPE_FIELD_CONFIG, EXTRA_FIELD_DB_COLUMNS, UNITS_WITH_FL_OZ_REMAINDER } from "@/lib/domain/labelAnalysis";
import { useLabelAssessment } from "@/lib/domain/useLabelAssessment";
import { convertPdfFiles } from "@/lib/domain/pdfToImage";
import { TYPE_DESIGNATIONS, ALCOHOL_UNITS, NET_CONTENTS_UNITS } from "@/lib/constants/units";

const FL_OZ_PER_ML = 1 / 29.5735;
const FL_OZ_PER_UNIT: Record<string, number> = { "Fl. Oz": 1, Pint: 16, Quart: 32, Gallon: 128, mL: FL_OZ_PER_ML, L: FL_OZ_PER_ML * 1000 };

// flags net-content combinations that should be expressed using a larger unit
// (e.g. 32 Fl. Oz must be entered as 1 Quart, or 1000 mL as 1 L) or an
// out-of-range Fl. Oz remainder. Metric values are allowed so long as they
// equate to the nearest tenth of a fluid ounce, which any decimal value does.
function validateNetContents(value: string, unit: string, secondary: string): string | null {
  const v = parseFloat(value);
  if (!value || isNaN(v) || v <= 0) return null;

  if (unit === "Fl. Oz") {
    for (const biggerUnit of ["Gallon", "Quart", "Pint"]) {
      const factor = FL_OZ_PER_UNIT[biggerUnit];
      if (v >= factor && v % factor === 0) {
        const qty = v / factor;
        return `${v} Fl. Oz must be expressed as ${qty} ${biggerUnit}${qty !== 1 ? "s" : ""} instead.`;
      }
    }
    return null;
  }

  if (unit === "mL") {
    if (v >= 1000 && v % 1000 === 0) {
      const qty = v / 1000;
      return `${v} mL must be expressed as ${qty} L instead.`;
    }
    // 27 CFR 4.72: contents under 1 liter are stated in whole milliliters
    if (v % 1 !== 0) {
      return "mL must be a whole number (under 1 liter is stated in whole mL).";
    }
    return null;
  }

  if (unit === "L") {
    // 27 CFR 4.72: contents under 1 liter must be stated in mL, not L
    if (v < 1) {
      return "Net contents under 1 liter must be stated in mL, not L.";
    }
    // ...and 1 liter or more is stated to the nearest hundredth of a liter
    const rounded = Math.round(v * 100) / 100;
    if (Math.abs(v - rounded) > 1e-9) {
      return "L must be accurate to the nearest hundredth of a liter (e.g. 1.75 L).";
    }
    return null;
  }

  const sec = secondary === "" ? 0 : parseFloat(secondary);
  if (!isNaN(sec) && (sec < 0 || sec >= 16)) {
    return "Fl. Oz portion must be between 0 and 15.";
  }
  return null;
}

// small "(i)" button shown next to a field label; opens a modal with the
// regulatory citation/description for that field, if any is available for
// the currently selected Class/Type designation
function InfoButton({ items, onOpen }: { items: ChecklistItem[]; onOpen: (items: ChecklistItem[]) => void }) {
  if (items.length === 0) return null;
  // intentionally a <span>, not a <button>: <button> is a "labelable" element,
  // so when this sits inside a <label> the browser implicitly associates the
  // label with it - clicking anywhere in the label (even empty space next to
  // the icon) would forward the click here and pop the info modal
  return (
    <span
      role="button"
      tabIndex={0}
      className="info-icon"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpen(items); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onOpen(items);
        }
      }}
      aria-label="Show regulatory information"
      title="Show regulatory information"
    >
      i
    </span>
  );
}

const EXTRA_FIELD_META: Record<string, { label: string; placeholder?: string }> = {
  ageStatement: { label: 'Age statement', placeholder: 'e.g. Aged 4 years' },
  colorDisclosure: { label: 'Color additive / ingredient disclosure' },
  sulfiteAspartame: { label: 'Sulfite and aspartame declarations' },
  sulfiteDeclaration: { label: 'Sulfite declaration', placeholder: 'e.g. Contains Sulfites' },
  commodityStatement: { label: 'Commodity statement' },
  appellationOfOrigin: { label: 'Appellation of origin' },
  percentageForeignWine: { label: '% foreign wine', placeholder: 'e.g. Made with 100% Foreign Wine' },
};

const MAX_IMAGES = 10;

export default function UploadForm({ onSubmit, initialData, viewOnly }: { onSubmit?: (data: any) => void; initialData?: any; viewOnly?: boolean }) {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [brand, setBrand] = useState("");
  const [typeDesignation, setTypeDesignation] = useState("");
  const [alcoholContent, setAlcoholContent] = useState("");
  const [alcoholUnit, setAlcoholUnit] = useState(ALCOHOL_UNITS[0]);
  const [infoModalItems, setInfoModalItems] = useState<ChecklistItem[] | null>(null);
  const [netContents, setNetContents] = useState("");
  const [netContentsUnit, setNetContentsUnit] = useState(NET_CONTENTS_UNITS[0]);
  const [netContentsSecondary, setNetContentsSecondary] = useState("");
  const [producer, setProducer] = useState("");
  const [producerCity, setProducerCity] = useState("");
  const [producerState, setProducerState] = useState("");
  const [country, setCountry] = useState("");
  const [isImported, setIsImported] = useState(false);
  const [extraFields, setExtraFields] = useState<Record<string, string>>({});
  const [extraApplicable, setExtraApplicable] = useState<Record<string, boolean>>({});
  const [showModal, setShowModal] = useState(false);
  const [modalText, setModalText] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [step, setStep] = useState<number>(0); // 0: text, 1: image, 2: checklist

  // append newly chosen photos to the batch; resets analysis state since the
  // set of images being checked has changed
  const addFiles = async (newFiles: File[]) => {
    if (newFiles.length === 0) return;
    if (files.length >= MAX_IMAGES) {
      setModalText(`A maximum of ${MAX_IMAGES} images can be uploaded per application.`);
      setShowModal(true);
      return;
    }
    const room = MAX_IMAGES - files.length;
    const toAdd = await convertPdfFiles(newFiles.slice(0, room));
    if (toAdd.length < newFiles.length) {
      setModalText(`Only ${room} more image(s) could be added — a maximum of ${MAX_IMAGES} images is allowed per application.`);
      setShowModal(true);
    }
    const newPreviews = toAdd.map((f) => URL.createObjectURL(f));
    setFiles((prev) => {
      const combined = [...prev, ...toAdd];
      setActiveImageIndex(combined.length - toAdd.length);
      return combined;
    });
    setPreviews((prev) => [...prev, ...newPreviews]);
    // adding/removing photos invalidates any previous analysis results
    resetAnalysis();
  };

  const removeFile = (index: number) => {
    setPreviews((prev) => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setActiveImageIndex((prev) => {
      if (index < prev) return prev - 1;
      if (index === prev) return 0;
      return prev;
    });
    if (inputRef.current) inputRef.current.value = "";
    resetAnalysis();
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(e.target.files ? Array.from(e.target.files) : []);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    addFiles(e.dataTransfer.files ? Array.from(e.dataTransfer.files) : []);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const clear = () => {
    previews.forEach((url) => URL.revokeObjectURL(url));
    setFiles([]);
    setPreviews([]);
    setActiveImageIndex(0);
    setBrand("");
    setTypeDesignation("");
    setAlcoholContent("");
    setAlcoholUnit(ALCOHOL_UNITS[0]);
    setNetContents("");
    setNetContentsUnit(NET_CONTENTS_UNITS[0]);
    setNetContentsSecondary("");
    setProducer("");
    setProducerCity("");
    setProducerState("");
    setCountry("");
    setIsImported(false);
    setExtraFields({});
    setExtraApplicable({});
    if (inputRef.current) inputRef.current.value = "";
  };

  const [netContentsError, setNetContentsError] = useState<string | null>(null);
  useEffect(() => {
    setNetContentsError(validateNetContents(netContents, netContentsUnit, netContentsSecondary));
  }, [netContents, netContentsUnit, netContentsSecondary]);

  // builds the value used for OCR-matching and submission, e.g. "1 Pint 2 Fl. Oz"
  const netContentsDisplay = () => {
    if (!netContents) return '';
    if (!UNITS_WITH_FL_OZ_REMAINDER.includes(netContentsUnit)) return `${netContents} ${netContentsUnit}`;
    const sec = netContentsSecondary && Number(netContentsSecondary) > 0 ? ` ${netContentsSecondary} Fl. Oz` : '';
    return `${netContents} ${netContentsUnit}${sec}`;
  };

  // the set of extra Class/Type-specific fields currently in play: always-required
  // ones for this type, plus any "if applicable" ones the user has checked
  const getActiveExtraInputs = (): Record<string, string> => {
    const cfg = TYPE_FIELD_CONFIG[typeDesignation] || { required: [], applicable: [] };
    const out: Record<string, string> = {};
    [...cfg.required, ...cfg.applicable.filter((k) => extraApplicable[k])].forEach((k) => {
      out[k] = extraFields[k] || '';
    });
    return out;
  };

  // country is excluded: it's manually entered and rarely printed on the
  // label itself, so it's carried over from the form rather than OCR-validated
  const activeExtraInputs = getActiveExtraInputs();
  const fieldInputs = {
    brand, typeDesignation, alcohol: alcoholContent ? `${alcoholContent}%` : '', net: netContentsDisplay(), producer,
    ...activeExtraInputs,
  };
  const fieldKeys = ['brand', 'typeDesignation', 'alcohol', 'net', 'producer', ...Object.keys(activeExtraInputs)];

  const {
    assessmentScore,
    setAssessmentScore,
    fieldMatches,
    setFieldMatches,
    ocrConfidence,
    setOcrConfidence,
    checkStatus,
    setCheckStatus,
    runningChecks,
    analysisComplete,
    setAnalysisComplete,
    assessing,
    ocrLoading,
    isBlurry,
    setIsBlurry,
    hasFlash,
    setHasFlash,
    annotRef,
    resetAnalysis,
    runOpenCVOnBlob,
    runAllChecks,
  } = useLabelAssessment({
    viewOnly,
    files,
    fieldInputs,
    fieldKeys,
    onWarning: (text) => { setModalText(text); setShowModal(true); },
    onStepChange: setStep,
  });

  // populate the form from a saved submission for read-only viewing
  useEffect(() => {
    if (!initialData) return;
    setBrand(initialData.brand || "");
    setTypeDesignation(initialData.type_designation || "");
    setAlcoholContent(initialData.alcohol_content || "");
    setAlcoholUnit(initialData.alcohol_unit || ALCOHOL_UNITS[0]);
    setNetContents(initialData.net_contents || "");
    setNetContentsUnit(initialData.net_contents_unit || NET_CONTENTS_UNITS[0]);
    setNetContentsSecondary(initialData.net_contents_secondary || "");
    setProducer(initialData.producer || "");
    setProducerCity(initialData.producer_city || "");
    setProducerState(initialData.producer_state || "");
    setCountry(initialData.country || "");
    setIsImported(initialData.is_imported === 'Yes');

    const newExtraFields: Record<string, string> = {};
    const newExtraApplicable: Record<string, boolean> = {};
    Object.entries(EXTRA_FIELD_DB_COLUMNS).forEach(([key, col]) => {
      const val = initialData[col];
      if (val) {
        newExtraFields[key] = val;
        newExtraApplicable[key] = true;
      }
    });
    setExtraFields(newExtraFields);
    setExtraApplicable(newExtraApplicable);

    const urls: string[] = Array.isArray(initialData.image_urls) && initialData.image_urls.length > 0
      ? initialData.image_urls
      : (initialData.image_url ? [initialData.image_url] : []);
    if (urls.length > 0) {
      Promise.all(urls.map((url) =>
        fetch(url)
          .then((res) => res.blob())
          .then((blob) => {
            const name = url.split('/').pop() || 'label.jpg';
            return new File([blob], name, { type: blob.type });
          })
      ))
        .then((loadedFiles) => {
          // set files/previews directly rather than via addFiles, which
          // resets analysis state (isBlurry/hasFlash/checkStatus/etc.) as
          // if brand-new photos were chosen - that would clobber the
          // stored assessment results we just populated below
          setFiles(loadedFiles);
          setPreviews(loadedFiles.map((f) => URL.createObjectURL(f)));
        })
        .catch((err) => console.error('Failed to load saved image(s):', err));
    }

    // populate read-only assessment results from the stored assessment row
    setAssessmentScore(
      initialData.assessment_score === null || initialData.assessment_score === undefined
        ? null
        : initialData.assessment_score
    );
    setFieldMatches(initialData.assessment_field_matches || {});
    setIsBlurry(initialData.assessment_blurry ?? null);
    setHasFlash(initialData.assessment_flash ?? null);
    const conf = initialData.assessment_ocr_confidence;
    setOcrConfidence(typeof conf === 'number' ? conf : null);
    const boolStatus = (v: boolean | null | undefined): 'idle' | 'ok' | 'fail' =>
      v === null || v === undefined ? 'idle' : (v ? 'ok' : 'fail');
    setCheckStatus({
      warningPresent: boolStatus(initialData.assessment_warning_present),
      surgeonGeneral: boolStatus(initialData.assessment_surgeon_general),
      ocrConfidence: typeof conf === 'number' ? (conf >= 70 ? 'ok' : 'fail') : 'idle',
    });
    setAnalysisComplete(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
  };

  const submitForm = async () => {
    // server assigns a TTB-style numeric ID
    const formData = new FormData();
    formData.append("brand", brand);
    formData.append("typeDesignation", typeDesignation);
    formData.append("alcoholContent", alcoholContent);
    formData.append("alcoholUnit", alcoholUnit);
    formData.append("netContents", netContents);
    formData.append("netContentsUnit", netContentsUnit);
    formData.append("netContentsSecondary", netContentsSecondary);
    formData.append("producer", producer);
    formData.append("producerCity", producerCity);
    formData.append("producerState", producerState);
    formData.append("country", isImported ? country : '');
    formData.append("isImported", isImported ? 'Yes' : 'No');
    formData.append("warning", checkStatus['warningPresent'] === 'ok' ? 'Yes' : 'No');
    formData.append("assessmentScore", assessmentScore === null ? '' : String(assessmentScore));
    formData.append("blurry", isBlurry === null ? '' : String(isBlurry));
    formData.append("flash", hasFlash === null ? '' : String(hasFlash));
    formData.append("warningPresent", checkStatus['warningPresent'] === 'ok' ? 'true' : 'false');
    formData.append("surgeonGeneral", checkStatus['surgeonGeneral'] === 'ok' ? 'true' : 'false');
    formData.append("ocrConfidence", ocrConfidence === null ? '' : String(ocrConfidence));
    formData.append("fieldMatches", JSON.stringify(fieldMatches));
    // additional Class/Type-specific label fields (age statement, sulfite
    // declarations, appellation of origin, etc.) - only send ones that apply
    const typeConfig = TYPE_FIELD_CONFIG[typeDesignation] || { required: [], applicable: [] };
    [...typeConfig.required, ...typeConfig.applicable.filter((k) => extraApplicable[k])].forEach((key) => {
      formData.append(key, extraFields[key] || '');
    });
    files.forEach((f) => formData.append("files", f));

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/submissions", { method: "POST", body: formData });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const saved = await res.json();
      onSubmit?.(saved);
      clear();
    } catch (err) {
      console.error("Failed to submit form:", err);
      setModalText('Failed to submit form. Please try again.');
      setShowModal(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const typeConfig = TYPE_FIELD_CONFIG[typeDesignation] || { required: [], applicable: [] };

  const allFieldsFilled = [brand, typeDesignation, alcoholContent, netContents, producer, producerCity, producerState].every(v => (v || '').toString().trim().length > 0)
    && !netContentsError
    && (!isImported || country.trim().length > 0)
    && typeConfig.required.every((k) => (extraFields[k] || '').trim().length > 0)
    && typeConfig.applicable.every((k) => !extraApplicable[k] || (extraFields[k] || '').trim().length > 0);

  return (
    <form onSubmit={handleSubmit} className="form-split">
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', justifyContent: step === 1 ? 'center' : (step === 0 ? 'center' : 'flex-start'), gridColumn: '1 / -1', width: '100%' }}>
        {step === 1 && (
        <div style={{ flex: '0 1 auto', minWidth: 320, position: 'relative' }}>
          {/* Image / upload panel (step 1) */}
          <span className="required-asterisk" style={{ position: 'absolute', top: 0, right: 0, fontSize: 20 }}>*</span>
          <SectionTitle>Upload Image</SectionTitle>
          <div style={{ position: 'relative', minHeight: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="upload-area" style={{ position: 'relative', width: 420, maxWidth: 420, margin: '0 auto', textAlign: 'center' }} onDrop={onDrop} onDragOver={onDragOver}>
                {previews.length > 0 ? (
                  <ImageAnnotator ref={annotRef} src={previews[activeImageIndex]} onRecognize={(blob) => runOpenCVOnBlob(blob)} />
                ) : (
                  <div style={{ textAlign: "center" }}>
                    <div className="upload-drop">Drop an image here or</div>
                  </div>
                )}
                {previews.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                    {previews.map((src, i) => (
                      <div
                        key={i}
                        onClick={() => setActiveImageIndex(i)}
                        style={{
                          position: 'relative',
                          width: 64,
                          height: 64,
                          borderRadius: 6,
                          overflow: 'hidden',
                          border: i === activeImageIndex ? '2px solid #0b5fff' : '2px solid transparent',
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                      >
                        <img src={src} alt={`Photo ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        {!viewOnly && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                            aria-label={`Remove photo ${i + 1}`}
                            style={{
                              position: 'absolute', top: 2, right: 2, width: 18, height: 18, lineHeight: '16px',
                              borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff',
                              fontSize: 12, cursor: 'pointer', padding: 0,
                            }}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                  {!viewOnly && files.length < MAX_IMAGES && (
                    <>
                      <input ref={inputRef} type="file" accept="image/*,application/pdf" multiple onChange={onFileChange} style={{ display: 'none' }} />
                      <div style={{ marginTop: 10, display: "flex", gap: 8, justifyContent: 'center' }}>
                        <Button type="button" variant="secondary" onClick={() => { if (inputRef.current) inputRef.current.click(); }}>
                          {previews.length > 0 ? 'Add more photos' : 'Upload file(s)'}
                        </Button>
                      </div>
                    </>
                  )}
                  {!viewOnly && files.length >= MAX_IMAGES && (
                    <p className="text-sm" style={{ color: "#555", marginTop: 10 }}>
                      Maximum of {MAX_IMAGES} images reached.
                    </p>
                  )}
                {ocrLoading && (
                  <div style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.6)', zIndex: 50 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <svg width="40" height="40" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="50" cy="50" r="35" stroke="#e6e6e6" strokeWidth="10" fill="none" />
                        <path d="M50 15 a35 35 0 0 1 0 70" stroke="#0b5fff" strokeWidth="10" strokeLinecap="round" fill="none">
                          <animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="1s" repeatCount="indefinite" />
                        </path>
                      </svg>
                      <div style={{ fontSize: 14, color: '#111' }}>Processing image…</div>
                    </div>
                  </div>
                )}
              </div>
          </div>
        </div>
        )}

        {step !== 1 && (
        <div style={{ flex: step === 0 ? '0 1 480px' : 1, minWidth: 320 }}>
          {/* Text fields panel (step 0) */}
          <div style={{ transition: 'all 280ms ease', minHeight: 220 }}>
            {step === 0 && (
              <div className="fields-area">
                <SectionTitle>Label Information</SectionTitle>

                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                </div>

                <h4 style={{ margin: "0", fontSize: 14, fontWeight: 700, color: "#000" }}>General Information</h4>

                <div className="field-row">
                  <label className="field-label">Brand name <span className="required-asterisk">*</span><InfoButton items={getChecklistItems(typeDesignation, 'brand')} onOpen={setInfoModalItems} /></label>
                  <input required disabled={viewOnly} className="field-input" value={brand} onChange={(e) => setBrand(e.target.value)} />
                </div>

                <div className="field-row">
                  <label className="field-label">Class / Type designation <span className="required-asterisk">*</span><InfoButton items={getChecklistItems(typeDesignation, 'typeDesignation')} onOpen={setInfoModalItems} /></label>
                  <SearchableSelect
                    required
                    disabled={viewOnly}
                    className="field-input"
                    value={typeDesignation}
                    onChange={setTypeDesignation}
                    placeholder="Search for a type…"
                    options={TYPE_DESIGNATIONS}
                  />
                </div>

                <div className="field-row">
                  <label className="field-label">Alcohol content <span className="required-asterisk">*</span><InfoButton items={getChecklistItems(typeDesignation, 'alcoholContent')} onOpen={setInfoModalItems} /></label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      required
                      disabled={viewOnly}
                      className="field-input"
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      inputMode="decimal"
                      value={alcoholContent}
                      onChange={(e) => setAlcoholContent(e.target.value)}
                      placeholder="e.g. 5"
                    />
                    <span>%</span>
                    <select
                      disabled={viewOnly}
                      className="field-input"
                      value={alcoholUnit}
                      onChange={(e) => setAlcoholUnit(e.target.value)}
                    >
                      {ALCOHOL_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>

                <div className="field-row">
                  <label className="field-label">Net contents <span className="required-asterisk">*</span><InfoButton items={getChecklistItems(typeDesignation, 'netContents')} onOpen={setInfoModalItems} /></label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <input
                      required
                      disabled={viewOnly}
                      className="field-input"
                      type="number"
                      min="0"
                      step={netContentsUnit === "mL" ? "1" : (netContentsUnit === "L" ? "0.01" : "0.1")}
                      inputMode="decimal"
                      value={netContents}
                      onChange={(e) => setNetContents(e.target.value)}
                      placeholder="e.g. 1"
                      style={{ width: 90 }}
                    />
                    <select
                      disabled={viewOnly}
                      className="field-input"
                      value={netContentsUnit}
                      onChange={(e) => setNetContentsUnit(e.target.value)}
                    >
                      {NET_CONTENTS_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                    {UNITS_WITH_FL_OZ_REMAINDER.includes(netContentsUnit) && (
                      <>
                        <input
                          disabled={viewOnly}
                          className="field-input"
                          type="number"
                          min="0"
                          max="15"
                          step="1"
                          inputMode="numeric"
                          value={netContentsSecondary}
                          onChange={(e) => setNetContentsSecondary(e.target.value)}
                          placeholder="0"
                          style={{ width: 90 }}
                        />
                        <span>Fl. Oz</span>
                      </>
                    )}
                  </div>
                  {netContentsError && (
                    <span style={{ color: '#ef4444', fontSize: 12 }}>{netContentsError}</span>
                  )}
                </div>

                <h4 style={{ margin: "8px 0 0", fontSize: 14, fontWeight: 700, color: "#000" }}>Bottler / Producer</h4>

                <div className="field-row">
                  <label className="field-label">Name <span className="required-asterisk">*</span><InfoButton items={getChecklistItems(typeDesignation, 'producer')} onOpen={setInfoModalItems} /></label>
                  <input required disabled={viewOnly} className="field-input" value={producer} onChange={(e) => setProducer(e.target.value)} />
                </div>

                <div className="field-row">
                  <label className="field-label">City <span className="required-asterisk">*</span></label>
                  <input required disabled={viewOnly} className="field-input" value={producerCity} onChange={(e) => setProducerCity(e.target.value)} />
                </div>

                <div className="field-row">
                  <label className="field-label">State <span className="required-asterisk">*</span></label>
                  <SearchableSelect
                    required
                    disabled={viewOnly}
                    className="field-input"
                    value={producerState}
                    onChange={setProducerState}
                    placeholder="Search for a state…"
                    options={US_STATES}
                  />
                </div>

                {typeDesignation && (typeConfig.required.length > 0 || typeConfig.applicable.length > 0) && (
                  <h4 style={{ margin: "8px 0 0", fontSize: 14, fontWeight: 700, color: "#000" }}>{typeDesignation} Specific Information</h4>
                )}

                {typeConfig.required.map((key) => {
                  const meta = EXTRA_FIELD_META[key];
                  return (
                    <div className="field-row" key={key}>
                      <label className="field-label">{meta.label} <span className="required-asterisk">*</span><InfoButton items={getChecklistItems(typeDesignation, key)} onOpen={setInfoModalItems} /></label>
                      <input
                        required
                        disabled={viewOnly}
                        className="field-input"
                        value={extraFields[key] || ''}
                        onChange={(e) => setExtraFields((s) => ({ ...s, [key]: e.target.value }))}
                        placeholder={meta.placeholder}
                      />
                    </div>
                  );
                })}

                {typeConfig.applicable.map((key) => {
                  const meta = EXTRA_FIELD_META[key];
                  const applicable = !!extraApplicable[key];

                  return (
                    <div className="field-row" key={key}>
                      <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input
                          type="checkbox"
                          disabled={viewOnly}
                          checked={applicable}
                          onChange={(e) => setExtraApplicable((s) => ({ ...s, [key]: e.target.checked }))}
                        />
                        {meta.label} (if applicable){applicable && <span className="required-asterisk">*</span>}
                        <InfoButton items={getChecklistItems(typeDesignation, key)} onOpen={setInfoModalItems} />
                      </label>
                      {applicable && (
                        <input
                          required
                          disabled={viewOnly}
                          className="field-input"
                          value={extraFields[key] || ''}
                          onChange={(e) => setExtraFields((s) => ({ ...s, [key]: e.target.value }))}
                          placeholder={meta.placeholder}
                        />
                      )}
                    </div>
                  );
                })}

                <div className="field-row">
                  <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="checkbox"
                      disabled={viewOnly}
                      checked={isImported}
                      onChange={(e) => setIsImported(e.target.checked)}
                    />
                    Imported product?
                  </label>
                </div>

                {isImported && (
                  <div className="field-row">
                    <label className="field-label">Country of origin (imports) <span className="required-asterisk">*</span><InfoButton items={getChecklistItems(typeDesignation, 'country')} onOpen={setInfoModalItems} /></label>
                    <SearchableSelect
                      required
                      disabled={viewOnly}
                      className="field-input"
                      value={country}
                      onChange={setCountry}
                      placeholder="Search for a country…"
                      options={COUNTRIES}
                    />
                  </div>
                )}

                {/* Navigation for the wizard lives below (Prev/Next) - submit/clear only shown on last step */}
              </div>
            )}

            {/* Checklist panel (step 2) */}
            {step === 2 && (
              <div style={{ padding: 8 }}>
                <h4 style={{ marginTop: 0 }}>{viewOnly ? 'Assessment Results' : 'Checks & Assessment'}</h4>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  <li style={{ marginBottom: 8 }}>
                    <strong>Checking image quality:</strong>
                    <div style={{ marginLeft: 10 }}>
                      {(() => {
                        const st = checkStatus['blurry'] ?? (isBlurry === null ? 'idle' : (isBlurry ? 'fail' : 'ok'));
                        return (
                          <div className="check-item">
                            <span className={`status-icon ${st === 'idle' ? 'status-no' : (st === 'ok' ? 'status-true' : (st === 'running' ? 'status-no' : 'status-false'))}`}>
                              {st === 'running' ? (
                                <svg width="12" height="12" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="white" strokeWidth="3" strokeOpacity="0.3" fill="none"/><path d="M22 12a10 10 0 0 1-10 10" stroke="white" strokeWidth="3" strokeLinecap="round" fill="none"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></path></svg>
                              ) : (st === 'ok' ? '✓' : (st === 'fail' ? '✖' : '–'))}
                            </span>
                            <strong>Blurry photo:</strong> {st === 'idle' ? 'Not analyzed' : (st === 'running' ? 'Analyzing…' : (st === 'fail' ? 'Likely blurry' : 'Looks sharp'))}
                          </div>
                        );
                      })()}

                      {(() => {
                        const st = checkStatus['flash'] ?? (hasFlash === null ? 'idle' : (hasFlash ? 'fail' : 'ok'));
                        return (
                          <div className="check-item">
                            <span className={`status-icon ${st === 'idle' ? 'status-no' : (st === 'ok' ? 'status-true' : (st === 'running' ? 'status-no' : 'status-false'))}`}>
                              {st === 'running' ? (
                                <svg width="12" height="12" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="white" strokeWidth="3" strokeOpacity="0.3" fill="none"/><path d="M22 12a10 10 0 0 1-10 10" stroke="white" strokeWidth="3" strokeLinecap="round" fill="none"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></path></svg>
                              ) : (st === 'ok' ? '✓' : (st === 'fail' ? '✖' : '–'))}
                            </span>
                            <strong>Flash detected:</strong> {st === 'idle' ? 'Not analyzed' : (st === 'running' ? 'Analyzing…' : (st === 'fail' ? 'Flash / bright highlights present' : 'No obvious flash'))}
                          </div>
                        );
                      })()}
                    </div>
                  </li>

                  <li style={{ marginBottom: 8 }}>
                    <strong>Checking fields:</strong>
                    <div style={{ marginLeft: 10 }}>
                      {['brand','typeDesignation','alcohol','net','producer', ...Object.keys(getActiveExtraInputs())].map((k) => {
                        const running = checkStatus[k] === 'running';
                        const status = checkStatus[k] ?? (fieldMatches[k] === 'no-input' ? 'idle' : (fieldMatches[k] === true ? 'ok' : (fieldMatches[k] === false ? 'fail' : 'idle')));
                        const label = k === 'net' ? 'Net contents' : (k === 'alcohol' ? 'Alcohol content' : (k === 'typeDesignation' ? 'Class / Type designation' : (k === 'brand' ? 'Brand name' : (k === 'producer' ? 'Producer' : (EXTRA_FIELD_META[k]?.label || k)))));
                        const statusText = status === 'idle' ? 'No input / no OCR' : (status === 'ok' ? 'Matched' : (status === 'running' ? 'Analyzing…' : 'Not matched'));
                        const cls = status === 'idle' ? 'status-no' : (status === 'ok' ? 'status-true' : 'status-false');
                        const icon = status === 'idle' ? '–' : (status === 'ok' ? '✓' : '✖');
                        return (
                          <div className="check-item" key={k}>
                            <span className={`status-icon ${cls}`}>
                              {running ? (
                                <svg width="12" height="12" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="white" strokeWidth="3" strokeOpacity="0.3" fill="none"/><path d="M22 12a10 10 0 0 1-10 10" stroke="white" strokeWidth="3" strokeLinecap="round" fill="none"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></path></svg>
                              ) : icon}
                            </span>
                            <strong>{label}:</strong> {statusText}
                          </div>
                        );
                      })}
                    </div>
                  </li>

                  <li style={{ marginBottom: 8 }}>
                    <strong>Government Health Warning Present:</strong>
                    <div style={{ marginLeft: 10 }}>
                      {(() => {
                        const st = checkStatus['warningPresent'] ?? 'idle';
                        const statusText = st === 'idle'
                          ? 'Not analyzed'
                          : (st === 'running'
                            ? 'Analyzing…'
                            : (st === 'ok' ? 'Reads exactly "GOVERNMENT WARNING"' : 'Missing or misspelled - must read exactly "GOVERNMENT WARNING"'));
                        const cls = st === 'idle' ? 'status-no' : (st === 'ok' ? 'status-true' : (st === 'running' ? 'status-no' : 'status-false'));
                        return (
                          <div className="check-item">
                            <span className={`status-icon ${cls}`}>
                              {st === 'running' ? (
                                <svg width="12" height="12" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="white" strokeWidth="3" strokeOpacity="0.3" fill="none"/><path d="M22 12a10 10 0 0 1-10 10" stroke="white" strokeWidth="3" strokeLinecap="round" fill="none"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></path></svg>
                              ) : (st === 'idle' ? '–' : (st === 'ok' ? '✓' : '✖'))}
                            </span>
                            {statusText}
                          </div>
                        );
                      })()}
                    </div>
                  </li>

                  <li style={{ marginBottom: 8 }}>
                    <strong>Surgeon General text:</strong>
                    <div style={{ marginLeft: 10 }}>
                      {(() => {
                        const st = checkStatus['surgeonGeneral'] ?? 'idle';
                        const statusText = st === 'idle'
                          ? 'Not analyzed'
                          : (st === 'running'
                            ? 'Analyzing…'
                            : (st === 'ok' ? 'Reads exactly "Surgeon General"' : 'Missing or misspelled - must read exactly "Surgeon General"'));
                        const cls = st === 'idle' ? 'status-no' : (st === 'ok' ? 'status-true' : (st === 'running' ? 'status-no' : 'status-false'));
                        return (
                          <div className="check-item">
                            <span className={`status-icon ${cls}`}>
                              {st === 'running' ? (
                                <svg width="12" height="12" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="white" strokeWidth="3" strokeOpacity="0.3" fill="none"/><path d="M22 12a10 10 0 0 1-10 10" stroke="white" strokeWidth="3" strokeLinecap="round" fill="none"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></path></svg>
                              ) : (st === 'idle' ? '–' : (st === 'ok' ? '✓' : '✖'))}
                            </span>
                            {statusText}
                          </div>
                        );
                      })()}
                    </div>
                  </li>

                  <li style={{ marginBottom: 8 }}>
                    <strong>OCR confidence:</strong>
                    <div style={{ marginLeft: 10 }}>
                      {(() => {
                        const st = checkStatus['ocrConfidence'] ?? 'idle';
                        const statusText = st === 'idle'
                          ? 'Not analyzed'
                          : (st === 'running'
                            ? 'Analyzing…'
                            : (st === 'ok' ? `Good (${ocrConfidence}%)` : `Low (${ocrConfidence}%) — review parsed fields manually`));
                        const cls = st === 'idle' ? 'status-no' : (st === 'ok' ? 'status-true' : (st === 'running' ? 'status-no' : 'status-false'));
                        return (
                          <div className="check-item">
                            <span className={`status-icon ${cls}`}>
                              {st === 'running' ? (
                                <svg width="12" height="12" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="white" strokeWidth="3" strokeOpacity="0.3" fill="none"/><path d="M22 12a10 10 0 0 1-10 10" stroke="white" strokeWidth="3" strokeLinecap="round" fill="none"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></path></svg>
                              ) : (st === 'idle' ? '–' : (st === 'ok' ? '✓' : '✖'))}
                            </span>
                            {statusText}
                          </div>
                        );
                      })()}
                    </div>
                  </li>

                  <li style={{ marginBottom: 8 }}>
                    <strong>Overall assessment score:</strong> {assessing ? 'Assessing…' : (assessmentScore === null ? 'N/A' : `${assessmentScore}%`)}
                  </li>
                </ul>
              </div>
            )}

            {/* Wizard navigation moved to bottom bar */}
          </div>
        </div>
        )}
      </div>
      {/* Bottom navigation centered beneath component */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14, gridColumn: '1 / -1', width: '100%' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center' }}>
          {step !== 0 && (
            <SecondaryButton
              type="button"
              onClick={(e) => { e.preventDefault(); setStep((s) => Math.max(0, s - 1)); }}
              disabled={runningChecks || isSubmitting}
            >
              Previous
            </SecondaryButton>
          )}
          {step === 2 ? (
            viewOnly ? null : (
            <Button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setShowConfirmModal(true);
              }}
              disabled={!analysisComplete || runningChecks || isBlurry === true || hasFlash === true || isSubmitting}
            >
              Save / Submit
            </Button>
            )
          ) : (
            <Button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                if (step === 1) {
                  if (viewOnly) setStep(2);
                  else runAllChecks();
                } else setStep((s) => Math.min(2, s + 1));
              }}
              disabled={(step === 0 && !allFieldsFilled) || (step === 1 && (files.length === 0 || runningChecks))}
            >
              {runningChecks ? 'Analyzing…' : 'Next'}
            </Button>
          )}
        </div>
      </div>
      {showModal && (
        <Modal onClose={() => setShowModal(false)}>
          <div style={{ padding: 8 }}>
            <h3 style={{ marginTop: 0 }}>Image Quality Warning</h3>
            <p style={{ color: '#333' }}>{modalText}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>Close</Button>
            </div>
          </div>
        </Modal>
      )}
      {isSubmitting && (
        <Modal>
          <Spinner label="Submitting..." />
          <p style={{ textAlign: 'center', color: '#555', fontSize: 13, marginTop: 8 }}>
            Please don't close this window or browser.
          </p>
        </Modal>
      )}
      {showConfirmModal && (
        <Modal onClose={() => setShowConfirmModal(false)}>
          <div style={{ padding: 8 }}>
            <h3 style={{ marginTop: 0, fontWeight: 'bold' }}>Confirm Submission</h3>
            <p style={{ color: '#333' }}>By clicking "Submit", you confirm that all information provided is accurate and complete. Any items which have mismatched or missing information may result in the application being rejected.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <Button type="button" variant="secondary" onClick={() => setShowConfirmModal(false)}>Decline</Button>
              <Button type="button" onClick={() => { setShowConfirmModal(false); submitForm(); }}>Submit</Button>
            </div>
          </div>
        </Modal>
      )}
      {infoModalItems && (
        <Modal onClose={() => setInfoModalItems(null)}>
          <div style={{ padding: 8 }}>
            {infoModalItems.map((item, idx) => (
              <div key={item.mandatory_item_name} style={{ marginTop: idx === 0 ? 0 : 16, paddingTop: idx === 0 ? 0 : 16, borderTop: idx === 0 ? 'none' : '1px solid #eee' }}>
                <h3 style={{ marginTop: 0 }}>{item.mandatory_item_name}</h3>
                <p style={{ color: '#333' }}>{item.description}</p>
                <p style={{ color: '#555', fontSize: 13 }}><strong>Citation:</strong> {item.regulatory_citation}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                  {item.link_to_citation.map((link) => (
                    <a key={link} href={link} target="_blank" rel="noopener noreferrer">{link}</a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </form>
  );
}
