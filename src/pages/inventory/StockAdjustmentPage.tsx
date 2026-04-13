import { useState, useMemo, useEffect } from 'react'
import { motion, type Variants } from 'framer-motion'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { toast } from 'sonner'
import {
  Search,
  Plus,
  Trash2,
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useMasterDataStore } from '@/stores/masterDataStore'
import api from '@/lib/api'
import { cn, formatCurrency, generateId, generateInvoiceNumber } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────
// Animation variants
// ─────────────────────────────────────────────────────────────

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: 'easeOut' as const },
  },
}

// ─────────────────────────────────────────────────────────────
// Adjustment types
// ─────────────────────────────────────────────────────────────

const adjustmentReasons = [
  'Physical Count',
  'Damaged',
  'Expired Removal',
  'Lost / Theft',
  'Sample Given',
  'Transfer Out',
  'Transfer In',
  'Other',
] as const

type AdjustmentReason = (typeof adjustmentReasons)[number]

interface AdjustmentItem {
  id: string
  productId: string
  productName: string
  batchId: string
  batchNumber: string
  systemQty: number
  adjustment: number
  newQty: number
  reason: AdjustmentReason
  mrp: number
}

// ─────────────────────────────────────────────────────────────
// Steps
// ─────────────────────────────────────────────────────────────

const steps = [
  { number: 1, label: 'Select Products' },
  { number: 2, label: 'Review' },
  { number: 3, label: 'Confirm' },
]

// ─────────────────────────────────────────────────────────────
// StockAdjustmentPage
// ─────────────────────────────────────────────────────────────

