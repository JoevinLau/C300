export interface AllocatedRouteLeg {
  distanceKm: number | null
  emissionsKg: number | null
}

export function allocateRouteEmissions(
  distancesKm: Array<number | null>,
  totalDistanceKm: number | null,
  totalEmissionsKg: number | null,
): AllocatedRouteLeg[] {
  const knownDistance = distancesKm.reduce<number>(
    (sum, distance) => sum + (distance ?? 0),
    0,
  )
  const missingLegs = distancesKm.filter((distance) => distance == null).length
  const fallbackDistance =
    totalDistanceKm != null && missingLegs > 0
      ? Math.max(totalDistanceKm - knownDistance, 0) / missingLegs
      : null
  const resolvedDistances = distancesKm.map((distance) => distance ?? fallbackDistance)
  const allocatedDistance = resolvedDistances.reduce<number>(
    (sum, distance) => sum + (distance ?? 0),
    0,
  )

  return resolvedDistances.map((distanceKm) => ({
    distanceKm,
    emissionsKg:
      distanceKm != null && totalEmissionsKg != null && allocatedDistance > 0
        ? totalEmissionsKg * (distanceKm / allocatedDistance)
        : null,
  }))
}
