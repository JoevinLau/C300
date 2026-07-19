import assert from 'node:assert/strict'
import test from 'node:test'

import { calculateEcoTransitTransport } from './calculator-api.ts'


test('does not replace an EcoTransit failure with a renderer-side estimate', async () => {
  const originalWindow = globalThis.window

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      electronAPI: {
        requestLocalApi: async () => {
          throw new Error('EcoTransit location field was unavailable')
        },
      },
    },
  })

  try {
    await assert.rejects(
      calculateEcoTransitTransport({
        port_of_loading: 'Port Klang',
        port_of_discharge: 'Singapore',
        weight_kg: 100,
        transport_mode: 'sea',
        origin_country: 'Malaysia',
      }),
      /EcoTransit location field was unavailable/,
    )
  } finally {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    })
  }
})
