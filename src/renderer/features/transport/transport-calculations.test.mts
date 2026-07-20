import assert from 'node:assert/strict'
import test from 'node:test'

import { allocateRouteEmissions } from './transport-calculations.ts'

test('allocates the authoritative total instead of recalculating it', () => {
  const legs = allocateRouteEmissions([100, 300], 400, 80)

  assert.deepEqual(legs, [
    { distanceKm: 100, emissionsKg: 20 },
    { distanceKm: 300, emissionsKg: 60 },
  ])
  assert.equal(legs.reduce((sum, leg) => sum + (leg.emissionsKg ?? 0), 0), 80)
})

test('shares remaining backend distance across unresolved legs', () => {
  const legs = allocateRouteEmissions([100, null, null], 500, 50)

  assert.deepEqual(legs.map((leg) => leg.distanceKm), [100, 200, 200])
  assert.equal(legs.reduce((sum, leg) => sum + (leg.emissionsKg ?? 0), 0), 50)
})

test('does not invent emissions without an authoritative total', () => {
  assert.deepEqual(allocateRouteEmissions([100], 100, null), [
    { distanceKm: 100, emissionsKg: null },
  ])
})
