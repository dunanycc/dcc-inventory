export const STRUCTURAL_LOCATIONS = [
  { code: "BAR", name: "Bar", active: true },
  { code: "STARTER_SHACK", name: "Starter Shack", active: true },
] as const;

export type LocationSeedRepository = {
  createMissingLocations(
    locations: ReadonlyArray<{ code: string; name: string; active: boolean }>,
  ): Promise<unknown>;
};

/** Inserts structural Locations only; existing operational names and active states are never updated. */
export function seedStructuralLocations(repository: LocationSeedRepository) {
  return repository.createMissingLocations(STRUCTURAL_LOCATIONS);
}
