import * as React from "react"
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker, type DropdownProps } from "react-day-picker"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

// Replaces react-day-picker's native <select> month/year navigation with the
// app's own Select — otherwise clicking the dropdown pops the browser's raw,
// unstyled <select> list instead of our themed menu.
function CalendarDropdown({
  options,
  value,
  onChange,
  disabled,
  "aria-label": ariaLabel,
  className,
}: DropdownProps) {
  return (
    <Select
      value={String(value ?? "")}
      disabled={disabled}
      onValueChange={(next) => {
        onChange?.({
          target: { value: next },
        } as unknown as React.ChangeEvent<HTMLSelectElement>)
      }}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn(
          "h-auto w-auto gap-1 rounded-md border-input/60 bg-muted/40 px-2 py-1 text-xs font-semibold tabular-nums shadow-none hover:bg-accent [&>svg]:size-3.5 [&>svg]:opacity-60",
          className
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-70">
        {options?.map((option) => (
          <SelectItem
            key={option.value}
            value={String(option.value)}
            disabled={option.disabled}
            className="text-xs tabular-nums"
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "dropdown",
  startMonth,
  endMonth,
  ...props
}: CalendarProps) {
  // Generous, jump-to-any-year range for the month/year dropdowns — wide
  // enough for old historical imports (past) and long-dated batch expiries
  // (future). Callers can still override via startMonth/endMonth.
  const thisYear = new Date().getFullYear()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      captionLayout={captionLayout}
      startMonth={startMonth ?? new Date(thisYear - 100, 0)}
      endMonth={endMonth ?? new Date(thisYear + 20, 11)}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row gap-2",
        month: "flex flex-col gap-4 relative",
        month_caption:
          "flex justify-center pt-1 items-center h-9",
        caption_label: "text-sm font-semibold",
        dropdowns: "flex items-center gap-1.5",
        nav: "absolute inset-x-1 top-1 flex items-center justify-between pointer-events-none",
        button_previous: cn(
          buttonVariants({ variant: "outline" }),
          "size-7 bg-transparent p-0 opacity-60 hover:opacity-100 pointer-events-auto z-10"
        ),
        button_next: cn(
          buttonVariants({ variant: "outline" }),
          "size-7 bg-transparent p-0 opacity-60 hover:opacity-100 pointer-events-auto z-10"
        ),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday:
          "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
        week: "flex w-full mt-2",
        day: "relative p-0 text-center text-sm focus-within:relative focus-within:z-20",
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "size-9 p-0 font-normal aria-selected:opacity-100"
        ),
        selected:
          "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary [&>button]:hover:text-primary-foreground [&>button]:focus:bg-primary [&>button]:focus:text-primary-foreground rounded-md",
        today: "[&>button]:bg-accent [&>button]:text-accent-foreground rounded-md",
        outside: "[&>button]:text-muted-foreground [&>button]:opacity-50",
        disabled: "[&>button]:text-muted-foreground [&>button]:opacity-40 [&>button]:pointer-events-none",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: chevronClassName }) => {
          if (orientation === "left") return <ChevronLeft className="size-4" />
          if (orientation === "right") return <ChevronRight className="size-4" />
          return <ChevronDown className={cn("size-3.5 opacity-60", chevronClassName)} />
        },
        Dropdown: CalendarDropdown,
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
