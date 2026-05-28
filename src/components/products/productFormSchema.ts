import { z } from 'zod'

export const productSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  genericName: z.string().min(1, 'Generic name is required'),
  saltComposition: z.string().optional().default(''),
  manufacturer: z.string().min(1, 'Manufacturer is required'),
  categoryId: z.string().min(1, 'Category is required'),
  packSize: z.string().min(1, 'Pack size is required'),
  unitOfMeasure: z.string().min(1, 'Unit of measure is required'),
  schedule: z.enum(['NONE', 'H', 'H1', 'X']),
  hsnCode: z.string().min(1, 'HSN code is required'),
  isNarcotic: z.boolean().default(false),
  storageCondition: z.enum(['ROOM_TEMP', 'COOL_DRY', 'REFRIGERATED', 'FROZEN']),
  mrp: z.coerce.number().min(0.01, 'MRP is required'),
  purchaseRate: z.coerce.number().min(0.01, 'Purchase rate is required'),
  sellingRate: z.coerce.number().min(0),
  wholesaleRate: z.coerce.number().min(0),
  gstRate: z.coerce.number(),
  minStock: z.coerce.number().min(0).default(0),
  maxStock: z.coerce.number().min(0).default(0),
  reorderQty: z.coerce.number().min(0).default(0),
  rackLocation: z.string().min(1, 'Rack location is required'),
})

export type ProductFormValues = z.input<typeof productSchema>

export const productFormDefaults: ProductFormValues = {
  name: '',
  genericName: '',
  saltComposition: '',
  manufacturer: '',
  categoryId: '',
  packSize: '',
  unitOfMeasure: '',
  schedule: 'NONE',
  hsnCode: '',
  isNarcotic: false,
  storageCondition: 'ROOM_TEMP',
  mrp: 0,
  purchaseRate: 0,
  sellingRate: 0,
  wholesaleRate: 0,
  gstRate: 5,
  minStock: 0,
  maxStock: 0,
  reorderQty: 0,
  rackLocation: '',
}
