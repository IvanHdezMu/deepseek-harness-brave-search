/** Cordis entry point: contributes Brave to the native web search registry. */
import type { Context, Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-web'
import { BraveSearchProvider } from './provider.js'

export { BraveSearchProvider } from './provider.js'
export const name = 'deepseek-harness-brave-search'
export const inject = ['web']

/** Live fields are read again for each search, including key rotation. */
export interface Config {
  apiKey: Volatile<string | undefined>
  timeoutMs: Volatile<number>
  minIntervalMs: Volatile<number>
  maxResults: Volatile<number>
}

export const Config = z.object({
  apiKey: z.string().role('secret').volatile(),
  timeoutMs: z.number().step(1).min(1).max(120000).default(15000).volatile(),
  minIntervalMs: z.number().step(1).min(1).max(3600000).default(1100).volatile(),
  maxResults: z.number().step(1).min(1).max(20).default(5).volatile(),
})

/** Register once; the registry owns disposal with the plugin fiber. */
export function apply(ctx: Context, config: Config): void {
  ctx.web.registerSearchProvider(new BraveSearchProvider(() => ({
    apiKey: config.apiKey.get() ?? '',
    timeoutMs: config.timeoutMs.get(),
    minIntervalMs: config.minIntervalMs.get(),
    maxResults: config.maxResults.get(),
  })))
}
