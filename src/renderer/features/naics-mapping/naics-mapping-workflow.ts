import type {
  BatchCalculationRequestRow,
  BatchCalculationResult,
} from '../../../shared/calculator-types'

export type MappingStep = 1 | 2 | 3 | 4 | 5

export type TargetField =
  | 'supplier'
  | 'material_name'
  | 'weight'
  | 'qty'
  | 'total_amount_sgd'
  | 'naics_code'
  | 'description'
  | 'kgco2e'
  | 'category'

export interface ColumnMapping {
  field: TargetField
  excelColumn: string | null
  confidence: number
}

export interface MappedRow {
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

export interface BatchCalculationDisplayRow extends MappedRow {
  mapped_naics: string
  naics_description?: string
  kgco2e_per_usd: number
  total_kgco2e: number
  data_source?: string
}

export interface NaicsFactorOption {
  code: string
  description: string
  kgco2e_per_usd?: number | null
  category?: string | null
}

export interface ExcelData {
  headers: string[]
  rows: string[][]
  fileName: string
  allSheets?: string[]
  selectedSheet?: string
}

export interface NaicsSearchResult {
  tier: number
  material_token: string
  matches: Array<{
    code: string
    description: string
    kgco2e_per_usd?: number
    category?: string | null
    confidence?: string
  }>
}

export interface NaicsConfirmation {
  material_token: string
  mapping: NaicsFactorOption
}

export interface NaicsMappingApi {
  calculate(rows: BatchCalculationRequestRow[]): Promise<BatchCalculationResult[]>
  confirm(materialName: string, naicsCode: string): Promise<NaicsConfirmation>
  factor(code: string): Promise<NaicsFactorOption | null>
  search(materialName: string): Promise<NaicsSearchResult>
  suggest(materialName: string): Promise<NaicsFactorOption | null>
}

export const DETECTION_KEYWORDS: Record<TargetField, string[]> = {
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

export const NAICS_SECTORS: Record<string, string> = {
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

export const INITIAL_MAPPINGS: ColumnMapping[] = [
  { field: 'supplier', excelColumn: null, confidence: -1 },
  { field: 'material_name', excelColumn: null, confidence: -1 },
  { field: 'weight', excelColumn: null, confidence: -1 },
  { field: 'qty', excelColumn: null, confidence: -1 },
  { field: 'total_amount_sgd', excelColumn: null, confidence: -1 },
  { field: 'naics_code', excelColumn: null, confidence: -1 },
  { field: 'description', excelColumn: null, confidence: -1 },
  { field: 'kgco2e', excelColumn: null, confidence: -1 },
  { field: 'category', excelColumn: null, confidence: -1 },
]

export function cleanMaterialToken(rawName: string): string {
  if (!rawName) return ''
  let text = String(rawName).toUpperCase().trim()
  text = text.replace(/\([^)]*\)/g, ' ')
  text = text.replace(/(\d+(\.\d+)?\s*[X*]\s*\d+).*$/i, '')
  text = text.replace(/\b\d+(\.\d+)?\s*(MM|CM|M|INCH|L|KG|G)\b.*$/i, '')
  text = text.replace(/\b(PLATE|SHEET|BAR|ROD|SCRAP|ROLL|TUBE|PIPE|BLOCK|STRIP|COIL|BOXES|WIRE)\b/gi, '')
  return text.replace(/[^A-Z0-9-]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function cleanNaicsCode(code: string): string {
  return String(code || '').replace(/[^0-9]/g, '').slice(0, 6)
}

export function getNaicsCategoryLabel(code: string, category?: string | null): string {
  if (category) return category
  return NAICS_SECTORS[cleanNaicsCode(code).slice(0, 2)] || ''
}

export function detectColumn(headers: string[], target: TargetField) {
  const keywords = DETECTION_KEYWORDS[target]
  for (const header of headers) {
    const normalized = header.toLowerCase().trim()
    if (keywords.some((keyword) => keyword === normalized)) {
      return { column: header, confidence: 100 }
    }
  }
  for (const header of headers) {
    const normalized = header.toLowerCase().trim()
    for (const keyword of keywords) {
      if (normalized.includes(keyword) || keyword.includes(normalized)) {
        return { column: header, confidence: normalized.length > keyword.length ? 90 : 70 }
      }
    }
  }
  return { column: null, confidence: -1 }
}

export function detectMappings(headers: string[]): ColumnMapping[] {
  return INITIAL_MAPPINGS.map((mapping) => {
    const detected = detectColumn(headers, mapping.field)
    return { ...mapping, excelColumn: detected.column, confidence: detected.confidence }
  })
}

export function extractSheetData(
  matrix: unknown[][],
  metadata: Pick<ExcelData, 'fileName' | 'allSheets' | 'selectedSheet'>,
): ExcelData | null {
  if (matrix.length === 0) return null
  let headerIndex = 0
  let highestScore = -1
  for (let index = 0; index < Math.min(matrix.length, 10); index += 1) {
    const row = matrix[index]
    if (!Array.isArray(row)) continue
    const cells = row.map((cell) => String(cell ?? '').toLowerCase())
    const score = Object.values(DETECTION_KEYWORDS).filter((keywords) =>
      keywords.some((keyword) => cells.some((cell) => cell.includes(keyword))),
    ).length
    if (score > highestScore) {
      highestScore = score
      headerIndex = index
    }
  }
  const headers = matrix[headerIndex].map((cell) => String(cell ?? ''))
  const rows = matrix
    .slice(headerIndex + 1)
    .filter((row) => row.some((cell) => cell !== null && cell !== ''))
    .map((row) => row.map((cell) => String(cell ?? '')))
  return { headers, rows, ...metadata }
}

function getMappedCell(data: ExcelData, mappings: ColumnMapping[], row: string[], field: TargetField) {
  const column = mappings.find((mapping) => mapping.field === field)?.excelColumn
  const index = column ? data.headers.indexOf(column) : -1
  return index >= 0 ? row[index]?.trim() || '' : ''
}

export function buildMappedRows(
  data: ExcelData,
  mappings: ColumnMapping[],
  categories: Map<string, string> = new Map(),
): MappedRow[] {
  return data.rows.map((row) => {
    const naicsCode = getMappedCell(data, mappings, row, 'naics_code')
    return {
      supplier: getMappedCell(data, mappings, row, 'supplier'),
      material_name: cleanMaterialToken(getMappedCell(data, mappings, row, 'material_name')),
      weight: getMappedCell(data, mappings, row, 'weight'),
      qty: getMappedCell(data, mappings, row, 'qty'),
      total_amount_sgd: getMappedCell(data, mappings, row, 'total_amount_sgd'),
      naics_code: naicsCode,
      description: getMappedCell(data, mappings, row, 'description'),
      kgco2e: getMappedCell(data, mappings, row, 'kgco2e'),
      category:
        getMappedCell(data, mappings, row, 'category') ||
        getNaicsCategoryLabel(naicsCode, categories.get(naicsCode.trim())),
      source: naicsCode ? 'phase1' : 'phase3',
    }
  })
}

function emptyMappedRow(materialName: string): MappedRow {
  return {
    supplier: '', material_name: materialName, weight: '', qty: '', total_amount_sgd: '',
    naics_code: '', description: 'No verified NAICS found - Please manual entry',
    category: '', kgco2e: '', source: 'phase3', confidence_level: 'low',
  }
}

async function runBounded<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0
  const run = async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex]
      nextIndex += 1
      await worker(item)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run))
}

