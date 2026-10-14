import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import React from 'react'
import { randomUUID } from 'node:crypto'
import { create, act } from 'react-test-renderer'
import { defaults } from '../dist/settings-contract.js'

const require = createRequire(import.meta.url)
// Harness supplies these controls through its module table. The stand-ins expose
// their documented props for interaction tests; styles and visual layout are not tested.
const primitives = {
  SettingsForm: ({ children, onSave, state, labels }) => React.createElement('section', {}, children,
    React.createElement('button', { disabled: !state.dirty || state.invalid || state.saving, onClick: onSave }, labels.save)),
  SettingsSecretField: props => React.createElement('input', { id: props.id, type: 'password', value: props.text, disabled: props.disabled, onChange: e => props.onEdit(e.target.value) }),
  SettingsValueField: props => React.createElement('input', { id: props.id, value: props.text, disabled: props.disabled, onChange: e => props.onEdit(e.target.value) }),
}

async function mount(api) {
  let client
  const registrations = []
  let dictionary
  let mounted
  const code = await readFile('dist/client.js', 'utf8')
  runInNewContext(code, { window: { __ModuleLoader__: { load: contribution => {
    assert.equal(contribution.id, 'deepseek-harness-brave-search')
    client = contribution.factory(name => {
      if (name === '@deepseek-ai/dsh-client-ui-primitives') return primitives
      assert.ok(['react', 'react/jsx-runtime'].includes(name), `Unexpected browser dependency: ${name}`)
      return require(name)
    })
  } } } })
  const context = {
    remote: { braveSearchSettings: api, $mount: async contribution => { mounted = contribution } },
    locale: { register: (_ns, dictionaries) => { dictionary = dictionaries.en; return () => {} } },
    effect: fn => fn(),
    slots: { inject: (_name, fn) => fn(), register: (options, component) => { registrations.push({ options, component }); return () => {} } },
    inject: (dependencies, fn) => {
      assert.deepEqual(Array.from(dependencies), ['remote.braveSearchSettings'])
      fn(context)
    },
  }
  await client.apply(context)
  assert.deepEqual(registrations.map(r => [r.options.name, r.options.key]), [
    ['plugins.bundle.config', 'deepseek-harness-brave-search'],
    ['plugins.row.config', 'deepseek-harness-brave-search#deepseek-harness-brave-search'],
  ])
  assert.equal(mounted.descriptors.length, 3)
  let renderer
  await act(async () => { renderer = create(React.createElement(registrations[0].component, {
    ...registrations[0].options.inject(), view: 'page', t: key => dictionary[key],
  })) })
  const button = text => renderer.root.findAllByType('button').find(b => b.children.join('') === text)
  const edit = async (id, value) => act(async () => renderer.root.findAllByType('input').find(input => input.props.id === id).props.onChange({ target: { value } }))
  return { renderer, button, edit }
}

test('browser artifact registers both settings pages and stages secret replacement/deletion', async t => {
  let state = { ...defaults, configured: true, selected: false, revision: 0 }
  const writes = []
  const api = {
    getState: async () => ({ ok: true, value: state }),
    save: async request => {
      writes.push(request)
      state = { ...state, maxResults: request.maxResults, configured: request.keyAction !== 'delete', revision: state.revision + 1 }
      return { ok: true, value: state }
    },
    selectBrave: async () => ({ ok: true, value: state = { ...state, selected: true } }),
  }
  const { renderer, button, edit } = await mount(api)
  t.after(() => act(() => renderer.unmount()))
  assert.equal(renderer.root.findAllByType('input').find(input => input.props.id === 'brave-api-key').props.value, '')
  assert.equal(renderer.root.findAllByType('input').find(input => input.props.id === 'brave-api-key').props.type, 'password')
  await edit('brave-maxResults', '7')
  await act(async () => button('Save').props.onClick())
  assert.equal(writes[0].keyAction, 'keep')
  await edit('brave-api-key', randomUUID())
  await act(async () => button('Save').props.onClick())
  assert.equal(writes[1].keyAction, 'replace')
  assert.equal(renderer.root.findAllByType('input').find(input => input.props.id === 'brave-api-key').props.value, '')
  await act(async () => button('Use Brave for web_search').props.onClick())
  assert.equal(state.selected, true)
  await act(async () => button('Delete key').props.onClick())
  assert.equal(writes.length, 2)
  await act(async () => button('Save').props.onClick())
  assert.equal(writes[2].keyAction, 'delete')
  assert.equal(writes[2].key, undefined)
  assert.equal(state.configured, false)
})

test('browser validates limits and clears typed passwords after rejected writes', async t => {
  const state = { ...defaults, configured: true, selected: true, revision: 1 }
  const { renderer, button, edit } = await mount({
    getState: async () => ({ ok: true, value: state }),
    save: async () => ({ ok: false, error: { message: 'private server diagnostic' } }),
  })
  t.after(() => act(() => renderer.unmount()))
  await edit('brave-maxResults', '21')
  assert.equal(button('Save').props.disabled, true)
  await edit('brave-maxResults', '5')
  await edit('brave-api-key', randomUUID())
  await act(async () => button('Save').props.onClick())
  assert.equal(renderer.root.findAllByType('input').find(input => input.props.id === 'brave-api-key').props.value, '')
  assert.equal(JSON.stringify(renderer.toJSON()).includes('private server diagnostic'), false)
})
