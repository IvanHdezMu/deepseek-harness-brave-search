import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID, webcrypto } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { Context } from '@deepseek-ai/cordis'
import { boot, initProfile, readProfilePatches } from '@deepseek-ai/dsh-app-boot'
import ConfigEditor from '@deepseek-ai/dsh-config-editor'
import Settings from '@deepseek-ai/dsh-settings'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import Gateway from '@deepseek-ai/dsh-api-gateway'
import * as plugin from '../dist/index.js'
import { defaults, PLUGIN_ID, parseSave, parseState, remoteContribution } from '../dist/settings-contract.js'
import { newDraft, saveRequest } from '../dist/client/draft.js'

async function fixture(t) {
  await mkdir('.tools', { recursive: true })
  const home = await mkdtemp(resolve('.tools/config-test-'))
  const dir = join(home, 'profiles', 'test')
  initProfile(dir, ['test-bundle'])
  const bundle = join(dir, 'node_modules', 'test-bundle')
  await mkdir(bundle, { recursive: true })
  await writeFile(join(bundle, 'package.json'), JSON.stringify({ name: 'test-bundle', version: '1.0.0', dsh: { bundle: { patch: 'cordis.patch.yml' } } }))
  await writeFile(join(bundle, 'cordis.patch.yml'), JSON.stringify([{ insert: [
    { id: 'config-editor', name: 'cordis:editor' },
    { id: 'settings', name: 'cordis:settings' },
    { id: 'typert', name: 'cordis:typert' },
    { id: 'gateway', name: 'cordis:gateway' },
    { id: 'web', name: '@deepseek-ai/dsh-web', config: { searchProvider: 'deepseek-official', fetchProvider: 'custom-fetch' } },
    { id: PLUGIN_ID, name: 'cordis:brave', config: {} },
  ] }]))
  await writeFile(join(dir, 'cordis.yml'), '[]\n')
  const profile = { name: 'test', startedBundles: ['test-bundle'], dir, patchPath: join(dir, 'cordis.patch.yml'),
    installAnchor: resolve('package.json'), cwd: home, home, overlays: [], telemetryDisabledEnv: undefined }
  const contexts = []
  t.after(async () => { for (const ctx of contexts) await ctx.fiber.dispose(); await rm(home, { recursive: true, force: true }) })
  const start = async () => {
    const ctx = await boot('brave-test', join(dir, 'cordis.yml'), readProfilePatches('brave-test', profile), ctx => {
      ctx.provide('profileContext', profile)
      ctx.provide('appReady', { onReady: fn => { fn(); return () => {} } })
      Object.assign(ctx.loader.builtins, { editor: ConfigEditor, settings: Settings, typert: TypertRegistry, gateway: Gateway, brave: plugin })
    })
    contexts.push(ctx)
    return ctx
  }
  const ctx = await start()
  const call = (method, request) => ctx.typertGateway.invoke({ namespace: 'braveSearchSettings', method, args: request ? { request } : {} })
  return { ctx, call, start, home, profile }
}

test('real rc.2 profile: save/replace/delete secrets through Gateway, live config and restart', async t => {
  const { ctx, call, start, profile } = await fixture(t)
  const first = await call('getState')
  assert.equal(first.configured, false)
  const key = randomUUID()
  let state = await call('save', { ...defaults, maxResults: 9, revision: first.revision, keyAction: 'replace', key })
  assert.equal(state.configured, true)
  assert.equal(state.maxResults, 9)
  assert.equal(JSON.stringify(state).includes(key), false)
  assert.equal(JSON.stringify(ctx.settings.describe({ redactSecrets: true })).includes(key), false)
  const entry = ctx.configEditor.entries().find(e => e.options.id === PLUGIN_ID)
  const fiber = entry.fiber
  assert.equal(fiber.config.apiKey.get(), key)
  assert.ok((await readFile(profile.patchPath, 'utf8')).includes(key))
  // An unrelated numeric save must not erase the redacted key.
  state = await call('save', { ...defaults, revision: state.revision, keyAction: 'keep' })
  assert.equal(entry.fiber, fiber)
  assert.equal(fiber.config.apiKey.get(), key)
  await assert.rejects(call('save', { ...defaults, revision: first.revision, keyAction: 'delete' }))
  const replacement = randomUUID()
  state = await call('save', { ...defaults, revision: state.revision, keyAction: 'replace', key: replacement })
  assert.equal(fiber.config.apiKey.get(), replacement)
  state = await call('save', { ...defaults, revision: state.revision, keyAction: 'delete' })
  assert.equal(state.configured, false)
  assert.equal(fiber.config.apiKey.get(), '')
  const persisted = await readFile(profile.patchPath, 'utf8')
  assert.equal(persisted.includes(key), false)
  assert.equal(persisted.includes(replacement), false)
  await ctx.fiber.dispose()
  const restarted = await start()
  assert.equal(restarted.get('braveSearchSettings').getState().configured, false)
})

