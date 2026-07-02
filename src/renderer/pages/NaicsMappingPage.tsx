import { useState, useRef } from 'react'
import { ArrowLeft, Upload, FileSpreadsheet, Check, X, AlertCircle, Loader2, Globe, Eye, Download, CheckCircle, RefreshCw } from 'lucide-react'
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

type TargetField =
  | 'supplier'
  | 'material_name'
  | 'weight'
  | 'qty'
  | 'total_amount_sgd'
  | 'naics_code'
  | 'description'
  | 'kgco2e'
  | 'category'
interface ColumnMapping {
  field: TargetField
  excelColumn: string | null
  confidence: number
}

interface MappedRow {
  supplier: string
  material_name: string
  weight: string
  qty: string
  total_amount_sgd: string
  naics_code: string
  description: string
  kgco2e: string
  category: string
  source?: 'phase1' | 'phase2' | 'phase3'
  confidence_level?: 'exact' | 'partial' | 'low'
}

interface BatchCalculationResult extends MappedRow {
  mapped_naics: string
  naics_description?: string
  kgco2e_per_usd: number
  total_kgco2e: number
  data_source?: string
}

interface NaicsFactorOption {
  code: string
  description: string
  kgco2e_per_usd?: number | null
  category?: string | null
}

interface ExcelData {
  headers: string[]
  rows: string[][]
  fileName: string
  allSheets?: string[]
  selectedSheet?: string
}

const DETECTION_KEYWORDS: Record<TargetField, string[]> = {
  supplier: ['supplier', 'vendor', 'company', 'seller'],
  material_name: ['material', 'name', 'item', 'description', 'material name', 'part name'],
  weight: ['weight', 'weight kg', 'kg', 'mass'],
  qty: ['qty', 'quantity', 'count', 'pcs', 'pieces'],
  total_amount_sgd: ['total amount sgd', 'amount sgd', 'total sgd', 'spend', 'cost', 'price', 'total amount', 'amount'],
  naics_code: ['naics', 'code', 'industry code', 'sector code', 'naics code'],
  description: ['description', 'desc', 'industry', 'sector name', 'activity', 'company'],
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

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || 'http://127.0.0.1:8000'

function cleanMaterialToken(rawName: string): string {
  if (!rawName) return ''

  let text = String(rawName).toUpperCase().trim()
  text = text.replace(/\([^)]*\)/g, ' ')
  text = text.replace(/(\d+(\.\d+)?\s*[X*]\s*\d+).*$/i, '')
  text = text.replace(/\b\d+(\.\d+)?\s*(MM|CM|M|INCH|L|KG|G)\b.*$/i, '')
  text = text.replace(/\b(PLATE|SHEET|BAR|ROD|SCRAP|ROLL|TUBE|PIPE|BLOCK|STRIP|COIL|BOXES|WIRE)\b/gi, '')
  text = text.replace(/[^A-Z0-9-]/g, ' ')
  text = text.replace(/\s+/g, ' ').trim()

  return text
}

function cleanNaicsCode(code: string): string {
  return String(code || '').replace(/[^0-9]/g, '').slice(0, 6)
}

async function fetchApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init)
  const body: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const detail =
      body && typeof body === 'object' && 'detail' in body
        ? (body as { detail: unknown }).detail
        : `Request failed (${response.status})`
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
  }

  return body as T
}

