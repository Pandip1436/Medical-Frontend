// ─────────────────────────────────────────────────────────────
// Frontend-only mock data for the leads module.
//
// Set USE_MOCK_DATA = false (one-line change) once the IndiaMART API key is
// configured on the backend and the real /leads endpoint starts returning
// data. Nothing here ever touches the DB — the data lives only in memory
// inside the browser, so refreshing the page resets activity/quote/invoice
// edits.
//
// The mock dataset mirrors the IndiaMART payload shape so the UI renders
// realistic data (manufacturer/product/category/location plus a buyer
// inquiry message in `externalMessage`).
// ─────────────────────────────────────────────────────────────

import type {
  Lead,
  LeadListCounts,
  LeadSource,
  LeadStage,
  LeadTab,
} from './types'

/**
 * When true, the leads-list and lead-detail hooks short-circuit their HTTP
 * calls and return data from this file instead. Flip to false to wire the
 * real API through.
 */
export const USE_MOCK_DATA = false

// Helper so we can write ISO timestamps relative to "now" without a hardcoded date.
function daysAgo(d: number): string {
  return new Date(Date.now() - d * 86_400_000).toISOString()
}

const HOSPITAL_OWNER = {
  id: 'mock-user-1',
  name: 'Hospital Suppliers',
  email: 'admin@hospitalsuppliers.in',
}

const BRANCH_ID = 'mock-branch-hq'

// Common IndiaMART inquiry-message template — gives every lead realistic
// content for the Requirements card on the Lead Details tab.
function indiaMartMsg(product: string, qty: number, value: string): string {
  return [
    `Requirement for ${product}`,
    ` Strength: As listed I want this for: Hospital Use Probable Order Value: Rs. ${value} Quantity: ${qty} Piece`,
    '',
    `Product: ${product}`,
    `Category: Pharmaceutical`,
    `Location: Hyderabad, Telangana`,
    `Type: Buy Lead`,
  ].join('\n')
}

