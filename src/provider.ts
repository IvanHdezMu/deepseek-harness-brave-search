/** Brave adapter. Only the fixed official endpoint can receive the API key. */
import { WebError } from '@deepseek-ai/dsh-web'
import type { WebSearchProvider, WebSearchRequest, WebSearchResult, WebSearchSource } from '@deepseek-ai/dsh-web'

export const BRAVE_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search'

export interface BraveOptions {
  apiKey: string
  timeoutMs: number
  minIntervalMs: number
  maxResults: number
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function integer(value: number, max: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= max
}

function valid(options: BraveOptions): boolean {
  return options.apiKey.trim().length > 0 && !/[\r\n]/u.test(options.apiKey)
    && integer(options.timeoutMs, 120000) && integer(options.minIntervalMs, 3600000)
    && integer(options.maxResults, 20)
}

function mapResponse(body: unknown, limit: number): WebSearchResult {
  if (!record(body) || body.type !== 'search' || (body.web !== undefined
    && (!record(body.web) || !Array.isArray(body.web.results)))) {
    throw new WebError('Brave returned an invalid search response.', 'WEB_PROVIDER_ERROR')
  }
  const sources: WebSearchSource[] = []
  const rows: unknown[] = record(body.web) ? body.web.results as unknown[] : []
  for (const row of rows) {
    if (!record(row) || typeof row.url !== 'string' || typeof row.title !== 'string'
      || typeof row.description !== 'string' || !row.title.trim() || !row.description.trim()) continue
    let url: URL
    try { url = new URL(row.url) } catch { continue }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) continue
    sources.push({ title: row.title, url: row.url, snippet: row.description })
  }
  return { sources: sources.slice(0, limit), truncated: sources.length > limit }
}

/** Wait without keeping timers/listeners after cancellation or completion. */
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted()
    const abort = () => { clearTimeout(timer); reject(signal.reason) }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    }, Math.min(ms, 2147483647))
    signal.addEventListener('abort', abort, { once: true })
  })
}

/** Request starts are spaced across sessions; at most ten calls may wait/run. */
export class BraveSearchProvider implements WebSearchProvider {
  readonly id = 'brave'
  private nextRequestAt = 0
  private pending = 0

  /** @param options Reads the current Cordis configuration without networking. */
  constructor(private readonly options: () => BraveOptions) {}

  available(): boolean { return valid(this.options()) }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    if (signal?.aborted) throw new WebError('Brave search cancelled.', 'WEB_ABORTED')
    const options = this.options()
    if (!valid(options)) throw new WebError('Configure a Brave API key and valid limits.', 'WEB_PROVIDER_CONFIGURED_UNAVAILABLE')
    const query = request.query.trim()
    if (!query || query.length > 600 || query.split(/\s+/u).length > 75
      || (request.maxResults !== undefined && !integer(request.maxResults, Number.MAX_SAFE_INTEGER))) {
      throw new WebError('Brave requires 1–600 characters, at most 75 words, and a positive result limit.', 'WEB_INVALID_REQUEST')
    }
    if (this.pending >= 10) {
      throw new WebError('Brave request limit reached; wait before searching again.', 'WEB_RATE_LIMITED')
    }
    this.pending++
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs)
    const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal
    const limit = Math.min(request.maxResults ?? options.maxResults, options.maxResults, 20)
    const url = new URL(BRAVE_ENDPOINT)
    url.search = new URLSearchParams({ q: query, count: String(limit), text_decorations: 'false', result_filter: 'web' }).toString()
    try {
      // Recheck after waiting: another call or a 429 can extend the cooldown.
      while (Date.now() < this.nextRequestAt) {
        await wait(this.nextRequestAt - Date.now(), combined)
      }
      combined.throwIfAborted()
      this.nextRequestAt = Date.now() + options.minIntervalMs
      const response = await fetch(url, {
        method: 'GET', redirect: 'error', signal: combined,
        headers: { Accept: 'application/json', 'X-Subscription-Token': options.apiKey.trim() },
      })
      if (!response.ok) {
        if (response.status === 429) {
          const retry = response.headers.get('retry-after')
          const seconds = retry !== null && /^\d+(?:\.\d+)?$/u.test(retry.trim()) ? Number(retry) : NaN
          const date = retry === null ? NaN : Date.parse(retry)
          const delay = Number.isFinite(seconds) ? seconds * 1000
            : Number.isFinite(date) ? Math.max(0, date - Date.now()) : 60000
          this.nextRequestAt = Math.max(this.nextRequestAt, Date.now() + delay)
        }
        // Never expose upstream bodies, headers, URLs, or exception causes.
        await response.body?.cancel()
        const code = response.status === 429 ? 'WEB_RATE_LIMITED'
          : response.status === 401 || response.status === 403 ? 'WEB_AUTH_ERROR' : 'WEB_PROVIDER_ERROR'
        throw new WebError(`Brave Search failed (HTTP ${response.status}).`, code)
      }
      const body: unknown = await response.json()
      combined.throwIfAborted()
      return mapResponse(body, limit)
    } catch (error: unknown) {
      if (signal?.aborted) throw new WebError('Brave search cancelled.', 'WEB_ABORTED')
      if (controller.signal.aborted) throw new WebError('Brave search timed out.', 'WEB_TIMEOUT')
      if (error instanceof WebError) throw error
      throw new WebError('Brave request failed or returned invalid JSON.', 'WEB_PROVIDER_ERROR')
    } finally {
      clearTimeout(timeout)
      this.pending--
    }
  }
}
