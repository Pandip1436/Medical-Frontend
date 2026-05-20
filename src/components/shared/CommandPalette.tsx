import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Command } from 'cmdk'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard,
  FileText,
  ShoppingCart,
  Package,
  Users,
  BookOpen,
  PieChart,
  Settings,
  PlusCircle,
  Zap,
  FileCheck,
  RotateCcw,
  PackageCheck,
  Truck,
  BarChart3,
  Clock,
  Settings2,
  IndianRupee,
  Receipt,
  FileSpreadsheet,
  TrendingUp,
  Search,
  ArrowRight,
  Hash,
  Star,
  Calculator,
  ShieldCheck,
} from 'lucide-react'
import { navigate } from '@/lib/router'
import { useMasterDataStore } from '@/stores/masterDataStore'

interface CommandItem {
  id: string
  label: string
  icon: React.ElementType
  href?: string
  shortcut?: string
  subtitle?: string
  section: string
  keywords?: string
}

const allItems: CommandItem[] = [
  // Quick Actions
  { id: 'quick-sale', label: 'New Sale', icon: Zap, href: '/billing/new', shortcut: 'Alt+N', section: 'Quick Actions', keywords: 'bill invoice create' },
  { id: 'quick-product', label: 'Add Product', icon: PlusCircle, href: '/inventory/products', shortcut: 'Alt+P', section: 'Quick Actions', keywords: 'medicine drug create' },
  { id: 'quick-customer', label: 'Add Customer', icon: Users, href: '/customers', shortcut: 'Alt+C', section: 'Quick Actions', keywords: 'client create new' },

  // Navigation
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard', section: 'Navigation', keywords: 'home overview' },
  { id: 'sales-list', label: 'Sales List', icon: FileText, href: '/billing/sales', section: 'Navigation', keywords: 'invoices bills' },
  { id: 'quotations', label: 'Quotations', icon: FileCheck, href: '/billing/quotations', section: 'Navigation', keywords: 'quotes estimates' },
  { id: 'sales-returns', label: 'Sales Returns', icon: RotateCcw, href: '/billing/returns', section: 'Navigation', keywords: 'credit note refund' },
  { id: 'purchase-orders', label: 'Purchase Orders', icon: ShoppingCart, href: '/purchase/orders', section: 'Navigation', keywords: 'po buy' },
  { id: 'goods-receipt', label: 'Purchase Entry', icon: PackageCheck, href: '/purchase/grn', section: 'Navigation', keywords: 'grn receive goods receipt purchase entry' },
  { id: 'purchase-returns', label: 'Purchase Returns', icon: RotateCcw, href: '/purchase/returns', section: 'Navigation', keywords: 'debit note' },
  { id: 'suppliers', label: 'Suppliers', icon: Truck, href: '/purchase/suppliers', section: 'Navigation', keywords: 'vendors distributors' },
  { id: 'products', label: 'Products', icon: Package, href: '/inventory/products', section: 'Navigation', keywords: 'inventory medicines drugs' },
  { id: 'stock-overview', label: 'Stock Overview', icon: BarChart3, href: '/inventory/stock', section: 'Navigation', keywords: 'quantity levels' },
  { id: 'expiry-management', label: 'Expiry Management', icon: Clock, href: '/inventory/expiry', section: 'Navigation', keywords: 'expired near expiry date' },
  { id: 'stock-adjustment', label: 'Stock Adjustment', icon: Settings2, href: '/inventory/adjustment', section: 'Navigation', keywords: 'damage loss correction' },
  { id: 'customers', label: 'Customer List', icon: Users, href: '/customers', section: 'Navigation', keywords: 'clients hospitals doctors' },
  { id: 'outstanding', label: 'Outstanding', icon: IndianRupee, href: '/customers/outstanding', section: 'Navigation', keywords: 'dues receivable pending payment' },
  { id: 'cash-book', label: 'Cash Book', icon: BookOpen, href: '/accounting/cashbook', section: 'Navigation', keywords: 'transactions ledger' },
  { id: 'expenses', label: 'Expenses', icon: Receipt, href: '/accounting/expenses', section: 'Navigation', keywords: 'costs spending' },
  { id: 'ledger', label: 'Ledger', icon: FileSpreadsheet, href: '/accounting/ledger', section: 'Navigation', keywords: 'accounts book' },
  { id: 'pnl', label: 'Profit & Loss', icon: TrendingUp, href: '/accounting/pnl', section: 'Navigation', keywords: 'income statement revenue' },
  { id: 'reports', label: 'Report Hub', icon: PieChart, href: '/reports', section: 'Navigation', keywords: 'analytics data' },
  { id: 'users', label: 'User Management', icon: Users, href: '/users', section: 'Navigation', keywords: 'roles permissions staff accounts' },
  { id: 'audit-trail', label: 'Audit Trail', icon: ShieldCheck, href: '/audit-trail', section: 'Navigation', keywords: 'log history changes' },
  { id: 'settings', label: 'Settings', icon: Settings, href: '/settings', section: 'Navigation', keywords: 'preferences configuration invoice prefix numbering format counter sequence template' },
]


const sectionIcons: Record<string, React.ElementType> = {
  'Quick Actions': Star,
  'Navigation': ArrowRight,
  'Products': Package,
  'Customers': Users,
  'Recent Invoices': Hash,
}

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
}