export const MOCK_LEADS: Lead[] = [
  {
    id: 'mock-1',
    leadNumber: 'L-0081',
    title: 'Requirement for Terifrac Pen Injection 750 mcg',
    description: 'Hospital use, probable order value ₹50,000 – 1 Lakh',
    source: 'INDIAMART',
    pipeline: 'SALES',
    stage: 'LEAD',
    status: 'OPEN',
    touchStatus: 'UNTOUCHED',
    score: 10,
    value: 75000,
    currency: 'INR',
    expectedCloseDate: null,
    validUntil: null,
    contact: {
      id: 'mock-c-1',
      firstName: 'Bandi',
      lastName: null,
      phone: '9110781505',
      phoneCountryCode: '+91',
      email: 'sairakhey@gmail.com',
      jobTitle: 'Procurement Officer',
      city: 'Hyderabad',
      state: 'Telangana',
      country: 'India',
    },
    contactId: 'mock-c-1',
    company: null,
    companyId: null,
    assignedToUser: HOSPITAL_OWNER,
    assignedToUserId: HOSPITAL_OWNER.id,
    branchId: BRANCH_ID,
    externalQueryId: '1245458554',
    externalMessage: indiaMartMsg('Terifrac Pen Injection 750 mcg', 30, '50,000 to 1 Lakh'),
    externalProductName: 'Terifrac Pen Injection 750 mcg',
    externalCategory: 'Terifrac Injection',
    externalCity: 'Hyderabad',
    externalState: 'Telangana',
    createdAt: daysAgo(0),
    updatedAt: daysAgo(0),
  },
  {
    id: 'mock-2',
    leadNumber: 'L-0080',
    title: 'Bulk order — Surgical gloves (size M)',
    description: '500 boxes, monthly recurring',
    source: 'INDIAMART',
    pipeline: 'SALES',
    stage: 'LEAD',
    status: 'OPEN',
    touchStatus: 'UNTOUCHED',
    score: 10,
    value: 120000,
    currency: 'INR',
    expectedCloseDate: null,
    validUntil: null,
    contact: {
      id: 'mock-c-2',
      firstName: 'Vasu',
      lastName: null,
      phone: '9390106392',
      phoneCountryCode: '+91',
      email: 'vasu.sangani@gmail.com',
      jobTitle: 'Buyer',
      city: 'Chennai',
      state: 'Tamil Nadu',
      country: 'India',
    },
    contactId: 'mock-c-2',
    company: null,
    companyId: null,
    assignedToUser: HOSPITAL_OWNER,
    assignedToUserId: HOSPITAL_OWNER.id,
    branchId: BRANCH_ID,
    externalQueryId: '1245458553',
    externalMessage: indiaMartMsg('Surgical gloves size M', 500, '1 to 1.5 Lakh'),
    externalProductName: 'Surgical Gloves Size M',
    externalCategory: 'Surgical Consumables',
    externalCity: 'Chennai',
    externalState: 'Tamil Nadu',
    createdAt: daysAgo(0),
    updatedAt: daysAgo(0),
  },
  {
    id: 'mock-3',
    leadNumber: 'L-0079',
    title: 'IV cannula 18G — 200 packs',
    description: '',
    source: 'INDIAMART',
    pipeline: 'SALES',
    stage: 'LEAD',
    status: 'OPEN',
    touchStatus: 'UNTOUCHED',
    score: 10,
    value: 25000,
    currency: 'INR',
    expectedCloseDate: null,
    validUntil: null,
    contact: {
      id: 'mock-c-3',
      firstName: 'V.mohan',
      lastName: 'Kumar',
      phone: '7411789194',
      phoneCountryCode: '+91',
      email: 'vmohank7@gmail.com',
      jobTitle: null,
      city: 'Bengaluru',
      state: 'Karnataka',
      country: 'India',
    },
    contactId: 'mock-c-3',
    company: null,
    companyId: null,
    assignedToUser: HOSPITAL_OWNER,
    assignedToUserId: HOSPITAL_OWNER.id,
    branchId: BRANCH_ID,
    externalQueryId: '1245458552',
    externalMessage: indiaMartMsg('IV Cannula 18G', 200, '25,000 to 30,000'),
    externalProductName: 'IV Cannula 18G',
    externalCategory: 'Disposables',
    externalCity: 'Bengaluru',
    externalState: 'Karnataka',
    createdAt: daysAgo(1),
    updatedAt: daysAgo(1),
  },
  {
    id: 'mock-4',
    leadNumber: 'L-0078',
    title: 'Paracetamol 650mg — strip orders',
    description: '5000 strips, urgent',
    source: 'INDIAMART',
    pipeline: 'SALES',
    stage: 'QUALIFIED',
    status: 'OPEN',
    touchStatus: 'TOUCHED',
    score: 65,
    value: 45000,
    currency: 'INR',
    expectedCloseDate: daysAgo(-7),
    validUntil: null,
    contact: {
      id: 'mock-c-4',
      firstName: 'Mohamed',
      lastName: 'Mustafa',
      phone: '9731223483',
      phoneCountryCode: '+91',
      email: 'mqureshi125@gmail.com',
      jobTitle: 'Pharmacy Manager',
      city: 'Mumbai',
      state: 'Maharashtra',
      country: 'India',
    },
    contactId: 'mock-c-4',
    company: { id: 'mock-co-1', name: 'Mustafa Medical Stores' },
    companyId: 'mock-co-1',
    assignedToUser: HOSPITAL_OWNER,
    assignedToUserId: HOSPITAL_OWNER.id,
    branchId: BRANCH_ID,
    externalQueryId: '1245458551',
    externalMessage: indiaMartMsg('Paracetamol 650mg', 5000, '40,000 to 50,000'),
    externalProductName: 'Paracetamol 650mg',
    externalCategory: 'OTC Medicines',
    externalCity: 'Mumbai',
    externalState: 'Maharashtra',
    createdAt: daysAgo(1),
    updatedAt: daysAgo(1),
  },
  {
    id: 'mock-5',
    leadNumber: 'L-0077',
    title: 'Insulin pens — Lantus SoloStar',
    description: 'Recurring monthly supply',
    source: 'INDIAMART',
    pipeline: 'SALES',
    stage: 'PROPOSAL',
    status: 'OPEN',
    touchStatus: 'TOUCHED',
    score: 80,
    value: 180000,
    currency: 'INR',
    expectedCloseDate: daysAgo(-3),
    validUntil: daysAgo(-14),
    contact: {
      id: 'mock-c-5',
      firstName: 'AKASH',
      lastName: null,
      phone: '9840210179',
      phoneCountryCode: '+91',
      email: 'aku1232002@gmail.com',
      jobTitle: 'Senior Buyer',
      city: 'Chennai',
      state: 'Tamil Nadu',
      country: 'India',
    },
    contactId: 'mock-c-5',
    company: { id: 'mock-co-2', name: 'Akash Med Distributors' },
    companyId: 'mock-co-2',
    assignedToUser: HOSPITAL_OWNER,
    assignedToUserId: HOSPITAL_OWNER.id,
    branchId: BRANCH_ID,
    externalQueryId: '1245458550',
    externalMessage: indiaMartMsg('Lantus SoloStar Insulin Pen', 50, '1.5 to 2 Lakh'),
    externalProductName: 'Lantus SoloStar Insulin Pen',
    externalCategory: 'Diabetes Care',
    externalCity: 'Chennai',
    externalState: 'Tamil Nadu',
    createdAt: daysAgo(1),
    updatedAt: daysAgo(0),
  },
  {
    id: 'mock-6',
    leadNumber: 'L-0076',
    title: 'N95 masks bulk order',
    description: '1000 units',
    source: 'INDIAMART',
    pipeline: 'SALES',
    stage: 'LEAD',
    status: 'OPEN',
    touchStatus: 'UNTOUCHED',
    score: 10,
    value: 0,
    currency: 'INR',
    expectedCloseDate: null,
    validUntil: null,
    contact: {
      id: 'mock-c-6',
      firstName: 'Rangarao',
      lastName: 'Bobba',
      phone: '9849090369',
      phoneCountryCode: '+91',
      email: 'rangaraobobba14@gmail.com',
      jobTitle: null,
      city: 'Vijayawada',
      state: 'Andhra Pradesh',
      country: 'India',
    },
    contactId: 'mock-c-6',
    company: null,
    companyId: null,
    assignedToUser: HOSPITAL_OWNER,
    assignedToUserId: HOSPITAL_OWNER.id,
    branchId: BRANCH_ID,
    externalQueryId: '1245458549',
    externalMessage: indiaMartMsg('N95 Mask', 1000, '60,000 to 80,000'),
    externalProductName: 'N95 Mask',
    externalCategory: 'PPE',
    externalCity: 'Vijayawada',
    externalState: 'Andhra Pradesh',
    createdAt: daysAgo(1),
    updatedAt: daysAgo(1),
  },
  {
    id: 'mock-7',
    leadNumber: 'L-0075',
    title: 'Pulse oximeters — branded',
    description: '',
    source: 'INDIAMART',
    pipeline: 'SALES',
    stage: 'LEAD',
    status: 'OPEN',
    touchStatus: 'UNTOUCHED',
    score: 10,
    value: 0,
    currency: 'INR',
    expectedCloseDate: null,
    validUntil: null,
    contact: {
      id: 'mock-c-7',
      firstName: 'Prashant',
      lastName: null,
      phone: '8123456789',
      phoneCountryCode: '+91',
      email: 'drprashant3110@gmail.com',
      jobTitle: 'Doctor',
      city: 'Pune',
      state: 'Maharashtra',
      country: 'India',
    },
    contactId: 'mock-c-7',
    company: null,
    companyId: null,
    assignedToUser: HOSPITAL_OWNER,
    assignedToUserId: HOSPITAL_OWNER.id,
    branchId: BRANCH_ID,
    externalQueryId: '1245458548',
    externalMessage: indiaMartMsg('Pulse Oximeter', 25, '15,000 to 20,000'),
    externalProductName: 'Pulse Oximeter',
    externalCategory: 'Diagnostic Devices',
    externalCity: 'Pune',
    externalState: 'Maharashtra',
    createdAt: daysAgo(2),
    updatedAt: daysAgo(2),
  },
  {
    id: 'mock-8',
    leadNumber: 'L-0074',
    title: 'Surgical sutures — assorted',
    description: 'Need quotation by Friday',
    source: 'MANUAL',
    pipeline: 'SALES',
    stage: 'NEGOTIATION',
    status: 'OPEN',
    touchStatus: 'TOUCHED',
    score: 85,
    value: 95000,
    currency: 'INR',
    expectedCloseDate: daysAgo(-5),
    validUntil: daysAgo(-30),
    contact: {
      id: 'mock-c-8',
      firstName: 'Dr. Suresh',
      lastName: 'Iyer',
      phone: '9988776655',
      phoneCountryCode: '+91',
      email: 'suresh.iyer@apollo.in',
      jobTitle: 'Head of Procurement',
      city: 'Hyderabad',
      state: 'Telangana',
      country: 'India',
    },
    contactId: 'mock-c-8',
    company: { id: 'mock-co-3', name: 'Apollo Hospitals' },
    companyId: 'mock-co-3',
    assignedToUser: HOSPITAL_OWNER,
    assignedToUserId: HOSPITAL_OWNER.id,
    branchId: BRANCH_ID,
    externalQueryId: null,
    externalMessage: null,
    externalProductName: null,
    externalCategory: null,
    externalCity: null,
    externalState: null,
    createdAt: daysAgo(5),
    updatedAt: daysAgo(0),
  },
  {
    id: 'mock-9',
    leadNumber: 'L-0073',
    title: 'Annual contract — General supplies',
    description: '12-month rolling contract',
    source: 'REFERRAL',
    pipeline: 'SALES',
    stage: 'WON',
    status: 'CLOSED',
    touchStatus: 'TOUCHED',
    score: 95,
    value: 850000,
    currency: 'INR',
    expectedCloseDate: daysAgo(-1),
    validUntil: null,
    contact: {
      id: 'mock-c-9',
      firstName: 'Priya',
      lastName: 'Rao',
      phone: '9123456780',
      phoneCountryCode: '+91',
      email: 'priya.rao@yashoda.com',
      jobTitle: 'Purchase Manager',
      city: 'Hyderabad',
      state: 'Telangana',
      country: 'India',
    },
    contactId: 'mock-c-9',
    company: { id: 'mock-co-4', name: 'Yashoda Hospitals' },
    companyId: 'mock-co-4',
    assignedToUser: HOSPITAL_OWNER,
    assignedToUserId: HOSPITAL_OWNER.id,
    branchId: BRANCH_ID,
    externalQueryId: null,
    externalMessage: null,
    externalProductName: null,
    externalCategory: null,
    externalCity: null,
    externalState: null,
    createdAt: daysAgo(45),
    updatedAt: daysAgo(2),
  },
  {
    id: 'mock-10',
    leadNumber: 'L-0072',
    title: 'Antibiotic injectables - bulk',
    description: '',
    source: 'WEBSITE',
    pipeline: 'SALES',
    stage: 'WON',
    status: 'CLOSED',
    touchStatus: 'TOUCHED',
    score: 90,
    value: 215000,
    currency: 'INR',
    expectedCloseDate: daysAgo(-2),
    validUntil: null,
    contact: {
      id: 'mock-c-10',
      firstName: 'Ananya',
      lastName: 'Sharma',
      phone: '9012345678',
      phoneCountryCode: '+91',
      email: 'ananya@medplus.in',
      jobTitle: 'Category Manager',
      city: 'Hyderabad',
      state: 'Telangana',
      country: 'India',
    },
    contactId: 'mock-c-10',
    company: { id: 'mock-co-5', name: 'MedPlus' },
    companyId: 'mock-co-5',
    assignedToUser: HOSPITAL_OWNER,
    assignedToUserId: HOSPITAL_OWNER.id,
    branchId: BRANCH_ID,
    externalQueryId: null,
    externalMessage: null,
    externalProductName: null,
    externalCategory: null,
    externalCity: null,
    externalState: null,
    createdAt: daysAgo(20),
    updatedAt: daysAgo(2),
  },
  {
    id: 'mock-11',
    leadNumber: 'L-0071',
    title: 'PPE kits monthly supply',
    description: 'Rejected pricing — too high',
    source: 'WHATSAPP',
    pipeline: 'SALES',
    stage: 'LOST',
    status: 'CLOSED',
    touchStatus: 'TOUCHED',
    score: 35,
    value: 60000,
    currency: 'INR',
    expectedCloseDate: null,
    validUntil: null,
    contact: {
      id: 'mock-c-11',
      firstName: 'Vikram',
      lastName: 'Singh',
      phone: '9555666777',
      phoneCountryCode: '+91',
      email: 'vikram@globalcare.in',
      jobTitle: null,
      city: 'Delhi',
      state: 'Delhi',
      country: 'India',
    },
    contactId: 'mock-c-11',
    company: { id: 'mock-co-6', name: 'GlobalCare Pharma' },
    companyId: 'mock-co-6',
    assignedToUser: HOSPITAL_OWNER,
    assignedToUserId: HOSPITAL_OWNER.id,
    branchId: BRANCH_ID,
    externalQueryId: null,
    externalMessage: null,
    externalProductName: null,
    externalCategory: null,
    externalCity: null,
    externalState: null,
    createdAt: daysAgo(15),
    updatedAt: daysAgo(7),
  },
  {
    id: 'mock-12',
    leadNumber: 'L-0070',
    title: 'BP monitors - 50 units',
    description: '',
    source: 'CALL',
    pipeline: 'SALES',
    stage: 'LOST',
    status: 'CLOSED',
    touchStatus: 'TOUCHED',
    score: 25,
    value: 0,
    currency: 'INR',
    expectedCloseDate: null,
    validUntil: null,
    contact: {
      id: 'mock-c-12',
      firstName: 'Rohan',
      lastName: 'Patel',
      phone: '8877665544',
      phoneCountryCode: '+91',
      email: null,
      jobTitle: null,
      city: 'Ahmedabad',
      state: 'Gujarat',
      country: 'India',
    },
    contactId: 'mock-c-12',
    company: null,
    companyId: null,
    assignedToUser: HOSPITAL_OWNER,
    assignedToUserId: HOSPITAL_OWNER.id,
    branchId: BRANCH_ID,
    externalQueryId: null,
    externalMessage: null,
    externalProductName: null,
    externalCategory: null,
    externalCity: null,
    externalState: null,
    createdAt: daysAgo(30),
    updatedAt: daysAgo(10),
  },
]

