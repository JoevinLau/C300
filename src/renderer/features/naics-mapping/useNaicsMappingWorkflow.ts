import { useCallback, useRef, useState } from 'react'

import { naicsMappingApi } from './naics-mapping-api'
import {
  buildBatchRequest,
  buildMappedRows,
  cleanMaterialToken,
  cleanNaicsCode,
  confirmRows,
  detectMappings,
  editMappedRow,
  enrichRows,
  getNaicsCategoryLabel,
  INITIAL_MAPPINGS,
  mergeCalculationResults,
  type BatchCalculationDisplayRow,
  type ColumnMapping,
  type ExcelData,
  type MappedRow,
  type MappingStep,
  type NaicsMappingApi,
  type TargetField,
} from './naics-mapping-workflow'

const EMPTY_PROGRESS = { current: 0, total: 0 }

export function useNaicsMappingWorkflow(api: NaicsMappingApi = naicsMappingApi) {
  const requestIds = useRef({ categories: 0, enrich: 0, confirm: 0, calculate: 0, refresh: 0 })
  const [step, setStep] = useState<MappingStep>(1)
  const [excelData, setExcelData] = useState<ExcelData | null>(null)
  const [mappings, setMappings] = useState<ColumnMapping[]>(INITIAL_MAPPINGS)
  const [categoryLoading, setCategoryLoading] = useState(false)
  const [fetchNaicsLoading, setFetchNaicsLoading] = useState(false)
  const [refreshPreviewLoading, setRefreshPreviewLoading] = useState(false)
  const [confirmationLoading, setConfirmationLoading] = useState(false)
  const [categoryProgress, setCategoryProgress] = useState(EMPTY_PROGRESS)
  const [fetchNaicsProgress, setFetchNaicsProgress] = useState(EMPTY_PROGRESS)
  const [filledCategories, setFilledCategories] = useState<Map<string, string>>(new Map())
  const [mappedData, setMappedData] = useState<MappedRow[]>([])
  const [hasFetchedNaics, setHasFetchedNaics] = useState(false)
  const [confirmedData, setConfirmedData] = useState<MappedRow[] | null>(null)
  const [calculationResults, setCalculationResults] = useState<BatchCalculationDisplayRow[] | null>(null)
  const [calculationLoading, setCalculationLoading] = useState(false)

  const invalidateRequests = useCallback(() => {
    Object.keys(requestIds.current).forEach((key) => {
      requestIds.current[key as keyof typeof requestIds.current] += 1
    })
    setCategoryLoading(false)
    setFetchNaicsLoading(false)
    setRefreshPreviewLoading(false)
    setConfirmationLoading(false)
    setCalculationLoading(false)
  }, [])

  const invalidateDownstream = useCallback(() => {
    setConfirmedData(null)
    setCalculationResults(null)
  }, [])

  const loadSheet = useCallback((data: ExcelData) => {
    invalidateRequests()
    setExcelData(data)
    setMappings(detectMappings(data.headers))
    setMappedData([])
    setFilledCategories(new Map())
    setHasFetchedNaics(false)
    setFetchNaicsProgress(EMPTY_PROGRESS)
    setCategoryProgress(EMPTY_PROGRESS)
    setConfirmedData(null)
    setCalculationResults(null)
    setStep(2)
  }, [invalidateRequests])

  const reset = useCallback(() => {
    invalidateRequests()
    setStep(1)
    setExcelData(null)
    setMappings(INITIAL_MAPPINGS)
    setMappedData([])
    setFilledCategories(new Map())
    setHasFetchedNaics(false)
    setFetchNaicsProgress(EMPTY_PROGRESS)
    setCategoryProgress(EMPTY_PROGRESS)
    setConfirmedData(null)
    setCalculationResults(null)
  }, [invalidateRequests])

  const updateMapping = useCallback((field: TargetField, column: string) => {
    invalidateRequests()
    setMappings((current) => current.map((mapping) => mapping.field === field
      ? {
          ...mapping,
          excelColumn: column === '__none__' ? null : column,
          confidence: column === '__none__' ? -1 : 50,
        }
      : mapping))
    invalidateDownstream()
  }, [invalidateDownstream, invalidateRequests])

  const fetchCategories = useCallback(async () => {
    if (!excelData) return
    invalidateRequests()
    const column = mappings.find((mapping) => mapping.field === 'naics_code')?.excelColumn
    if (!column) throw new Error('Please map the NAICS Code column first.')
    const index = excelData.headers.indexOf(column)
    if (index < 0) throw new Error('The mapped NAICS Code column no longer exists.')
    const codes = [...new Set(excelData.rows.map((row) => row[index]?.trim()).filter(Boolean))]
    const requestId = ++requestIds.current.categories
    setCategoryLoading(true)
    setCategoryProgress({ current: 0, total: codes.length })
    try {
      const categories = new Map<string, string>()
      codes.forEach((code, codeIndex) => {
        if (requestId !== requestIds.current.categories) return
        const category = getNaicsCategoryLabel(code)
        if (category) categories.set(code, category)
        setCategoryProgress({ current: codeIndex + 1, total: codes.length })
      })
      if (requestId === requestIds.current.categories) setFilledCategories(categories)
    } finally {
      if (requestId === requestIds.current.categories) setCategoryLoading(false)
    }
  }, [excelData, invalidateRequests, mappings])

  const fetchNaics = useCallback(async () => {
    if (!excelData) return
    invalidateRequests()
    const requestId = ++requestIds.current.enrich
    setFetchNaicsLoading(true)
    invalidateDownstream()
    try {
      const rows = await enrichRows({
        data: excelData,
        mappings,
        api,
        onProgress: (current, total) => {
          if (requestId === requestIds.current.enrich) setFetchNaicsProgress({ current, total })
        },
      })
      if (requestId !== requestIds.current.enrich) return
      setMappedData(rows)
      setHasFetchedNaics(true)
      setStep(3)
    } finally {
      if (requestId === requestIds.current.enrich) setFetchNaicsLoading(false)
    }
  }, [api, excelData, invalidateDownstream, invalidateRequests, mappings])

  const showPreview = useCallback(() => {
    if (!excelData) return
    invalidateRequests()
    setMappedData(buildMappedRows(excelData, mappings, filledCategories))
    setHasFetchedNaics(false)
    invalidateDownstream()
    setStep(3)
  }, [excelData, filledCategories, invalidateDownstream, invalidateRequests, mappings])

  const confirm = useCallback(async () => {
    invalidateRequests()
    const requestId = ++requestIds.current.confirm
    setConfirmationLoading(true)
    setCalculationResults(null)
    try {
      const result = await confirmRows(mappedData, api)
      if (requestId !== requestIds.current.confirm) return
      setMappedData(result.rows)
      if (result.failures.length > 0) {
        setConfirmedData(null)
        const names = result.failures.map((failure) => failure.materialName).join(', ')
        throw new Error(`Could not confirm ${result.failures.length} row(s): ${names}`)
      }
      setConfirmedData(result.rows)
      setStep(4)
    } finally {
      if (requestId === requestIds.current.confirm) setConfirmationLoading(false)
    }
  }, [api, invalidateRequests, mappedData])

  const calculate = useCallback(async () => {
    invalidateRequests()
    const rows = confirmedData ?? mappedData
    const request = buildBatchRequest(rows)
    const requestId = ++requestIds.current.calculate
    setCalculationLoading(true)
    try {
      const results = await api.calculate(request)
      if (requestId !== requestIds.current.calculate) return
      setCalculationResults(mergeCalculationResults(rows, results))
      setStep(5)
    } finally {
      if (requestId === requestIds.current.calculate) setCalculationLoading(false)
    }
  }, [api, confirmedData, invalidateRequests, mappedData])

  const refreshPreview = useCallback(async () => {
    invalidateRequests()
    const selectedByMaterial = new Map<string, { code: string; priority: number }>()
    mappedData.forEach((row) => {
      const materialName = cleanMaterialToken(row.material_name)
      const code = cleanNaicsCode(row.naics_code)
      if (!materialName || code.length !== 6) return
      const priority = row.source === 'phase3' ? 2 : 1
      const current = selectedByMaterial.get(materialName)
      if (!current || priority >= current.priority) selectedByMaterial.set(materialName, { code, priority })
    })
    if (selectedByMaterial.size === 0) {
      throw new Error('Please enter at least one valid 6-digit NAICS code before refreshing.')
    }

    const requestId = ++requestIds.current.refresh
    setRefreshPreviewLoading(true)
    try {
      const uniqueCodes = [...new Set([...selectedByMaterial.values()].map(({ code }) => code))]
      const factors = await Promise.all(uniqueCodes.map(async (code) => [code, await api.factor(code)] as const))
      if (requestId !== requestIds.current.refresh) return []
      const factorByCode = new Map(factors)
      const invalidCodes = factors.filter(([, factor]) => !factor).map(([code]) => code)
      setMappedData((rows) => rows.map((row) => {
        const materialName = cleanMaterialToken(row.material_name) || row.material_name
        const selected = selectedByMaterial.get(materialName)
        if (!selected) return { ...row, material_name: materialName }
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
        return {
          ...row,
          material_name: materialName,
          naics_code: cleanNaicsCode(factor.code || selected.code),
          description: factor.description || row.description,
          kgco2e: factor.kgco2e_per_usd == null ? row.kgco2e : String(factor.kgco2e_per_usd),
          category: getNaicsCategoryLabel(factor.code || selected.code, factor.category) || row.category,
          source: selected.priority === 2 ? 'phase3' : 'phase2',
          confidence_level: 'exact',
        }
      }))
      invalidateDownstream()
      return invalidCodes
    } finally {
      if (requestId === requestIds.current.refresh) setRefreshPreviewLoading(false)
    }
  }, [api, invalidateDownstream, invalidateRequests, mappedData])

  const editRow = useCallback((index: number, field: keyof MappedRow, value: string) => {
    invalidateRequests()
    setMappedData((rows) => editMappedRow(rows, index, field, value))
    invalidateDownstream()
  }, [invalidateDownstream, invalidateRequests])

  return {
    calculationLoading,
    calculationResults,
    calculate,
    categoryLoading,
    categoryProgress,
    confirm,
    confirmationLoading,
    confirmedData,
    editRow,
    excelData,
    fetchCategories,
    fetchNaics,
    fetchNaicsLoading,
    fetchNaicsProgress,
    filledCategories,
    hasFetchedNaics,
    loadSheet,
    mappedData,
    mappings,
    refreshPreview,
    refreshPreviewLoading,
    reset,
    setStep,
    showPreview,
    step,
    updateMapping,
  }
}