export async function enrichRows({
  data,
  mappings,
  api,
  onProgress,
}: {
  data: ExcelData
  mappings: ColumnMapping[]
  api: NaicsMappingApi
  onProgress?: (current: number, total: number) => void
}): Promise<MappedRow[]> {
  const nameColumn = mappings.find((mapping) => mapping.field === 'material_name')?.excelColumn
  if (!nameColumn) throw new Error('Please map the Material Name column first.')
  const nameIndex = data.headers.indexOf(nameColumn)
  if (nameIndex < 0) throw new Error('The mapped Material Name column no longer exists.')
  const names = data.rows
    .map((row) => cleanMaterialToken(row[nameIndex] ?? ''))
    .filter(Boolean)
  const uniqueNames = [...new Set(names)]
  if (uniqueNames.length === 0) throw new Error('No valid material names found in the selected column.')

  const resultByName = new Map<string, MappedRow>()
  let completed = 0
  onProgress?.(0, uniqueNames.length)
  await runBounded(uniqueNames, 6, async (materialName) => {
    let mapped = emptyMappedRow(materialName)
    try {
      const result = await api.search(materialName)
      const normalizedName = cleanMaterialToken(result.material_token || materialName) || materialName
      const match = result.matches[0]
      if (match) {
        mapped = {
          ...mapped,
          material_name: normalizedName,
          naics_code: cleanNaicsCode(match.code),
          description: match.description || 'Not Found - Please manual entry',
          category: getNaicsCategoryLabel(match.code, match.category),
          kgco2e: match.kgco2e_per_usd == null ? '' : String(match.kgco2e_per_usd),
          source: result.tier === 1 ? 'phase1' : 'phase2',
          confidence_level: match.confidence === 'exact' ? 'exact' : 'partial',
        }
      } else {
        const suggestion = await api.suggest(materialName)
        mapped = applySuggestion(mapped, suggestion)
      }
    } catch {
      const suggestion = await api.suggest(materialName).catch(() => null)
      mapped = applySuggestion(mapped, suggestion)
    } finally {
      resultByName.set(materialName, mapped)
      completed += 1
      onProgress?.(completed, uniqueNames.length)
    }
  })

  return data.rows
    .filter((row) => cleanMaterialToken(row[nameIndex] ?? ''))
    .map((row) => {
      const materialName = cleanMaterialToken(row[nameIndex] ?? '')
      return {
        ...(resultByName.get(materialName) ?? emptyMappedRow(materialName)),
        supplier: getMappedCell(data, mappings, row, 'supplier'),
        weight: getMappedCell(data, mappings, row, 'weight'),
        qty: getMappedCell(data, mappings, row, 'qty'),
        total_amount_sgd: getMappedCell(data, mappings, row, 'total_amount_sgd'),
      }
    })
}