// ── Tab-aware filtering for the mock dataset ─────────────────
// Mirrors the backend's LeadsService.applyTabFilter so the UI behaves the
// same with mock data as it will with real data.
function applyTab(leads: Lead[], tab: LeadTab | undefined): Lead[] {
  switch (tab) {
    case 'open':
      return leads.filter((l) => l.status === 'OPEN')
    case 'closed':
      return leads.filter((l) => l.status === 'CLOSED')
    case 'untouched':
      return leads.filter((l) => l.touchStatus === 'UNTOUCHED')
    case 'lead':
      return leads.filter((l) => l.stage === 'LEAD')
    case 'qualified':
      return leads.filter((l) => l.stage === 'QUALIFIED')
    case 'proposal':
      return leads.filter((l) => l.stage === 'PROPOSAL')
    case 'negotiation':
      return leads.filter((l) => l.stage === 'NEGOTIATION')
    case 'won':
      return leads.filter((l) => l.stage === 'WON')
    case 'lost':
      return leads.filter((l) => l.stage === 'LOST')
    default:
      return leads
  }
}

export function mockFilteredLeads(opts: {
  q?: string
  tab?: LeadTab
  stage?: LeadStage[]
  source?: LeadSource[]
}): Lead[] {
  let result = MOCK_LEADS

  if (opts.stage && opts.stage.length > 0) {
    result = result.filter((l) => opts.stage!.includes(l.stage))
  }
  if (opts.source && opts.source.length > 0) {
    result = result.filter((l) => opts.source!.includes(l.source))
  }
  if (opts.q) {
    const q = opts.q.toLowerCase()
    result = result.filter(
      (l) =>
        l.leadNumber.toLowerCase().includes(q) ||
        l.title.toLowerCase().includes(q) ||
        l.contact.firstName.toLowerCase().includes(q) ||
        (l.contact.lastName?.toLowerCase().includes(q) ?? false) ||
        l.contact.phone.includes(q) ||
        (l.contact.email?.toLowerCase().includes(q) ?? false),
    )
  }
  result = applyTab(result, opts.tab)
  return result
}

