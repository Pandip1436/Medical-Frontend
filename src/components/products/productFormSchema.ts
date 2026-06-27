import { z } from 'zod'

// Pharmacy product master schema. Trimmed to 17 fields after the user asked to
// match Zoho-style compactness: clinical-detail noise (salt composition,
// storage condition, narcotic toggle) is dropped from the UI entirely and the
// backend fills in defaults. Stock fields stay because the low-stock alert
// pipeline (billing.service.ts) reads `minStock` after every sale.
export const productSchema = z
  .object({
    // Required — identity + clinical + compliance + key pricing
    name: z.string().min(1, 'Product name is required'),
    genericName: z.string().min(1, 'Generic name is required'),
    manufacturer: z.string().min(1, 'Manufacturer is required'),
    hsnCode: z.string().min(1, 'HSN code is required'),
    schedule: z.enum(['NONE', 'H', 'H1', 'X']),
    mrp: z.coerce.number().min(0.01, 'MRP is required'),
    sellingRate: z.coerce.number().min(0.01, 'Selling price is required'),
    gstRate: z.coerce.number(),
    // minStock is required — it drives the low-stock alert (see
    // billing.service.ts deductStockForItem). Form starts at 0 but the user
    // must confirm a value (UI shows the * marker).
    minStock: z.coerce.number().min(0, 'Min stock is required'),

    // Optional — empty defaults if the user skips them
    categoryId: z.string().optional().default(''),
    packSize: z.string().optional().default(''),
    unitOfMeasure: z.string().optional().default(''),
    purchaseRate: z.coerce.number().min(0).default(0),
    wholesaleRate: z.coerce.number().min(0).default(0),
    rackLocation: z.string().optional().default(''),
    maxStock: z.coerce.number().min(0).default(0),
    reorderQty: z.coerce.number().min(0).default(0),
  })
  // MRP is the legal maximum a pharmacy can charge under the Drugs (Prices
  // Control) Order, so selling above it is non-negotiable. Validate at the
  // form layer so the error attaches to the Selling Price field directly.
  .refine(
    (data) => Number(data.sellingRate) <= Number(data.mrp),
    {
      message: 'Selling price cannot exceed MRP',
      path: ['sellingRate'],
    },
  )
  // Don't sell below cost — a purchase rate above the selling price means
  // every sale loses money, which is almost always a data-entry mistake.
  // Purchase rate is optional (0 = not entered), so only check when it's set.
  .refine(
    (data) => Number(data.purchaseRate) <= 0 || Number(data.purchaseRate) <= Number(data.sellingRate),
    {
      message: 'Purchase rate cannot exceed selling price',
      path: ['purchaseRate'],
    },
  )
  // Cost above the legal max retail price (MRP) is impossible to recover —
  // the product could never be sold at a profit. Only check when set.
  .refine(
    (data) => Number(data.purchaseRate) <= 0 || Number(data.purchaseRate) <= Number(data.mrp),
    {
      message: 'Purchase rate cannot exceed MRP',
      path: ['purchaseRate'],
    },
  )
  // Wholesale rate is still a retail-bound price and cannot exceed the MRP
  // ceiling. Optional (0 = not entered), so only check when it's set.
  .refine(
    (data) => Number(data.wholesaleRate) <= 0 || Number(data.wholesaleRate) <= Number(data.mrp),
    {
      message: 'Wholesale rate cannot exceed MRP',
      path: ['wholesaleRate'],
    },
  )

export type ProductFormValues = z.input<typeof productSchema>

// Numeric fields start EMPTY (not a literal 0) so the user isn't forced to
// clear a "0" before typing. They're held as empty strings in the form and
// coerced back to numbers by `z.coerce.number()` on submit (empty → 0, which
// still trips the `min(0.01)` "required" checks on MRP / Selling Price).
export const productFormDefaults = {
  name: '',
  genericName: '',
  manufacturer: '',
  hsnCode: '',
  schedule: 'NONE',
  mrp: '',
  sellingRate: '',
  gstRate: 5,
  minStock: '',
  categoryId: '',
  packSize: '',
  unitOfMeasure: '',
  purchaseRate: '',
  wholesaleRate: '',
  rackLocation: '',
  maxStock: '',
  reorderQty: '',
} as unknown as ProductFormValues