export default function StockAdjustmentPage() {
  const products = useMasterDataStore((s) => s.products)
  const batches = useMasterDataStore((s) => s.batches)
  const fetchProducts = useMasterDataStore((s) => s.fetchProducts)
  const updateBatchLocally = useMasterDataStore((s) => s.updateBatchLocally)

  const [currentStep, setCurrentStep] = useState(1)
  const [search, setSearch] = useState('')
  const [items, setItems] = useState<AdjustmentItem[]>([])
  const [referenceNumber, setReferenceNumber] = useState('')

  useEffect(() => {
    fetchProducts()
  }, [])

  // Search results for adding products
  const searchResults = useMemo(() => {
    if (!search.trim()) return []
    const q = search.toLowerCase()
    const matchedProducts = products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.genericName.toLowerCase().includes(q)
    )
    const results: Array<{ product: any; batch: any }> = []
    matchedProducts.forEach((product) => {
      const productBatches = batches.filter((b) => b.productId === product.id)
      productBatches.forEach((batch) => {
        const alreadyAdded = items.some((i) => i.batchId === batch.id)
        if (!alreadyAdded) {
          results.push({ product, batch })
        }
      })
    })
    return results.slice(0, 8)
  }, [search, items, products, batches])

  const addItem = (product: any, batch: any) => {
    setItems((prev) => [
      ...prev,
      {
        id: generateId('adj'),
        productId: product.id,
        productName: product.name,
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        systemQty: batch.quantity,
        adjustment: 0,
        newQty: batch.quantity,
        reason: 'Physical Count',
        mrp: Number(batch.mrp),
      },
    ])
    setSearch('')
  }

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  const updateAdjustment = (id: string, value: number) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, adjustment: value, newQty: item.systemQty + value }
          : item
      )
    )
  }

  const updateReason = (id: string, reason: AdjustmentReason) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, reason } : item))
    )
  }

  // Calculations
  const totalValueImpact = useMemo(() => {
    return items.reduce((sum, item) => sum + item.adjustment * item.mrp, 0)
  }, [items])
  
  const requiresApproval = Math.abs(totalValueImpact) > 5000

  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleConfirm = async () => {
    try {
      setIsSubmitting(true)
      
      // Optimistic UI updates
      items.forEach(item => {
        updateBatchLocally(item.batchId, item.adjustment)
      })
      
      const refNo = generateInvoiceNumber('ADJ', Math.floor(Math.random() * 1000) + 1)
      setReferenceNumber(refNo)
      setCurrentStep(3)

      // Make all adjustment API calls in parallel in background
      await Promise.all(
        items.map(item => 
          api.post(`/products/${item.productId}/batches/${item.batchId}/adjust`, {
            adjustmentQty: item.adjustment,
            reason: item.reason
          })
        )
      )

      toast.success('Stock adjustment saved successfully')
    } catch (error) {
      console.error(error)
      toast.error('Failed to process stock adjustments. Rolling back.')
      fetchProducts() // Rollback on failure
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReset = () => {
    setCurrentStep(1)
    setItems([])
    setSearch('')
    setReferenceNumber('')
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-6"
    >
      {/* Custom Flex Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <ClipboardList className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Stock Adjustment</h1>
            <p className="text-sm text-muted-foreground">
              Adjust stock quantities for physical count or discrepancies
            </p>
          </div>
        </div>
      </div>

      {/* ── Step Indicator ── */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={itemVariants}>
          <div className="flex items-center justify-center gap-2">
            {steps.map((step, index) => (
              <div key={step.number} className="flex items-center gap-2">
                <div
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold transition-all',
                    currentStep === step.number
                      ? 'bg-primary text-primary-foreground shadow-md shadow-primary/25'
                      : currentStep > step.number
                        ? 'bg-emerald-500 text-white'
                        : 'bg-muted text-muted-foreground'
                  )}
                >
                  {currentStep > step.number ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    step.number
                  )}
                </div>
                <span
                  className={cn(
                    'text-sm font-medium',
                    currentStep === step.number
                      ? 'text-foreground'
                      : 'text-muted-foreground'
                  )}
                >
                  {step.label}
                </span>
                {index < steps.length - 1 && (
                  <div
                    className={cn(
                      'mx-4 h-px w-16 transition-colors',
                      currentStep > step.number ? 'bg-emerald-500' : 'bg-border'
                    )}
                  />
                )}
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>

      {/* ── Step 1: Select Products ── */}
      {currentStep === 1 && (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-4"
        >
          <DataTableFilterBar
            searchQuery={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search products by name or generic name..."
            resultsCount={searchResults.length}
          />

          {/* Search results dropdown */}
          {searchResults.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-2 rounded-xl border border-border/60 bg-popover shadow-md"
            >
              {searchResults.map(({ product, batch }) => (
                <button
                  key={batch.id}
                  onClick={() => addItem(product, batch)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-sm transition-colors hover:bg-muted/50"
                >
                  <div>
                    <p className="font-medium">{product.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Batch: <span className="font-mono">{batch.batchNumber}</span> | Qty: <span className="font-mono">{batch.quantity}</span> |
                      MRP: <span className="font-mono">{formatCurrency(Number(batch.mrp))}</span>
                    </p>
                  </div>
                  <Plus className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </motion.div>
          )}

          {/* Adjustment Table */}
          <motion.div variants={itemVariants}>
            {items.length > 0 ? (
              <div className="rounded-2xl border border-border/60 bg-card shadow">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <TableHead>Product</TableHead>
                      <TableHead>Batch</TableHead>
                      <TableHead className="text-right">System Qty</TableHead>
                      <TableHead className="text-center w-[140px]">
                        Adjustment (+/-)
                      </TableHead>
                      <TableHead className="text-right">New Qty</TableHead>
                      <TableHead className="w-[180px]">Reason</TableHead>
                      <TableHead className="w-[50px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id} className="border-b border-border/40">
                        <TableCell className="font-medium">
                          {item.productName}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {item.batchNumber}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {item.systemQty}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={item.adjustment}
                            onChange={(e) =>
                              updateAdjustment(
                                item.id,
                                parseInt(e.target.value) || 0
                              )
                            }
                            className={cn(
                              'h-9 w-full text-center font-mono',
                              item.adjustment > 0 &&
                                'border-emerald-500 text-emerald-600 dark:text-emerald-400',
                              item.adjustment < 0 &&
                                'border-red-500 text-red-600 dark:text-red-400'
                            )}
                          />
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right font-mono text-sm font-semibold',
                            item.newQty < 0 && 'text-red-600 dark:text-red-400'
                          )}
                        >
                          {item.newQty}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={item.reason}
                            onValueChange={(v) =>
                              updateReason(item.id, v as AdjustmentReason)
                            }
                          >
                            <SelectTrigger className="h-9 rounded-xl">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {adjustmentReasons.map((r) => (
                                <SelectItem key={r} value={r}>
                                  {r}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => removeItem(item.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-border/60 bg-card py-16 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                  <ClipboardList className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="mb-1 text-lg font-semibold">
                  No products added yet
                </h3>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Search and add products above to begin a stock adjustment.
                </p>
              </div>
            )}
          </motion.div>

          {/* Step 1 Footer */}
          {items.length > 0 && (
            <motion.div variants={itemVariants}>
              <div className="flex justify-end">
                <Button onClick={() => setCurrentStep(2)}>
                  Review Adjustments
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          )}
        </motion.div>
      )}

      {/* ── Step 2: Review ── */}
      {currentStep === 2 && (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-4"
        >
          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Adjustment Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl border border-border/60 bg-card shadow">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        <TableHead>Product</TableHead>
                        <TableHead>Batch</TableHead>
                        <TableHead className="text-right">System Qty</TableHead>
                        <TableHead className="text-right">
                          Adjustment
                        </TableHead>
                        <TableHead className="text-right">New Qty</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead className="text-right">
                          Value Impact
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item) => {
                        const impact = item.adjustment * item.mrp
                        return (
                          <TableRow key={item.id} className="border-b border-border/40">
                            <TableCell className="font-medium">
                              {item.productName}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {item.batchNumber}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {item.systemQty}
                            </TableCell>
                            <TableCell
                              className={cn(
                                'text-right font-mono text-sm font-semibold',
                                item.adjustment > 0 &&
                                  'text-emerald-600 dark:text-emerald-400',
                                item.adjustment < 0 &&
                                  'text-red-600 dark:text-red-400'
                              )}
                            >
                              {item.adjustment > 0
                                ? `+${item.adjustment}`
                                : item.adjustment}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {item.newQty}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" size="sm">{item.reason}</Badge>
                            </TableCell>
                            <TableCell
                              className={cn(
                                'text-right font-mono text-sm font-semibold',
                                impact > 0 &&
                                  'text-emerald-600 dark:text-emerald-400',
                                impact < 0 &&
                                  'text-red-600 dark:text-red-400'
                              )}
                            >
                              {impact > 0
                                ? `+${formatCurrency(impact)}`
                                : formatCurrency(impact)}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>

                <Separator className="bg-border/60" />

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Total items: <span className="font-mono">{items.length}</span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Total value impact:{' '}
                      <span
                        className={cn(
                          'font-mono font-semibold',
                          totalValueImpact > 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : totalValueImpact < 0
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-foreground'
                        )}
                      >
                        {totalValueImpact > 0
                          ? `+${formatCurrency(totalValueImpact)}`
                          : formatCurrency(totalValueImpact)}
                      </span>
                    </p>
                  </div>
                </div>

                {/* Approval warning */}
                {requiresApproval && (
                  <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50/50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <div>
                      <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                        Requires Admin Approval
                      </p>
                      <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
                        Total adjustment value exceeds {formatCurrency(5000)}.
                        This adjustment will require admin approval before
                        processing.
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Step 2 Footer */}
          <motion.div variants={itemVariants}>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setCurrentStep(1)}>
                <ChevronLeft className="mr-1 h-4 w-4" />
                Back
              </Button>
              <Button onClick={handleConfirm} disabled={isSubmitting}>
                <CheckCircle2 className="mr-1 h-4 w-4" />
                {isSubmitting ? 'Processing...' : 'Confirm Adjustment'}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* ── Step 3: Confirmation ── */}
      {currentStep === 3 && (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={itemVariants}>
            <div className="flex flex-col items-center justify-center py-16">
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/15 dark:bg-emerald-500/10">
                <CheckCircle2 className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h2 className="mb-2 text-2xl font-bold">
                Adjustment Saved Successfully
              </h2>
              <p className="mb-4 text-muted-foreground">
                Your stock adjustment has been recorded.
              </p>
              <div className="mb-8 rounded-xl border border-border/60 bg-muted/50 dark:bg-muted/30 px-6 py-4 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Reference Number
                </p>
                <p className="mt-1 font-mono text-lg font-bold">
                  {referenceNumber}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={handleReset}>
                  New Adjustment
                </Button>
                <Button
                  onClick={() => toast.info('Navigating to adjustment history...')}
                >
                  View History
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  )
}