// Lookup helper for the ContactDetailsDrawer. We re-shape the embedded
// contact on a Lead into the ContactDetail payload the drawer expects.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mockContactById(id: string): any | null {
  const lead = MOCK_LEADS.find((l) => l.contactId === id || l.contact.id === id)
  if (!lead) return null
  const c = lead.contact
  return {
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName ?? null,
    phoneCountryCode: c.phoneCountryCode,
    phone: c.phone,
    email: c.email ?? null,
    jobTitle: c.jobTitle ?? null,
    address: null,
    city: c.city ?? null,
    state: c.state ?? null,
    country: c.country ?? null,
    countryIso: 'IN',
    source: lead.source,
    status: 'ACTIVE' as const,
    notes: null,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
    ownerUser: lead.assignedToUser,
    company: lead.company,
  }
}

// Mutates the in-memory mock list so a stage change persists across
// refetches in dev (USE_MOCK_DATA=true). Returns true if the lead was
// found and updated. No-op for callers when mock mode is disabled.
export function mockSetLeadStage(id: string, stage: LeadStage): boolean {
  const lead = MOCK_LEADS.find((l) => l.id === id)
  if (!lead) return false
  lead.stage = stage
  // WON / LOST are terminal stages — flip the lead's open/closed status
  // accordingly so the Open/Closed pill counts stay coherent.
  lead.status = stage === 'WON' || stage === 'LOST' ? 'CLOSED' : 'OPEN'
  lead.touchStatus = 'TOUCHED'
  lead.updatedAt = new Date().toISOString()
  return true
}

