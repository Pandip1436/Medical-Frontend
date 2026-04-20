import { useState, useEffect } from 'react'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  Building2, Plus, Pencil, Trash2, MapPin, Phone, Mail,
  CheckCircle2, Star,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Textarea } from '@/components/ui/textarea'
import api from '@/lib/api'
import { useBranchStore, type Branch } from '@/stores/branchStore'
import { cn } from '@/lib/utils'

const branchSchema = z.object({
  name: z.string().min(1, 'Branch name is required'),
  code: z.string().min(1, 'Branch code is required').max(10, 'Code max 10 chars'),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').or(z.literal('')).optional(),
  gstin: z.string().optional(),
  drugLicense: z.string().optional(),
  isActive: z.boolean(),
  isDefault: z.boolean(),
})
type BranchFormValues = z.infer<typeof branchSchema>

export default function BranchesPage() {
  const { branches, fetchBranches, activeBranchId, setActiveBranch } = useBranchStore()
  const [showForm, setShowForm] = useState(false)
  const [editBranch, setEditBranch] = useState<Branch | null>(null)
  const [deleteBranch, setDeleteBranch] = useState<Branch | null>(null)
  const [stats, setStats] = useState<Record<string, { invoiceCount: number; invoiceTotal: number; expenseTotal: number }>>({})
  const [saving, setSaving] = useState(false)

  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<BranchFormValues>({
    resolver: zodResolver(branchSchema),
    defaultValues: { isActive: true, isDefault: false },
  })

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchBranches() }, [])
  useBranchRefresh(fetchBranches)

  useEffect(() => {
    branches.forEach((b) => {
      api.get(`/branches/${b.id}/stats`)
        .then((res) => {
          const data = res.data?.data ?? res.data
          setStats((prev) => ({ ...prev, [b.id]: data }))
        })
        .catch(() => {})
    })
  }, [branches])

  const openAdd = () => {
    setEditBranch(null)
    reset({ name: '', code: '', isActive: true, isDefault: false })
    setShowForm(true)
  }

  const openEdit = (b: Branch) => {
    setEditBranch(b)
    reset({
      name: b.name,
      code: b.code,
      address: b.address ?? '',
      phone: b.phone ?? '',
      email: b.email ?? '',
      gstin: b.gstin ?? '',
      drugLicense: b.drugLicense ?? '',
      isActive: b.isActive,
      isDefault: b.isDefault,
    })
    setShowForm(true)
  }

  const onSubmit = async (data: BranchFormValues) => {
    setSaving(true)
    try {
      if (editBranch) {
        await api.patch(`/branches/${editBranch.id}`, data)
        toast.success('Branch updated')
      } else {
        await api.post('/branches', data)
        toast.success('Branch created')
      }
      await fetchBranches()
      setShowForm(false)
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to save branch')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteBranch) return
    try {
      await api.delete(`/branches/${deleteBranch.id}`)
      toast.success('Branch deleted')
      await fetchBranches()
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to delete branch')
    } finally {
      setDeleteBranch(null)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            Branch Management
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage multiple pharmacy locations
          </p>
        </div>
        <Button onClick={openAdd} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Branch
        </Button>
      </div>

      {activeBranchId && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5 flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          <span>Active branch: <strong>{branches.find(b => b.id === activeBranchId)?.name}</strong></span>
          <span className="text-muted-foreground ml-auto">All new invoices will be tagged to this branch</span>
        </div>
      )}

      {branches.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Building2 className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">No branches yet. Add your first branch.</p>
          <Button className="mt-4 gap-2" onClick={openAdd}>
            <Plus className="h-4 w-4" /> Add Branch
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {branches.map((branch) => {
            const bStats = stats[branch.id]
            const isActive = activeBranchId === branch.id
            return (
              <Card
                key={branch.id}
                className={cn(
                  'relative cursor-pointer transition-all duration-200 hover:shadow-md',
                  isActive ? 'border-primary ring-1 ring-primary/30' : ''
                )}
                onClick={() => setActiveBranch(branch.id)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-bold text-sm',
                        isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                      )}>
                        {branch.code}
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-base truncate">{branch.name}</CardTitle>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {branch.isDefault && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-0.5">
                              <Star className="h-2.5 w-2.5" />Default
                            </Badge>
                          )}
                          {!branch.isActive && (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Inactive</Badge>
                          )}
                          {isActive && (
                            <Badge className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-primary/20">Selected</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="icon" variant="ghost" className="h-7 w-7"
                        onClick={(e) => { e.stopPropagation(); openEdit(branch) }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); setDeleteBranch(branch) }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  {branch.address && (
                    <div className="flex items-start gap-2 text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span className="line-clamp-2">{branch.address}</span>
                    </div>
                  )}
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    {branch.phone && (
                      <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{branch.phone}</span>
                    )}
                    {branch.email && (
                      <span className="flex items-center gap-1 truncate"><Mail className="h-3 w-3" />{branch.email}</span>
                    )}
                  </div>
                  {bStats && (
                    <div className="border-t pt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-[11px] text-muted-foreground">Invoices</p>
                        <p className="text-sm font-semibold">{bStats.invoiceCount}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground">Sales</p>
                        <p className="text-sm font-semibold">&#8377;{(bStats.invoiceTotal / 1000).toFixed(1)}k</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground">Expenses</p>
                        <p className="text-sm font-semibold">&#8377;{(bStats.expenseTotal / 1000).toFixed(1)}k</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editBranch ? 'Edit Branch' : 'Add New Branch'}</DialogTitle>
            <DialogDescription>
              {editBranch ? 'Update branch information' : 'Create a new pharmacy location'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Branch Name *</Label>
                <Input {...register('name')} placeholder="Main Branch" />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Branch Code *</Label>
                <Input {...register('code')} placeholder="HQ" className="uppercase" />
                {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Textarea {...register('address')} placeholder="Full address" rows={2} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input {...register('phone')} placeholder="9876543210" />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input {...register('email')} placeholder="branch@pharmacy.com" />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>GSTIN</Label>
                <Input {...register('gstin')} placeholder="22AAAAA0000A1Z5" />
              </div>
              <div className="space-y-1.5">
                <Label>Drug License No.</Label>
                <Input {...register('drugLicense')} placeholder="DL-XXXX" />
              </div>
            </div>
            <div className="flex items-center gap-6">
              <Controller
                control={control}
                name="isActive"
                render={({ field }) => (
                  <div className="flex items-center gap-2">
                    <Switch checked={field.value} onCheckedChange={field.onChange} id="isActive" />
                    <Label htmlFor="isActive">Active</Label>
                  </div>
                )}
              />
              <Controller
                control={control}
                name="isDefault"
                render={({ field }) => (
                  <div className="flex items-center gap-2">
                    <Switch checked={field.value} onCheckedChange={field.onChange} id="isDefault" />
                    <Label htmlFor="isDefault">Set as Default</Label>
                  </div>
                )}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Saving...' : editBranch ? 'Update' : 'Create Branch'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteBranch} onOpenChange={(o) => { if (!o) setDeleteBranch(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Branch?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteBranch?.name}</strong>?
              Invoices linked to this branch will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
