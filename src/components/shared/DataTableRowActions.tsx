import { MoreHorizontal, Eye, Printer, Edit, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface CustomAction {
  label: string
  icon: React.ReactNode
  onClick: () => void
  disabled?: boolean
  variant?: 'default' | 'destructive'
}

interface DataTableRowActionsProps {
  onView?: () => void
  onEdit?: () => void
  onPrint?: () => void
  onDelete?: () => void
  deleteLabel?: string
  customActions?: React.ReactNode | CustomAction[]
}

export function DataTableRowActions({
  onView,
  onEdit,
  onPrint,
  onDelete,
  deleteLabel = 'Delete',
  customActions,
}: DataTableRowActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {onView && (
          <DropdownMenuItem onClick={onView}>
            <Eye className="mr-2 h-4 w-4" />
            View
          </DropdownMenuItem>
        )}
        {onEdit && (
          <DropdownMenuItem onClick={onEdit}>
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </DropdownMenuItem>
        )}
        {onPrint && (
          <DropdownMenuItem onClick={onPrint}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </DropdownMenuItem>
        )}
        {customActions && (
          <>
             {Array.isArray(customActions) ? (
               customActions.map((action, idx) => (
                 <DropdownMenuItem 
                   key={idx} 
                   onClick={action.onClick} 
                   disabled={action.disabled}
                   className={action.variant === 'destructive' ? 'text-destructive focus:text-destructive' : ''}
                 >
                   {action.icon && <span className="mr-2 h-4 w-4 flex items-center justify-center">{action.icon}</span>}
                   {action.label}
                 </DropdownMenuItem>
               ))
             ) : (
               customActions
             )}
          </>
        )}
        {onDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {deleteLabel}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
