import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildBatchRequest,
  confirmRows,
  detectMappings,
  editMappedRow,
  enrichRows,
  extractSheetData,
  mergeCalculationResults,
  type MappedRow,
  type NaicsMappingApi,
} from './naics-mapping-workflow.ts'

const row = (overrides: Partial<MappedRow> = {}): MappedRow => ({
  supplier: 'Supplier',
  material_name: 'ALUMINIUM',
  weight: '2',
  qty: '1',
  total_amount_sgd: '100',
  naics_code: '331315',
  description: 'Aluminium production',
  kgco2e: '2.5',
  category: 'Manufacturing',
  source: 'phase2',
  confidence_level: 'partial',
  ...overrides,
})

const api = (overrides: Partial<NaicsMappingApi> = {}): NaicsMappingApi => ({
  calculate: async () => [],
  confirm: async (materialName, naicsCode) => ({
    material_token: materialName,
    mapping: { code: naicsCode, description: 'Confirmed' },
  }),
  factor: async (code) => ({ code, description: 'Factor' }),
  search: async (materialName) => ({ tier: 2, material_token: materialName, matches: [] }),
  suggest: async () => null,
  ...overrides,
})

test('extracts the header row and detects column mappings', () => {
  const data = extractSheetData(
    [['Report'], ['Supplier', 'Material Name', 'Total Amount SGD'], ['A', 'Aluminium plate', 100]],
    { fileName: 'input.xlsx', allSheets: ['Sheet1'], selectedSheet: 'Sheet1' },
  )
  assert.ok(data)
  assert.deepEqual(data.headers, ['Supplier', 'Material Name', 'Total Amount SGD'])
  const mappings = detectMappings(data.headers)
  assert.equal(mappings.find(({ field }) => field === 'material_name')?.excelColumn, 'Material Name')
})

test('preserves every imported row while enriching duplicate materials once', async () => {
  let searches = 0
  const data = {
    headers: ['Material Name', 'Supplier', 'Total Amount SGD'],
    rows: [
      ['Aluminium plate 2MM', 'A', '10'],
      ['Aluminium plate 3MM', 'B', '20'],
    ],
    fileName: 'input.xlsx',
  }
  const mappings = detectMappings(data.headers)
  const rows = await enrichRows({
    data,
    mappings,
    api: api({
      search: async (materialName) => {
        searches += 1
        return {
          tier: 1,
          material_token: materialName,
          matches: [{ code: '331315', description: 'Aluminium', confidence: 'exact' }],
        }
      },
    }),
  })

  assert.equal(searches, 1)
  assert.equal(rows.length, 2)
  assert.deepEqual(rows.map(({ supplier }) => supplier), ['A', 'B'])
})

test('isolates enrichment failures to the affected material', async () => {
  const data = {
    headers: ['Material Name', 'Total Amount SGD'],
    rows: [['Aluminium', '10'], ['Steel', '20']],
    fileName: 'input.xlsx',
  }
  const rows = await enrichRows({
    data,
    mappings: detectMappings(data.headers),
    api: api({
      search: async (materialName) => {
        if (materialName === 'STEEL') throw new Error('search unavailable')
        return {
          tier: 1,
          material_token: materialName,
          matches: [{ code: '331315', description: 'Aluminium' }],
        }
      },
      suggest: async (materialName) => materialName === 'STEEL'
        ? { code: '331110', description: 'Steel suggestion' }
        : null,
    }),
  })

  assert.deepEqual(rows.map(({ naics_code, source }) => ({ naics_code, source })), [
    { naics_code: '331315', source: 'phase1' },
    { naics_code: '331110', source: 'phase3' },
  ])
})

test('reports partial confirmation without marking failed rows confirmed', async () => {
  const result = await confirmRows(
    [row(), row({ material_name: 'STEEL', naics_code: '331110' })],
    api({
      confirm: async (materialName, naicsCode) => {
        if (materialName === 'STEEL') throw new Error('database unavailable')
        return { material_token: materialName, mapping: { code: naicsCode, description: 'Confirmed' } }
      },
    }),
  )

  assert.equal(result.rows[0].confidence_level, 'exact')
  assert.equal(result.rows[1].confidence_level, 'partial')
  assert.deepEqual(result.failures.map(({ materialName }) => materialName), ['STEEL'])
})

test('validates batch inputs and response cardinality', () => {
  assert.throws(() => buildBatchRequest([row({ total_amount_sgd: 'not-a-number' })]), /valid non-negative/)
  const request = buildBatchRequest([row()])
  assert.equal(request[0].mapped_naics, '331315')
  assert.throws(() => mergeCalculationResults([row()], []), /returned 0 results for 1 rows/)
})

test('row edits are immutable so the workflow can invalidate downstream snapshots', () => {
  const original = [row()]
  const edited = editMappedRow(original, 0, 'naics_code', '332710')
  assert.equal(original[0].naics_code, '331315')
  assert.equal(edited[0].naics_code, '332710')
  assert.equal(edited[0].source, 'phase3')
})
