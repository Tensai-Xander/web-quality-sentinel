export interface ProposedPage {
  id: string
  label: string
  path: string
  template: string
}
export interface SitemapProposal {
  origin: string
  siteId: string
  siteName: string
  sitemaps: string[]
  urlCount: number
  pages: ProposedPage[]
  estimatedMinutes: number
}
export const SECONDS_PER_PSI_CALL: number
export const CALLS_PER_PAGE: number
export function slugify(words: string[]): string
export function pageIdFromPath(path: string): string
export function labelFromId(id: string): string
export function siteIdFromUrl(url: string): string
export function siteNameFromUrl(url: string): string
export function estimateMinutes(pageCount: number): number
export function proposePages(
  siteUrl: string,
  warn?: (msg: string) => void
): Promise<SitemapProposal>
