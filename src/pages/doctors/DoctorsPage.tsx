import { useState, useEffect, useMemo, useCallback } from 'react'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import { motion, AnimatePresence } from 'framer-motion'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  Plus,
  Search,
  Stethoscope,
  Phone,
  Mail,
  BadgeCheck,
  MoreHorizontal,
  Pencil,
  Trash2,
  UserCheck,
  UserX,
  Filter,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { DataTablePagination } from '@/components/shared/DataTablePagination'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import api from '@/lib/api'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface Doctor {
  id: string
  name: string
  specialization: string
  phone: string
  regNumber?: string
  email?: string
  address?: string
  isActive: boolean
  createdAt: string
}

const SPECIALIZATIONS = [
  'Nephrologist',
  'Oncologist',
  'General Physician',
  'Urologist',
  'Cardiologist',
  'Diabetologist',
  'Neurologist',
  'Pulmonologist',
  'Gastroenterologist',
  'Orthopedician',
  'Pediatrician',
  'Gynecologist',
  'Dermatologist',
  'ENT Specialist',
  'Ophthalmologist',
  'Psychiatrist',
  'Other',
]

// ─────────────────────────────────────────────────────────────
// Form schema
// ─────────────────────────────────────────────────────────────

const doctorSchema = z.object({
  name: z.string().min(1, 'Doctor name is required'),
  specialization: z.string().min(1, 'Specialization is required'),
  phone: z
    .string()
    .min(10, 'Phone must be 10 digits')
    .max(10, 'Phone must be 10 digits')
    .regex(/^\d{10}$/, 'Phone must be exactly 10 digits'),
  regNumber: z.string().optional(),
  email: z.union([z.string().email('Invalid email'), z.literal('')]).optional(),
  address: z.string().optional(),
})

type DoctorFormValues = z.infer<typeof doctorSchema>

const PAGE_SIZE = 12

// ─────────────────────────────────────────────────────────────
// Doctor Card
// ─────────────────────────────────────────────────────────────

