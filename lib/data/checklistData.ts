import wineChecklist from "../../api/wine_checklist_information.json";
import maltBeverageChecklist from "../../api/malt_beverage_checklist_information.json";
import distilledSpiritsChecklist from "../../api/distilled_spirits_checklist_information.json";

export type ChecklistItem = {
  mandatory_item_name: string;
  description: string;
  regulatory_citation: string;
  link_to_citation: string[];
};

// per-Class/Type reference data (TTB mandatory labeling information), keyed
// to match the Class/Type designations used throughout the app
export const CHECKLIST_DATA: Record<string, ChecklistItem[]> = {
  Wine: wineChecklist,
  'Malt Beverage': maltBeverageChecklist,
  'Distilled Spirits': distilledSpiritsChecklist,
};

// maps each form field to the corresponding mandatory_item_name entry/entries
// in CHECKLIST_DATA for the current Class/Type designation
export const CHECKLIST_FIELD_MAP: Record<string, Record<string, string[]>> = {
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

export const getChecklistItems = (typeDesignation: string, fieldKey: string): ChecklistItem[] => {
  const data = CHECKLIST_DATA[typeDesignation];
  const names = CHECKLIST_FIELD_MAP[typeDesignation]?.[fieldKey];
  if (!data || !names) return [];
  return names
    .map((name) => data.find((item) => item.mandatory_item_name === name))
    .filter((item): item is ChecklistItem => !!item);
};
