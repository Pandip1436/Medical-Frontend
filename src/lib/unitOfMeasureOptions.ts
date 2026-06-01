// Suggested Unit of Measure values surfaced as a typeahead/datalist in the
// product Add/Edit forms. Sourced from real customer data — pharmacies use
// a wide and inconsistent set of unit codes, container types, and pack
// sizes, so we present the full menu and let staff pick the closest match.
//
// The list is case-insensitively deduped (so "Tab" / "TAB" / "tab" collapse
// to one entry, first occurrence's casing wins). Free typing is still
// allowed in the input — the dropdown is suggestions, not a hard whitelist.

export const UNIT_OF_MEASURE_OPTIONS: ReadonlyArray<string> = [
  // ── Standard codes (metric / imperial)
  'BOX',
  'CMS',
  'DOZ',
  'FTS',
  'GMS',
  'INC',
  'KGS',
  'KME',
  'LBS',
  'MGS',
  'MLT',
  'MTR',
  'PCS',
  // ── Containers / dosage forms
  'INJ',
  'Strips',
  'Bottle',
  'Sachet',
  'UNITS',
  'Ampoule',
  'CAPSULE',
  'TABLETS',
  'TIN',
  'OTHERS',
  'tab',
  'CAPS',
  'TABS',
  'SYP',
  'VIAL',
  'STR',
  'CAP',
  'gel',
  'SYRUP',
  'CREAM',
  'Cartridge',
  'INJE',
  'STP',
  'Pack',
  // ── Pack sizes
  '15\'S',
  '10\'S',
  '30\'S',
  '20\'S',
  '14\'S',
  '5*1.5ML',
  '50\'S',
  'Strips 10\'S',
  '100\'S',
  '5*2ML',
  '15',
  'Strips 8\'S',
  '6\'S',
  '5*1',
  '1*10 PCS',
  '1*5',
  '7*1\'S',
  '5\'s PACK',
  '6*1ML',
  '21\'S STRIP',
  '10 STRIPS',
  'Strips 15\'S',
  '4 S',
] as const
