import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { navigate, useRoute } from '@/lib/router'
import { BatchDetailView } from './BatchDetailView'

// Batch Detail route — destination for Expiry notifications and dashboard
// inbox links. Renders the shared BatchDetailView inside a full-page Card
// with a back button. The same view powers the Stock Overview side panel.

export default function BatchDetailPage() {
  const { search } = useRoute()
  // Accept either `?id=` (new) or `?batchId=` (legacy).
  const params = new URLSearchParams(search)
  const id = params.get('id') ?? params.get('batchId')

  const goBack = () => navigate('/inventory/expiry')

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <Button variant="ghost" size="sm" className="gap-1.5 -ml-2" onClick={goBack}>
        <ArrowLeft className="h-3.5 w-3.5" /> Back to expiry management
      </Button>

      <Card>
        <BatchDetailView batchId={id} onAfterAction={goBack} />
      </Card>
    </motion.div>
  )
}