// Same as mockSetLeadStage but for the lead's source. Used by the inline
// source pill in the list view and the detail panel.
export function mockSetLeadSource(id: string, source: LeadSource): boolean {
  const lead = MOCK_LEADS.find((l) => l.id === id)
  if (!lead) return false
  lead.source = source
  lead.updatedAt = new Date().toISOString()
  return true
}

// Mock-mode reassignment helper for the inline sales-person pill. Mirrors
// mockSetLeadStage / mockSetLeadSource — keeps MOCK_LEADS in sync so the
// pill doesn't snap back after a refetch.
export function mockSetLeadAssignee(
  id: string,
  user: { id: string; name: string; email?: string | null },
): boolean {
  const lead = MOCK_LEADS.find((l) => l.id === id)
  if (!lead) return false
  lead.assignedToUserId = user.id
  lead.assignedToUser = {
    id: user.id,
    name: user.name,
    email: user.email ?? '',
  }
  lead.updatedAt = new Date().toISOString()
  return true
}

// ─────────────────────────────────────────────────────────────
// Mutation helpers — keep the in-memory MOCK_LEADS array in sync
// with create/update/delete actions so the UI behaves like prod.
// All of these are pure mutations on the shared array; refetch
// helpers in the hooks pick them up on the next pass.
// ─────────────────────────────────────────────────────────────

let mockLeadCounter = 100

/**
 * Append a new lead to the in-memory list. Caller passes a partial Lead;
 * we backfill defaults (id, leadNumber, timestamps, status, touchStatus,
 * etc.) so the result is a fully-formed Lead the UI can render.
 */