async function fetchLlmNaicsSuggestion(materialName: string): Promise<string | null> {
  const suggestion = await fetchApi<{ suggested_naics: string }>(
    `/api/naics/llm-suggest?material=${encodeURIComponent(materialName)}`,
  ).catch(() => null)

  return suggestion?.suggested_naics || null
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
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1)
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null)
  const [excelData, setExcelData] = useState<ExcelData | null>(null)
  const [mappings, setMappings] = useState<ColumnMapping[]>([
    { field: 'supplier', excelColumn: null, confidence: -1 },
    { field: 'material_name', excelColumn: null, confidence: -1 },
    { field: 'weight', excelColumn: null, confidence: -1 },
    { field: 'qty', excelColumn: null, confidence: -1 },
    { field: 'total_amount_sgd', excelColumn: null, confidence: -1 },
    { field: 'naics_code', excelColumn: null, confidence: -1 },
    { field: 'description', excelColumn: null, confidence: -1 },
    { field: 'kgco2e', excelColumn: null, confidence: -1 },
    { field: 'category', excelColumn: null, confidence: -1 },
  ])
  const [categoryLoading, setCategoryLoading] = useState(false)
  const [fetchNaicsLoading, setFetchNaicsLoading] = useState(false)
  const [refreshPreviewLoading, setRefreshPreviewLoading] = useState(false)
  const [categoryProgress, setCategoryProgress] = useState({ current: 0, total: 0 })
  const [fetchNaicsProgress, setFetchNaicsProgress] = useState({ current: 0, total: 0 })
  const [filledCategories, setFilledCategories] = useState<Map<string, string>>(new Map())
  const [mappedData, setMappedData] = useState<MappedRow[]>([])
  const [confirmedData, setConfirmedData] = useState<MappedRow[] | null>(null)
  const [calculationResults, setCalculationResults] = useState<BatchCalculationResult[] | null>(null)
  const [calculationLoading, setCalculationLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const processSheet = (wb: XLSX.WorkBook, sheetName: string) => {
    const sheet = wb.Sheets[sheetName]
    const json = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]
    
    if (json.length === 0) return

    // Find header row (the row with the most detected keywords)
    let bestHeaderRowIndex = 0
    let maxDetectedCount = -1

    // Scan first 10 rows for headers
    for (let i = 0; i < Math.min(json.length, 10); i++) {
      const row = json[i]
      if (!row || !Array.isArray(row)) continue
      
      let detectedCount = 0
      const rowStrings = row.map(cell => String(cell ?? '').toLowerCase())
      
      Object.values(DETECTION_KEYWORDS).forEach(keywords => {
        if (keywords.some(k => rowStrings.some(rs => rs.includes(k)))) {
          detectedCount++
        }
      })
      
      if (detectedCount > maxDetectedCount) {
        maxDetectedCount = detectedCount
        bestHeaderRowIndex = i
      }
    }

    const headers = json[bestHeaderRowIndex].map(h => String(h ?? ''))
    const rows = json.slice(bestHeaderRowIndex + 1).filter(row => row.some(cell => cell !== null && cell !== ''))

    setExcelData({ 
      headers, 
      rows: rows.map(r => r.map(c => String(c ?? ''))), 
      fileName: (excelData?.fileName || ''),
      allSheets: wb.SheetNames,
      selectedSheet: sheetName
    })

    const newMappings = mappings.map(m => {
      const detected = detectColumn(headers, m.field)
      return { ...m, excelColumn: detected.column, confidence: detected.confidence }
    })
    setMappings(newMappings)
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        setWorkbook(wb)
        setFetchNaicsProgress({ current: 0, total: 0 })
        setCalculationResults(null)
        setConfirmedData(null)

        setExcelData(prev => ({ ...prev, fileName: file.name } as ExcelData))
        processSheet(wb, wb.SheetNames[0])
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

  const getMappedCellValue = (row: string[], field: TargetField): string => {
    if (!excelData) return ''
    const column = mappings.find(m => m.field === field)?.excelColumn
    const index = column ? excelData.headers.indexOf(column) : -1
    return index >= 0 ? row[index]?.toString().trim() || '' : ''
  }

  const handleFetchNaics = async () => {
    if (!excelData) return

    const nameMapping = mappings.find(m => m.field === 'material_name')
    if (!nameMapping?.excelColumn) {
      alert('Please map the Material Name column first')
      return
    }

    const nameColIndex = excelData.headers.indexOf(nameMapping.excelColumn)
    if (nameColIndex === -1) return

    const materialNames = excelData.rows
      .map(row => cleanMaterialToken(row[nameColIndex]?.toString().trim() || ''))
      .filter((name): name is string => !!name)

    const uniqueNames = [...new Set(materialNames)]
    if (uniqueNames.length === 0) {
      alert('No valid material names found in selected column')
      return
    }

    setFetchNaicsLoading(true)
    setFetchNaicsProgress({ current: 0, total: uniqueNames.length })

    try {
      const concurrency = Math.min(6, uniqueNames.length)
      const resultByName = new Map<string, MappedRow>()
      let nextIndex = 0
      let completed = 0

      const worker = async () => {
        while (true) {
          const currentIndex = nextIndex
          nextIndex += 1
          if (currentIndex >= uniqueNames.length) return

          const materialName = uniqueNames[currentIndex]

          try {
            const result = await fetchApi<{
              tier: number
              material_token: string
              matches: Array<{
                code: string
                description: string
                kgco2e_per_usd?: number
                source?: string
                confidence?: string
              }>
            }>(`/api/naics/search?q=${encodeURIComponent(materialName)}`)

            const match = result.matches[0]
            const cleanedMaterialName = cleanMaterialToken(result.material_token || materialName) || materialName
            if (match) {
              resultByName.set(materialName, {
                supplier: '',
                material_name: cleanedMaterialName,
                weight: '',
                qty: '',
                total_amount_sgd: '',
                naics_code: match.code || '',
                description: match.description || 'Not Found - Please manual entry',
                category: '',
                kgco2e: match.kgco2e_per_usd != null ? String(match.kgco2e_per_usd) : '',
                source: result.tier === 1 ? 'phase1' : 'phase2',
                confidence_level: match.confidence === 'exact' ? 'exact' : 'partial',
              })
            } else {
              const suggestedNaics = await fetchLlmNaicsSuggestion(materialName)
              resultByName.set(materialName, {
                supplier: '',
                material_name: cleanedMaterialName,
                weight: '',
                qty: '',
                total_amount_sgd: '',
                naics_code: suggestedNaics || '',
                description: suggestedNaics ? 'LLM suggestion - please confirm' : 'Not Found - Please manual entry',
                category: '',
                kgco2e: '',
                source: 'phase3',
                confidence_level: 'low',
              })
            }
          } catch (rowError) {
            console.error(`Error fetching NAICS for ${materialName}:`, rowError)
            const suggestedNaics = await fetchLlmNaicsSuggestion(materialName)
            resultByName.set(materialName, {
              supplier: '',
              material_name: materialName,
              weight: '',
              qty: '',
              total_amount_sgd: '',
              naics_code: suggestedNaics || '',
              description: suggestedNaics
                ? 'LLM suggestion - please confirm'
                : 'Connection failed - Please manual entry',
              category: '',
              kgco2e: '',
              source: 'phase3',
              confidence_level: 'low',
            })
          } finally {
            completed += 1
            setFetchNaicsProgress({ current: completed, total: uniqueNames.length })
          }
        }
      }

      await Promise.all(Array.from({ length: concurrency }, () => worker()))

      const newMappedData: MappedRow[] = excelData.rows
        .filter(row => cleanMaterialToken(row[nameColIndex]?.toString().trim() || ''))
        .map(row => {
        const materialName = cleanMaterialToken(row[nameColIndex]?.toString().trim() || '')
        const hit = resultByName.get(materialName)
        return {
          ...(hit ?? {
            supplier: '',
            material_name: materialName,
            weight: '',
            qty: '',
            total_amount_sgd: '',
            naics_code: '',
            description: 'Not Found - Please manual entry',
            category: '',
            kgco2e: '',
            source: 'phase3',
            confidence_level: 'low',
          }),
          supplier: getMappedCellValue(row, 'supplier'),
          weight: getMappedCellValue(row, 'weight'),
          qty: getMappedCellValue(row, 'qty'),
          total_amount_sgd: getMappedCellValue(row, 'total_amount_sgd'),
        }
      })

      setMappedData(newMappedData)
      setStep(3)
    } catch (error) {
      console.error('Error fetching NAICS:', error)
      alert('Failed to fetch NAICS codes')
    } finally {
      setFetchNaicsLoading(false)
    }
  }

  const buildMappedData = (): MappedRow[] => {
    if (!excelData) return []
    
    const nameCol = mappings.find(m => m.field === 'material_name')?.excelColumn
    const naicsCol = mappings.find(m => m.field === 'naics_code')?.excelColumn
    const descCol = mappings.find(m => m.field === 'description')?.excelColumn
    const kgco2eCol = mappings.find(m => m.field === 'kgco2e')?.excelColumn
    const catCol = mappings.find(m => m.field === 'category')?.excelColumn
    
    const nameIdx = nameCol ? excelData.headers.indexOf(nameCol) : -1
    const naicsIdx = naicsCol ? excelData.headers.indexOf(naicsCol) : -1
    const descIdx = descCol ? excelData.headers.indexOf(descCol) : -1
    const kgco2eIdx = kgco2eCol ? excelData.headers.indexOf(kgco2eCol) : -1
    const catIdx = catCol ? excelData.headers.indexOf(catCol) : -1
    
    return excelData.rows.map(row => {
      const naicsCode = naicsIdx >= 0 ? row[naicsIdx]?.toString() || '' : ''
      const materialName = nameIdx >= 0 ? cleanMaterialToken(row[nameIdx]?.toString() || '') : ''
      return {
        supplier: getMappedCellValue(row, 'supplier'),
        material_name: materialName,
        weight: getMappedCellValue(row, 'weight'),
        qty: getMappedCellValue(row, 'qty'),
        total_amount_sgd: getMappedCellValue(row, 'total_amount_sgd'),
        naics_code: naicsCode,
        description: descIdx >= 0 ? row[descIdx]?.toString() || '' : '',
        kgco2e: kgco2eIdx >= 0 ? row[kgco2eIdx]?.toString() || '' : '',
        category: catIdx >= 0 
          ? row[catIdx]?.toString() || '' 
          : (naicsIdx >= 0 ? filledCategories.get(naicsCode.trim()) || '' : ''),
        source: naicsCode ? 'phase1' : 'phase3'
      }
    })
  }


  const handleShowPreview = () => {
    const data = buildMappedData()
    setMappedData(data)
    setStep(3)
  }

  const handleConfirmMapping = async () => {
    try {
      const confirmedRows: MappedRow[] = []
      for (const row of mappedData) {
        if (row.material_name && row.naics_code) {
          const confirmation = await fetchApi<{
            material_token: string
            mapping: {
              code: string
              description: string
              kgco2e_per_usd?: number
              category?: string | null
            }
          }>('/api/naics/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              material_token: row.material_name,
              mapped_naics: row.naics_code,
              user_id: 'default',
            }),
          })
          confirmedRows.push({
            ...row,
            naics_code: confirmation.mapping.code || row.naics_code,
            description: confirmation.mapping.description || row.description,
            kgco2e: confirmation.mapping.kgco2e_per_usd != null
              ? String(confirmation.mapping.kgco2e_per_usd)
              : row.kgco2e,
            category: confirmation.mapping.category || row.category,
            source: 'phase1',
            confidence_level: 'exact',
          })
        } else {
          confirmedRows.push(row)
        }
      }

      setMappedData(confirmedRows)
      setConfirmedData(confirmedRows)
      setStep(4)
      alert(`Mapping confirmed! ${mappedData.length} rows saved to the learning dictionary.`)
    } catch (error) {
      console.error('Learning failed:', error)
      alert(error instanceof Error ? error.message : 'Failed to confirm mapping')
    }
  }

  const handleCalculateBatch = async () => {
    const rows = confirmedData ?? mappedData
    const invalid = rows.find(row => !row.naics_code || !row.total_amount_sgd)
    if (invalid) {
      alert('Please make sure every row has a NAICS code and Total Amount SGD before calculating.')
      return
    }

    setCalculationLoading(true)
    try {
      const results = await fetchApi<BatchCalculationResult[]>('/api/calculate/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rows.map(row => ({
          supplier: row.supplier,
          material: row.material_name,
          weight: Number(row.weight || 0),
          qty: Number(row.qty || 0),
          total_amount_sgd: Number(row.total_amount_sgd || 0),
          mapped_naics: row.naics_code,
        }))),
      })

      setCalculationResults(results.map((result, index) => ({
        ...rows[index],
        ...result,
        kgco2e: String(result.kgco2e_per_usd ?? rows[index].kgco2e),
        description: result.naics_description || rows[index].description,
      })))
      setStep(5)
    } catch (error) {
      console.error('Batch calculation failed:', error)
      alert(error instanceof Error ? error.message : 'Batch calculation failed')
    } finally {
      setCalculationLoading(false)
    }
  }

  const handleRefreshPreview = async () => {
    if (mappedData.length === 0) return

    const selectedByMaterial = new Map<string, { code: string; priority: number }>()
    for (const row of mappedData) {
      const materialName = cleanMaterialToken(row.material_name)
      const naicsCode = cleanNaicsCode(row.naics_code)
      if (!materialName || naicsCode.length !== 6) continue

      const priority = row.source === 'phase3' ? 2 : 1
      const current = selectedByMaterial.get(materialName)
      if (!current || priority >= current.priority) {
        selectedByMaterial.set(materialName, { code: naicsCode, priority })
      }
    }

    if (selectedByMaterial.size === 0) {
      alert('Please enter at least one valid 6-digit NAICS code before refreshing.')
      return
    }

    setRefreshPreviewLoading(true)
    try {
      const uniqueCodes = [...new Set([...selectedByMaterial.values()].map(item => item.code))]
      const factorResults = await Promise.all(
        uniqueCodes.map(async code => {
          try {
            const factor = await fetchApi<NaicsFactorOption>(`/api/naics/factor/${encodeURIComponent(code)}`)
            return [code, factor] as const
          } catch (error) {
            console.error(`Failed to refresh factor for NAICS ${code}:`, error)
            return [code, null] as const
          }
        }),
      )

      const factorByCode = new Map(factorResults)
      const invalidCodes = factorResults
        .filter(([, factor]) => !factor)
        .map(([code]) => code)

      const refreshedRows: MappedRow[] = mappedData.map(row => {
        const materialName = cleanMaterialToken(row.material_name) || row.material_name
        const selected = selectedByMaterial.get(materialName)
        if (!selected) {
          return { ...row, material_name: materialName }
        }

        const factor = factorByCode.get(selected.code)
        if (!factor) {
          return {
            ...row,
            material_name: materialName,
            naics_code: selected.code,
            description: 'Invalid NAICS code - please edit',
            kgco2e: '',
            category: '',
            source: 'phase3',
            confidence_level: 'low',
          }
        }

        const sectorCategory = NAICS_SECTORS[selected.code.slice(0, 2)] || ''
        return {
          ...row,
          material_name: materialName,
          naics_code: cleanNaicsCode(factor.code || selected.code),
          description: factor.description || row.description,
          kgco2e: factor.kgco2e_per_usd != null ? String(factor.kgco2e_per_usd) : row.kgco2e,
          category: factor.category || sectorCategory || row.category,
          source: selected.priority === 2 ? 'phase3' : 'phase2',
          confidence_level: 'exact',
        }
      })

      setMappedData(refreshedRows)
      setConfirmedData(null)
      setCalculationResults(null)

      if (invalidCodes.length > 0) {
        alert(`Some NAICS codes could not be found: ${invalidCodes.join(', ')}`)
      }
    } catch (error) {
      console.error('Failed to refresh preview:', error)
      alert(error instanceof Error ? error.message : 'Failed to refresh preview')
    } finally {
      setRefreshPreviewLoading(false)
    }
  }

  const handleRowEdit = (index: number, field: keyof MappedRow, value: string) => {
    const newData = [...mappedData]
    newData[index] = { ...newData[index], [field]: value, source: field === 'naics_code' ? 'phase3' : newData[index].source }
    setMappedData(newData)
    setCalculationResults(null)
  }

  const getSourceBadge = (source?: string) => {
    switch (source) {
      case 'phase1': return <span className="rounded bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">Phase 1</span>
      case 'phase2': return <span className="rounded bg-yellow-100 px-2 py-0.5 text-[10px] font-bold text-yellow-700">Phase 2</span>
      case 'phase3': return <span className="rounded bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">Phase 3</span>
      default: return null
    }
  }

  const handleExportFull = () => {
    const rows = calculationResults ?? mappedData
    const exportData = rows.map(row => ({
      'Supplier': row.supplier,
      'Material Name': row.material_name,
      'Weight': row.weight,
      'Quantity': row.qty,
      'Total Amount SGD': row.total_amount_sgd,
      'NAICS Code': row.naics_code,
      'Description': row.description,
      'kgCO2e per USD': row.kgco2e,
      'Category': row.category,
      'Total kgCO2e': 'total_kgco2e' in row ? row.total_kgco2e : '',
    }))
    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'NAICS Mapping')
    XLSX.writeFile(wb, 'naics_mapping_result.xlsx')
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
                <div className="flex gap-2">
                  {excelData.allSheets && excelData.allSheets.length > 1 && (
                    <Select
                      value={excelData.selectedSheet}
                      onValueChange={(value) => workbook && processSheet(workbook, value)}
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
                      setStep(1)
                      setExcelData(null)
                      setFilledCategories(new Map())
                      setConfirmedData(null)
                      setCalculationResults(null)
                      setMappedData([])
                      setFetchNaicsProgress({ current: 0, total: 0 })
                    }}
                  >
                    Upload Different File
                  </Button>
                </div>
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
              <section className="rounded-lg border border-zinc-900/12 bg-white shadow-sm overflow-hidden flex flex-col max-h-[70vh]">
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
                    onClick={() => setStep(2)}
                  >
                    Back to Mapping
                  </Button>
                </div>

                <div className="overflow-auto flex-1 border-b border-zinc-900/10">
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
                  <Button onClick={handleConfirmMapping} className="flex items-center gap-2 bg-lime-600 hover:bg-lime-700">
                    <CheckCircle className="size-4" />
                    Confirm Mapping
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
      </section>
    </AppBackground>
  )
}

export default NaicsMappingPage
