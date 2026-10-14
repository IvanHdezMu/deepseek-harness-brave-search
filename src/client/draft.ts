/** Pure form conversion: a blank password preserves the stored secret. */
import { defaults, parseSave } from '../settings-contract.js'
import type { Numbers, SaveSettings, SettingsState } from '../settings-contract.js'

export interface Draft {
  numbers: Record<keyof Numbers, string>
  key: string
  deleteKey: boolean
}
export function newDraft(state: Numbers = defaults): Draft {
  return { numbers: { maxResults: String(state.maxResults), timeoutMs: String(state.timeoutMs), minIntervalMs: String(state.minIntervalMs) }, key: '', deleteKey: false }
}
export function saveRequest(draft: Draft, state: SettingsState): SaveSettings {
  return parseSave({
    ...Object.fromEntries(Object.entries(draft.numbers).map(([k, v]) => [k, v.trim() ? Number(v) : NaN])),
    revision: state.revision,
    keyAction: draft.deleteKey ? 'delete' : draft.key.trim() ? 'replace' : 'keep',
    key: draft.key,
  })
}