export function mockCreateLead(input: {
  title: string
  description?: string
  source?: LeadSource
  pipeline?: 'SALES' | 'PROCUREMENT' | 'SUPPORT'
  stage?: LeadStage
  score?: number
  value?: number
  currency?: string
  expectedCloseDate?: string
  validUntil?: string
  contact: {
    id?: string
    firstName: string
    lastName?: string
    phone: string
    phoneCountryCode?: string
    email?: string
    jobTitle?: string
    city?: string
    state?: string
    country?: string
  }
  contactId?: string
  company?: { id: string; name: string }
  companyId?: string
  assignedToUser?: { id: string; name: string; email: string }
}): Lead {
  const now = new Date().toISOString()
  const number = String(mockLeadCounter++).padStart(4, '0')
  const id = `mock-new-${number}`
  const lead: Lead = {
    id,
    leadNumber: `L-${number}`,
    title: input.title,
    description: input.description ?? null,
    source: input.source ?? 'MANUAL',
    pipeline: input.pipeline ?? 'SALES',
    stage: input.stage ?? 'LEAD',
    status: 'OPEN',
    touchStatus: 'UNTOUCHED',
    score: input.score ?? 50,
    value: input.value ?? 0,
    currency: input.currency ?? 'INR',
    expectedCloseDate: input.expectedCloseDate,
    validUntil: input.validUntil,
    contact: {
      id: input.contact.id ?? `mock-contact-${id}`,
      firstName: input.contact.firstName,
      lastName: input.contact.lastName ?? null,
      phone: input.contact.phone,
      phoneCountryCode: input.contact.phoneCountryCode ?? '+91',
      email: input.contact.email ?? null,
      jobTitle: input.contact.jobTitle ?? null,
      city: input.contact.city ?? null,
      state: input.contact.state ?? null,
      country: input.contact.country ?? null,
    },
    contactId: input.contact.id ?? input.contactId ?? `mock-contact-${id}`,
    company: input.company,
    companyId: input.company?.id ?? input.companyId,
    assignedToUser: input.assignedToUser ?? HOSPITAL_OWNER,
    assignedToUserId: (input.assignedToUser ?? HOSPITAL_OWNER).id,
    branchId: BRANCH_ID,
    createdAt: now,
    updatedAt: now,
  } as Lead
  // Prepend so newest leads show up first in the default desc-by-createdAt order.
  MOCK_LEADS.unshift(lead)
  return lead
}

/** Remove a single lead from MOCK_LEADS. Returns true if removed. */
export function mockDeleteLead(id: string): boolean {
  const idx = MOCK_LEADS.findIndex((l) => l.id === id)
  if (idx === -1) return false
  MOCK_LEADS.splice(idx, 1)
  return true
}

/**
 * Apply the same partial patch to every lead in `ids`. Returns the number
 * of leads updated. Mirrors POST /leads/bulk-update semantics.
 */
export function mockBulkUpdateLeads(
  ids: string[],
  patch: Partial<Pick<Lead, 'stage' | 'source' | 'assignedToUser'>>,
): number {
  let count = 0
  const now = new Date().toISOString()
  for (const id of ids) {
    const lead = MOCK_LEADS.find((l) => l.id === id)
    if (!lead) continue
    if (patch.stage) {
      lead.stage = patch.stage
      lead.status = patch.stage === 'WON' || patch.stage === 'LOST' ? 'CLOSED' : 'OPEN'
      lead.touchStatus = 'TOUCHED'
    }
    if (patch.source) lead.source = patch.source
    if (patch.assignedToUser) {
      lead.assignedToUser = patch.assignedToUser
      lead.assignedToUserId = patch.assignedToUser.id
    }
    lead.updatedAt = now
    count++
  }
  return count
}

/** Remove every lead in `ids`. Returns count of deletions. */
export function mockBulkDeleteLeads(ids: string[]): number {
  let count = 0
  for (const id of ids) {
    if (mockDeleteLead(id)) count++
  }
  return count
}

/**
 * Bulk-create from imported CSV rows. Mirrors POST /leads/import return shape
 * so the drawer's success UI doesn't need to branch.
 */
export function mockImportLeads(
  rows: Array<Parameters<typeof mockCreateLead>[0]>,
): { imported: number; updated: number; skipped: number; errors: string[] } {
  let imported = 0
  const errors: string[] = []
  for (const row of rows) {
    try {
      mockCreateLead(row)
      imported++
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err))
    }
  }
  return { imported, updated: 0, skipped: 0, errors }
}

/**
 * Delete a contact. In mock land contacts are embedded inside leads, so
 * "deleting" a contact removes every lead that references it.
 */
export function mockDeleteContact(contactId: string): boolean {
  let removed = false
  for (let i = MOCK_LEADS.length - 1; i >= 0; i--) {
    if (
      MOCK_LEADS[i].contactId === contactId ||
      MOCK_LEADS[i].contact?.id === contactId
    ) {
      MOCK_LEADS.splice(i, 1)
      removed = true
    }
  }
  return removed
}

/**
 * Shallow patch a contact across every lead that references it.
 * Mirrors PATCH /contacts/:id semantics for ContactDetailsDrawer.
 */
export function mockPatchContact(
  contactId: string,
  patch: Partial<{
    firstName: string
    lastName: string | null
    phone: string
    phoneCountryCode: string
    email: string | null
    jobTitle: string | null
    address: string | null
    city: string | null
    state: string | null
    country: string | null
  }>,
): boolean {
  let touched = false
  for (const lead of MOCK_LEADS) {
    if (lead.contactId === contactId || lead.contact?.id === contactId) {
      Object.assign(lead.contact, patch)
      lead.updatedAt = new Date().toISOString()
      touched = true
    }
  }
  return touched
}

// ─────────────────────────────────────────────────────────────
// Mock per-tab data
// ─────────────────────────────────────────────────────────────
//
// Each helper returns realistic content keyed by leadId. The main lead
// (mock-1 / Bandi) gets rich data so every tab has something to render;
// other leads get lighter/empty data so the empty states stay visible.

