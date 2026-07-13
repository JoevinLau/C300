import type { EcoTransitResponse } from '@/lib/calculator-api'
import type { CalculationHistoryTransport } from '../../shared/calculation-history-types'

export function toCalculationHistoryTransport(
  response: EcoTransitResponse | null | undefined,
): CalculationHistoryTransport | null {
  if (!response) return null

  const transport = response.transport
  return {
    origin: transport.origin,
    port_of_loading: transport.port_of_loading,
    port_of_discharge: transport.port_of_discharge,
    weight_kg: transport.weight_kg,
    chosen_mode: transport.chosen_mode,
    chosen_emissions_kg: transport.chosen_emissions_kg,
    distance_km: transport.distance_km,
    energy_mj: transport.energy_mj,
    source: transport.source,
  }
}
