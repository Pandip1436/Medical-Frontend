import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Shield, Clock } from 'lucide-react'

import api from '@/lib/api'
import { formatDateTime } from '@/lib/utils'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'

interface AuditEntry {
  id: string
  timestamp: string
  user: string
  module: string
  action: string
  entity: string
  field: string
  oldValue: string
  newValue: string
}

function actionBadgeVariant(action: string): 'success' | 'info' | 'warning' | 'destructive' | 'secondary' {
  switch (action.toLowerCase()) {
    case 'create': return 'success'
    case 'update': return 'info'
    case 'delete':
    case 'cancel':
    case 'deactivate': return 'destructive'
    case 'return': return 'warning'
    default: return 'secondary'
  }
}

export default function AuditTrailPage() {
  const [filterUser, setFilterUser] = useState('all')
  const [filterModule, setFilterModule] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([])

  const loadAuditLog = () => {
    api
      .get('/audit-logs', { params: { limit: 200 } })
      .then((res) => {
        const rows = res.data ?? []
        const mapped: AuditEntry[] = rows.map((r: any) => ({
          id: r.id,
          timestamp: r.createdAt,
          user: r.user?.name || r.userId,
          module: r.module,
          action: r.action,
          entity: r.entityId || '-',
          field: '-',
          oldValue: r.oldValue ? JSON.stringify(r.oldValue).slice(0, 80) : '-',
          newValue: r.newValue ? JSON.stringify(r.newValue).slice(0, 80) : '-',
        }))
        setAuditEntries(mapped)
      })
      .catch(() => { toast.error('Failed to load audit log') })
  }

  useEffect(() => {
    loadAuditLog()
  }, [])

  const uniqueUsers = Array.from(new Set(auditEntries.map((a) => a.user)))
  const uniqueModules = Array.from(new Set(auditEntries.map((a) => a.module)))

  const filteredAudit = auditEntries.filter((entry) => {
    if (filterUser !== 'all' && entry.user !== filterUser) return false
    if (filterModule !== 'all' && entry.module !== filterModule) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return (
        entry.entity.toLowerCase().includes(q) ||
        entry.action.toLowerCase().includes(q) ||
        entry.field.toLowerCase().includes(q) ||
        entry.newValue.toLowerCase().includes(q) ||
        entry.oldValue.toLowerCase().includes(q)
      )
    }
    return true
  })

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="space-y-4"
    >
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10 dark:bg-rose-500/15">
                <Shield className="h-5 w-5 text-rose-600 dark:text-rose-400" />
              </div>
              <div>
                <CardTitle>Audit Trail</CardTitle>
                <CardDescription>Complete log of all system changes (read-only)</CardDescription>
              </div>
            </div>
            <Button onClick={loadAuditLog} variant="outline" size="sm" className="gap-1.5 cursor-pointer h-8">
              <Clock className="h-4 w-4" />
              Refresh Log
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <DataTableFilterBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder="Search entities, actions..."
            resultsCount={filteredAudit.length}
            activeFilterCount={(filterUser !== 'all' ? 1 : 0) + (filterModule !== 'all' ? 1 : 0)}
            onClearFilters={() => {
              setFilterUser('all')
              setFilterModule('all')
            }}
          >
            <div className="flex items-center gap-2">
              <Label className="shrink-0 text-xs font-medium text-muted-foreground">User:</Label>
              <Select value={filterUser} onValueChange={setFilterUser}>
                <SelectTrigger className="h-8 w-40">
                  <SelectValue placeholder="All Users" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {uniqueUsers.map((user) => (
                    <SelectItem key={user} value={user}>{user}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="shrink-0 text-xs font-medium text-muted-foreground">Module:</Label>
              <Select value={filterModule} onValueChange={setFilterModule}>
                <SelectTrigger className="h-8 w-40">
                  <SelectValue placeholder="All Modules" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Modules</SelectItem>
                  {uniqueModules.map((mod) => (
                    <SelectItem key={mod} value={mod}>{mod}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </DataTableFilterBar>

          {/* Table */}
          <div className="rounded-xl border border-border/60 overflow-x-auto">
            <ScrollArea className="h-125">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 dark:bg-muted/15">
                    <TableHead>Timestamp</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Module</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Field</TableHead>
                    <TableHead>Old Value</TableHead>
                    <TableHead>New Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAudit.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDateTime(entry.timestamp)}
                      </TableCell>
                      <TableCell className="text-xs font-medium">{entry.user}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" size="sm">{entry.module}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={actionBadgeVariant(entry.action)} size="sm">
                          {entry.action}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-foreground">{entry.entity}</span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{entry.field}</TableCell>
                      <TableCell className="text-xs">
                        {entry.oldValue !== '-' ? (
                          <span className="rounded-md bg-destructive/10 px-1.5 py-0.5 text-destructive dark:bg-destructive/15">
                            {entry.oldValue}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {entry.newValue !== '-' ? (
                          <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-400 dark:bg-emerald-500/15">
                            {entry.newValue}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