// Mutable per-lead activity store. Seeded lazily from the per-lead seed
// arrays below — once seeded for a lead, all subsequent reads/writes go
// through this Map so mock-mode mutations persist across tab switches.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockActivityStore: Map<string, any[]> = new Map()
let mockActivityCounter = 1000

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function seedActivitiesForLead(leadId: string): any[] {
  const lead = MOCK_LEADS.find((l) => l.id === leadId)
  if (!lead) return []
  if (leadId !== 'mock-1' && leadId !== 'mock-4' && leadId !== 'mock-5') {
    return []
  }
  const owner = lead.assignedToUser

  if (leadId === 'mock-1') {
    return [
      {
        id: 'mock-act-1',
        leadId,
        type: 'NOTE',
        notes:
          'New IndiaMART inquiry for Terifrac Pen Injection 750 mcg. Buyer mentioned probable order value Rs. 50,000 – 1 Lakh. Need to confirm batch availability before quoting.',
        occurredAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        createdBy: owner,
      },
      {
        id: 'mock-act-2',
        leadId,
        type: 'CALL',
        notes:
          'Called Bandi at +91 9110781505. Brief discussion about the requirement. He confirmed bulk order intent — 30 pieces minimum, possibly recurring monthly.',
        contactName: 'Bandi',
        occurredAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
        createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
        createdBy: owner,
      },
      {
        id: 'mock-act-3',
        leadId,
        type: 'EMAIL',
        subject: 'Quotation request — Terifrac Pen Injection',
        notes:
          'Sent product datasheet + indicative pricing tier. Awaiting confirmation on quantity and target delivery date.',
        contactName: 'Bandi',
        occurredAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        createdBy: owner,
      },
      {
        id: 'mock-act-4',
        leadId,
        type: 'WHATSAPP',
        notes:
          'Shared catalog link on WhatsApp. Buyer asked about Schedule H license — confirmed we ship only to licensed pharmacies.',
        contactName: 'Bandi',
        occurredAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
        createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
        createdBy: owner,
      },
      {
        id: 'mock-act-5',
        leadId,
        type: 'REMINDER',
        title: 'Follow up on quotation acceptance',
        notes: 'Confirm acceptance and start preparing the PO.',
        dueAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'PENDING',
        createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        createdBy: owner,
      },
      {
        id: 'mock-act-6',
        leadId,
        type: 'REMINDER',
        title: 'Send initial product brochure',
        notes: '',
        dueAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
        status: 'DONE',
        createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
        createdBy: owner,
      },
    ]
  }

  if (leadId === 'mock-4') {
    return [
      {
        id: 'mock-act-7',
        leadId,
        type: 'CALL',
        notes:
          'Spoke with Mohamed re: bulk paracetamol order. He needs delivery by end of week — confirmed feasibility on our side.',
        contactName: 'Mohamed Mustafa',
        occurredAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        createdBy: owner,
      },
      {
        id: 'mock-act-8',
        leadId,
        type: 'REMINDER',
        title: 'Share final quotation by Tuesday',
        dueAt: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'PENDING',
        createdAt: new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString(),
        createdBy: owner,
      },
    ]
  }

  // mock-5 (AKASH — proposal stage)
  return [
    {
      id: 'mock-act-9',
      leadId,
      type: 'EMAIL',
      subject: 'Lantus SoloStar proposal v2',
      notes:
        'Sent revised proposal with 8% discount and quarterly billing terms. Decision expected by 25th.',
      contactName: 'AKASH',
      occurredAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      createdBy: owner,
    },
    {
      id: 'mock-act-10',
      leadId,
      type: 'REMINDER',
      title: 'Check proposal status',
      dueAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      status: 'PENDING',
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      createdBy: owner,
    },
  ]
}

// Public reader — lazy-seed the per-lead store on first access, then always
// return the SAME array reference so subsequent mutations are visible to
// every caller without going through the network. Caller should treat the
// returned array as read-only and use the mutation helpers below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mockActivitiesForLead(leadId: string): any[] {
  if (!mockActivityStore.has(leadId)) {
    mockActivityStore.set(leadId, seedActivitiesForLead(leadId))
  }
  return mockActivityStore.get(leadId) ?? []
}

// Append a new activity to the in-memory store for `leadId`. Returns the
// shaped activity object so the caller can use the same fields it would get
// back from the real POST /leads/:id/activities response.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mockAddActivity(leadId: string, payload: any): any {
  const lead = MOCK_LEADS.find((l) => l.id === leadId)
  const owner = lead?.assignedToUser ?? HOSPITAL_OWNER
  const activity = {
    id: `mock-act-${mockActivityCounter++}`,
    leadId,
    type: payload.type,
    notes: payload.notes ?? null,
    title: payload.title ?? null,
    occurredAt: payload.occurredAt ?? null,
    dueAt: payload.dueAt ?? null,
    status:
      payload.status ?? (payload.type === 'REMINDER' ? 'PENDING' : null),
    contactName: payload.contactName ?? null,
    subject: payload.subject ?? null,
    createdAt: new Date().toISOString(),
    createdBy: owner,
  }
  const list = mockActivitiesForLead(leadId)
  // Newest first — matches the backend's `orderBy: createdAt desc` ordering.
  list.unshift(activity)
  return activity
}

