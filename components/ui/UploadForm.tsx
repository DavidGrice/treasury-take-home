"use client";
import React, { useState, useRef, useEffect } from "react";
import Button from "./Button";
import ImageAnnotator from "./ImageAnnotator";
import Modal from "./Modal";
import SearchableSelect from "./SearchableSelect";
import { COUNTRIES } from "./countries";
import wineChecklist from "../../api/wine_checklist_information.json";
import maltBeverageChecklist from "../../api/malt_beverage_checklist_information.json";
import distilledSpiritsChecklist from "../../api/distilled_spirits_checklist_information.json";

const TYPE_DESIGNATIONS = ["Malt Beverage", "Wine", "Distilled Spirits"];

const ALCOHOL_UNITS = ["Alc./Vol.", "Alc./Wt."];

const NET_CONTENTS_UNITS = ["Fl. Oz", "Pint", "Quart", "Gallon", "mL", "L"];
const FL_OZ_PER_ML = 1 / 29.5735;
const FL_OZ_PER_UNIT: Record<string, number> = { "Fl. Oz": 1, Pint: 16, Quart: 32, Gallon: 128, mL: FL_OZ_PER_ML, L: FL_OZ_PER_ML * 1000 };

// units that take a secondary "X Fl. Oz" remainder (metric units are a single value)
const UNITS_WITH_FL_OZ_REMAINDER = ["Pint", "Quart", "Gallon"];

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

type ChecklistItem = {
  mandatory_item_name: string;
  description: string;
  regulatory_citation: string;
  link_to_citation: string[];
};

// per-Class/Type reference data (TTB mandatory labeling information), keyed
// to match TYPE_DESIGNATIONS above
const CHECKLIST_DATA: Record<string, ChecklistItem[]> = {
  Wine: wineChecklist,
  'Malt Beverage': maltBeverageChecklist,
  Beer: maltBeverageChecklist,
  'Distilled Spirits': distilledSpiritsChecklist,
};

// maps each form field to the corresponding mandatory_item_name entry/entries
// in CHECKLIST_DATA for the current Class/Type designation
const CHECKLIST_FIELD_MAP: Record<string, Record<string, string[]>> = {
  Wine: {
    brand: ['Brand Name'],
    typeDesignation: ['Designation Class/Type or Statement of Composition'],
    alcoholContent: ['Alcohol Content'],
    netContents: ['Net Contents'],
    producer: ['Name and Address'],
    country: ['Country of Origin (imported products only)'],
    colorDisclosure: ['FD&C Yellow No. 5 Declaration', 'Cochineal Extract or Carmine Declaration'],
    sulfiteDeclaration: ['Sulfite Declaration'],
    appellationOfOrigin: ['Appellation of Origin'],
    percentageForeignWine: ['Percentage of Foreign Wine'],
  },
  'Malt Beverage': {
    brand: ['Brand Name'],
    typeDesignation: ['Designation Class/Type', 'Other Designation (Distinctive or Fanciful Name with Statement of Composition)'],
    alcoholContent: ['Alcohol Content (alc. % by volume)', 'Alcohol by Weight'],
    netContents: ['Net Contents'],
    producer: ['Name and Address (domestic, wholly fermented in US)', 'Name and Address (imported products only)'],
    country: ['Country of Origin (imported products only)'],
    colorDisclosure: ['FD&C Yellow No. 5 Declaration', 'Cochineal Extract or Carmine Declaration'],
    sulfiteAspartame: ['Sulfite Declaration', 'Aspartame Declaration'],
  },
  'Distilled Spirits': {
    brand: ['Brand Name'],
    typeDesignation: ['Designation Class/Type or Distinctive/Fanciful Name with Statement of Composition'],
    alcoholContent: ['Alcohol Content'],
    netContents: ['Net Contents'],
    producer: ['Name and Address (domestic/imported as applicable)'],
    country: ['Country of Origin (imported products only)'],
    ageStatement: ['Statement of Age'],
    colorDisclosure: ['Presence of Coloring Materials', 'FD&C Yellow No. 5 Declaration', 'Cochineal Extract or Carmine Declaration'],
    commodityStatement: ['Commodity Statements (Presence of Neutral Spirits / Commodity of Distillation)', 'State of Distillation'],
  },
};
CHECKLIST_FIELD_MAP.Beer = CHECKLIST_FIELD_MAP['Malt Beverage'];

const getChecklistItems = (typeDesignation: string, fieldKey: string): ChecklistItem[] => {
  const data = CHECKLIST_DATA[typeDesignation];
  const names = CHECKLIST_FIELD_MAP[typeDesignation]?.[fieldKey];
  if (!data || !names) return [];
  return names
    .map((name) => data.find((item) => item.mandatory_item_name === name))
    .filter((item): item is ChecklistItem => !!item);
};

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

// label fields that vary by Class/Type designation (per TTB labeling rules).
// "required" fields are always shown for that type; "applicable" fields are
// shown behind a checkbox since they only apply in certain circumstances.
const TYPE_FIELD_CONFIG: Record<string, { required: string[]; applicable: string[] }> = {
  Beer: { required: [], applicable: ['colorDisclosure', 'sulfiteAspartame'] },
  'Malt Beverage': { required: [], applicable: ['colorDisclosure', 'sulfiteAspartame'] },
  'Distilled Spirits': { required: ['ageStatement'], applicable: ['colorDisclosure', 'commodityStatement'] },
  Wine: { required: ['sulfiteDeclaration'], applicable: ['colorDisclosure', 'appellationOfOrigin', 'percentageForeignWine'] },
};

