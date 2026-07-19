import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyAllocationPreset,
  createRequestGate,
} from './calculation-workspace.ts'

const categories = [
  {
    id: 'raw',
    amountKey: 'raw_material_sgd',
    naicsKey: 'naics_raw_material',
    label: 'Raw material',
    barClass: 'raw',
    defaultNaics: '331110',
  },
  {
    id: 'fabrication',
    amountKey: 'fabrication_sgd',
    naicsKey: 'naics_fabrication',
    label: 'Fabrication',
    barClass: 'fabrication',
    defaultNaics: '332710',
  },
  {
    id: 'surface',
    amountKey: 'surface_treatment_sgd',
    naicsKey: 'naics_surface_treatment',
    label: 'Surface treatment',
    barClass: 'surface',
    defaultNaics: '332812',
  },
] as const

test('invalidates stale calculation and transport requests', () => {
  const gate = createRequestGate()
  const first = gate.begin()
  const second = gate.begin()

  assert.equal(gate.isCurrent(first), false)
  assert.equal(gate.isCurrent(second), true)

  gate.invalidate()
  assert.equal(gate.isCurrent(second), false)
})

test('applies allocation presets atomically and preserves selected NAICS codes', () => {
  const form = {
    total_amount_sgd: '100',
    raw_material_sgd: '',
    fabrication_sgd: '',
    surface_treatment_sgd: '',
    naics_raw_material: '331110',
    naics_fabrication: '332710',
    naics_surface_treatment: '332812',
  }
  const lineItems = {
    raw: [{ amount: '', naics: '331315' }],
    fabrication: [{ amount: '', naics: '332710' }],
    surface: [{ amount: '', naics: '332813' }],
  }

  const next = applyAllocationPreset({
    categories,
    form,
    lineItems,
    totalAmountKey: 'total_amount_sgd',
    percentages: { raw: 33.33, fabrication: 33.33, surface: 33.34 },
  })

  assert.deepEqual(
    {
      raw: next.form.raw_material_sgd,
      fabrication: next.form.fabrication_sgd,
      surface: next.form.surface_treatment_sgd,
    },
    { raw: '33.33', fabrication: '33.33', surface: '33.34' },
  )
  assert.deepEqual(next.lineItems, {
    raw: [{ amount: '33.33', naics: '331315' }],
    fabrication: [{ amount: '33.33', naics: '332710' }],
    surface: [{ amount: '33.34', naics: '332813' }],
  })
})
