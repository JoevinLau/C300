import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createBackendHandlers } from '../main/backend-ipc.ts'
import { CalculationHistoryStore } from '../main/calculation-history-store.ts'
import {
  buildBatchRequest,
  confirmRows,
  detectMappings,
  enrichRows,
  extractSheetData,
  mergeCalculationResults,
} from '../renderer/features/naics-mapping/naics-mapping-workflow.ts'

const calculationDetails = {
  fx_rate: 0.74,
  inflation_index: 106.5,
  year: 2024,
  sgd_amounts: {
    raw_material: 1_000,
    fabrication: 500,
    surface_treatment: 250,
  },
  usd_amounts: {
    raw_material: 740,
    fabrication: 370,
    surface_treatment: 185,
  },
  usd2022_amounts: {
    raw_material: 694.84,
    fabrication: 347.42,
    surface_treatment: 173.71,
  },
  factors: {
    raw_material: 0.85,
    fabrication: 0.45,
    surface_treatment: 1.2,
  },
}

const useeioRequest = {
  invoice_id: 'INV-WORKFLOW',
  year: 2024,
  total_amount_sgd: 1_750,
  sgd_amounts: calculationDetails.sgd_amounts,
  allocation: {
    raw_material_pct: 57.14,
    fabrication_pct: 28.57,
    surface_treatment_pct: 14.29,
  },
  naics: {
    raw_material: '331110',
    fabrication: '332710',
    surface_treatment: '332812',
  },
}

const useeioResult = {
  invoice_id: 'INV-WORKFLOW',
  calculation: calculationDetails,
  costs: {
    raw_material_usd2022: 694.84,
    fabrication_usd2022: 347.42,
    surface_treatment_usd2022: 173.71,
  },
  emissions: {
    raw_material: 590.61,
    fabrication: 156.34,
    surface_treatment: 208.45,
    total: 955.4,
  },
}

const transportRequest = {
  port_of_loading: 'Port of Shanghai',
  port_of_discharge: 'Port of Singapore',
  weight_kg: 500,
  transport_mode: 'sea' as const,
  origin_country: 'China',
  allow_estimate: true,
}

const transportResult = {
  transport: {
    origin: 'China',
    port_of_loading: 'Port of Shanghai',
    port_of_discharge: 'Port of Singapore',
    weight_kg: 500,
    chosen_mode: 'sea',
    chosen_emissions_kg: 44.6,
    distance_km: 3_800,
    energy_mj: 730,
    source: 'EcoTransit World',
    estimated: false,
    raw: { provider_request_id: 'provider-secret' },
  },
}

const method2Request = {
  part_id: 'PART-WORKFLOW',
  year: 2024,
  raw_material_sgd: 900,
  surface_treatment_sgd: 100,
  naics: {
    raw_material: '331110',
    surface_treatment: '332812',
  },
  transport_emissions_kg: 25,
  transport_source: 'EcoTransit World',
  machining_entries: [
    {
      machine_type: 'CNC Milling',
      duty_level: 'Light',
      operating_hours: 3,
    },
  ],
}

const machine = {
  machineType: 'CNC Milling',
  dutyLevel: 'Light',
  avgKW: 4,
  hourlyEmission: 1.5,
  countryCode: 'SG',
  gridFactor: 0.375,
  gridYear: 2024,
  gridSource: 'EMA',
  dataSource: 'machine_reference',
}

const method2Result = {
  part_id: 'PART-WORKFLOW',
  calculation: calculationDetails,
  costs: {
    raw_material_usd2022: 625.36,
    surface_treatment_usd2022: 69.48,
  },
  machining: {
    entries: [
      {
        ...machine,
        operatingHours: 3,
        emissions: 4.5,
      },
    ],
    total: 4.5,
  },
  transport: {
    emissions: 25,
    source: 'EcoTransit World',
  },
  emissions: {
    raw_material: 531.56,
    transportation: 25,
    surface_treatment: 83.38,
    machining: 4.5,
    total: 644.44,
  },
  notes: {
    machining: 'Authoritative machine and grid factors were used.',
  },
}

function createHistoryStore(t: test.TestContext, id: string) {
  const directory = mkdtempSync(path.join(tmpdir(), 'c300-workflow-'))
  const store = new CalculationHistoryStore(path.join(directory, 'history.sqlite3'), {
    createId: () => id,
    now: () => new Date('2026-07-20T01:00:00.000Z'),
  })
  t.after(() => {
    store.close()
    rmSync(directory, { force: true, recursive: true })
  })
  return store
}

test('completes the USEEIO, transport, and history workflow', async (t) => {
  const backendRequests = []
  const handlers = createBackendHandlers({
    calculate: async (payload) => {
      assert.deepEqual(payload, useeioRequest)
      return useeioResult
    },
    request: async (request) => {
      backendRequests.push(request)
      if (request.path === '/ecotransit') {
        assert.deepEqual(request, {
          path: '/ecotransit',
          method: 'POST',
          json: transportRequest,
        })
        return transportResult as never
      }
      throw new Error(`Unexpected backend request: ${request.path}`)
    },
  })

  const result = await handlers.calculateUseeio(useeioRequest)
  const transport = await handlers.calculateTransport(transportRequest)
  const store = createHistoryStore(t, 'history-useeio-workflow')
  const saved = store.save({
    method: 'useeio',
    request: useeioRequest,
    result,
    transport: transport.transport,
  })

  assert.equal(saved.id, 'history-useeio-workflow')
  assert.equal(saved.totalEmissionsKgCo2e, 1_000)
  assert.equal(saved.transport?.chosen_emissions_kg, 44.6)
  assert.equal(Object.hasOwn(saved.transport ?? {}, 'raw'), false)
  assert.deepEqual(backendRequests.map(({ path }) => path), ['/ecotransit'])
})