/** Patch one activity in place. Returns true if found. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mockUpdateActivity(
  leadId: string,
  activityId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  patch: any,
): boolean {
  const list = mockActivitiesForLead(leadId)
  const idx = list.findIndex((a) => a.id === activityId)
  if (idx === -1) return false
  list[idx] = { ...list[idx], ...patch }
  return true
}

/** Remove one activity by id. Returns true if removed. */
export function mockDeleteActivity(
  leadId: string,
  activityId: string,
): boolean {
  const list = mockActivitiesForLead(leadId)
  const idx = list.findIndex((a) => a.id === activityId)
  if (idx === -1) return false
  list.splice(idx, 1)
  return true
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mockQuotationsForLead(leadId: string): any[] {
  if (leadId === 'mock-1') {
    return [
      {
        id: 'mock-q-1',
        quotationNumber: 'QT-2026-0042',
        date: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(),
        customerName: 'Bandi',
        status: 'SENT',
        total: 75000,
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        items: [
          {
            id: 'mock-qi-1',
            productName: 'Terifrac Pen Injection 750 mcg',
            quantity: 30,
            rate: 2500,
            amount: 75000,
          },
        ],
      },
    ]
  }
  if (leadId === 'mock-5') {
    return [
      {
        id: 'mock-q-2',
        quotationNumber: 'QT-2026-0039',
        date: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
        customerName: 'AKASH',
        status: 'DRAFT',
        total: 180000,
        validUntil: null,
        items: [
          {
            id: 'mock-qi-2',
            productName: 'Lantus SoloStar Insulin Pen',
            quantity: 50,
            rate: 3600,
            amount: 180000,
          },
        ],
      },
      {
        id: 'mock-q-3',
        quotationNumber: 'QT-2026-0040',
        date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        customerName: 'AKASH',
        status: 'SENT',
        total: 165600,
        validUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        items: [
          {
            id: 'mock-qi-3',
            productName: 'Lantus SoloStar Insulin Pen',
            quantity: 50,
            rate: 3312,
            amount: 165600,
          },
        ],
      },
    ]
  }
  if (leadId === 'mock-8') {
    return [
      {
        id: 'mock-q-4',
        quotationNumber: 'QT-2026-0035',
        date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        customerName: 'Dr. Suresh Iyer',
        status: 'ACCEPTED',
        total: 95000,
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        items: [
          {
            id: 'mock-qi-4',
            productName: 'Surgical sutures (assorted)',
            quantity: 100,
            rate: 950,
            amount: 95000,
          },
        ],
      },
    ]
  }
  return []
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mockInvoicesForLead(leadId: string): any[] {
  if (leadId === 'mock-9') {
    return [
      {
        id: 'mock-inv-1',
        invoiceNumber: 'INV-2026-0102',
        date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        customerName: 'Yashoda Hospitals',
        status: 'PAID',
        grandTotal: 850000,
        amountPaid: 850000,
        type: 'TAX_INVOICE',
      },
    ]
  }
  if (leadId === 'mock-10') {
    return [
      {
        id: 'mock-inv-2',
        invoiceNumber: 'INV-2026-0095',
        date: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
        customerName: 'MedPlus',
        status: 'PARTIAL',
        grandTotal: 215000,
        amountPaid: 100000,
        type: 'TAX_INVOICE',
      },
    ]
  }
  if (leadId === 'mock-4') {
    return [
      {
        id: 'mock-inv-3',
        invoiceNumber: 'INV-2026-0099',
        date: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
        customerName: 'Mustafa Medical Stores',
        status: 'DRAFT',
        grandTotal: 45000,
        amountPaid: 0,
        type: 'TAX_INVOICE',
      },
    ]
  }
  return []
}

export function mockCounts(filtered: Lead[]): LeadListCounts {
  // counts ignore the active tab (so the pill row stays accurate when a
  // tab is selected) — match the backend's groupBy behavior.
  const base = mockFilteredLeads({
    q: undefined,
    tab: undefined,
    stage: undefined,
    source: undefined,
  })
  // Honor non-tab filters when computing counts so the pills update
  // alongside the rest of the filter row.
  void filtered
  const counts: LeadListCounts = {
    all: base.length,
    open: base.filter((l) => l.status === 'OPEN').length,
    closed: base.filter((l) => l.status === 'CLOSED').length,
    untouched: base.filter((l) => l.touchStatus === 'UNTOUCHED').length,
    lead: base.filter((l) => l.stage === 'LEAD').length,
    qualified: base.filter((l) => l.stage === 'QUALIFIED').length,
    proposal: base.filter((l) => l.stage === 'PROPOSAL').length,
    negotiation: base.filter((l) => l.stage === 'NEGOTIATION').length,
    won: base.filter((l) => l.stage === 'WON').length,
    lost: base.filter((l) => l.stage === 'LOST').length,
  }
  return counts
}
