import { useEffect, useRef, useState } from 'react'
import { SettingsForm, SettingsSecretField, SettingsValueField } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SettingsApi, SettingsState, Numbers } from '../settings-contract.js'
import { defaults, limits } from '../settings-contract.js'
import { newDraft, saveRequest } from './draft.js'
import type { TextKey } from './locales.js'

export interface PageProps {
  view: 'page' | 'summary'
  api: SettingsApi
  t: (key: TextKey) => string
}
/** Official form controls; all secrets are write-only drafts held in component memory. */
export function BraveSettingsPage({ view, api, t }: PageProps) {
  const [state, setState] = useState<SettingsState>()
  const [draft, setDraft] = useState(() => newDraft())
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [saved, setSaved] = useState(false)
  const generation = useRef(0)
  const accept = (next: SettingsState) => { setState(next); setDraft(newDraft(next)) }
  const run = async (action: 'load' | 'save' | 'select') => {
    const current = ++generation.current
    setBusy(true); setFailed(false); setSaved(false)
    try {
      const response = action === 'save' && state ? await api.save(saveRequest(draft, state))
        : action === 'select' ? await api.selectBrave() : await api.getState()
      if (current !== generation.current) return
      if (!response.ok) { setFailed(true); return }
      accept(response.value)
      setSaved(action === 'save')
    } catch {
      if (current === generation.current) setFailed(true)
    } finally {
      if (current === generation.current) {
        setBusy(false)
        // Clear the typed password after every save attempt, including a refused write.
        if (action === 'save') setDraft(value => ({ ...value, key: '' }))
      }
    }
  }
  useEffect(() => {
    if (view === 'page') void run('load')
    return () => { generation.current++ }
  }, [api, view])
  if (view === 'summary') return <>{t('description')}</>
  const dirty = state !== undefined && (draft.key !== '' || draft.deleteKey ||
    (Object.keys(defaults) as (keyof Numbers)[]).some(key => draft.numbers[key] !== String(state[key])))
  let invalid = false
  if (state) { try { saveRequest(draft, state) } catch { invalid = true } }
  return <div>
    <button type="button" disabled={busy} onClick={() => { void run('load') }}>{t('reload')}</button>
    {!state && failed ? <p role="alert">{t('saveFailed')}</p> : null}
    <SettingsForm labels={{ unavailable: t('unavailable'), readOnly: t('readOnly'), saveFailed: t('saveFailed'), save: t('save'), saving: t('saving') }}
      state={{ available: state !== undefined, writable: true, dirty, invalid, saving: busy, failed }}
      onSave={() => { void run('save') }} onDiscard={() => { generation.current++ }}>
      <SettingsSecretField id="brave-api-key" label={t('apiKey')} hint={t('keyHint')}
        configured={state?.configured ?? false} stateLabel={t(state?.configured ? 'configured' : 'missing')}
        disabled={busy || draft.deleteKey} text={draft.key}
        onEdit={key => { setSaved(false); setDraft(value => ({ ...value, key })) }} />
      <button type="button" disabled={busy || (!state?.configured && !draft.key && !draft.deleteKey)}
        onClick={() => { setSaved(false); setDraft(value => ({ ...value, key: '', deleteKey: !value.deleteKey })) }}>
        {t(draft.deleteKey ? 'cancelDelete' : 'deleteKey')}
      </button>
      {draft.deleteKey ? <p role="status">{t('deleting')}</p> : null}
      {(Object.keys(defaults) as (keyof Numbers)[]).map(key => <SettingsValueField key={key}
        id={`brave-${key}`} label={t(key)} hint={`1–${limits[key]}`} numeric
        overriddenLabel={t('overridden')} resetLabel={t('reset')} invalidLabel={t('range')}
        disabled={busy} text={draft.numbers[key]} overridden={draft.numbers[key] !== String(defaults[key])}
        invalid={!Number.isInteger(Number(draft.numbers[key])) || Number(draft.numbers[key]) < 1 || Number(draft.numbers[key]) > limits[key]}
        onEdit={text => { setSaved(false); setDraft(value => ({ ...value, numbers: { ...value.numbers, [key]: text } })) }}
        onReset={() => { setSaved(false); setDraft(value => ({ ...value, numbers: { ...value.numbers, [key]: String(defaults[key]) } })) }} />)}
    </SettingsForm>
    {saved ? <p role="status">{t('saved')}</p> : null}
    {state ? <section>
      <p role="status">{t(state.selected ? 'selected' : 'notSelected')}</p>
      <button type="button" disabled={busy || dirty || !state.configured || state.selected}
        onClick={() => { void run('select') }}>{t('select')}</button>
      <p>{t('selectionHint')}</p>
    </section> : null}
  </div>
}
