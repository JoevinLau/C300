import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'

import { CalculationHistoryStore } from './calculation-history-store.ts'

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

function createUseeioInput() {
  return {
    method: 'useeio',
    request: {
      invoice_id: 'INV-001',
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
    },
    result: {
      invoice_id: 'INV-001',
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
    },
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
      raw: { providerPayload: 'must not be stored' },
    },
  }
}

function createMethod2Input() {
  return {
    method: 'method2',
    request: {
      part_id: 'PART-002',
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
    },
    result: {
      part_id: 'PART-002',
      calculation: calculationDetails,
      costs: {
        raw_material_usd2022: 625.36,
        surface_treatment_usd2022: 69.48,
      },
      machining: {
        entries: [
          {
            machineType: 'CNC Milling',
            dutyLevel: 'Light',
            avgKW: 4,
            hourlyEmission: 1.5,
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
      notes: {},
    },
  }
}

test('persists immutable calculation snapshots and supports method pagination', (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'c300-history-'))
  const databasePath = path.join(directory, 'history.sqlite3')
  const ids = ['history-useeio', 'history-method2']
  const dates = [new Date('2026-07-13T01:00:00.000Z'), new Date('2026-07-13T02:00:00.000Z')]
  let store = new CalculationHistoryStore(databasePath, {
    createId: () => ids.shift(),
    now: () => dates.shift(),
  })

  t.after(() => {
    try {
      store.close()
    } catch {
      // The test closes and reopens the store to prove disk persistence.
    }
    rmSync(directory, { force: true, recursive: true })
  })

  const useeioInput = createUseeioInput()
  const savedUseeio = store.save(useeioInput)
  assert.equal(savedUseeio.totalEmissionsKgCo2e, 1_000)
  assert.equal(savedUseeio.totalAmountSgd, 1_750)
  assert.equal(Object.hasOwn(savedUseeio.transport, 'raw'), false)

  useeioInput.request.invoice_id = 'MUTATED'
  useeioInput.result.emissions.total = 0
  useeioInput.transport.origin = 'MUTATED'

  const savedMethod2 = store.save(createMethod2Input())
  assert.equal(savedMethod2.totalEmissionsKgCo2e, 644.44)
  assert.equal(savedMethod2.totalAmountSgd, 1_000)

  assert.deepEqual(
    store.list().map(({ id }) => id),
    ['history-method2', 'history-useeio'],
  )
  assert.deepEqual(
    store.list({ method: 'useeio', limit: 1, offset: 0 }).map(({ id }) => id),
    ['history-useeio'],
  )
  assert.deepEqual(
    store.list({ limit: 1, offset: 1 }).map(({ id }) => id),
    ['history-useeio'],
  )

  store.close()
  store = new CalculationHistoryStore(databasePath)

  const persisted = store.get('history-useeio')
  assert.equal(persisted?.method, 'useeio')
  assert.equal(persisted?.request.invoice_id, 'INV-001')
  assert.equal(persisted?.result.emissions.total, 955.4)
  assert.equal(persisted?.transport?.origin, 'China')
  assert.equal(store.get('missing-id'), null)
})

test('rejects malformed snapshots when saving and reading history records', (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'c300-history-validation-'))
  const databasePath = path.join(directory, 'history.sqlite3')
  const ids = [
    'useeio-bad-request',
    'useeio-bad-result',
    'method2-bad-request',
    'method2-bad-result',
  ]
  let store = new CalculationHistoryStore(databasePath, {
    createId: () => ids.shift(),
  })

  t.after(() => {
    try {
      store.close()
    } catch {
      // The test closes and reopens the store while corrupting its on-disk snapshots.
    }
    rmSync(directory, { force: true, recursive: true })
  })

  const invalidUseeioRequest = createUseeioInput()
  Reflect.set(invalidUseeioRequest.request, 'year', '2024')
  assert.throws(
    () => store.save(invalidUseeioRequest),
    /USEEIO request\.year must be a finite number/,
  )

  const invalidUseeioResult = createUseeioInput()
  Reflect.set(invalidUseeioResult.result.emissions, 'total', Number.NaN)
  assert.throws(
    () => store.save(invalidUseeioResult),
    /USEEIO result\.emissions\.total must be a finite number/,
  )

  const invalidMethod2Request = createMethod2Input()
  Reflect.deleteProperty(invalidMethod2Request.request.machining_entries[0], 'operating_hours')
  assert.throws(
    () => store.save(invalidMethod2Request),
    /Method 2 request\.machining_entries\[0\]\.operating_hours must be a finite number/,
  )

  const invalidMethod2Result = createMethod2Input()
  Reflect.set(invalidMethod2Result.result.notes, 'warning', 42)
  assert.throws(
    () => store.save(invalidMethod2Result),
    /Method 2 result\.notes\.warning must be a string/,
  )
  assert.equal(store.list().length, 0)

  store.save(createUseeioInput())
  store.save(createUseeioInput())
  store.save(createMethod2Input())
  store.save(createMethod2Input())
  store.close()

  const database = new DatabaseSync(databasePath)
  const corruptSnapshot = database.prepare(`
    UPDATE calculation_history
    SET request_json = ?, result_json = ?
    WHERE id = ?
  `)

  const useeioBadRequest = createUseeioInput()
  Reflect.deleteProperty(useeioBadRequest.request.allocation, 'fabrication_pct')
  corruptSnapshot.run(
    JSON.stringify(useeioBadRequest.request),
    JSON.stringify(useeioBadRequest.result),
    'useeio-bad-request',
  )

  const useeioBadResult = createUseeioInput()
  Reflect.set(useeioBadResult.result.costs, 'surface_treatment_usd2022', 'invalid')
  corruptSnapshot.run(
    JSON.stringify(useeioBadResult.request),
    JSON.stringify(useeioBadResult.result),
    'useeio-bad-result',
  )

  const method2BadRequest = createMethod2Input()
  Reflect.set(method2BadRequest.request.naics, 'raw_material', '')
  corruptSnapshot.run(
    JSON.stringify(method2BadRequest.request),
    JSON.stringify(method2BadRequest.result),
    'method2-bad-request',
  )

  const method2BadResult = createMethod2Input()
  Reflect.deleteProperty(method2BadResult.result.machining.entries[0], 'emissions')
  corruptSnapshot.run(
    JSON.stringify(method2BadResult.request),
    JSON.stringify(method2BadResult.result),
    'method2-bad-result',
  )
  database.close()

  store = new CalculationHistoryStore(databasePath)
  assert.throws(
    () => store.get('useeio-bad-request'),
    /Stored USEEIO request\.allocation\.fabrication_pct must be a finite number/,
  )
  assert.throws(
    () => store.get('useeio-bad-result'),
    /Stored USEEIO result\.costs\.surface_treatment_usd2022 must be a finite number/,
  )
  assert.throws(
    () => store.get('method2-bad-request'),
    /Stored Method 2 request\.naics\.raw_material must be a non-empty string/,
  )
  assert.throws(
    () => store.get('method2-bad-result'),
    /Stored Method 2 result\.machining\.entries\[0\]\.emissions must be a finite number/,
  )
})
