import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'

import type {
  CalculateRequest,
  CalculateResponse,
  Method2CalculateRequest,
  Method2CalculateResponse,
} from '../shared/calculator-types'
import type {
  CalculationHistoryDetail,
  CalculationHistoryListOptions,
  CalculationHistoryMethod,
  CalculationHistorySummary,
  CalculationHistoryTransport,
  SaveCalculationHistoryInput,
} from '../shared/calculation-history-types'

const DEFAULT_LIST_LIMIT = 50
const MAX_LIST_LIMIT = 100

interface CalculationHistoryStoreOptions {
  createId?: () => string
  now?: () => Date
}

interface SummaryRow {
  id: string
  method: string
  document_id: string
  year: number
  total_emissions_kg_co2e: number
  total_amount_sgd: number
  created_at: string
}

interface DetailRow extends SummaryRow {
  request_json: string
  result_json: string
  transport_json: string | null
}

type UnknownRecord = Record<string, unknown>

function requireRecord(value: unknown, label: string): UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`)
  }
  return value as UnknownRecord
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be an array.`)
  }
  return value
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${label} must be a non-empty string.`)
  }
  return value.trim()
}

function requireFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number.`)
  }
  return value
}

function normalizeNullableNumber(value: unknown, label: string): number | null {
  if (value == null) return null
  return requireFiniteNumber(value, label)
}

function validateCategoryAmounts(value: unknown, label: string): void {
  const record = requireRecord(value, label)
  requireFiniteNumber(record.raw_material, `${label}.raw_material`)
  requireFiniteNumber(record.fabrication, `${label}.fabrication`)
  requireFiniteNumber(record.surface_treatment, `${label}.surface_treatment`)
}

function validateCalculationLineItems(
  value: unknown,
  label: string,
  includeResultFields: boolean,
): void {
  if (value === undefined) return

  requireArray(value, label).forEach((item, index) => {
    const itemLabel = `${label}[${index}]`
    const record = requireRecord(item, itemLabel)
    if (
      record.category !== 'raw_material' &&
      record.category !== 'fabrication' &&
      record.category !== 'surface_treatment'
    ) {
      throw new TypeError(
        `${itemLabel}.category must be "raw_material", "fabrication", or "surface_treatment".`,
      )
    }
    requireFiniteNumber(record.amount_sgd, `${itemLabel}.amount_sgd`)
    requireNonEmptyString(record.naics_code, `${itemLabel}.naics_code`)

    if (includeResultFields) {
      requireFiniteNumber(record.amount_usd, `${itemLabel}.amount_usd`)
      requireFiniteNumber(record.amount_usd2022, `${itemLabel}.amount_usd2022`)
      requireFiniteNumber(record.factor, `${itemLabel}.factor`)
      requireFiniteNumber(record.emission, `${itemLabel}.emission`)
    }
  })
}

function validateCalculationDetails(value: unknown, label: string): void {
  const record = requireRecord(value, label)
  requireFiniteNumber(record.fx_rate, `${label}.fx_rate`)
  requireFiniteNumber(record.inflation_index, `${label}.inflation_index`)
  requireFiniteNumber(record.year, `${label}.year`)
  validateCategoryAmounts(record.sgd_amounts, `${label}.sgd_amounts`)
  validateCategoryAmounts(record.usd_amounts, `${label}.usd_amounts`)
  validateCategoryAmounts(record.usd2022_amounts, `${label}.usd2022_amounts`)
  validateCategoryAmounts(record.factors, `${label}.factors`)
  validateCalculationLineItems(record.line_items, `${label}.line_items`, true)
}

