// Shared column-definition shape for the "Customize Columns" (show/hide) feature.
// A list page declares its columns as ColumnDef[] and gates each <TableHead> /
// <TableCell> on the resolved visibility (see useColumnVisibility + ColumnsToggle).
export interface ColumnDef {
  /** Stable key used in storage + isVisible(id) checks. */
  id: string
  /** Human label shown in the Columns popover. */
  label: string
  /** Required columns are always shown and cannot be unchecked. */
  required?: boolean
  /** Whether the column is shown by default (before the user customizes). */
  defaultVisible?: boolean
  /** Whether the user can reposition this field left ↔ right in the card. */
  positionable?: boolean
  /** Default side of the card row when positionable. */
  defaultPosition?: 'left' | 'right'
}