test('real configEditor selects Brave, preserves fetch and rejects home overrides', async t => {
  const { ctx, call, profile, home } = await fixture(t)
  assert.equal((await call('getState')).selected, false)
  assert.equal((await call('selectBrave')).selected, true)
  const web = ctx.configEditor.entries().find(e => e.options.id === 'web')
  assert.equal(web.fiber.config.fetchProvider, 'custom-fetch')
  const before = await readFile(profile.patchPath, 'utf8')
  await writeFile(join(home, 'cordis.patch.yml'), JSON.stringify([{ id: 'web', config: { searchProvider: 'deepseek-official', fetchProvider: 'home-fetch' } }]))
  await assert.rejects(call('selectBrave'))
  assert.equal(await readFile(profile.patchPath, 'utf8'), before)
})

test('strict settings codec rejects invalid values without reflecting secrets', () => {
  const key = randomUUID()
  for (const maxResults of [0, 21, 1.5, '5', NaN]) {
    assert.throws(() => parseSave({ ...defaults, maxResults, key, keyAction: 'replace', revision: 0 }), error => !String(error).includes(key))
  }
  assert.throws(() => parseSave({ ...defaults, keyAction: 'replace', key: '\n', revision: 0 }))
  assert.throws(() => parseSave({ ...defaults, keyAction: 'delete', revision: -1 }))
  assert.throws(() => parseSave({ ...defaults, keyAction: { toString: () => 'keep' }, revision: 0 }))
  assert.throws(() => parseState({ ...defaults, configured: 'yes', selected: true, revision: 0 }))
})

test('form drafts preserve blank keys, stage deletion and apply defaults', () => {
  const state = { ...defaults, configured: true, selected: true, revision: 3 }
  const draft = newDraft(state)
  assert.equal(draft.key, '')
  assert.equal(saveRequest(draft, state).keyAction, 'keep')
  draft.key = randomUUID()
  assert.equal(saveRequest(draft, state).keyAction, 'replace')
  draft.deleteKey = true
  assert.equal(saveRequest(draft, state).key, undefined)
  assert.equal(saveRequest(draft, state).keyAction, 'delete')
  draft.numbers.timeoutMs = '120001'
  assert.throws(() => saveRequest(draft, state))
})

test('official browser Remote mounts the contract and calls the real Host Gateway', async t => {
  const { ctx } = await fixture(t)
  const client = new Context()
  t.after(async () => { await client.fiber.dispose() })
  await client.plugin(TypertRegistry)
  client.provide('connection', {
    isLoopback: true, generation: { getSnapshot: () => undefined },
    registerGenerationSource: () => () => {}, start: () => ({ stop() {} }),
    rpc: {
      open: async function* () {},
      call: async (_prefix, endpoint, payload) => {
        const [namespace, method] = endpoint.split('/')
        return { ok: true, value: await ctx.typertGateway.invoke({ namespace, method, args: payload.args }) }
      },
    },
  })
  const require = createRequire(import.meta.url)
  let gatewayClient
  const code = await readFile(require.resolve('@deepseek-ai/dsh-api-gateway/client'), 'utf8')
  runInNewContext(code, { crypto: webcrypto, AbortController, AbortSignal, setTimeout, clearTimeout,
    window: { __ModuleLoader__: { load: contribution => { gatewayClient = contribution.factory(require) } } } })
  await client.plugin(gatewayClient)
  await client.remote.$mount(remoteContribution)
  const initial = await client.remote.braveSearchSettings.getState()
  assert.equal(initial.ok, true)
  const key = randomUUID()
  const saved = await client.remote.braveSearchSettings.save({ ...defaults, revision: initial.value.revision, keyAction: 'replace', key })
  assert.equal(saved.ok, true)
  assert.equal(saved.value.configured, true)
  assert.equal(JSON.stringify(saved).includes(key), false)
})
