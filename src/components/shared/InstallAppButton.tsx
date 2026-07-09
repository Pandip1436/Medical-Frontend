import { Download, Share } from 'lucide-react'
import { useInstallPrompt } from '@/hooks/useInstallPrompt'
import { Button } from '@/components/ui/button'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'

// Surfaces an "Install App" affordance in the header control cluster.
// Chromium (desktop + Android) gets a one-click native install prompt; iOS
// Safari never fires beforeinstallprompt, so it gets a popover with the
// manual Share > Add to Home Screen steps instead. Renders nothing once
// installed or on browsers that support neither path.
export function InstallAppButton() {
  const { canInstall, isIosManualInstall, promptInstall } = useInstallPrompt()

  if (canInstall) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 rounded-full hover:bg-accent"
        onClick={promptInstall}
        aria-label="Install app"
        title="Install app"
      >
        <Download className="h-4 w-4" />
      </Button>
    )
  }

  if (isIosManualInstall) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full hover:bg-accent"
            aria-label="Install app"
            title="Install app"
          >
            <Download className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 text-sm">
          <p className="font-medium">Install PBIMS</p>
          <p className="mt-1 flex items-center gap-1 text-muted-foreground">
            Tap <Share className="h-3.5 w-3.5" /> Share, then "Add to Home Screen".
          </p>
        </PopoverContent>
      </Popover>
    )
  }

  return null
}
