import type { WorkshopProgress } from '../domain/skills'
import type { PortfolioReport } from '../domain/portfolio'

export type MaterialCollection = 'labs' | 'courses' | 'graphs'
export type MaterialTokens = Record<string, string | null>
export type StoredMaterial = { id: string; value: unknown; storageToken?: string | null }
export type StoredWorkshop = {
  id: string
  value: unknown
  enabled?: boolean
  revision?: number
}
export type WorkshopSnapshot = [
  PromiseSettledResult<StoredWorkshop | undefined>,
  PromiseSettledResult<StoredMaterial[]>,
  PromiseSettledResult<StoredMaterial[]>,
  PromiseSettledResult<unknown[]>,
  PromiseSettledResult<StoredMaterial[]>,
]

/** The store owns RAM, consent and its write queue; this port owns durable transactions. */
export interface WorkshopRepository {
  read(): Promise<WorkshopSnapshot>
  saveProgress(snapshot: WorkshopProgress, expectedRevision: number): Promise<number>
  disableProgress(): Promise<number | undefined>
  clearProgress(): Promise<void>
  readMaterials(collection: MaterialCollection): Promise<StoredMaterial[]>
  saveMaterials<T extends { id: string }>(
    collection: MaterialCollection,
    values: T[],
    expected: MaterialTokens,
  ): Promise<MaterialTokens>
  deleteMaterial(collection: MaterialCollection, id: string, expected: string | null): Promise<void>
  saveReport(value: PortfolioReport): Promise<PortfolioReport>
  removeReport(id: string): Promise<void>
}
