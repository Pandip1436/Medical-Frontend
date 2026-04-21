import { useSettingsStore } from '@/stores/settingsStore'
import { cn } from '@/lib/utils'

interface PrintHeaderProps {
  title: string
  className?: string
}

export function PrintHeader({ title, className }: PrintHeaderProps) {
  const businessProfile = useSettingsStore((s) => s.businessProfile)
  
  if (!businessProfile) return null

  return (
    <div className={cn("hidden print:block mb-8 border-b-2 border-slate-900 pb-4", className)}>
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tight text-slate-950">
            {businessProfile.name}
          </h1>
          <div className="mt-2 text-sm text-slate-700 space-y-0.5">
            <p>{businessProfile.address}</p>
            <p>Phone: {businessProfile.phone} | Email: {businessProfile.email}</p>
            <div className="flex gap-4 mt-1 font-bold text-slate-900">
              {businessProfile.gstin && <span>GSTIN: {businessProfile.gstin}</span>}
              {businessProfile.drugLicense && <span>DL No: {businessProfile.drugLicense}</span>}
            </div>
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-xl font-bold text-slate-900 uppercase underline decoration-2 underline-offset-4">{title}</h2>
          <p className="text-xs text-slate-500 mt-2">Date: {new Date().toLocaleDateString('en-IN')}</p>
        </div>
      </div>
    </div>
  )
}