const EXTRA_FIELD_META: Record<string, { label: string; placeholder?: string }> = {
  ageStatement: { label: 'Age statement', placeholder: 'e.g. Aged 4 years' },
  colorDisclosure: { label: 'Color additive / ingredient disclosure' },
  sulfiteAspartame: { label: 'Sulfite and aspartame declarations' },
  sulfiteDeclaration: { label: 'Sulfite declaration', placeholder: 'e.g. Contains Sulfites' },
  commodityStatement: { label: 'Commodity statement' },
  appellationOfOrigin: { label: 'Appellation of origin' },
  percentageForeignWine: { label: '% foreign wine', placeholder: 'e.g. Made with 100% Foreign Wine' },
};

// maps the camelCase extra field keys above to their snake_case DB columns
const EXTRA_FIELD_DB_COLUMNS: Record<string, string> = {
  ageStatement: 'age_statement',
  colorDisclosure: 'color_disclosure',
  sulfiteAspartame: 'sulfite_aspartame',
  sulfiteDeclaration: 'sulfite_declaration',
  commodityStatement: 'commodity_statement',
  appellationOfOrigin: 'appellation_of_origin',
  percentageForeignWine: 'percentage_foreign_wine',
};

export default function UploadForm({ onSubmit, initialData, viewOnly }: { onSubmit?: (data: any) => void; initialData?: any; viewOnly?: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [brand, setBrand] = useState("");
  const [typeDesignation, setTypeDesignation] = useState("");
  const [alcoholContent, setAlcoholContent] = useState("");
  const [alcoholUnit, setAlcoholUnit] = useState(ALCOHOL_UNITS[0]);
  const [infoModalItems, setInfoModalItems] = useState<ChecklistItem[] | null>(null);
  const [netContents, setNetContents] = useState("");
  const [netContentsUnit, setNetContentsUnit] = useState(NET_CONTENTS_UNITS[0]);
  const [netContentsSecondary, setNetContentsSecondary] = useState("");
  const [producer, setProducer] = useState("");
  const [country, setCountry] = useState("");
  const [isImported, setIsImported] = useState(false);
  const [extraFields, setExtraFields] = useState<Record<string, string>>({});
  const [extraApplicable, setExtraApplicable] = useState<Record<string, boolean>>({});
  const [parsedFields, setParsedFields] = useState<any>(null);
  const [ocrRaw, setOcrRaw] = useState<string>('');
  const [assessmentScore, setAssessmentScore] = useState<number | null>(null);
  const [fieldMatches, setFieldMatches] = useState<Record<string, boolean | 'no-input'>>({});
  const [showModal, setShowModal] = useState(false);
  const [modalText, setModalText] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const annotRef = useRef<any>(null);
  const [step, setStep] = useState<number>(0); // 0: text, 1: image, 2: checklist

  // checklist state
  const [isBlurry, setIsBlurry] = useState<boolean | null>(null);
  const [hasFlash, setHasFlash] = useState<boolean | null>(null);

  const handleFile = (f: File | null) => {
    setFile(f);
    if (f) {
      const url = URL.createObjectURL(f);
      setPreview(url);
      // replacing the photo invalidates any previous analysis results
      setIsBlurry(null);
      setHasFlash(null);
      setCheckStatus({});
      setAnalysisComplete(false);
      setOcrConfidence(null);
      // preview only; analysis will run when user clicks Next from the image step
    }
    else setPreview(null);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files ? e.target.files[0] : null;
    handleFile(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const clear = () => {
    setFile(null);
    setPreview(null);
    setBrand("");
    setTypeDesignation("");
    setAlcoholContent("");
    setAlcoholUnit(ALCOHOL_UNITS[0]);
    setNetContents("");
    setNetContentsUnit(NET_CONTENTS_UNITS[0]);
    setNetContentsSecondary("");
    setProducer("");
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

    if (initialData.image_url) {
      fetch(initialData.image_url)
        .then((res) => res.blob())
        .then((blob) => {
          const name = initialData.image_url.split('/').pop() || 'label.jpg';
          const f = new File([blob], name, { type: blob.type });
          // set file/preview directly rather than via handleFile, which
          // resets analysis state (isBlurry/hasFlash/checkStatus/etc.) as
          // if a brand-new photo were chosen - that would clobber the
          // stored assessment results we just populated below
          setFile(f);
          setPreview(URL.createObjectURL(f));
        })
        .catch((err) => console.error('Failed to load saved image:', err));
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
    const id = crypto.randomUUID();
    const formData = new FormData();
    formData.append("id", id);
    formData.append("brand", brand);
    formData.append("typeDesignation", typeDesignation);
    formData.append("alcoholContent", alcoholContent);
    formData.append("alcoholUnit", alcoholUnit);
    formData.append("netContents", netContents);
    formData.append("netContentsUnit", netContentsUnit);
    formData.append("netContentsSecondary", netContentsSecondary);
    formData.append("producer", producer);
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
    if (file) formData.append("file", file);

    try {
      const res = await fetch("/api/submissions", { method: "POST", body: formData });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const saved = await res.json();
      console.log("Submitted:", saved);
      onSubmit?.(saved);
      clear();
    } catch (err) {
      console.error("Failed to submit form:", err);
      setModalText('Failed to submit form. Please try again.');
      setShowModal(true);
    }
  };

  const [ocrLoading, setOcrLoading] = useState(false);
  const parseOCRText = (text: string) => {
    // keep parser in case we add OCR later; for now return empty structured fields
    return {
      brand: '',
      typeDesignation: '',
      alcoholContent: '',
      netContents: '',
      producer: '',
      country: '',
      warning: '',
    };
  };

  const runOpenCVOnBlob = async (blobLike: Blob | null) => {
    if (!blobLike) return alert('No image selected');
    setOcrLoading(true);
    let worker: Worker | null = null;
    let finalParsed: any = null;
    addLog('runOpenCVOnBlob: starting OpenCV worker');
    try {
      // try worker first (served from /public/opencv-worker.js)
      worker = new Worker('/opencv-worker.js');
      const bmp = await createImageBitmap(blobLike);

      const result = await new Promise<{ found?: number; blob?: Blob; rects?: any[] }>((res, rej) => {
        const t = setTimeout(() => rej(new Error('Worker timeout')), 15000);
        worker!.onmessage = (ev) => {
          clearTimeout(t);
          const data = ev.data;
          if (data.type === 'result') res({ found: data.found, blob: data.blob, rects: data.rects });
          else if (data.type === 'error') rej(new Error(data.message || 'worker error'));
        };
        worker!.postMessage({ type: 'process', bitmap: bmp }, [bmp]);
      });

      if (result.blob) {
        // keep original preview (do not replace with annotated image)
        addLog(`OpenCV worker rects: ${JSON.stringify(result.rects || [])}`);
        // run OCR on each rect, parse and log structured fields
        if (result.rects && result.rects.length > 0) {
            try {
              addLog('runOpenCVOnBlob: sending rects to OCR worker');
              const ocrResults = await runOCROnRects(blobLike, result.rects);
              const parsed = parseFromRects(ocrResults || []);
              console.log('Parsed fields:', parsed);
              finalParsed = parsed || {};
              setParsedFields(finalParsed);
              setOcrRaw(finalParsed?.raw || '');
              try { if (annotRef.current && typeof annotRef.current.clearBoxes === 'function') annotRef.current.clearBoxes(); } catch (e) {}
            } catch (e) { console.warn('OCR on rects failed', e); }
        }
      } else {
        throw new Error('No blob returned from worker');
      }
    } catch (err) {
      console.warn('Worker processing failed, falling back to main thread', err);
      // fallback: try main-thread approach but first downscale image to avoid freeze
      try {
        const img = await new Promise<HTMLImageElement>((res, rej) => {
          const i = new Image();
          i.onload = () => res(i);
          i.onerror = rej;
          i.src = URL.createObjectURL(blobLike);
        });
        const MAX = 1200;
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (Math.max(w, h) > MAX) {
          const scale = MAX / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, w, h);
        const imgData = ctx.getImageData(0, 0, w, h);

        const { loadOpenCV } = await import('./opencvLoader');
        const cv = await loadOpenCV();
        const src = cv.matFromImageData(imgData);
        const gray = new cv.Mat();
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        const blur = new cv.Mat();
        cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
        const thresh = new cv.Mat();
        cv.adaptiveThreshold(blur, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2);
        const contours = new cv.MatVector();
        const hierarchy = new cv.Mat();
        cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        ctx.strokeStyle = '#0b5fff';
        ctx.lineWidth = Math.max(2, Math.round(Math.min(w, h) / 300));
        let found = 0;
        const rects: any[] = [];
        for (let i = 0; i < contours.size(); i++) {
          const cnt = contours.get(i);
          const area = cv.contourArea(cnt);
          if (area < 500) { cnt.delete(); continue; }
          const rect = cv.boundingRect(cnt);
          ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
          rects.push({ x: rect.x, y: rect.y, width: rect.width, height: rect.height, area });
          found++;
          cnt.delete();
        }
        src.delete(); gray.delete(); blur.delete(); thresh.delete(); contours.delete(); hierarchy.delete();
        const canvasBlob: Blob | null = await new Promise((res) => canvas.toBlob((b) => res(b), 'image/png'));
        // do not replace preview with annotated canvas; keep original preview image
        console.log('OpenCV fallback rects:', rects);
        if (rects && rects.length > 0) {
          try {
            const ocrResults = await runOCROnRects(canvasBlob, rects);
            const parsed = parseFromRects(ocrResults || []);
            console.log('Parsed fields (fallback):', parsed);
            finalParsed = parsed || {};
            setParsedFields(finalParsed);
            setOcrRaw(finalParsed?.raw || '');
            try { if (annotRef.current && typeof annotRef.current.clearBoxes === 'function') annotRef.current.clearBoxes(); } catch (e) {}
          } catch (e) { console.warn('OCR on rects failed', e); }
        }
      } catch (err2) {
        console.error('Fallback main-thread processing failed', err2);
        alert('Image processing failed. See console for details.');
      }
    } finally {
      if (worker) worker.terminate();
      setOcrLoading(false);
    }

    return finalParsed;
  };

  const runOpenCVOnFile = async () => {
    if (!file) return alert('Please choose an image first');
    await runOpenCVOnBlob(file);
  };

  const runOCROnRects = async (blobLike: Blob | null, rects: any[]) => {
    if (!blobLike) return;
    try {
      addLog('Starting OCR worker');
      // prepare buffer to transfer
      const buffer = await (blobLike as Blob).arrayBuffer();
      const worker = new Worker('/ocr-worker.js');
      worker.postMessage({ type: 'ocr', buffer, rects }, [buffer]);
      const res = await new Promise<any>((res, rej) => {
        const t = setTimeout(() => rej(new Error('ocr worker timeout')), 120000);
        worker.onmessage = (ev) => {
          if (ev.data.type === 'log') addLog(ev.data.text);
          else if (ev.data.type === 'result') { clearTimeout(t); res(ev.data.results); }
          else if (ev.data.type === 'error') { clearTimeout(t); rej(new Error(ev.data.message)); }
        };
      });
      worker.terminate();
      addLog('OCR worker finished');
      return res;
    } catch (err) {
      addLog(`OCR worker failed: ${String(err)}`);
      console.warn('Tesseract import or OCR failed', err);
      alert('Text extraction failed. See console for details.');
    }
  };

  // analyze image for blur/flash heuristics using OpenCV when available
  const analyzeImageForChecklist = async (blobLike: Blob | null) => {
    if (!blobLike) return;
    try {
      const bmp = await createImageBitmap(blobLike as Blob);
      const canvas = document.createElement('canvas');
      canvas.width = bmp.width;
      canvas.height = bmp.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);

      // For backwards compatibility this function runs both checks
      // but the UI will call specific checks sequentially.
      // basic JS bright-spot heuristic (flash)
      let flashDetected: boolean | null = null;
      try {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;
        let bright = 0;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2];
          const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          if (lum > 240) bright++;
        }
        const brightRatio = bright / (canvas.width * canvas.height);
        flashDetected = brightRatio > 0.002; // if more than 0.2% pixels extremely bright
        setHasFlash(flashDetected);
      } catch (err) {
        setHasFlash(null);
        flashDetected = null;
      }

      // try OpenCV-based blur detection (variance of Laplacian)
      let blurryDetected: boolean | null = null;
      try {
        const { loadOpenCV } = await import('./opencvLoader');
        const cv = await loadOpenCV();
        const img = await createImageBitmap(blobLike as Blob);
        const tmp = document.createElement('canvas');
        tmp.width = img.width;
        tmp.height = img.height;
        const tctx = tmp.getContext('2d')!;
        tctx.drawImage(img, 0, 0);
        const imgData = tctx.getImageData(0, 0, tmp.width, tmp.height);
        const src = cv.matFromImageData(imgData);
        const gray = new cv.Mat();
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        const lap = new cv.Mat();
        cv.Laplacian(gray, lap, cv.CV_64F);
        const mean = new cv.Mat();
        const stddev = new cv.Mat();
        cv.meanStdDev(lap, mean, stddev);
        const variance = Math.pow(stddev.doubleAt(0, 0), 2);
        // lower variance -> blur; threshold chosen heuristically
        blurryDetected = variance < 100;
        setIsBlurry(blurryDetected);
        src.delete(); gray.delete(); lap.delete(); mean.delete(); stddev.delete();
      } catch (err) {
        console.warn('OpenCV blur check failed', err);
        setIsBlurry(null);
        blurryDetected = null;
      }

      return { blurryDetected, flashDetected };
    } catch (err) {
      console.warn('analyzeImageForChecklist failed', err);
      setIsBlurry(null); setHasFlash(null);
    }
  };

  // Run blur-only check (sequential UI)
  const analyzeBlurForChecklist = async (blobLike: Blob | null) => {
    if (!blobLike) return null;
    addLog('Starting blur check (worker)');
    try {
      const worker = new Worker('/opencv-worker.js');
      const bmp = await createImageBitmap(blobLike as Blob);
      worker.postMessage({ type: 'blurcheck', bitmap: bmp }, [bmp]);
      const res = await new Promise<any>((res, rej) => {
        const t = setTimeout(() => rej(new Error('blur worker timeout')), 20000);
        worker.onmessage = (ev) => {
          clearTimeout(t);
          if (ev.data.type === 'blurResult') res(ev.data.variance);
          else if (ev.data.type === 'error') rej(new Error(ev.data.message));
          else if (ev.data.type === 'log') addLog(ev.data.text);
        };
      });
      worker.terminate();
      addLog(`Blur variance: ${res}`);
      const blurryDetected = (typeof res === 'number') ? (res < 100) : null;
      setIsBlurry(blurryDetected);
      return blurryDetected;
    } catch (err) {
      addLog(`Blur check failed: ${String(err)}`);
      setIsBlurry(null);
      return null;
    }
  };

  // Run flash-only check (sequential UI)
  const analyzeFlashForChecklist = async (blobLike: Blob | null) => {
    if (!blobLike) return null;
    addLog('Starting flash check (worker)');
    try {
      const worker = new Worker('/opencv-worker.js');
      const bmp = await createImageBitmap(blobLike as Blob);
      worker.postMessage({ type: 'flashcheck', bitmap: bmp }, [bmp]);
      const res = await new Promise<any>((res, rej) => {
        const t = setTimeout(() => rej(new Error('flash worker timeout')), 20000);
        worker.onmessage = (ev) => {
          clearTimeout(t);
          if (ev.data.type === 'flashResult') res(ev.data);
          else if (ev.data.type === 'error') rej(new Error(ev.data.message));
          else if (ev.data.type === 'log') addLog(ev.data.text);
        };
      });
      worker.terminate();
      addLog(`Flash metrics: ${JSON.stringify(res)}`);
      // worker flags a flash when it finds a compact, roughly circular
      // saturated hotspot (radial falloff) away from the image edges -
      // large/even bright regions (e.g. white backgrounds) are ignored
      const flashDetected = typeof res === 'object' && typeof res.flashDetected === 'boolean' ? res.flashDetected : null;
      setHasFlash(flashDetected);
      return flashDetected;
    } catch (err) {
      addLog(`Flash check failed: ${String(err)}`);
      setHasFlash(null);
      return null;
    }
  };

  useEffect(() => {
    // when file removed, reset checklist
    // (skip in viewOnly: on mount `file` is still null until the saved image
    // finishes loading async, which would otherwise wipe out the stored
    // isBlurry/hasFlash results set by the initialData population effect)
    if (viewOnly) return;
    if (!file) {
      setIsBlurry(null); setHasFlash(null);
    }
  }, [file, viewOnly]);

  // don't auto-open modal; modal will be shown after orchestrated checks if needed

  // match each input field's value (treated as a regex, falling back to literal)
  // against the full raw OCR text. Inputs left blank are 'no-input'.
  const computeFieldMatches = (rawText: string, inputs: Record<string, string>) => {
    const raw = (rawText || '').trim();
    const fm: Record<string, boolean | 'no-input'> = {};
    let matches = 0;
    let total = 0;

    for (const [key, input] of Object.entries(inputs)) {
      const inVal = (input || '').trim();
      if (!inVal) {
        fm[key] = 'no-input';
        continue;
      }
      total++;
      // treat user input as regex; if invalid, fall back to literal match.
      // any whitespace in the input becomes optional (\s*) so OCR text that
      // drops/collapses spaces (e.g. "1PINT" vs "1 PINT") still matches.
      let ok = false;
      try {
        const re = new RegExp(inVal.replace(/\s+/g, '\\s*'), 'i');
        ok = re.test(raw);
      } catch (e) {
        try {
          const esc = inVal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const re2 = new RegExp(esc.replace(/\s+/g, '\\s*'), 'i');
          ok = re2.test(raw);
        } catch (e2) { ok = false; }
      }
      // fallback: allow OCR whitespace noise between every character
      // (e.g. "MALT BEVERAGE" vs "M A L T B E V E R A G E", or
      // "1PINT" vs "1 P I N T"), regardless of which side has the spaces
      if (!ok) {
        const flexible = inVal
          .replace(/\s+/g, '')
          .split('')
          .map(ch => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('\\s*');
        try {
          ok = new RegExp(flexible, 'i').test(raw);
        } catch (e3) { /* ignore */ }
      }
      fm[key] = ok;
      if (ok) matches++;
    }

    return { fm, matches, total };
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

  // compute assessment by comparing user inputs (treated as regex) to parsed OCR fields
  const computeAssessment = () => {
    const token = ++assessmentTokenRef.current;
    setAssessing(true);
    // schedule heavy work off the render path to keep UI responsive
    setTimeout(() => {
      if (token !== assessmentTokenRef.current) return; // cancelled
      const rawText = (parsedFields || {}).raw || '';
      // country is excluded: it's manually entered and rarely printed on the
      // label itself, so it's carried over from the form rather than OCR-validated
      const { fm, matches, total } = computeFieldMatches(rawText, {
        brand, typeDesignation, alcohol: alcoholContent ? `${alcoholContent}%` : '', net: netContentsDisplay(), producer,
        ...getActiveExtraInputs(),
      });

      if (token !== assessmentTokenRef.current) return;
      if (total === 0) setAssessmentScore(null);
      else setAssessmentScore(Math.round((matches / total) * 100));
      setFieldMatches(fm);
      setAssessing(false);
    }, 0);
  };

  useEffect(() => {
    // recompute whenever parsed fields or user inputs change
    // (skip in viewOnly: results are loaded from the stored assessment, not recomputed)
    if (viewOnly) return;
    computeAssessment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsedFields, brand, typeDesignation, alcoholContent, netContents, netContentsUnit, netContentsSecondary, producer, country, extraFields, extraApplicable]);

  // assessment scheduling state
  const assessmentTokenRef = React.useRef(0);
  const [assessing, setAssessing] = useState(false);
  const addLog = (msg: string) => {
    console.log(`ChecklistLog: ${msg}`);
  };

  const [checkStatus, setCheckStatus] = useState<Record<string, 'idle' | 'running' | 'ok' | 'fail'>>({});
  const [runningChecks, setRunningChecks] = useState(false);

  const typeConfig = TYPE_FIELD_CONFIG[typeDesignation] || { required: [], applicable: [] };

  const allFieldsFilled = [brand, typeDesignation, alcoholContent, netContents, producer].every(v => (v || '').toString().trim().length > 0)
    && !netContentsError
    && (!isImported || country.trim().length > 0)
    && typeConfig.required.every((k) => (extraFields[k] || '').trim().length > 0)
    && typeConfig.applicable.every((k) => !extraApplicable[k] || (extraFields[k] || '').trim().length > 0);

  const runAllChecks = async () => {
    if (!file) return alert('Please upload an image first');
    setRunningChecks(true);
    setAnalysisComplete(false);
    // reset statuses
    const initial: Record<string, any> = { blurry: 'running', flash: 'running', ocr: 'idle', surgeonGeneral: 'idle', warningPresent: 'idle', ocrConfidence: 'idle' };
    ['brand','typeDesignation','alcohol','net','producer', ...Object.keys(getActiveExtraInputs())].forEach(k => initial[k] = 'idle');
    setCheckStatus(initial);
    addLog('runAllChecks: started');
    // move to checklist view immediately so user sees running spinners
    setStep(2);

    // 1) analyze image quality sequentially: blur then flash
    try {
      // blur first
      addLog('runAllChecks: starting blur check');
      setCheckStatus((s) => ({ ...s, blurry: 'running' }));
      const blurryDetected = await analyzeBlurForChecklist(file);
      addLog(`runAllChecks: blur check result=${String(blurryDetected)}`);
      setCheckStatus((s) => ({ ...s, blurry: blurryDetected ? 'fail' : 'ok' }));
      if (blurryDetected) {
        setModalText('Warning: Image appears blurry. All images must be clear and free of blur.');
        setShowModal(true);
        setRunningChecks(false);
        setAnalysisComplete(true);
        return;
      }

      // flash next
      addLog('runAllChecks: starting flash check');
      setCheckStatus((s) => ({ ...s, flash: 'running' }));
      const flashDetected = await analyzeFlashForChecklist(file);
      addLog(`runAllChecks: flash check result=${String(flashDetected)}`);
      setCheckStatus((s) => ({ ...s, flash: flashDetected ? 'fail' : 'ok' }));
      if (flashDetected) {
        setModalText('Warning: Flash or extreme highlights detected. All images must be free of flash.');
        setShowModal(true);
        setRunningChecks(false);
        setAnalysisComplete(true);
        return;
      }
    } catch (err) {
      console.warn('Image quality check failed', err);
      setCheckStatus((s) => ({ ...s, blurry: 'fail', flash: 'fail' }));
      setModalText('Image quality analysis failed');
      setShowModal(true);
      setRunningChecks(false);
      setAnalysisComplete(true);
      return;
    }

    // 2) run OCR / parsing
    addLog('runAllChecks: starting OCR');
    setCheckStatus((s) => {
      const next: Record<string, any> = { ...s, ocr: 'running' };
      ['brand','typeDesignation','alcohol','net','producer', ...Object.keys(getActiveExtraInputs())].forEach(k => next[k] = 'running');
      return next;
    });
    try {
      const parsed = await runOpenCVOnBlob(file);
      addLog('runAllChecks: OCR finished');
      // parsed is set in state by runOpenCVOnBlob too
      setCheckStatus((s) => ({ ...s, ocr: 'ok' }));

      // compute per-field matches directly from the freshly parsed raw OCR text
      // (country is excluded: it's manually entered and rarely printed on the label)
      const rawText = (parsed || {}).raw || '';
      const { fm, matches, total } = computeFieldMatches(rawText, {
        brand, typeDesignation, alcohol: alcoholContent ? `${alcoholContent}%` : '', net: netContentsDisplay(), producer,
        ...getActiveExtraInputs(),
      });
      setFieldMatches(fm);
      setAssessmentScore(total === 0 ? null : Math.round((matches / total) * 100));

      const updates: Record<string, any> = {};
      let anyFail = false;
      ['brand','typeDesignation','alcohol','net','producer', ...Object.keys(getActiveExtraInputs())].forEach(k => {
        const v = fm[k];
        if (v === 'no-input') updates[k] = 'idle';
        else if (v === true) updates[k] = 'ok';
        else { updates[k] = 'fail'; anyFail = true; }
      });

      // "Surgeon General" must appear exactly as written; common OCR misspellings
      // (e.g. "Surgeon Genreal") indicate the printed text itself is non-compliant
      const sgExact = /surgeon general/i.test(rawText);
      if (sgExact) updates.surgeonGeneral = 'ok';
      else { updates.surgeonGeneral = 'fail'; anyFail = true; }

      // "GOVERNMENT WARNING" must appear exactly as written on the label
      const gwExact = /government warning/i.test(rawText);
      if (gwExact) updates.warningPresent = 'ok';
      else { updates.warningPresent = 'fail'; anyFail = true; }

      // overall OCR confidence: low confidence means the parsed fields above
      // are less trustworthy and may warrant manual review even if they matched
      const conf = (parsed || {}).confidence;
      setOcrConfidence(typeof conf === 'number' ? conf : null);
      if (typeof conf === 'number') {
        if (conf >= 70) updates.ocrConfidence = 'ok';
        else { updates.ocrConfidence = 'fail'; anyFail = true; }
      } else {
        updates.ocrConfidence = 'idle';
      }

      setCheckStatus((s) => ({ ...s, ...updates }));

      if (anyFail) {
        setModalText('One or more fields did not match the image. Please review the parsed results or edit the inputs.');
        setShowModal(true);
      }
    } catch (err) {
      console.warn('OCR check failed', err);
      setCheckStatus((s) => ({ ...s, ocr: 'fail' }));
      setModalText('Text recognition failed.');
      setShowModal(true);
    } finally {
      setRunningChecks(false);
      setAnalysisComplete(true);
      setStep(2);
    }
  };

  const parseFromRects = (ocrResults: Array<{ rect: any; text: string; confidence?: number | null }>) => {
    if (!ocrResults || ocrResults.length === 0) return {};

    // sort top->bottom, left->right
    const sorted = [...ocrResults].sort((a, b) => (a.rect.y - b.rect.y) || (a.rect.x - b.rect.x));
    const joined = sorted.map(r => r.text.replace(/[\u2018\u2019\u201C\u201D]/g, '"')).join('\n').replace(/\s+\n/g,'\n');

    // overall OCR confidence: average of per-rect confidences, weighted by
    // recognized text length (longer rects contribute more to the result)
    const confidenceSamples = sorted
      .map(r => ({ len: r.text.trim().length, conf: typeof r.confidence === 'number' ? r.confidence : null }))
      .filter(r => r.len > 0 && r.conf !== null) as Array<{ len: number; conf: number }>;
    let confidence: number | null = null;
    if (confidenceSamples.length > 0) {
      const totalLen = confidenceSamples.reduce((s, r) => s + r.len, 0);
      confidence = Math.round(confidenceSamples.reduce((s, r) => s + r.conf * r.len, 0) / totalLen);
    }

    // split into lines and normalize characters likely from OCR noise
    const lines = joined.split(/\r?\n/)
      .map(l => l.replace(/["“”‘’\|\\/\_\*‚„{}\[\]<>~^@#]/g, ' ').replace(/[^\x00-\x7F]/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .filter(l => /[A-Za-z0-9]{2,}/.test(l));

    // join with spaces (not newlines) so phrases split across OCR lines
    // (e.g. "GOVERNMENT\nWARNING:") can still be matched as "GOVERNMENT WARNING"
    const raw = lines.join(' ');

    // detect potential warning start (may be split across lines)
    let warningIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      const li = lines[i];
      if (/government/i.test(li) || /warning/i.test(li) || /surgeon general/i.test(li)) { warningIdx = i; break; }
    }
    const warningLines = warningIdx !== -1 ? lines.slice(warningIdx) : [];
    const nonWarningLines = warningIdx !== -1 ? lines.slice(0, warningIdx) : lines.slice();

    // normalize warning text if present
    let warning = '';
    if (warningLines.length > 0) {
      let wtxt = warningLines.join(' ');
      // normalize 'GOVERNMENT WARNING'
      wtxt = wtxt.replace(/government\s*warning/i, 'GOVERNMENT WARNING');
      // normalize common OCR misspellings of 'Surgeon General'
      wtxt = wtxt.replace(/surgeon\s*(?:genr?al|genreal|gereral|generel|genera[lI]|genefal|genaral)/gi, 'Surgeon General');
      // ensure 'Surgeon General' capitalization
      wtxt = wtxt.replace(/surgeon general/gi, 'Surgeon General');
      warning = wtxt.trim();
    }

    // alcohol: look for 'contains less than X%' first, then typical percent patterns; normalize to 'X% Alc./Vol.'
    let alcohol = '';
    const m1 = joined.match(/contains\s+less\s+than\s*(\d{1,3}(?:\.\d+)?)\s*%/i);
    if (m1) alcohol = `Less than ${m1[1]}% Alc./Vol.`;
    else {
      const m2 = joined.match(/(\d{1,3}(?:\.\d+)?)\s*%\s*(?:abv|alc|alc\.|alc\/vol|alcohol)?/i);
      if (m2) alcohol = `${m2[1]}% Alc./Vol.`;
    }

    // net contents: look for pints first, then mL/L/oz
    let net = '';
    const netMatch = joined.match(/(\d+(?:\.\d+)?)\s*(pint|pints)\b/i) || joined.match(/(\d+(?:\.\d+)?)\s*(mL|ml|l|L|litre|oz|fl oz)\b/i);
    if (netMatch) net = `${netMatch[1]} ${netMatch[2]}`;

    // producer: find the line with the brewed/bottled keyword, then pull in
    // the following lines (name + address) until a stop marker is hit
    let producer = '';
    const prodKeyword = /(?:brewed and bottled by|brewed and bottled|bottled by|brewed by|brewing co\.?|brewery|brewer)/i;
    const prodStop = /drink responsibly|government\s*warning|surgeon general/i;
    const prodIdx = lines.findIndex(l => prodKeyword.test(l));
    const prodLineIndices = new Set<number>();
    if (prodIdx !== -1) {
      const prodLines = [lines[prodIdx]];
      prodLineIndices.add(prodIdx);
      for (let i = prodIdx + 1; i < lines.length && prodLines.length < 3; i++) {
        const l = lines[i];
        if (prodStop.test(l)) break;
        prodLines.push(l);
        prodLineIndices.add(i);
      }
      producer = prodLines.join(', ').replace(/^[:\-\s]+/, '').trim();
    }

    // country: capture just the country name after 'made in'; fall back to USA when
    // US federal label markers (TTB tax classification / health warning) are present
    let country = (joined.match(/\bmade in\s+([A-Za-z]{2,}(?:\s+[A-Za-z]{2,})?)/i) || [])[1] || '';
    if (!country) {
      const usMarkers = /internal revenue|surgeon general|government\s*warning|alcohol by volume|\btaxable\b/i;
      if (usMarkers.test(joined)) country = 'USA';
    }

    // brand: prefer first non-warning short line that isn't producer/alcohol/net/legal boilerplate
    let brand = '';
    const brandSkip = /government warning|surgeon general|drink responsibly|contains less than|%|ml|pint|bottled by|brewed by|brewery|brew|under|section|taxable|federal|internal revenue|\btax\b|\bco\.?$|alc.*hol|volume|malt beverage/i;
    for (let i = 0; i < nonWarningLines.length; i++) {
      if (prodLineIndices.has(i)) continue;
      const l = nonWarningLines[i];
      if (brandSkip.test(l)) continue;
      if (/:$/.test(l)) continue; // skip section-header style lines ending in ':'
      const cleaned = l.replace(/[^A-Za-z0-9 &\-\.]/g, '').trim();
      if (cleaned.length <= 2 || cleaned.length >= 40) continue;
      const words = cleaned.split(/\s+/).filter(w => /^[A-Za-z]{2,}$/.test(w));
      const letterCount = (l.match(/[A-Za-z]/g) || []).length;
      const letterRatio = letterCount / l.length;
      // require either a multi-word phrase, or a single longer word from a mostly-alphabetic line
      const looksLikeName = words.length >= 2 || (words.length === 1 && words[0].length >= 4 && letterRatio >= 0.6);
      if (looksLikeName) { brand = cleaned; break; }
    }
    // fall back to the producer's company name (brand often matches the brewery/winery name)
    if (!brand && prodIdx !== -1) {
      const prodNameLine = lines[prodIdx]
        .replace(/[^A-Za-z0-9 &\-\.]/g, '')
        .replace(/^[-\s]+|[-\s]+$/g, '')
        .trim();
      if (prodNameLine.length > 2) brand = prodNameLine;
    }
    if (!brand && nonWarningLines[0]) brand = nonWarningLines[0].replace(/[^A-Za-z0-9 &\-\.]/g, '').trim();

    // if we didn't create a formatted warning but 'government' and 'warning' are present anywhere, set canonical warning
    const hasGov = /government\s*warning/i.test(joined) || (/government/i.test(joined) && /warning/i.test(joined));
    if (!warning && hasGov) warning = 'GOVERNMENT WARNING';

    return { brand, alcohol, net, producer, country, warning, raw, confidence };
  };

  return (
    <form onSubmit={handleSubmit} className="form-split">
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', justifyContent: step === 1 ? 'center' : (step === 0 ? 'center' : 'flex-start'), gridColumn: '1 / -1', width: '100%' }}>
        {step === 1 && (
        <div style={{ flex: '0 1 auto', minWidth: 320, position: 'relative' }}>
          {/* Image / upload panel (step 1) */}
          <span className="required-asterisk" style={{ position: 'absolute', top: 0, right: 0, fontSize: 20 }}>*</span>
          <h3 style={{ margin: '0 0 8px', fontSize: 26, fontWeight: 700, color: '#000', textAlign: 'center' }}>Upload Image</h3>
          <div style={{ position: 'relative', minHeight: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="upload-area" style={{ position: 'relative', width: 'auto', maxWidth: 420, margin: '0 auto' }} onDrop={onDrop} onDragOver={onDragOver}>
                {preview ? (
                  <ImageAnnotator ref={annotRef} src={preview} onRecognize={(blob) => runOpenCVOnBlob(blob)} />
                ) : (
                  <div style={{ textAlign: "center" }}>
                    <div className="upload-drop">Drop an image here or</div>
                  </div>
                )}
                  {!viewOnly && (
                    <>
                      <input ref={inputRef} type="file" accept="image/*" onChange={onFileChange} style={preview ? { display: 'none' } : { marginTop: 8 }} />
                      <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                        <Button type="button" variant="secondary" onClick={() => { if (inputRef.current) inputRef.current.click(); }}>
                          {preview ? 'Replace photo' : 'Upload file'}
                        </Button>
                      </div>
                    </>
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
                <h3 style={{ margin: '0 0 8px', fontSize: 26, fontWeight: 700, color: '#000', textAlign: 'center' }}>Label Information</h3>

                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                </div>

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

                <div className="field-row">
                  <label className="field-label">Name and address of bottler/producer <span className="required-asterisk">*</span><InfoButton items={getChecklistItems(typeDesignation, 'producer')} onOpen={setInfoModalItems} /></label>
                  <input required disabled={viewOnly} className="field-input" value={producer} onChange={(e) => setProducer(e.target.value)} />
                </div>

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
            <Button type="button" variant="secondary" onClick={(e) => { e.preventDefault(); setStep((s) => Math.max(0, s - 1)); }}>Previous</Button>
          )}
          {step === 2 ? (
            viewOnly ? null : (
            <Button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setShowConfirmModal(true);
              }}
              disabled={!analysisComplete || runningChecks || isBlurry === true || hasFlash === true}
            >
              Save / Submit
            </Button>
            )
          ) : (
            <Button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                if (step === 0) {
                  console.log('View 1 input fields:', { brand, typeDesignation, alcoholContent, netContents, producer, isImported, country, ...getActiveExtraInputs() });
                }
                if (step === 1) {
                  if (viewOnly) setStep(2);
                  else runAllChecks();
                } else setStep((s) => Math.min(2, s + 1));
              }}
              disabled={(step === 0 && !allFieldsFilled) || (step === 1 && (!file || runningChecks))}
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
