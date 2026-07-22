import { useState, useRef } from 'react'
import { Upload, FileSpreadsheet, Check, X, AlertCircle, Loader2, Globe, Eye, Download, CheckCircle, RefreshCw, DatabaseZap } from 'lucide-react'

import { AppBackground } from '@/components/AppBackground'
import { WorkspaceFrame, WorkspaceRail } from '@/components/WorkspaceShell'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  buildExportRows,
  extractSheetData,
  type MappedRow,
  type TargetField,
} from '@/features/naics-mapping/naics-mapping-workflow'
import { useNaicsMappingWorkflow } from '@/features/naics-mapping/useNaicsMappingWorkflow'

function SourceGuide() {
  return (
    <div className="shrink-0 border-t border-zinc-900/10 bg-zinc-50 px-5 py-3">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-950">Source note</h3>
        <p className="text-xs text-zinc-600">Use this to decide which rows need checking before you save.</p>
      </div>
      <div className="grid gap-2 text-xs text-zinc-700 md:grid-cols-3">
        <div className="rounded border border-green-200 bg-green-50 px-3 py-2">
          <span className="font-semibold text-green-800">Phase 1:</span>
          <span className="ml-1">confirmed before in the shared dictionary.</span>
        </div>
        <div className="rounded border border-yellow-200 bg-yellow-50 px-3 py-2">
          <span className="font-semibold text-yellow-800">Phase 2:</span>
          <span className="ml-1">found by searching the official NAICS database.</span>
        </div>
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2">
          <span className="font-semibold text-red-800">Phase 3:</span>
          <span className="ml-1">AI/manual suggestion; confirm only if the details look right.</span>
        </div>
      </div>
    </div>
  )
}

