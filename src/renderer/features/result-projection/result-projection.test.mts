import assert from 'node:assert/strict'
import test from 'node:test'

import type {
  CalculateResponse,
  Method2CalculateRequest,
  Method2CalculateResponse,
} from '../../../shared/calculator-types.ts'
import {
  createMethod2ResultProjection,
  createUseeioResultProjection,
} from './result-projection.ts'

const useeioResult: CalculateResponse = {
  invoice_id: 'INV-1',
  calculation: {
    fx_rate: 0.75,
    inflation_index: 80,
    year: 2020,
    sgd_amounts: { raw_material: 50, fabrication: 30, surface_treatment: 20 },
    usd_amounts: { raw_material: 37.5, fabrication: 22.5, surface_treatment: 15 },
    usd2022_amounts: { raw_material: 46.875, fabrication: 28.125, surface_treatment: 18.75 },
    factors: { raw_material: 2, fabrication: 3, surface_treatment: 4 },
    line_items: [
      {
        category: 'raw_material',
        amount_sgd: 50,
        amount_usd: 37.5,
        amount_usd2022: 46.875,
        naics_code: '331110',
        factor: 2,
        emission: 93.75,
      },
    ],
  },
  costs: {
    raw_material_usd2022: 46.875,
    fabrication_usd2022: 28.125,
    surface_treatment_usd2022: 18.75,
  },
  emissions: { raw_material: 93.75, fabrication: 84.375, surface_treatment: 75, total: 253.125 },
}

test('projects USEEIO totals, formulas, categories, and reconciliation once', () => {
  const projection = createUseeioResultProjection({
    result: useeioResult,
    totalAmountSgd: 100,
    transport: { chosen_emissions_kg: 12.5 },
    fallbackNaics: { fabrication: '332710', surface_treatment: '332812' },
  })

  assert.equal(projection.totals.usd2022, 93.75)
  assert.equal(projection.totals.reportedEmissions, 265.625)
  assert.equal(projection.totals.intensityKgPerUsd2022, 2.7)
  assert.equal(projection.inflationBaseIndex, 100)
  assert.equal(projection.reconciliation.totalsReconcile, true)
  assert.deepEqual(
    projection.categories.map(({ key, naicsCodes }) => ({ key, naicsCodes })),
    [
      { key: 'raw_material', naicsCodes: ['331110'] },
      { key: 'fabrication', naicsCodes: ['332710'] },
      { key: 'surface_treatment', naicsCodes: ['332812'] },
    ],
  )
})

test('distinguishes missing transport emissions from a real zero', () => {
  const missing = createUseeioResultProjection({ result: useeioResult, totalAmountSgd: 100 })
  const zero = createUseeioResultProjection({
    result: useeioResult,
    totalAmountSgd: 100,
    transport: { chosen_emissions_kg: 0 },
  })

  assert.equal(missing.totals.transportEmissions, null)
  assert.equal(zero.totals.transportEmissions, 0)
})

test('projects Method 2 screen and history categories from the same result', () => {
  const request = {
    part_id: 'PART-1',
    year: 2024,
    raw_material_sgd: 10,
    surface_treatment_sgd: 20,
    naics: { raw_material: '331110', surface_treatment: '332812' },
    transport_emissions_kg: 3,
    machining_entries: [],
  } satisfies Method2CalculateRequest
  const result = {
    part_id: 'PART-1',
    calculation: {
      ...useeioResult.calculation,
      sgd_amounts: { raw_material: 10, fabrication: 0, surface_treatment: 20 },
    },
    costs: { raw_material_usd2022: 8, surface_treatment_usd2022: 16 },
    machining: { entries: [], total: 4 },
    transport: { emissions: 3, source: 'EcoTransit' },
    emissions: {
      raw_material: 10,
      transportation: 3,
      machining: 4,
      surface_treatment: 5,
      total: 22,
    },
    notes: {},
  } satisfies Method2CalculateResponse

  const projection = createMethod2ResultProjection({ request, result })

  assert.equal(projection.documentId, 'PART-1')
  assert.equal(projection.totals.componentEmissions, 22)
  assert.equal(projection.reconciliation.totalsReconcile, true)
  assert.deepEqual(
    projection.categories.map(({ key, emissions }) => ({ key, emissions })),
    [
      { key: 'raw_material', emissions: 10 },
      { key: 'transportation', emissions: 3 },
      { key: 'machining', emissions: 4 },
      { key: 'surface_treatment', emissions: 5 },
    ],
  )
})
