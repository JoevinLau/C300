import assert from 'node:assert/strict'
import test from 'node:test'

import {
  addLineItem,
  buildTransportCalculationRequest,
  deriveAllocationState,
  isSupportedCalculationYear,
  parseAmount,
  pctFromAmount,
  removeLineItem,
  updateLineItem,
} from './calculation-workflow.ts'

const categories = [
  { id: 'raw', amountKey: 'raw_amount', label: 'Raw material', barClass: 'bg-lime-400' },
  { id: 'fabrication', amountKey: 'fab_amount', label: 'Fabrication', barClass: 'bg-teal-400' },
  { id: 'surface', amountKey: 'surface_amount', label: 'Surface treatment', barClass: 'bg-rose-400' },
] as const

test('accepts only calculation years backed by shipped reference data', () => {
  assert.equal(isSupportedCalculationYear(2022), true)
  assert.equal(isSupportedCalculationYear(2026), true)
  assert.equal(isSupportedCalculationYear(2021), false)
  assert.equal(isSupportedCalculationYear(2030), false)
  assert.equal(isSupportedCalculationYear(2024.5), false)
})

test('parses display amounts and safely handles invalid values', () => {
  assert.equal(parseAmount(' 1,307.25 '), 1_307.25)
  assert.equal(parseAmount('-12.5'), -12.5)
  assert.equal(parseAmount(''), 0)
  assert.equal(parseAmount('not a number'), 0)
  assert.equal(parseAmount('Infinity'), 0)

  assert.equal(pctFromAmount(25, 100), 25)
  assert.equal(pctFromAmount(25, 0), 0)
  assert.equal(pctFromAmount(25, -100), 0)
})

test('derives category totals, rounded allocation percentages, and segments', () => {
  const allocation = deriveAllocationState({
    categories,
    form: {
      total: '2,614',
      raw_amount: '0',
      fab_amount: '914.90',
      surface_amount: '392.10',
    },
    lineItems: {
      raw: [
        { amount: '1,000', naics: '331110' },
        { amount: '307', naics: '331110' },
      ],
      fabrication: [{ amount: '', naics: '332710' }],
      surface: [{ amount: '', naics: '332812' }],
    },
    totalAmountKey: 'total',
  })

  assert.deepEqual(
    allocation.categoryAmounts.map(({ id, amount }) => ({ id, amount })),
    [
      { id: 'raw', amount: 1_307 },
      { id: 'fabrication', amount: 914.9 },
      { id: 'surface', amount: 392.1 },
    ],
  )
  assert.equal(allocation.allocationSum, 2_614)
  assert.equal(allocation.totalAmount, 2_614)
  assert.equal(allocation.allocationValid, true)
  assert.equal(allocation.remaining, 0)
  assert.equal(allocation.percentages.raw, 50)
  assert.ok(Math.abs(allocation.percentages.fabrication - 35) < Number.EPSILON * 16)
  assert.ok(Math.abs(allocation.percentages.surface - 15) < Number.EPSILON * 16)
  assert.deepEqual(
    allocation.segments.map(({ label, pct, className }) => ({ label, pct, className })),
    [
      { label: 'Raw material', pct: 50, className: 'bg-lime-400' },
      { label: 'Fabrication', pct: allocation.percentages.fabrication, className: 'bg-teal-400' },
      { label: 'Surface treatment', pct: allocation.percentages.surface, className: 'bg-rose-400' },
    ],
  )

  const activityBasedAllocation = deriveAllocationState({
    categories: categories.filter(({ id }) => id !== 'fabrication'),
    form: {
      total: '0',
      raw_amount: '0',
      fab_amount: '0',
      surface_amount: '0',
    },
    lineItems: {
      raw: [{ amount: '900', naics: '331110' }],
      surface: [{ amount: '100', naics: '332812' }],
    },
    totalAmountKey: 'total',
    requireInvoiceTotal: false,
    reconcileAllocationToTotal: false,
  })
  assert.equal(activityBasedAllocation.hasInvoiceTotal, true)
  assert.equal(activityBasedAllocation.allocationValid, true)
})

test('updates, adds, and removes line items without mutating the input', () => {
  const original = [
    { amount: '100', naics: '331110' },
    { amount: '50', naics: '332710' },
  ]
  const snapshot = structuredClone(original)

  const updated = updateLineItem(original, 0, { amount: '125' })
  const added = addLineItem(updated, '332812')
  const removed = removeLineItem(added, 1)

  assert.deepEqual(original, snapshot)
  assert.notEqual(updated, original)
  assert.deepEqual(updated, [
    { amount: '125', naics: '331110' },
    { amount: '50', naics: '332710' },
  ])
  assert.deepEqual(added.at(-1), { amount: '', naics: '332812' })
  assert.deepEqual(removed, [
    { amount: '125', naics: '331110' },
    { amount: '', naics: '332812' },
  ])

  const onlyRow = [{ amount: '10', naics: '331110' }]
  const deletionAttempt = removeLineItem(onlyRow, 0)
  assert.deepEqual(deletionAttempt, onlyRow)
  assert.notEqual(deletionAttempt, onlyRow)
})

test('validates transport fields in the current order and normalizes the request', () => {
  const base = {
    weight: ' 12.5 ',
    origin: ' china ',
    portOfLoading: ' Port of Shanghai ',
    portOfDischarge: ' Singapore ',
    mode: 'sea' as const,
    matchedPort: { country: 'China', loadingPort: 'Port of Shanghai' },
  }

  assert.deepEqual(buildTransportCalculationRequest({ ...base, weight: '1,000' }), {
    ok: false,
    error: 'Enter a valid shipment weight in kg',
  })
  assert.deepEqual(buildTransportCalculationRequest({ ...base, weight: '0' }), {
    ok: false,
    error: 'Enter a valid shipment weight in kg',
  })
  assert.deepEqual(buildTransportCalculationRequest({ ...base, origin: '  ' }), {
    ok: false,
    error: 'Enter origin country',
  })
  assert.deepEqual(buildTransportCalculationRequest({ ...base, portOfLoading: '  ' }), {
    ok: false,
    error: 'Enter port of loading',
  })
  assert.deepEqual(buildTransportCalculationRequest({ ...base, portOfDischarge: '' }), {
    ok: false,
    error: 'Enter port of discharge',
  })

  assert.deepEqual(buildTransportCalculationRequest(base), {
    ok: true,
    request: {
      origin_country: 'China',
      port_of_loading: 'Port of Shanghai',
      port_of_discharge: 'Singapore',
      weight_kg: 12.5,
      transport_mode: 'sea',
      allow_estimate: false,
    },
  })

  assert.deepEqual(
    buildTransportCalculationRequest({ ...base, origin: '  Vietnam  ', matchedPort: null }),
    {
      ok: true,
      request: {
        origin_country: 'Vietnam',
        port_of_loading: 'Port of Shanghai',
        port_of_discharge: 'Singapore',
        weight_kg: 12.5,
        transport_mode: 'sea',
        allow_estimate: false,
      },
    },
  )

  assert.deepEqual(buildTransportCalculationRequest({ ...base, allowEstimate: true }), {
    ok: true,
    request: {
      origin_country: 'China',
      port_of_loading: 'Port of Shanghai',
      port_of_discharge: 'Singapore',
      weight_kg: 12.5,
      transport_mode: 'sea',
      allow_estimate: true,
    },
  })
})
