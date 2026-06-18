import { useState, useRef } from 'react'
import { ArrowLeft, Upload, FileSpreadsheet, Check, X, AlertCircle, Loader2, Globe, Eye, Download, CheckCircle } from 'lucide-react'
import * as XLSX from 'xlsx'

import { AppBackground } from '@/components/AppBackground'
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

type TargetField = 'naics_code' | 'description' | 'kgco2e' | 'category'
interface ColumnMapping {
  field: TargetField
  excelColumn: string | null
  confidence: number
}

interface MappedRow {
  naics_code: string
  description: string
  kgco2e: string
  category: string
}

interface ExcelData {
  headers: string[]
  rows: string[][]
  fileName: string
}

const DETECTION_KEYWORDS: Record<TargetField, string[]> = {
  naics_code: ['naics', 'code', 'industry code', 'sector code', 'naics code'],
  description: ['description', 'desc', 'industry', 'sector name', 'activity', 'name', 'company'],
  kgco2e: ['kgco2e', 'co2e', 'emission factor', 'ef', 'carbon', 'ghg', 'emissions'],
  category: ['category', ' industries', 'sector', 'industry classification', 'group'],
}

// Built-in NAICS category lookup (2-digit sector codes)
const NAICS_SECTORS: Record<string, string> = {
  '11': 'Agriculture, Forestry, Fishing and Hunting',
  '21': 'Mining, Quarrying, and Oil and Gas Extraction',
  '22': 'Utilities',
  '23': 'Construction',
  '31': 'Manufacturing',
  '32': 'Manufacturing',
  '33': 'Manufacturing',
  '42': 'Wholesale Trade',
  '44': 'Retail Trade',
  '45': 'Retail Trade',
  '48': 'Transportation and Warehousing',
  '49': 'Transportation and Warehousing',
  '51': 'Information',
  '52': 'Finance and Insurance',
  '53': 'Real Estate and Rental and Leasing',
  '54': 'Professional, Scientific, and Technical Services',
  '55': 'Management of Companies and Enterprises',
  '56': 'Administrative and Support and Waste Management and Remediation Services',
  '61': 'Educational Services',
  '62': 'Health Care and Social Assistance',
  '71': 'Arts, Entertainment, and Recreation',
  '72': 'Accommodation and Food Services',
  '81': 'Other Services (except Public Administration)',
  '92': 'Public Administration',
}

// Fetch category from Census Bureau API
async function fetchNaicsCategory(code: string): Promise<string | null> {
  try {
    const cleanCode = code.replace(/[^0-9]/g, '').slice(0, 6)
    if (cleanCode.length < 2) return null
    
    const sector = cleanCode.slice(0, 2)
    if (NAICS_SECTORS[sector]) {
      return NAICS_SECTORS[sector]
    }
    
    const response = await fetch(
      `https://api.census.gov/data/2022/naics?sector=${encodeURIComponent(sector)}`
    )
    if (response.ok) {
      const data = await response.json()
      if (data.records && data.records.length > 0) {
        return data.records[0].naics2022?.title || null
      }
    }
    
    return null
  } catch {
    return null
  }
}

