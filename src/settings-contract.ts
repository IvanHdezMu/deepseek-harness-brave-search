/** Browser-safe, explicit Typert descriptors for the plugin's configuration API. */
import type { InvocationDescriptor, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'

export const PLUGIN_ID = 'deepseek-harness-brave-search'
export const SETTINGS_SERVICE = 'braveSearchSettings'
export const defaults = { maxResults: 5, timeoutMs: 15000, minIntervalMs: 1100 }
export const limits = { maxResults: 20, timeoutMs: 120000, minIntervalMs: 3600000 }
export type Numbers = typeof defaults
export interface SettingsState extends Numbers {
  configured: boolean
  selected: boolean
  revision: number
}
export interface SaveSettings extends Numbers {
  revision: number
  keyAction: 'keep' | 'replace' | 'delete'
  key?: string
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw Error('Invalid settings request')
  return value as Record<string, unknown>
}
function numbers(value: Record<string, unknown>): Numbers {
  const out = { ...defaults }
  for (const name of Object.keys(limits) as (keyof Numbers)[]) {
    const n = value[name]
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > limits[name]) throw Error('Invalid numeric setting')
    out[name] = n
  }
  return out
}
function revision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw Error('Invalid configuration revision')
  return value
}
/** Validate and project fields; errors never interpolate secret input. */
export function parseSave(value: unknown): SaveSettings {
  const v = object(value)
  if (typeof v.keyAction !== 'string' || !['keep', 'replace', 'delete'].includes(v.keyAction)) throw Error('Invalid key action')
  const keyAction = v.keyAction as SaveSettings['keyAction']
  if (keyAction === 'replace' && (typeof v.key !== 'string' || !v.key.trim() || /[\r\n]/u.test(v.key))) throw Error('Invalid API key')
  return { ...numbers(v), revision: revision(v.revision), keyAction,
    ...(keyAction === 'replace' ? { key: (v.key as string).trim() } : {}) }
}
export function parseState(value: unknown): SettingsState {
  const v = object(value)
  if (typeof v.configured !== 'boolean' || typeof v.selected !== 'boolean') throw Error('Invalid settings response')
  return { ...numbers(v), revision: revision(v.revision), configured: v.configured, selected: v.selected }
}

const result = { mode: 'strict' as const, typeSymbol: `${PLUGIN_ID}#SettingsState`, create: () => ({ parse: parseState }) }
export const descriptors: readonly InvocationDescriptor[] = ['getState', 'save', 'selectBrave'].map(method => ({
  id: `${PLUGIN_ID}#${method}`, service: SETTINGS_SERVICE, namespace: SETTINGS_SERVICE, method,
  invocation: { kind: 'direct' },
  parameters: method === 'save' ? [{
    name: 'request', wire: 'request', source: 'json',
    codec: { mode: 'strict', typeSymbol: `${PLUGIN_ID}#SaveSettings`, create: () => ({ parse: parseSave }) },
  }] : [], result,
}))
export const remoteContribution: TypertRemoteContribution = { package: PLUGIN_ID, descriptors }

type Reply<T> = { ok: true; value: T } | { ok: false; error: { message: string } }
/** Public client projection mounted using the official Remote contribution API. */
export interface SettingsApi {
  getState(): Promise<Reply<SettingsState>>
  save(request: SaveSettings): Promise<Reply<SettingsState>>
  selectBrave(): Promise<Reply<SettingsState>>
}
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespaceMap { braveSearchSettings: SettingsApi }
}
