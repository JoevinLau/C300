import { PDFDownloadLink } from '@react-pdf/renderer'
import { Download, Loader2 } from 'lucide-react'

import { buttonVariants } from '@/components/ui/button'
import type { EcoTransitResponse } from '@/lib/calculator-api'
import type { UseeioResultProjection } from '@/features/result-projection/result-projection'
import { UseeioResultsPdf } from './UseeioResultsPdf'

export function UseeioPdfDownload({
  fileName,
  projection,
  transport,
}: {
  fileName: string
  projection: UseeioResultProjection
  transport?: EcoTransitResponse | null
}) {
  return (
    <PDFDownloadLink
      className={buttonVariants({ className: 'w-full' })}
      document={<UseeioResultsPdf projection={projection} transport={transport} />}
      fileName={fileName}
    >
      {({ loading }: { loading: boolean }) => (
        <>
          {loading ? <Loader2 className="animate-spin" /> : <Download />}
          {loading ? 'Preparing PDF…' : 'Download PDF'}
        </>
      )}
    </PDFDownloadLink>
  )
}