function validateUseeioRequest(value: unknown, label: string): CalculateRequest {
  const record = requireRecord(value, label)
  requireNonEmptyString(record.invoice_id, `${label}.invoice_id`)
  requireFiniteNumber(record.year, `${label}.year`)
  requireFiniteNumber(record.total_amount_sgd, `${label}.total_amount_sgd`)
  validateCategoryAmounts(record.sgd_amounts, `${label}.sgd_amounts`)

  const allocation = requireRecord(record.allocation, `${label}.allocation`)
  requireFiniteNumber(allocation.raw_material_pct, `${label}.allocation.raw_material_pct`)
  requireFiniteNumber(allocation.fabrication_pct, `${label}.allocation.fabrication_pct`)
  requireFiniteNumber(
    allocation.surface_treatment_pct,
    `${label}.allocation.surface_treatment_pct`,
  )

  const naics = requireRecord(record.naics, `${label}.naics`)
  requireNonEmptyString(naics.raw_material, `${label}.naics.raw_material`)
  requireNonEmptyString(naics.fabrication, `${label}.naics.fabrication`)
  requireNonEmptyString(naics.surface_treatment, `${label}.naics.surface_treatment`)
  validateCalculationLineItems(record.line_items, `${label}.line_items`, false)

  return record as unknown as CalculateRequest
}

function validateUseeioResult(value: unknown, label: string): CalculateResponse {
  const record = requireRecord(value, label)
  requireNonEmptyString(record.invoice_id, `${label}.invoice_id`)
  validateCalculationDetails(record.calculation, `${label}.calculation`)

  const costs = requireRecord(record.costs, `${label}.costs`)
  requireFiniteNumber(costs.raw_material_usd2022, `${label}.costs.raw_material_usd2022`)
  requireFiniteNumber(costs.fabrication_usd2022, `${label}.costs.fabrication_usd2022`)
  requireFiniteNumber(
    costs.surface_treatment_usd2022,
    `${label}.costs.surface_treatment_usd2022`,
  )

  const emissions = requireRecord(record.emissions, `${label}.emissions`)
  requireFiniteNumber(emissions.raw_material, `${label}.emissions.raw_material`)
  requireFiniteNumber(emissions.fabrication, `${label}.emissions.fabrication`)
  requireFiniteNumber(
    emissions.surface_treatment,
    `${label}.emissions.surface_treatment`,
  )
  requireFiniteNumber(emissions.total, `${label}.emissions.total`)

  return record as unknown as CalculateResponse
}

function validateMethod2Request(value: unknown, label: string): Method2CalculateRequest {
  const record = requireRecord(value, label)
  requireNonEmptyString(record.part_id, `${label}.part_id`)
  requireFiniteNumber(record.year, `${label}.year`)
  requireFiniteNumber(record.raw_material_sgd, `${label}.raw_material_sgd`)
  requireFiniteNumber(record.surface_treatment_sgd, `${label}.surface_treatment_sgd`)

  const naics = requireRecord(record.naics, `${label}.naics`)
  requireNonEmptyString(naics.raw_material, `${label}.naics.raw_material`)
  requireNonEmptyString(naics.surface_treatment, `${label}.naics.surface_treatment`)
  if (naics.fabrication !== undefined) {
    requireNonEmptyString(naics.fabrication, `${label}.naics.fabrication`)
  }

  requireFiniteNumber(record.transport_emissions_kg, `${label}.transport_emissions_kg`)
  if (record.transport_source !== undefined) {
    requireNonEmptyString(record.transport_source, `${label}.transport_source`)
  }

  requireArray(record.machining_entries, `${label}.machining_entries`).forEach(
    (entry, index) => {
      const entryLabel = `${label}.machining_entries[${index}]`
      const machiningEntry = requireRecord(entry, entryLabel)
      requireNonEmptyString(machiningEntry.machine_type, `${entryLabel}.machine_type`)
      requireNonEmptyString(machiningEntry.duty_level, `${entryLabel}.duty_level`)
      requireFiniteNumber(machiningEntry.operating_hours, `${entryLabel}.operating_hours`)
    },
  )

  return record as unknown as Method2CalculateRequest
}