function applySuggestion(row: MappedRow, suggestion: NaicsFactorOption | null): MappedRow {
  return {
    ...row,
    naics_code: cleanNaicsCode(suggestion?.code || ''),
    description: suggestion?.description || row.description,
    category: getNaicsCategoryLabel(suggestion?.code || '', suggestion?.category),
    kgco2e: suggestion?.kgco2e_per_usd == null ? '' : String(suggestion.kgco2e_per_usd),
    source: 'phase3',
    confidence_level: 'low',
  }
}

export async function confirmRows(rows: MappedRow[], api: NaicsMappingApi) {
  const confirmed = [...rows]
  const failures: Array<{ index: number; materialName: string; error: string }> = []
  await runBounded(rows.map((row, index) => ({ row, index })), 4, async ({ row, index }) => {
    if (!row.material_name || !row.naics_code) return
    try {
      const result = await api.confirm(row.material_name, row.naics_code)
      confirmed[index] = {
        ...row,
        naics_code: cleanNaicsCode(result.mapping.code || row.naics_code),
        description: result.mapping.description || row.description,
        kgco2e: result.mapping.kgco2e_per_usd == null
          ? row.kgco2e
          : String(result.mapping.kgco2e_per_usd),
        category: result.mapping.category || row.category,
        source: 'phase1',
        confidence_level: 'exact',
      }
    } catch (error) {
      failures.push({
        index,
        materialName: row.material_name,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })
  return { rows: confirmed, failures: failures.sort((a, b) => a.index - b.index) }
}

export function buildBatchRequest(rows: MappedRow[]): BatchCalculationRequestRow[] {
  return rows.map((row, index) => {
    const amount = Number(row.total_amount_sgd)
    const code = cleanNaicsCode(row.naics_code)
    if (code.length !== 6) throw new Error(`Row ${index + 1} requires a valid 6-digit NAICS code.`)
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error(`Row ${index + 1} requires a valid non-negative Total Amount SGD.`)
    }
    return {
      supplier: row.supplier,
      material: row.material_name,
      weight: Number(row.weight || 0),
      qty: Number(row.qty || 0),
      total_amount_sgd: amount,
      mapped_naics: code,
    }
  })
}

export function mergeCalculationResults(
  rows: MappedRow[],
  results: BatchCalculationResult[],
): BatchCalculationDisplayRow[] {
  if (results.length !== rows.length) {
    throw new Error(`Batch calculation returned ${results.length} results for ${rows.length} rows.`)
  }
  return results.map((result, index) => ({
    ...result,
    ...rows[index],
    mapped_naics: result.mapped_naics,
    kgco2e_per_usd: result.kgco2e_per_usd,
    total_kgco2e: result.total_kgco2e,
    data_source: result.data_source,
    kgco2e: String(result.kgco2e_per_usd ?? rows[index].kgco2e),
    description: result.naics_description || rows[index].description,
  }))
}

export function editMappedRow(
  rows: MappedRow[],
  index: number,
  field: keyof MappedRow,
  value: string,
): MappedRow[] {
  return rows.map((row, rowIndex) => rowIndex === index
    ? { ...row, [field]: value, source: field === 'naics_code' ? 'phase3' : row.source }
    : row)
}

export function buildExportRows(rows: Array<MappedRow | BatchCalculationDisplayRow>) {
  return rows.map((row) => ({
    Supplier: row.supplier,
    'Material Name': row.material_name,
    Weight: row.weight,
    Quantity: row.qty,
    'Total Amount SGD': row.total_amount_sgd,
    'NAICS Code': row.naics_code,
    Description: row.description,
    'kgCO2e per USD': row.kgco2e,
    Category: row.category,
    'Total kgCO2e': 'total_kgco2e' in row ? row.total_kgco2e : '',
  }))
}
