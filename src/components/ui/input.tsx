import * as React from "react"

import { cn } from "@/lib/utils"

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode
  suffix?: React.ReactNode
  error?: boolean
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, icon, suffix, error, ...props }, ref) => {
    if (icon || suffix) {
      return (
        <div className={cn(
          "flex h-9 w-full items-center gap-2 rounded-lg border border-input bg-transparent px-3 text-sm shadow-sm transition-all duration-150",
          "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 focus-within:border-ring",
          error && "border-destructive focus-within:ring-destructive/30",
          props.disabled && "cursor-not-allowed opacity-50",
          className
        )}>
          {icon && <span className="shrink-0 text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">{icon}</span>}
          <input
            type={type}
            className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground/60 disabled:cursor-not-allowed file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground"
            ref={ref}
            {...props}
          />
          {suffix && <span className="shrink-0 text-muted-foreground text-xs">{suffix}</span>}
        </div>
      )
    }

    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-all duration-150",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          "placeholder:text-muted-foreground/60",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:border-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          error && "border-destructive focus-visible:ring-destructive/30",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