const dialogVariants = {
  hidden: { opacity: 0, scale: 0.96, y: -10 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.15, ease: [0.16, 1, 0.3, 1] as const },
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    y: -10,
    transition: { duration: 0.1 },
  },
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const storeProducts = useMasterDataStore((s) => s.products)
  const storeCustomers = useMasterDataStore((s) => s.customers)
  const fetchMasterData = useMasterDataStore((s) => s.fetchMasterData)
  const fetchedRef = useRef(false)

  // Fetch once when palette opens for the first time
  useEffect(() => {
    if (open && !fetchedRef.current) {
      fetchedRef.current = true
      fetchMasterData()
    }
  }, [open, fetchMasterData])

  const items = useMemo(() => {
    const productItems: CommandItem[] = storeProducts.slice(0, 8).map((p) => ({
      id: `prod-${p.id}`,
      label: p.name,
      icon: Package,
      href: '/inventory/products',
      subtitle: `Stock: ${p.totalStock ?? 0}`,
      section: 'Products',
      keywords: `${p.genericName ?? ''} ${p.category ?? ''}`,
    }))
    const customerItems: CommandItem[] = storeCustomers.slice(0, 6).map((c) => ({
      id: `cust-${c.id}`,
      label: c.name,
      icon: Users,
      href: '/customers',
      subtitle: c.type,
      section: 'Customers',
      keywords: c.type,
    }))
    return [...allItems, ...productItems, ...customerItems]
  }, [storeProducts, storeCustomers])

  const sections = useMemo(() => {
    const map = new Map<string, CommandItem[]>()
    for (const item of items) {
      const list = map.get(item.section) || []
      list.push(item)
      map.set(item.section, list)
    }
    return map
  }, [items])

  // Global keyboard listener
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    },
    []
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Reset search when closed
  useEffect(() => {
    if (!open) setSearch('')
  }, [open])

  const navigateTo = (path: string) => {
    setOpen(false)
    navigate(path)
  }

  const resultCount = items.filter((i) =>
    `${i.label} ${i.subtitle || ''} ${i.keywords || ''}`
      .toLowerCase()
      .includes(search.toLowerCase())
  ).length

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          {/* Overlay */}
          <motion.div
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Dialog */}
          <motion.div
            variants={dialogVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute left-1/2 top-[15%] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2"
          >
            <Command
              className="overflow-hidden rounded-2xl border border-border/60 bg-popover/95 shadow-2xl backdrop-blur-xl"
              shouldFilter={true}
              loop
            >
              {/* Search input */}
              <div className="flex items-center gap-3 border-b border-border/60 px-4">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                <Command.Input
                  value={search}
                  onValueChange={setSearch}
                  placeholder="Search commands, products, customers..."
                  className="flex h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                />
                <kbd className="pointer-events-none hidden h-5 select-none items-center rounded-md border border-border/60 bg-muted/50 px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:inline-flex">
                  ESC
                </kbd>
              </div>

              {/* Results */}
              <Command.List className="max-h-[min(60vh,400px)] overflow-y-auto overscroll-contain p-2">
                <Command.Empty className="flex flex-col items-center gap-2 py-12 text-center">
                  <Calculator className="h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">No results found</p>
                  <p className="text-xs text-muted-foreground/60">Try a different search term</p>
                </Command.Empty>

                {Array.from(sections.entries()).map(([section, sectionItems]) => {
                  const SectionIcon = sectionIcons[section] || ArrowRight
                  return (
                    <Command.Group
                      key={section}
                      heading={
                        <span className="flex items-center gap-1.5">
                          <SectionIcon className="h-3 w-3" />
                          {section}
                        </span>
                      }
                      className="**:[[cmdk-group-heading]]:flex **:[[cmdk-group-heading]]:items-center **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-[10px] **:[[cmdk-group-heading]]:font-semibold **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-wider **:[[cmdk-group-heading]]:text-muted-foreground/60"
                    >
                      {sectionItems.map((item) => {
                        const Icon = item.icon
                        return (
                          <Command.Item
                            key={item.id}
                            value={`${item.label} ${item.subtitle || ''} ${item.keywords || ''}`}
                            onSelect={() => item.href && navigateTo(item.href)}
                            className="group flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors aria-selected:bg-accent/80 aria-selected:text-accent-foreground"
                          >
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/40 bg-muted/40 transition-colors group-aria-selected:border-primary/30 group-aria-selected:bg-primary/10">
                              <Icon className="h-3.5 w-3.5 text-muted-foreground transition-colors group-aria-selected:text-primary" />
                            </span>
                            <span className="flex flex-1 flex-col gap-0.5">
                              <span className="font-medium leading-none">{item.label}</span>
                              {item.subtitle && (
                                <span className="text-[11px] leading-none text-muted-foreground/70">
                                  {item.subtitle}
                                </span>
                              )}
                            </span>
                            {item.shortcut && (
                              <kbd className="pointer-events-none hidden h-5 select-none items-center gap-0.5 rounded-md border border-border/60 bg-muted/50 px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:inline-flex">
                                {item.shortcut}
                              </kbd>
                            )}
                            <ArrowRight className="h-3 w-3 text-muted-foreground/0 transition-all group-aria-selected:text-muted-foreground/60 group-aria-selected:translate-x-0 -translate-x-1" />
                          </Command.Item>
                        )
                      })}
                    </Command.Group>
                  )
                })}
              </Command.List>

              {/* Footer */}
              <div className="flex items-center justify-between border-t border-border/60 px-4 py-2">
                <div className="flex items-center gap-4 text-[10px] text-muted-foreground/60">
                  <span className="flex items-center gap-1">
                    <kbd className="rounded border border-border/60 bg-muted/50 px-1 py-0.5 font-mono">↑↓</kbd>
                    Navigate
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="rounded border border-border/60 bg-muted/50 px-1 py-0.5 font-mono">↵</kbd>
                    Open
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="rounded border border-border/60 bg-muted/50 px-1 py-0.5 font-mono">Esc</kbd>
                    Close
                  </span>
                </div>
                {search && (
                  <span className="text-[10px] text-muted-foreground/60">
                    {resultCount} result{resultCount !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </Command>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