// Batch fetch categories for all naics codes
async function fetchAllCategories(
  naicsCodes: string[],
  onProgress?: (current: number, total: number) => void
): Promise<Map<string, string>> {
  const results = new Map<string, string>()
  
  for (let i = 0; i < naicsCodes.length; i++) {
    const code = naicsCodes[i]
    if (code && !results.has(code)) {
      onProgress?.(i + 1, naicsCodes.length)
      
      const sector = code.replace(/[^0-9]/g, '').slice(0, 2)
      const category = NAICS_SECTORS[sector] || null
      
      if (category) {
        results.set(code, category)
      } else {
        const apiCategory = await fetchNaicsCategory(code)
        if (apiCategory) {
          results.set(code, apiCategory)
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  
  return results
}

function detectColumn(headers: string[], target: TargetField): { column: string | null; confidence: number } {
  const keywords = DETECTION_KEYWORDS[target]
  
  for (const header of headers) {
    const normalized = header.toLowerCase().trim()
    if (keywords.some(k => k === normalized)) {
      return { column: header, confidence: 100 }
    }
  }
  
  for (const header of headers) {
    const normalized = header.toLowerCase().trim()
    for (const keyword of keywords) {
      if (normalized.includes(keyword) || keyword.includes(normalized)) {
        const score = normalized.length > keyword.length ? 90 : 70
        return { column: header, confidence: score }
      }
    }
  }
  
  return { column: null, confidence: -1 }
}

function NaicsMappingPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1) // 1: upload, 2: mapping, 3: preview
  const [excelData, setExcelData] = useState<ExcelData | null>(null)
  const [mappings, setMappings] = useState<ColumnMapping[]>([
    { field: 'naics_code', excelColumn: null, confidence: -1 },
    { field: 'description', excelColumn: null, confidence: -1 },
    { field: 'kgco2e', excelColumn: null, confidence: -1 },
    { field: 'category', excelColumn: null, confidence: -1 },
  ])
  const [categoryLoading, setCategoryLoading] = useState(false)
  const [categoryProgress, setCategoryProgress] = useState({ current: 0, total: 0 })
  const [filledCategories, setFilledCategories] = useState<Map<string, string>>(new Map())
  const [mappedData, setMappedData] = useState<MappedRow[]>([])
  const [confirmedData, setConfirmedData] = useState<MappedRow[] | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
        const json = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as string[][]
        
        if (json.length === 0) {
          alert('Empty spreadsheet')
          return
        }

        const headers = json[0].map(h => String(h ?? ''))
        const rows = json.slice(1)

        setExcelData({ headers, rows, fileName: file.name })
        setFilledCategories(new Map())
        setConfirmedData(null)
        setMappedData([])

        const newMappings = mappings.map(m => {
          const detected = detectColumn(headers, m.field)
          return { ...m, excelColumn: detected.column, confidence: detected.confidence }
        })
        setMappings(newMappings)
        setStep(2)
      } catch (error) {
        console.error('Error parsing Excel:', error)
        alert('Failed to parse Excel file')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const handleMappingChange = (field: TargetField, column: string) => {
    setMappings(prev => prev.map(m => 
      m.field === field 
        ? { ...m, excelColumn: column === '__none__' ? null : column, confidence: column === '__none__' ? -1 : 50 }
        : m
    ))
  }

  const handleFetchCategories = async () => {
    if (!excelData) return
    
    const naicsMapping = mappings.find(m => m.field === 'naics_code')
    if (!naicsMapping?.excelColumn) {
      alert('Please map the NAICS Code column first')
      return
    }

    const naicsColIndex = excelData.headers.indexOf(naicsMapping.excelColumn)
    if (naicsColIndex === -1) return

    setCategoryLoading(true)
    setCategoryProgress({ current: 0, total: excelData.rows.length })
    
    const naicsCodes = [...new Set(
      excelData.rows
        .map(row => row[naicsColIndex]?.toString().trim())
        .filter(code => code && code.length > 0)
    )]

    try {
      const categories = await fetchAllCategories(naicsCodes, (current, total) => {
        setCategoryProgress({ current, total })
      })
      setFilledCategories(categories)
    } catch (error) {
      console.error('Error fetching categories:', error)
    } finally {
      setCategoryLoading(false)
    }
  }

  const buildMappedData = (): MappedRow[] => {
    if (!excelData) return []
    
    const naicsCol = mappings.find(m => m.field === 'naics_code')?.excelColumn
    const descCol = mappings.find(m => m.field === 'description')?.excelColumn
    const kgco2eCol = mappings.find(m => m.field === 'kgco2e')?.excelColumn
    const catCol = mappings.find(m => m.field === 'category')?.excelColumn
    
    const naicsIdx = naicsCol ? excelData.headers.indexOf(naicsCol) : -1
    const descIdx = descCol ? excelData.headers.indexOf(descCol) : -1
    const kgco2eIdx = kgco2eCol ? excelData.headers.indexOf(kgco2eCol) : -1
    const catIdx = catCol ? excelData.headers.indexOf(catCol) : -1
    
    return excelData.rows.map(row => ({
      naics_code: naicsIdx >= 0 ? row[naicsIdx]?.toString() || '' : '',
      description: descIdx >= 0 ? row[descIdx]?.toString() || '' : '',
      kgco2e: kgco2eIdx >= 0 ? row[kgco2eIdx]?.toString() || '' : '',
      category: catIdx >= 0 
        ? row[catIdx]?.toString() || '' 
        : (naicsIdx >= 0 ? filledCategories.get(row[naicsIdx]?.toString().trim() || '') || '' : ''),
    }))
  }

  const handleShowPreview = () => {
    const data = buildMappedData()
    setMappedData(data)
    setStep(3)
  }

  const handleExportFull = () => {
    const data = buildMappedData()
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'NAICS Mapping')
    XLSX.writeFile(wb, 'naics_mapping_result.xlsx')
  }

  const handleConfirmMapping = () => {
    const data = buildMappedData()
    setConfirmedData(data)
    alert(`Mapping confirmed! ${data.length} rows saved locally.`)
  }

  const fieldLabels: Record<TargetField, string> = {
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

  const canShowPreview = mappings.some(m => m.field === 'naics_code' && m.excelColumn)


  return (
    <AppBackground>
      <section className="relative z-10 mx-auto grid min-h-[calc(100vh-2rem)] w-full max-w-7xl gap-4 lg:grid-cols-[16rem_1fr]">
        <aside className="flex flex-col justify-between rounded-lg bg-zinc-950 p-5 text-white shadow-2xl shadow-zinc-950/20">
          <div>
            <a
              href="#"
              className="mb-6 flex size-10 items-center justify-center rounded-md bg-zinc-800 text-lime-300 transition-colors hover:bg-zinc-700"
            >
              <ArrowLeft className="size-5" />
            </a>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-lime-300">Workspace</p>
            <h1 className="mt-3 text-2xl font-semibold leading-tight tracking-tight">
              NAICS Mapping
            </h1>
            <p className="text-sm leading-6 text-zinc-300">
              Prepare company, supplier, or spend-category records by assigning NAICS codes before calculating sector-based carbon factors.
            </p>
          </div>
        </aside>

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
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep(1)
                    setExcelData(null)
                    setFilledCategories(new Map())
                    setConfirmedData(null)
                    setMappedData([])
                  }}
                >
                  Upload Different File
                </Button>
              </div>

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
          {step === 3 && mappedData.length > 0 && (
            <>
              <section className="rounded-lg border border-zinc-900/12 bg-white shadow-sm">
                <div className="border-b border-zinc-900/10 p-5 flex items-center justify-between">
                  <div>
                    <CardTitle className="text-2xl flex items-center gap-2">
                      <FileSpreadsheet className="size-5" />
                      Mapping Preview
                    </CardTitle>
                    <CardDescription className="mt-2">
                      Showing first 5 rows of {mappedData.length} total mappings
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setStep(2)}
                  >
                    Back to Mapping
                  </Button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-950">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-zinc-300">NAICS Code</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-zinc-300">Description</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-zinc-300">kgCO₂e</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-zinc-300">Category</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mappedData.slice(0, 5).map((row, idx) => (
                        <tr key={idx} className="border-t border-zinc-900/10">
                          <td className="px-4 py-3 font-mono text-lime-700">{row.naics_code}</td>
                          <td className="px-4 py-3 text-zinc-700">{row.description}</td>
                          <td className="px-4 py-3 text-zinc-700">{row.kgco2e}</td>
                          <td className="px-4 py-3 text-zinc-700">{row.category}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="border-t border-zinc-900/10 p-5 flex gap-4">
                  <Button onClick={handleExportFull} variant="outline" className="flex items-center gap-2">
                    <Download className="size-4" />
                    Export Full Result
                  </Button>
                  <Button onClick={handleConfirmMapping} className="flex items-center gap-2 bg-lime-600 hover:bg-lime-700">
                    <CheckCircle className="size-4" />
                    Confirm Mapping
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
                    {confirmedData.length} rows saved locally. Data will persist until you close the app.
                  </p>
                </section>
              )}
            </>
          )}

          <Card className="border-zinc-900/12 bg-white">
            <CardHeader className="border-b border-zinc-900/10 pb-5">
              <CardTitle>Workflow</CardTitle>
              <CardDescription>Current step: {step === 1 ? 'Upload' : step === 2 ? 'Map Columns' : 'Preview'}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                'Upload Excel file with NAICS data.',
                'Map columns to target fields.',
                'Fetch categories if missing (optional).',
                'Preview mapped data.',
                'Export or confirm mapping.',
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
      </section>
    </AppBackground>
  )
}

export default NaicsMappingPage