function DoctorCard({
  doctor,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  doctor: Doctor
  onEdit: (d: Doctor) => void
  onToggleActive: (d: Doctor) => void
  onDelete: (d: Doctor) => void
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="group relative flex flex-col gap-3 rounded-xl border border-border/40 bg-background p-4 transition-shadow hover:shadow-sm"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
            <Stethoscope className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-sm">{doctor.name}</p>
            <p className="truncate text-xs text-muted-foreground">{doctor.specialization}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge variant={doctor.isActive ? 'success' : 'secondary'} size="sm">
            {doctor.isActive ? 'Active' : 'Inactive'}
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => onEdit(doctor)}>
                <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onToggleActive(doctor)}>
                {doctor.isActive
                  ? <><UserX className="mr-2 h-3.5 w-3.5" /> Deactivate</>
                  : <><UserCheck className="mr-2 h-3.5 w-3.5" /> Activate</>}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onDelete(doctor)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Contact info */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Phone className="h-3 w-3 shrink-0" />
          <span>{doctor.phone}</span>
        </div>
        {doctor.email && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Mail className="h-3 w-3 shrink-0" />
            <span className="truncate">{doctor.email}</span>
          </div>
        )}
        {doctor.regNumber && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <BadgeCheck className="h-3 w-3 shrink-0" />
            <span>Reg: {doctor.regNumber}</span>
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────

export default function DoctorsPage() {
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterSpec, setFilterSpec] = useState('all')
  const [showInactive, setShowInactive] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingDoctor, setEditingDoctor] = useState<Doctor | null>(null)
  const [saving, setSaving] = useState(false)

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DoctorFormValues>({
    resolver: zodResolver(doctorSchema),
    defaultValues: {
      name: '', specialization: '', phone: '',
      regNumber: '', email: '', address: '',
    },
  })

  // ── Fetch ──────────────────────────────────────────────────
  const fetchDoctors = useCallback(async () => {
    try {
      const res = await api.get(`/doctors${showInactive ? '?includeInactive=true' : ''}`)
      setDoctors(Array.isArray(res.data) ? res.data : [])
    } catch {
      toast.error('Failed to load doctors')
    } finally {
      setIsLoading(false)
    }
  }, [showInactive])

  useEffect(() => { fetchDoctors() }, [fetchDoctors])
  useBranchRefresh(fetchDoctors)

  // ── Filtered list ──────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = doctors
    if (filterSpec !== 'all') list = list.filter((d) => d.specialization === filterSpec)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.specialization.toLowerCase().includes(q) ||
          d.phone.includes(q) ||
          (d.regNumber ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [doctors, searchQuery, filterSpec])

  const specializations = useMemo(
    () => Array.from(new Set(doctors.map((d) => d.specialization))),
    [doctors]
  )

  // ── Pagination ─────────────────────────────────────────────
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginatedDoctors = useMemo(() => {
    return filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  }, [filtered, currentPage])

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, filterSpec, showInactive])

  // ── Dialog helpers ──────────────────────────────────────────
  const openAdd = () => {
    setEditingDoctor(null)
    reset({ name: '', specialization: '', phone: '', regNumber: '', email: '', address: '' })
    setDialogOpen(true)
  }

  const openEdit = (doctor: Doctor) => {
    setEditingDoctor(doctor)
    reset({
      name: doctor.name,
      specialization: doctor.specialization,
      phone: doctor.phone,
      regNumber: doctor.regNumber ?? '',
      email: doctor.email ?? '',
      address: doctor.address ?? '',
    })
    setDialogOpen(true)
  }

  const handleSave = async (values: DoctorFormValues) => {
    setSaving(true)
    try {
      if (editingDoctor) {
        await api.patch(`/doctors/${editingDoctor.id}`, values)
        toast.success('Doctor updated')
      } else {
        await api.post('/doctors', values)
        toast.success('Doctor added')
      }
      setDialogOpen(false)
      fetchDoctors()
    } catch {
      toast.error('Failed to save doctor')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (doctor: Doctor) => {
    try {
      await api.patch(`/doctors/${doctor.id}`, { isActive: !doctor.isActive })
      toast.success(doctor.isActive ? 'Doctor deactivated' : 'Doctor activated')
      fetchDoctors()
    } catch {
      toast.error('Failed to update doctor')
    }
  }

  const handleDelete = async (doctor: Doctor) => {
    if (!window.confirm(`Delete ${doctor.name}? This cannot be undone.`)) return
    try {
      await api.delete(`/doctors/${doctor.id}`)
      toast.success('Doctor deleted')
      fetchDoctors()
    } catch {
      toast.error('Failed to delete doctor')
    }
  }

  // ── Stats ──────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total: doctors.length,
    active: doctors.filter((d) => d.isActive).length,
    specializations: new Set(doctors.map((d) => d.specialization)).size,
  }), [doctors])

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Doctors</h1>
          <p className="text-sm text-muted-foreground">
            {stats.active} active · {stats.specializations} specialization{stats.specializations !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={openAdd} className="gap-2">
          <Plus className="h-4 w-4" /> Add Doctor
        </Button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: 'Total Doctors', value: stats.total },
          { label: 'Active', value: stats.active },
          { label: 'Specializations', value: stats.specializations },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-border/40 bg-background px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{kpi.label}</p>
            <p className="mt-0.5 text-2xl font-bold tabular-nums">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          icon={<Search />}
          placeholder="Search by name, specialization, phone..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-72 h-8 text-xs"
        />
        <Select value={filterSpec} onValueChange={setFilterSpec}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <Filter className="h-3 w-3 mr-1.5 shrink-0" />
            <SelectValue placeholder="Specialization" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Specializations</SelectItem>
            {specializations.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={showInactive ? 'default' : 'outline'}
          size="sm"
          className="h-8 text-xs gap-1"
          onClick={() => setShowInactive((v) => !v)}
        >
          {showInactive ? <UserX className="h-3 w-3" /> : <UserCheck className="h-3 w-3" />}
          {showInactive ? 'Showing All' : 'Active Only'}
        </Button>
        {(searchQuery || filterSpec !== 'all') && (
          <span className="text-xs text-muted-foreground">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50">
            <Stethoscope className="h-7 w-7 text-muted-foreground/40" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">
            {searchQuery || filterSpec !== 'all' ? 'No doctors match your search' : 'No doctors yet'}
          </p>
          {!searchQuery && filterSpec === 'all' && (
            <Button variant="outline" size="sm" className="mt-3" onClick={openAdd}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add first doctor
            </Button>
          )}
        </div>
      ) : (
        <ScrollArea>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <AnimatePresence mode="popLayout">
              {paginatedDoctors.map((doctor) => (
                <DoctorCard
                  key={doctor.id}
                  doctor={doctor}
                  onEdit={openEdit}
                  onToggleActive={handleToggleActive}
                  onDelete={handleDelete}
                />
              ))}
            </AnimatePresence>
          </div>
        </ScrollArea>
      )}

      {/* Pagination */}
      {filtered.length > PAGE_SIZE && (
        <DataTablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          totalItems={filtered.length}
          itemsPerPage={PAGE_SIZE}
          className="mt-2"
        />
      )}

      {/* Add / Edit Dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditingDoctor(null)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingDoctor ? 'Edit Doctor' : 'Add Doctor'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(handleSave)} className="space-y-4">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="name">Full Name</Label>
              <Controller
                control={control}
                name="name"
                render={({ field }) => (
                  <Input id="name" placeholder="Dr. Rajesh Kumar" {...field} />
                )}
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            {/* Specialization */}
            <div className="space-y-1.5">
              <Label htmlFor="specialization">Specialization</Label>
              <Controller
                control={control}
                name="specialization"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger id="specialization">
                      <SelectValue placeholder="Select specialization" />
                    </SelectTrigger>
                    <SelectContent>
                      {SPECIALIZATIONS.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.specialization && <p className="text-xs text-destructive">{errors.specialization.message}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Phone */}
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Controller
                  control={control}
                  name="phone"
                  render={({ field }) => (
                    <Input id="phone" placeholder="9876543210" maxLength={10} {...field} />
                  )}
                />
                {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
              </div>

              {/* Reg Number */}
              <div className="space-y-1.5">
                <Label htmlFor="regNumber">
                  Reg. Number <span className="text-muted-foreground font-normal">(opt)</span>
                </Label>
                <Controller
                  control={control}
                  name="regNumber"
                  render={({ field }) => (
                    <Input id="regNumber" placeholder="TN-12345" {...field} />
                  )}
                />
              </div>
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="email">
                Email <span className="text-muted-foreground font-normal">(opt)</span>
              </Label>
              <Controller
                control={control}
                name="email"
                render={({ field }) => (
                  <Input id="email" placeholder="doctor@hospital.com" type="email" {...field} />
                )}
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>

            {/* Address */}
            <div className="space-y-1.5">
              <Label htmlFor="address">
                Address / Hospital <span className="text-muted-foreground font-normal">(opt)</span>
              </Label>
              <Controller
                control={control}
                name="address"
                render={({ field }) => (
                  <Input id="address" placeholder="Apollo Hospital, Chennai" {...field} />
                )}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : editingDoctor ? 'Update Doctor' : 'Add Doctor'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
