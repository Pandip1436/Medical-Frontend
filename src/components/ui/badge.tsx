import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary/10 text-primary shadow-sm",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground",
        destructive:
          "border-transparent bg-rose-500/10 text-rose-600 dark:text-rose-400",
        outline:
          "text-foreground border-border/60",
        success:
          "border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        warning:
          "border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-400",
        info:
          "border-transparent bg-blue-500/10 text-blue-700 dark:text-blue-400",
        purple:
          "border-transparent bg-purple-500/10 text-purple-700 dark:text-purple-400",
      },
      size: {
        default: "px-2.5 py-0.5 text-xs",
        sm: "px-2 py-0 text-[10px]",
        lg: "px-3 py-1 text-sm",
      },
      dot: {
        true: "gap-1.5",
        false: "",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      dot: false,
    },
  }
)

const dotColors: Record<string, string> = {
  default: "bg-primary",
  secondary: "bg-secondary-foreground",
  destructive: "bg-rose-500",
  outline: "bg-foreground",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
  purple: "bg-purple-500",
}

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, dot, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant, size, dot }), className)} {...props}>
      {dot && (
        <span className={cn("h-1.5 w-1.5 rounded-full", dotColors[variant || "default"])} />
      )}
      {props.children}
    </div>
  )
}

export { Badge, badgeVariants }
