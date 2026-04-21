import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  Plus,
  Search,
  UserCheck,
  UserX,
  Phone,
  Mail,
  MoreHorizontal,
  Pencil,
  TrendingUp,
  Building2,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuthStore } from '@/stores/authStore'
import { useBranchStore } from '@/stores/branchStore'
import api from '@/lib/api'

// ─── Types ────────────────────────────────────────────────────

interface Salesperson {
  id: string
  name: string
  email: string
  phone: string
  isActive: boolean
  branchId?: string
  lastLogin?: string
  createdAt: string
}

// ─── Schema ───────────────────────────────────────────────────

const salespersonSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
  phone: z
    .string()
    .min(10, 'Phone must be 10 digits')
    .max(10, 'Phone must be 10 digits')
    .regex(/^\d{10}$/, 'Phone must be exactly 10 digits'),
  password: z.string().optional(),
  branchId: z.string().min(1, 'Branch is required'),
})

const createSchema = salespersonSchema.extend({
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

type FormValues = z.infer<typeof salespersonSchema>

// ─── Card ─────────────────────────────────────────────────────

function SalespersonCard({
  sp,
  branchName,
  isAdmin,
  onEdit,
  onToggle,
}: {
  sp: Salesperson
  branchName: string
  isAdmin: boolean
  onEdit: (s: Salesperson) => void
  onToggle: (s: Salesperson) => void
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="group relative flex flex-col gap-3 rounded-xl border border-border/40 bg-background p-4 transition-shadow hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/10">
            <UserCheck className="h-5 w-5 text-orange-600 dark:text-orange-400" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-sm">{sp.name}</p>
            <p className="truncate text-xs text-muted-foreground">Salesperson</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge variant={sp.isActive ? 'success' : 'secondary'} size="sm">
            {sp.isActive ? 'Active' : 'Inactive'}
          </Badge>
          {isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={() => onEdit(sp)}>
                  <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onToggle(sp)}>
                  {sp.isActive
                    ? <><UserX className="mr-2 h-3.5 w-3.5" /> Deactivate</>
                    : <><UserCheck className="mr-2 h-3.5 w-3.5" /> Activate</>}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Phone className="h-3 w-3 shrink-0" />
          <span>{sp.phone}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Mail className="h-3 w-3 shrink-0" />
          <span className="truncate">{sp.email}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Building2 className="h-3 w-3 shrink-0" />
          <span className="truncate">{branchName || 'No branch'}</span>
        </div>
      </div>
    </motion.div>
  )
}

// ─── Main Page ────────────────────────────────────────────────

export default function SalespersonsPage() {
  const { user } = useAuthStore()
  const { branches, fetchBranches } = useBranchStore()
  const isAdmin = user?.role === 'ADMIN'

  const [salespersons, setSalespersons] = useState<Salesperson[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Salesperson | null>(null)
  const [saving, setSaving] = useState(false)
  const [selectedBranchId, setSelectedBranchId] = useState('')

  const schema = editing ? salespersonSchema : createSchema

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { branchId: '' },
  })

  useEffect(() => { fetchBranches() }, [fetchBranches])

  const fetchSalespersons = async () => {
    try {
      // Fetch all salespersons without branch filter so admin sees all
      const { data } = await api.get('/salespersons', { params: { branchId: undefined } })
      setSalespersons(data)
    } catch {
      toast.error('Failed to load salespersons')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchSalespersons() }, [])

  const filtered = useMemo(() => {
    return salespersons.filter((sp) => {
      const matchSearch = search === '' ||
        sp.name.toLowerCase().includes(search.toLowerCase()) ||
        sp.email.toLowerCase().includes(search.toLowerCase()) ||
        sp.phone.includes(search)
      const matchStatus =
        filterStatus === 'ALL' ||
        (filterStatus === 'ACTIVE' && sp.isActive) ||
        (filterStatus === 'INACTIVE' && !sp.isActive)
      return matchSearch && matchStatus
    })
  }, [salespersons, search, filterStatus])

  const getBranchName = (branchId?: string) => {
    if (!branchId) return ''
    return branches.find((b) => b.id === branchId)?.name ?? branchId
  }

  const openCreate = () => {
    setEditing(null)
    setSelectedBranchId('')
    reset({ name: '', email: '', phone: '', password: '', branchId: '' })
    setDialogOpen(true)
  }

  const openEdit = (sp: Salesperson) => {
    setEditing(sp)
    setSelectedBranchId(sp.branchId ?? '')
    reset({
      name: sp.name,
      email: sp.email,
      phone: sp.phone,
      password: '',
      branchId: sp.branchId ?? '',
    })
    setDialogOpen(true)
  }

  const onSubmit = async (values: FormValues) => {
    setSaving(true)
    try {
      const payload: any = {
        name: values.name,
        email: values.email,
        phone: values.phone,
        branchId: values.branchId,
      }
      if (values.password) payload.password = values.password

      if (editing) {
        await api.patch(`/salespersons/${editing.id}`, payload)
        toast.success('Salesperson updated')
      } else {
        await api.post('/salespersons', payload)
        toast.success('Salesperson created')
      }
      setDialogOpen(false)
      fetchSalespersons()
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to save salesperson')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (sp: Salesperson) => {
    try {
      await api.patch(`/salespersons/${sp.id}/toggle`)
      toast.success(sp.isActive ? 'Salesperson deactivated' : 'Salesperson activated')
      fetchSalespersons()
    } catch {
      toast.error('Failed to update status')
    }
  }

  const activeCount = salespersons.filter((s) => s.isActive).length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-border/40">
        <div>
          <p className="text-sm text-muted-foreground">
            {activeCount} active · {salespersons.length} total
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg border border-border/50 overflow-hidden text-xs">
            {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-3 py-1.5 font-medium transition-colors capitalize ${
                  filterStatus === s
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent'
                }`}
              >
                {s.toLowerCase()}
              </button>
            ))}
          </div>
          {isAdmin && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" />
              Add Salesperson
            </Button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="px-4 sm:px-6 py-3 border-b border-border/40">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="h-7 w-7 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <TrendingUp className="h-7 w-7 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium text-sm">No salespersons found</p>
              <p className="text-xs text-muted-foreground mt-1">
                {isAdmin ? 'Add your first salesperson to get started.' : 'No salespersons available.'}
              </p>
            </div>
            {isAdmin && (
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-1" />
                Add Salesperson
              </Button>
            )}
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((sp) => (
                <SalespersonCard
                  key={sp.id}
                  sp={sp}
                  branchName={getBranchName(sp.branchId)}
                  isAdmin={isAdmin}
                  onEdit={openEdit}
                  onToggle={handleToggle}
                />
              ))}
            </div>
          </AnimatePresence>
        )}
      </div>

      {/* Add/Edit Dialog */}
      {isAdmin && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editing ? 'Edit Salesperson' : 'Add Salesperson'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="name">Full Name</Label>
                <Input id="name" {...register('name')} placeholder="John Doe" />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" {...register('phone')} placeholder="9876543210" maxLength={10} />
                {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" {...register('email')} placeholder="john@example.com" />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>Branch</Label>
                <Select
                  value={selectedBranchId}
                  onValueChange={(val) => {
                    setSelectedBranchId(val)
                    setValue('branchId', val, { shouldValidate: true })
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select branch..." />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.filter((b) => b.isActive).map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name} <span className="text-muted-foreground text-xs">({b.code})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.branchId && <p className="text-xs text-destructive">{errors.branchId.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">
                  {editing ? 'New Password (leave blank to keep current)' : 'Password'}
                </Label>
                <Input
                  id="password"
                  type="password"
                  {...register('password')}
                  placeholder={editing ? '••••••••' : 'Min 6 characters'}
                />
                {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
