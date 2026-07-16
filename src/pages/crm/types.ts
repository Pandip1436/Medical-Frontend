// Mirrors backend Prisma enums + the Lead include shape from leads.service.ts.
// Kept here so every component under /pages/crm/* shares one source of truth.

export type LeadStage =
  | 'LEAD'
  | 'QUALIFIED'
  | 'PROPOSAL'
  | 'NEGOTIATION'
  | 'WON'
  | 'LOST'

export type LeadStatus = 'OPEN' | 'CLOSED'
export type LeadTouchStatus = 'TOUCHED' | 'UNTOUCHED'
export type LeadSource =
  | 'MANUAL'
  | 'INDIAMART'
  | 'JUSTDIAL'
  | 'REFERRAL'
  | 'WEBSITE'
  | 'WHATSAPP'
  | 'CALL'
  | 'EMAIL'
  | 'OTHER'
export type LeadPipeline = 'SALES' | 'PROCUREMENT' | 'SUPPORT'

export type LeadTab =
  | 'all'
  | 'open'
  | 'closed'
  | 'untouched'
  | 'lead'
  | 'qualified'
  | 'proposal'
  | 'negotiation'
  | 'won'
  | 'lost'

export interface LeadContact {
  id: string
  firstName: string
  lastName?: string | null
  phone: string
  phoneCountryCode: string
  email?: string | null
  jobTitle?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  company?: LeadCompany | null
}

export interface LeadAssignee {
  id: string
  name: string
  email: string
}

export interface LeadCompany {
  id: string
  name: string
}

export interface Lead {
  id: string
  leadNumber: string
  title: string
  description?: string | null
  source: LeadSource
  pipeline: LeadPipeline
  stage: LeadStage
  status: LeadStatus
  touchStatus: LeadTouchStatus
  score: number
  value: number | string
  currency: string
  expectedCloseDate?: string | null
  validUntil?: string | null
  contact: LeadContact
  contactId: string
  company?: LeadCompany | null
  companyId?: string | null
  assignedToUser: LeadAssignee
  assignedToUserId: string
  branchId: string
  externalQueryId?: string | null
  externalMessage?: string | null
  externalProductName?: string | null
  externalCategory?: string | null
  externalCity?: string | null
  externalState?: string | null
  createdAt: string
  updatedAt: string
}

export interface LeadListCounts {
  all: number
  open: number
  closed: number
  untouched: number
  lead: number
  qualified: number
  proposal: number
  negotiation: number
  won: number
  lost: number
}

export interface LeadListResponse {
  data: Lead[]
  total: number
  page: number
  take: number
  counts: LeadListCounts
}

// The table column registry. `required: true` columns can't be hidden via
// the Columns popover (Customer Info is always shown).
export interface ColumnDef {
  id: string
  label: string
  required?: boolean
  defaultVisible?: boolean
}

export const ALL_COLUMNS: ColumnDef[] = [
  { id: 'customerInfo', label: 'Customer Info', required: true, defaultVisible: true },
  { id: 'leadNumber', label: 'Lead ID', defaultVisible: true },
  { id: 'description', label: 'Description', defaultVisible: true },
  { id: 'contact', label: 'Contact', defaultVisible: true },
  { id: 'email', label: 'Email', defaultVisible: true },
  { id: 'phone', label: 'Phone' },
  { id: 'company', label: 'Company' },
  { id: 'stage', label: 'Stage', defaultVisible: true },
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'source', label: 'Source', defaultVisible: true },
  // Inline server-side dropdown editor — the column header reads "Owner" in
  // the table but the underlying field is still the lead's assignedToUser.
  { id: 'salesPerson', label: 'Owner', defaultVisible: true },
  { id: 'score', label: 'Score', defaultVisible: true },
  { id: 'value', label: 'Value', defaultVisible: true },
  { id: 'created', label: 'Created', defaultVisible: true },
  { id: 'updated', label: 'Updated' },
]

export const STAGES: { value: LeadStage; label: string; color: string }[] = [
  { value: 'LEAD', label: 'Lead', color: 'blue' },
  { value: 'QUALIFIED', label: 'Qualified', color: 'purple' },
  { value: 'PROPOSAL', label: 'Proposal', color: 'amber' },
  { value: 'NEGOTIATION', label: 'Negotiation', color: 'orange' },
  { value: 'WON', label: 'Won', color: 'emerald' },
  { value: 'LOST', label: 'Lost', color: 'rose' },
]

export const SOURCES: { value: LeadSource; label: string }[] = [
  { value: 'MANUAL', label: 'Manual' },
  { value: 'INDIAMART', label: 'IndiaMART' },
  { value: 'JUSTDIAL', label: 'Just Dial' },
  { value: 'REFERRAL', label: 'Referral' },
  { value: 'WEBSITE', label: 'Website' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'CALL', label: 'Call' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'OTHER', label: 'Other' },
]

export const TABS: { value: LeadTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
  { value: 'untouched', label: 'Untouched' },
  { value: 'lead', label: 'Lead' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'negotiation', label: 'Negotiation' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
]