function validateMethod2Result(value: unknown, label: string): Method2CalculateResponse {
  const record = requireRecord(value, label)
  requireNonEmptyString(record.part_id, `${label}.part_id`)
  validateCalculationDetails(record.calculation, `${label}.calculation`)

  const costs = requireRecord(record.costs, `${label}.costs`)
  requireFiniteNumber(costs.raw_material_usd2022, `${label}.costs.raw_material_usd2022`)
  requireFiniteNumber(
    costs.surface_treatment_usd2022,
    `${label}.costs.surface_treatment_usd2022`,
  )

  const machining = requireRecord(record.machining, `${label}.machining`)
  requireArray(machining.entries, `${label}.machining.entries`).forEach((entry, index) => {
    const entryLabel = `${label}.machining.entries[${index}]`
    const machiningEntry = requireRecord(entry, entryLabel)
    requireNonEmptyString(machiningEntry.machineType, `${entryLabel}.machineType`)
    requireNonEmptyString(machiningEntry.dutyLevel, `${entryLabel}.dutyLevel`)
    requireFiniteNumber(machiningEntry.avgKW, `${entryLabel}.avgKW`)
    requireFiniteNumber(machiningEntry.hourlyEmission, `${entryLabel}.hourlyEmission`)
    requireFiniteNumber(machiningEntry.operatingHours, `${entryLabel}.operatingHours`)
    requireFiniteNumber(machiningEntry.emissions, `${entryLabel}.emissions`)
  })
  requireFiniteNumber(machining.total, `${label}.machining.total`)

  const transport = requireRecord(record.transport, `${label}.transport`)
  requireFiniteNumber(transport.emissions, `${label}.transport.emissions`)
  requireNonEmptyString(transport.source, `${label}.transport.source`)

  const emissions = requireRecord(record.emissions, `${label}.emissions`)
  requireFiniteNumber(emissions.raw_material, `${label}.emissions.raw_material`)
  requireFiniteNumber(emissions.transportation, `${label}.emissions.transportation`)
  requireFiniteNumber(
    emissions.surface_treatment,
    `${label}.emissions.surface_treatment`,
  )
  requireFiniteNumber(emissions.machining, `${label}.emissions.machining`)
  requireFiniteNumber(emissions.total, `${label}.emissions.total`)

  const notes = requireRecord(record.notes, `${label}.notes`)
  Object.entries(notes).forEach(([key, note]) => {
    if (typeof note !== 'string') {
      throw new TypeError(`${label}.notes.${key} must be a string.`)
    }
  })

  return record as unknown as Method2CalculateResponse
}