test('completes spreadsheet import, NAICS enrichment, confirmation, and batch calculation', async () => {
  const requests = []
  const handlers = createBackendHandlers({
    calculate: async () => useeioResult,
    request: async (request) => {
      requests.push(request)
      if (request.path === '/api/naics/search?q=ALUMINIUM') {
        return {
          tier: 2,
          material_token: 'ALUMINIUM',
          matches: [{
            code: '331315',
            description: 'Aluminium production',
            kgco2e_per_usd: 2.5,
            category: 'Manufacturing',
            confidence: 'partial',
          }],
        } as never
      }
      if (request.path === '/api/naics/confirm') {
        assert.deepEqual(request.json, {
          material_token: 'ALUMINIUM',
          mapped_naics: '331315',
          user_id: 'default',
        })
        return {
          material_token: 'ALUMINIUM',
          mapping: {
            code: '331315',
            description: 'Aluminium production',
            kgco2e_per_usd: 2.5,
            category: 'Manufacturing',
          },
        } as never
      }
      if (request.path === '/api/calculate/batch') {
        assert.deepEqual(request.json, [{
          supplier: 'Supplier A',
          material: 'ALUMINIUM',
          weight: 2,
          qty: 4,
          total_amount_sgd: 100,
          mapped_naics: '331315',
        }])
        return [{
          ...request.json[0],
          mapped_naics: '331315',
          naics_description: 'Aluminium production',
          kgco2e_per_usd: 2.5,
          total_kgco2e: 185,
          data_source: 'USEEIO v2.0',
        }] as never
      }
      throw new Error(`Unexpected backend request: ${request.path}`)
    },
  })

  const data = extractSheetData(
    [
      ['Procurement export'],
      ['Supplier', 'Material Name', 'Weight', 'Qty', 'Total Amount SGD'],
      ['Supplier A', 'Aluminium plate 2MM', 2, 4, 100],
    ],
    { fileName: 'procurement.xlsx', selectedSheet: 'Sheet1' },
  )
  assert.ok(data)
  const mappings = detectMappings(data.headers)
  const mappingApi = {
    calculate: (rows) => handlers.calculateBatch(rows),
    confirm: (materialName, naicsCode) => handlers.confirmNaics(materialName, naicsCode),
    factor: (code) => handlers.getNaicsFactor(code),
    search: (materialName) => handlers.searchNaics(materialName),
    suggest: (materialName) => handlers.suggestNaics(materialName),
  }

  const enriched = await enrichRows({ data, mappings, api: mappingApi })
  const confirmed = await confirmRows(enriched, mappingApi)
  assert.deepEqual(confirmed.failures, [])
  const batchRequest = buildBatchRequest(confirmed.rows)
  const results = await mappingApi.calculate(batchRequest)
  const displayRows = mergeCalculationResults(confirmed.rows, results)

  assert.equal(displayRows[0].confidence_level, 'exact')
  assert.equal(displayRows[0].total_kgco2e, 185)
  assert.deepEqual(requests.map(({ path }) => path), [
    '/api/naics/search?q=ALUMINIUM',
    '/api/naics/confirm',
    '/api/calculate/batch',
  ])
})

test('completes the Method 2 machine, calculation, RAG, and history workflow', async (t) => {
  const requests = []
  const handlers = createBackendHandlers({
    calculate: async () => useeioResult,
    request: async (request) => {
      requests.push(request)
      if (request.path === '/method2/machines') return { machines: [machine] } as never
      if (request.path === '/method2/calculate') {
        assert.deepEqual(request.json, method2Request)
        return method2Result as never
      }
      if (request.path === '/rag/documents?workspace_id=workspace-method2') {
        return [{
          document_id: 'document-1',
          filename: 'process.pdf',
          file_type: 'application/pdf',
          content_hash: 'hash-1',
          chunk_count: 3,
          status: 'ready',
          error: null,
        }] as never
      }
      if (request.path === '/method2-chat') {
        assert.equal(request.json.workspace_id, 'workspace-method2')
        assert.equal(request.json.calculation_context.part_id, 'PART-WORKFLOW')
        return {
          reply: 'The machining stage contributes 4.5 kgCO2e.',
          citations: [{
            document_id: 'document-1',
            filename: 'process.pdf',
            location: 'page 2',
            excerpt: 'CNC Milling, Light duty',
            score: 0.92,
          }],
          grounded: true,
        } as never
      }
      throw new Error(`Unexpected backend request: ${request.path}`)
    },
  })

  const library = await handlers.listMethod2Machines()
  assert.equal(library.machines[0].machineType, method2Request.machining_entries[0].machine_type)
  const result = await handlers.calculateMethod2(method2Request)
  const documents = await handlers.listDocuments('workspace-method2')
  const chat = await handlers.sendMethod2Chat({
    workspace_id: 'workspace-method2',
    message: 'What drives machining emissions?',
    calculation_context: result,
    messages: [],
  })
  const store = createHistoryStore(t, 'history-method2-workflow')
  const saved = store.save({
    method: 'method2',
    request: method2Request,
    result,
  })

  assert.equal(documents[0].status, 'ready')
  assert.equal(chat.grounded, true)
  assert.equal(chat.citations[0].document_id, documents[0].document_id)
  assert.equal(saved.totalEmissionsKgCo2e, 644.44)
  assert.deepEqual(requests.map(({ path }) => path), [
    '/method2/machines',
    '/method2/calculate',
    '/rag/documents?workspace_id=workspace-method2',
    '/method2-chat',
  ])
})