function NaicsMappingPage() {
  const [workbook, setWorkbook] = useState<import('xlsx').WorkBook | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const workflow = useNaicsMappingWorkflow()
  const {
    calculationLoading,
    calculationResults,
    categoryLoading,
    categoryProgress,
    confirmationLoading,
    confirmedData,
    excelData,
    fetchNaicsLoading,
    fetchNaicsProgress,
    hasFetchedNaics,
    mappedData,
    mappings,
    refreshPreviewLoading,
    step,
  } = workflow

  const processSheet = async (
    nextWorkbook: import('xlsx').WorkBook,
    sheetName: string,
    fileName = excelData?.fileName ?? '',
  ) => {
    const XLSX = await import('xlsx')
    const sheet = nextWorkbook.Sheets[sheetName]
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][]
    const data = extractSheetData(matrix, {
      fileName,
      allSheets: nextWorkbook.SheetNames,
      selectedSheet: sheetName,
    })
    if (!data) {
      alert('The selected sheet is empty.')
      return
    }
    workflow.loadSheet(data)
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (loadEvent) => {
      try {
        const XLSX = await import('xlsx')
        const bytes = new Uint8Array(loadEvent.target?.result as ArrayBuffer)
        const nextWorkbook = XLSX.read(bytes, { type: 'array' })
        setWorkbook(nextWorkbook)
        await processSheet(nextWorkbook, nextWorkbook.SheetNames[0], file.name)
      } catch (error) {
        console.error('Error parsing Excel:', error)
        alert('Failed to parse Excel file')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const handleMappingChange = (field: TargetField, column: string) => {
    workflow.updateMapping(field, column)
  }

  const handleFetchCategories = async () => {
    try {
      await workflow.fetchCategories()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to fetch NAICS categories')
    }
  }

  const handleFetchNaics = async () => {
    try {
      await workflow.fetchNaics()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to fetch NAICS codes')
    }
  }

  const handleShowPreview = () => workflow.showPreview()

  const handleConfirmMapping = async () => {
    try {
      await workflow.confirm()
      alert(`Mapping confirmed! ${mappedData.length} rows saved to the learning dictionary.`)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to confirm mapping')
    }
  }

  const handleCalculateBatch = async () => {
    try {
      await workflow.calculate()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Batch calculation failed')
    }
  }

  const handleRefreshPreview = async () => {
    try {
      const invalidCodes = await workflow.refreshPreview()
      if (invalidCodes.length > 0) {
        alert(`Some NAICS codes could not be found: ${invalidCodes.join(', ')}`)
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to refresh preview')
    }
  }

  const handleRowEdit = (index: number, field: keyof MappedRow, value: string) => {
    workflow.editRow(index, field, value)
  }

  const handleExportFull = async () => {
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.json_to_sheet(buildExportRows(calculationResults ?? mappedData))
    const outputWorkbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(outputWorkbook, ws, 'NAICS Mapping')
    XLSX.writeFile(outputWorkbook, 'naics_mapping_result.xlsx')
  }


  const getSourceBadge = (source?: string) => {
    switch (source) {
      case 'phase1': return <span className="rounded bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">Phase 1</span>
      case 'phase2': return <span className="rounded bg-yellow-100 px-2 py-0.5 text-[10px] font-bold text-yellow-700">Phase 2</span>
      case 'phase3': return <span className="rounded bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">Phase 3</span>
      default: return null
    }
  }

  const fieldLabels: Record<TargetField, string> = {
    supplier: 'Supplier',
    material_name: 'Material Name',
    weight: 'Weight',
    qty: 'Quantity',
    total_amount_sgd: 'Total Amount SGD',
    naics_code: 'NAICS Code',
    description: 'Description',
    kgco2e: 'kgCO₂e per USD',
    category: 'Category',
  }


  const getStatusColor = (confidence: number) => {
    if (confidence >= 70) return 'bg-teal-100 border-teal-500 text-teal-800'
    if (confidence > 0) return 'bg-yellow-100 border-yellow-500 text-yellow-800'
    return 'bg-red-100 border-red-500 text-red-800'
  }

  const getStatusIcon = (confidence: number) => {
    if (confidence >= 70) return <Check className="size-4" />
    if (confidence > 0) return <AlertCircle className="size-4" />
    return <X className="size-4" />
  }

  const canShowPreview = mappings.some(m => m.field === 'material_name' && m.excelColumn)


  return (
    <AppBackground>
      <WorkspaceFrame>
        <WorkspaceRail
          icon={DatabaseZap}
          eyebrow="Data preparation"
          title="NAICS mapping"
          description="Assign sector codes to supplier and spend records before calculating emissions."
        >
          <div className="space-y-2 text-sm">
            {['Upload source', 'Map columns', 'Match sectors', 'Review results'].map((label, index) => (
              <div key={label} className={index + 1 === step ? 'font-semibold text-white' : 'text-zinc-400'}>
                {label}
              </div>
            ))}
          </div>
        </WorkspaceRail>

        <div className="grid gap-4">
          {/* Step 1: Upload */}
          {step === 1 && (
            <section className="rounded-lg border border-zinc-900/12 bg-white shadow-sm">
              <div className="border-b border-zinc-900/10 p-5">
                <CardTitle className="text-2xl">Upload Excel File</CardTitle>
                <CardDescription className="mt-2">
                  Upload an Excel file containing NAICS codes, descriptions, emission factors, and categories.
                </CardDescription>
              </div>
              
              <div className="p-10">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full flex-col items-center gap-4 rounded-lg border-2 border-dashed border-zinc-300 p-12 transition-colors hover:border-lime-500 hover:bg-lime-50"
                >
                  <div className="flex size-16 items-center justify-center rounded-full bg-lime-100">
                    <Upload className="size-8 text-lime-700" />
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-medium text-zinc-950">Click to upload Excel file</p>
                    <p className="text-sm text-muted-foreground">Supports .xlsx, .xls, .csv</p>
                  </div>
                </button>
              </div>
            </section>
          )}

          {/* Step 2: Column Mapping */}
          {step === 2 && excelData && (
            <section className="rounded-lg border border-zinc-900/12 bg-white shadow-sm">
              <div className="border-b border-zinc-900/10 p-5 flex items-center justify-between">
                <div>
                  <CardTitle className="text-2xl">Column Mapping</CardTitle>
                  <CardDescription className="mt-2">
                    Review and adjust the auto-detected column mappings for {excelData.fileName}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  {excelData.allSheets && excelData.allSheets.length > 1 && (
                    <Select
                      value={excelData.selectedSheet}
                      onValueChange={(value) => {
                        if (workbook) void processSheet(workbook, value)
                      }}
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Select sheet" />
                      </SelectTrigger>
                      <SelectContent>
                        {excelData.allSheets.map(sheet => (
                          <SelectItem key={sheet} value={sheet}>{sheet}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => {
                      workflow.reset()
                      setWorkbook(null)
                      if (fileInputRef.current) fileInputRef.current.value = ''
                    }}
                  >
                    Upload Different File
                  </Button>
                </div>
              </div>

              {hasFetchedNaics && <SourceGuide />}

              <div className="overflow-x-auto">

                <div className="min-w-[48rem]">
                  <div className="grid grid-cols-[1.5fr_2fr_1fr_0.8fr] bg-zinc-950 px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-300">
                    <span>Target Field</span>
                    <span>Excel Column</span>
                    <span>Detected</span>
                    <span>Confidence</span>
                  </div>
                  
                  {mappings.map((mapping) => (
                    <div
                      key={mapping.field}
                      className="grid grid-cols-[1.5fr_2fr_1fr_0.8fr] items-center border-t border-zinc-900/10 px-5 py-4"
                    >
                      <span className="font-medium text-zinc-950">
                        {fieldLabels[mapping.field]}
                      </span>
                      
                      <Select
                        value={mapping.excelColumn ?? '__none__'}
                        onValueChange={(value) => handleMappingChange(mapping.field, value)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select column" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">-- Not mapped --</SelectItem>
                          {excelData.headers.map((header) => (
                            <SelectItem key={header} value={header}>
                              {header}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      
                      <div className={`flex items-center gap-2 rounded-md border px-3 py-2 ${getStatusColor(mapping.confidence)}`}>
                        {getStatusIcon(mapping.confidence)}
                        <span className="text-sm font-medium">
                          {mapping.confidence >= 70 ? 'Detected' : mapping.confidence > 0 ? 'Partial' : 'Not Found'}
                        </span>
                      </div>
                      
                      <span className={`text-sm font-mono ${
                        mapping.confidence >= 70 ? 'text-teal-700' : 
                        mapping.confidence > 0 ? 'text-yellow-700' : 'text-red-700'
                      }`}>
                        {mapping.confidence > 0 ? `${mapping.confidence}%` : '--'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Fetch NAICS Button */}
              {mappings.find(m => m.field === 'material_name')?.excelColumn && (
                <div className="border-t border-zinc-900/10 p-5">
                  <Button
                    onClick={handleFetchNaics}
                    disabled={fetchNaicsLoading}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700"
                  >
                    {fetchNaicsLoading ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Fetching {fetchNaicsProgress.current}/{fetchNaicsProgress.total}...
                      </>
                    ) : (
                      <>
                        <Globe className="size-4" />
                        Fetch NAICS code
                      </>
                    )}
                  </Button>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {fetchNaicsLoading
                      ? `Batch matching in progress (${fetchNaicsProgress.current}/${fetchNaicsProgress.total})`
                      : 'Automatically find NAICS codes based on your material names.'}
                  </p>
                </div>
              )}

              {/* Fetch Categories Button */}

              {mappings.find(m => m.field === 'naics_code')?.excelColumn && 
               !mappings.find(m => m.field === 'category')?.excelColumn && (
                <div className="border-t border-zinc-900/10 p-5">
                  <Button
                    onClick={handleFetchCategories}
                    disabled={categoryLoading}
                    className="flex items-center gap-2"
                  >
                    {categoryLoading ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Fetching {categoryProgress.current}/{categoryProgress.total}...
                      </>
                    ) : (
                      <>
                        <Globe className="size-4" />
                        Fetch NAICS Categories Online
                      </>
                    )}
                  </Button>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Click to automatically look up categories for your NAICS codes using online data.
                  </p>
                </div>
              )}

              {/* Show Preview Button */}
              {canShowPreview && (
                <div className="border-t border-zinc-900/10 p-5">
                  <Button
                    onClick={handleShowPreview}
                    className="flex items-center gap-2"
                  >
                    <Eye className="size-4" />
                    Mapping Preview
                  </Button>
                </div>
              )}
            </section>
          )}

          {/* Step 3: Preview */}
          {step >= 3 && mappedData.length > 0 && (
            <>
              <section className="rounded-lg border border-zinc-900/12 bg-white shadow-sm overflow-hidden flex flex-col">
                <div className="border-b border-zinc-900/10 p-5 flex items-center justify-between shrink-0">
                  <div>
                    <CardTitle className="text-2xl flex items-center gap-2">
                      <FileSpreadsheet className="size-5" />
                      Mapping Preview
                    </CardTitle>
                    <CardDescription className="mt-2">
                      Showing {mappedData.length} total mappings. You can manually edit the NAICS codes below.
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => workflow.setStep(2)}
                  >
                    Back to Mapping
                  </Button>
                </div>

                <div className="min-h-[26rem] max-h-[58vh] overflow-auto border-b border-zinc-900/10">
                  <table className="w-full text-sm border-collapse">
                    <thead className="bg-zinc-950 sticky top-0 z-20">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-zinc-300">Material Name</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-zinc-300 w-32">NAICS Code</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-zinc-300">Description</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-zinc-300">kgCO₂e</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-zinc-300">Category</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-zinc-300">Source</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-900/10">
                      {mappedData.map((row, idx) => (
                        <tr key={idx} className="hover:bg-zinc-50">
                          <td className="px-4 py-3 text-zinc-700 font-medium">{row.material_name}</td>
                          <td className="px-4 py-3">
                            <input 
                              type="text"
                              value={row.naics_code}
                              onChange={(e) => handleRowEdit(idx, 'naics_code', e.target.value)}
                              className="w-full rounded border border-zinc-200 px-2 py-1 font-mono text-lime-700 focus:outline-lime-500"
                            />
                          </td>
                          <td className="px-4 py-3 text-zinc-700">{row.description}</td>
                          <td className="px-4 py-3 text-zinc-700">{row.kgco2e}</td>
                          <td className="px-4 py-3 text-zinc-700">{row.category}</td>
                          <td className="px-4 py-3">{getSourceBadge(row.source)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="p-5 flex gap-4 shrink-0 bg-white">

                  <Button
                    onClick={handleRefreshPreview}
                    disabled={refreshPreviewLoading}
                    className="flex items-center gap-2 bg-zinc-950 hover:bg-zinc-800"
                  >
                    {refreshPreviewLoading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                    Refresh Preview
                  </Button>
                  <Button onClick={handleExportFull} variant="outline" className="flex items-center gap-2">
                    <Download className="size-4" />
                    Export Full Result
                  </Button>
                  <Button
                    onClick={handleConfirmMapping}
                    disabled={confirmationLoading}
                    className="flex items-center gap-2 bg-lime-600 hover:bg-lime-700"
                  >
                    {confirmationLoading ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle className="size-4" />}
                    {confirmationLoading ? 'Confirming…' : 'Confirm Mapping'}
                  </Button>
                  <Button
                    onClick={handleCalculateBatch}
                    disabled={calculationLoading}
                    className="flex items-center gap-2 bg-zinc-950 hover:bg-zinc-800"
                  >
                    {calculationLoading ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle className="size-4" />}
                    Calculate Batch
                  </Button>
                </div>
              </section>

              {confirmedData && (
                <section className="rounded-lg border border-lime-500 bg-lime-50 p-5">
                  <CardTitle className="text-xl flex items-center gap-2 text-lime-800">
                    <CheckCircle className="size-5" />
                    Mapping Confirmed!
                  </CardTitle>
                  <p className="mt-2 text-sm text-lime-700">
                    {confirmedData.length} rows saved to the learning dictionary. Future imports will reuse these confirmed mappings.
                  </p>
                </section>
              )}

              {calculationResults && (
                <section className="rounded-lg border border-zinc-900/12 bg-white shadow-sm">
                  <div className="border-b border-zinc-900/10 p-5">
                    <CardTitle className="text-2xl">Dashboard Preview</CardTitle>
                    <CardDescription className="mt-2">
                      Total emissions: {calculationResults.reduce((sum, row) => sum + row.total_kgco2e, 0).toFixed(2)} kgCO₂e
                    </CardDescription>
                  </div>
                  <div className="overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-zinc-950">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-zinc-300">Supplier</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-zinc-300">Material</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-zinc-300">NAICS</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.16em] text-zinc-300">Amount SGD</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.16em] text-zinc-300">Factor</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.16em] text-zinc-300">kgCO₂e</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-900/10">
                        {calculationResults.map((row, idx) => (
                          <tr key={`${row.material_name}-${idx}`} className="hover:bg-zinc-50">
                            <td className="px-4 py-3 text-zinc-700">{row.supplier}</td>
                            <td className="px-4 py-3 font-medium text-zinc-950">{row.material_name}</td>
                            <td className="px-4 py-3 font-mono text-lime-700">{row.mapped_naics}</td>
                            <td className="px-4 py-3 text-right text-zinc-700">{Number(row.total_amount_sgd || 0).toFixed(2)}</td>
                            <td className="px-4 py-3 text-right text-zinc-700">{row.kgco2e_per_usd.toFixed(6)}</td>
                            <td className="px-4 py-3 text-right font-semibold text-zinc-950">{row.total_kgco2e.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}

          {hasFetchedNaics && step >= 3 && mappedData.length > 0 && <SourceGuide />}

          <Card className="border-zinc-900/12 bg-white">
            <CardHeader className="border-b border-zinc-900/10 pb-5">
              <CardTitle>Workflow</CardTitle>
              <CardDescription>
                Current step: {
                  step === 1 ? 'Upload' :
                  step === 2 ? 'Map Columns' :
                  step === 3 ? 'Preview' :
                  step === 4 ? 'Confirm Mapping' :
                  'Dashboard'
                }
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                'Upload Excel file with NAICS data.',
                'Map columns to target fields.',
                'Fetch categories if missing (optional).',
                'Preview mapped data.',
                'Confirm mapping and save learning dictionary.',
                'Calculate batch emissions and review dashboard.',
              ].map((item, index) => (
                <div key={item} className="flex gap-3">
                  <div className={`flex size-7 shrink-0 items-center justify-center rounded-md text-sm ${index + 1 <= step ? 'bg-lime-600 text-white' : 'bg-zinc-200 text-zinc-500'}`}>
                    {index + 1}
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">{item}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </WorkspaceFrame>
    </AppBackground>
  )
}

export default NaicsMappingPage