function serializeSnapshot(value: unknown, label: string): string {
  let serialized: string | undefined
  try {
    serialized = JSON.stringify(value)
  } catch (error) {
    throw new TypeError(
      `${label} must be JSON serializable: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  if (serialized === undefined) {
    throw new TypeError(`${label} must be JSON serializable.`)
  }
  return serialized
}

function normalizeTransport(transport: unknown): CalculationHistoryTransport | null {
  if (transport == null) return null

  const record = requireRecord(transport, 'transport')
  const source = requireNonEmptyString(record.source, 'transport.source')

  // Reconstruct the snapshot field by field so large/raw provider responses never
  // enter the history database, even if a caller passes an object containing `raw`.
  return {
    origin: requireNonEmptyString(record.origin, 'transport.origin'),
    port_of_loading: requireNonEmptyString(
      record.port_of_loading,
      'transport.port_of_loading',
    ),
    port_of_discharge: requireNonEmptyString(
      record.port_of_discharge,
      'transport.port_of_discharge',
    ),
    weight_kg: requireFiniteNumber(record.weight_kg, 'transport.weight_kg'),
    chosen_mode: requireNonEmptyString(record.chosen_mode, 'transport.chosen_mode'),
    chosen_emissions_kg: normalizeNullableNumber(
      record.chosen_emissions_kg,
      'transport.chosen_emissions_kg',
    ),
    distance_km: normalizeNullableNumber(record.distance_km, 'transport.distance_km'),
    energy_mj: normalizeNullableNumber(record.energy_mj, 'transport.energy_mj'),
    source,
    estimated:
      typeof record.estimated === 'boolean'
        ? record.estimated
        : source.toLowerCase().includes('estimate'),
  }
}

function normalizeListOptions(options: CalculationHistoryListOptions = {}) {
  const requestedLimit = options.limit ?? DEFAULT_LIST_LIMIT
  const requestedOffset = options.offset ?? 0

  if (!Number.isInteger(requestedLimit) || requestedLimit < 1) {
    throw new TypeError('History list limit must be a positive integer.')
  }
  if (!Number.isInteger(requestedOffset) || requestedOffset < 0) {
    throw new TypeError('History list offset must be a non-negative integer.')
  }
  if (options.method !== undefined && options.method !== 'useeio' && options.method !== 'method2') {
    throw new TypeError('History method must be either "useeio" or "method2".')
  }

  return {
    limit: Math.min(requestedLimit, MAX_LIST_LIMIT),
    offset: requestedOffset,
    method: options.method,
  }
}

function rowToSummary(row: SummaryRow): CalculationHistorySummary {
  if (row.method !== 'useeio' && row.method !== 'method2') {
    throw new Error(`Unknown calculation history method: ${row.method}`)
  }

  return {
    id: requireNonEmptyString(row.id, 'Stored history id'),
    method: row.method,
    documentId: requireNonEmptyString(row.document_id, 'Stored history document id'),
    year: requireFiniteNumber(row.year, 'Stored history year'),
    totalEmissionsKgCo2e: requireFiniteNumber(
      row.total_emissions_kg_co2e,
      'Stored history total emissions',
    ),
    totalAmountSgd: requireFiniteNumber(
      row.total_amount_sgd,
      'Stored history total amount',
    ),
    createdAt: requireNonEmptyString(row.created_at, 'Stored history creation time'),
  }
}

function parseJsonSnapshot<T>(json: string, label: string): T {
  try {
    return JSON.parse(json) as T
  } catch (error) {
    throw new Error(
      `Stored ${label} snapshot is invalid: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

function rowToDetail(row: DetailRow): CalculationHistoryDetail {
  const summary = rowToSummary(row)
  const transport = row.transport_json
    ? normalizeTransport(parseJsonSnapshot<unknown>(row.transport_json, 'transport'))
    : null

  if (summary.method === 'useeio') {
    return {
      ...summary,
      method: 'useeio',
      request: validateUseeioRequest(
        parseJsonSnapshot<unknown>(row.request_json, 'request'),
        'Stored USEEIO request',
      ),
      result: validateUseeioResult(
        parseJsonSnapshot<unknown>(row.result_json, 'result'),
        'Stored USEEIO result',
      ),
      transport,
    }
  }

  return {
    ...summary,
    method: 'method2',
    request: validateMethod2Request(
      parseJsonSnapshot<unknown>(row.request_json, 'request'),
      'Stored Method 2 request',
    ),
    result: validateMethod2Result(
      parseJsonSnapshot<unknown>(row.result_json, 'result'),
      'Stored Method 2 result',
    ),
    transport,
  }
}

function getSummaryValues(input: SaveCalculationHistoryInput): {
  documentId: string
  year: number
  totalEmissionsKgCo2e: number
  totalAmountSgd: number
} {
  if (input.method === 'useeio') {
    const transportEmissions = input.transport?.chosen_emissions_kg ?? 0
    return {
      documentId: requireNonEmptyString(input.result.invoice_id, 'result.invoice_id'),
      year: requireFiniteNumber(input.result.calculation.year, 'result.calculation.year'),
      totalEmissionsKgCo2e:
        requireFiniteNumber(input.result.emissions.total, 'result.emissions.total') +
        requireFiniteNumber(transportEmissions, 'transport.chosen_emissions_kg'),
      totalAmountSgd: requireFiniteNumber(
        input.request.total_amount_sgd,
        'request.total_amount_sgd',
      ),
    }
  }

  return {
    documentId: requireNonEmptyString(input.result.part_id, 'result.part_id'),
    year: requireFiniteNumber(input.result.calculation.year, 'result.calculation.year'),
    totalEmissionsKgCo2e: requireFiniteNumber(
      input.result.emissions.total,
      'result.emissions.total',
    ),
    totalAmountSgd:
      requireFiniteNumber(input.request.raw_material_sgd, 'request.raw_material_sgd') +
      requireFiniteNumber(input.request.surface_treatment_sgd, 'request.surface_treatment_sgd'),
  }
}

export class CalculationHistoryStore {
  readonly #database: DatabaseSync
  readonly #createId: () => string
  readonly #now: () => Date

  constructor(databasePath: string, options: CalculationHistoryStoreOptions = {}) {
    this.#database = new DatabaseSync(databasePath)
    this.#createId = options.createId ?? randomUUID
    this.#now = options.now ?? (() => new Date())

    this.#database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA busy_timeout = 5000;

      CREATE TABLE IF NOT EXISTS calculation_history (
        id TEXT PRIMARY KEY,
        method TEXT NOT NULL CHECK (method IN ('useeio', 'method2')),
        document_id TEXT NOT NULL,
        year INTEGER NOT NULL,
        total_emissions_kg_co2e REAL NOT NULL,
        total_amount_sgd REAL NOT NULL,
        request_json TEXT NOT NULL,
        result_json TEXT NOT NULL,
        transport_json TEXT,
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE INDEX IF NOT EXISTS calculation_history_created_at_idx
        ON calculation_history (created_at DESC);

      CREATE INDEX IF NOT EXISTS calculation_history_method_created_at_idx
        ON calculation_history (method, created_at DESC);
    `)
  }

  save(input: SaveCalculationHistoryInput): CalculationHistoryDetail {
    if (!input || (input.method !== 'useeio' && input.method !== 'method2')) {
      throw new TypeError('Calculation history input must specify a supported method.')
    }

    const transport = normalizeTransport(input.transport)
    const requestJson = serializeSnapshot(input.request, 'request')
    const resultJson = serializeSnapshot(input.result, 'result')
    const validatedInput: SaveCalculationHistoryInput =
      input.method === 'useeio'
        ? {
            method: 'useeio',
            request: validateUseeioRequest(
              parseJsonSnapshot<unknown>(requestJson, 'request'),
              'USEEIO request',
            ),
            result: validateUseeioResult(
              parseJsonSnapshot<unknown>(resultJson, 'result'),
              'USEEIO result',
            ),
            transport,
          }
        : {
            method: 'method2',
            request: validateMethod2Request(
              parseJsonSnapshot<unknown>(requestJson, 'request'),
              'Method 2 request',
            ),
            result: validateMethod2Result(
              parseJsonSnapshot<unknown>(resultJson, 'result'),
              'Method 2 result',
            ),
            transport,
          }
    const summaryValues = getSummaryValues(validatedInput)
    const id = requireNonEmptyString(this.#createId(), 'history id')
    const createdAt = this.#now().toISOString()
    const transportJson = transport ? serializeSnapshot(transport, 'transport') : null

    this.#database
      .prepare(`
        INSERT INTO calculation_history (
          id,
          method,
          document_id,
          year,
          total_emissions_kg_co2e,
          total_amount_sgd,
          request_json,
          result_json,
          transport_json,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        validatedInput.method,
        summaryValues.documentId,
        summaryValues.year,
        summaryValues.totalEmissionsKgCo2e,
        summaryValues.totalAmountSgd,
        requestJson,
        resultJson,
        transportJson,
        createdAt,
      )

    const saved = this.get(id)
    if (!saved) {
      throw new Error('The calculation history record could not be read after it was saved.')
    }
    return saved
  }

  list(options: CalculationHistoryListOptions = {}): CalculationHistorySummary[] {
    const { limit, offset, method } = normalizeListOptions(options)
    const rows = method
      ? this.#database
          .prepare(`
            SELECT
              id,
              method,
              document_id,
              year,
              total_emissions_kg_co2e,
              total_amount_sgd,
              created_at
            FROM calculation_history
            WHERE method = ?
            ORDER BY created_at DESC, rowid DESC
            LIMIT ? OFFSET ?
          `)
          .all(method, limit, offset)
      : this.#database
          .prepare(`
            SELECT
              id,
              method,
              document_id,
              year,
              total_emissions_kg_co2e,
              total_amount_sgd,
              created_at
            FROM calculation_history
            ORDER BY created_at DESC, rowid DESC
            LIMIT ? OFFSET ?
          `)
          .all(limit, offset)

    return (rows as unknown as SummaryRow[]).map(rowToSummary)
  }

  get(id: string): CalculationHistoryDetail | null {
    const normalizedId = requireNonEmptyString(id, 'History id')
    const row = this.#database
      .prepare(`
        SELECT
          id,
          method,
          document_id,
          year,
          total_emissions_kg_co2e,
          total_amount_sgd,
          request_json,
          result_json,
          transport_json,
          created_at
        FROM calculation_history
        WHERE id = ?
      `)
      .get(normalizedId) as unknown as DetailRow | undefined

    return row ? rowToDetail(row) : null
  }

  close(): void {
    this.#database.close()
  }
}

export type { CalculationHistoryStoreOptions, CalculationHistoryMethod }
