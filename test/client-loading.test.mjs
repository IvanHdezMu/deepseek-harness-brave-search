import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { webcrypto } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { ClientModuleRegistry } from '@deepseek-ai/dsh-client-modules'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'

const require = createRequire(import.meta.url)
const id = 'deepseek-harness-brave-search'
const globals = { console, setTimeout, clearTimeout, queueMicrotask, crypto: webcrypto, AbortController, AbortSignal }
async function browserModule(specifier) {
  let exports
  runInNewContext(await readFile(require.resolve(specifier), 'utf8'), {
    ...globals, window: { __ModuleLoader__: { load: registration => { exports = registration.factory(require) } } },
  })
  return exports
}

test('rc.2 discovers and serves the client, loads it through ClientEntries, and retains configuration slots', async t => {
  const host = new Context()
  const client = new Context()
  t.after(async () => { await client.fiber.dispose(); await host.fiber.dispose() })
  // Real package resolution against this package's exports, not a cordis: builtin.
  host.provide('loader', { entries: () => [{
    options: { name: id }, fiber: {},
    parent: { tree: { ctx: { baseUrl: pathToFileURL(resolve('package.json')).href } } },
  }] })
  await host.plugin(ClientModuleRegistry)
  const graph = host.clientModules.graph()
  assert.deepEqual(graph.entries.map(row => row.id), [id])
  const { SlotRegistry } = await browserModule('@deepseek-ai/dsh-client-ui-renderer/client')
  new SlotRegistry(client)
  client.provide('locale', { register: () => () => {} })
  await client.plugin(TypertRegistry)
  client.provide('connection', {
    isLoopback: true, generation: { getSnapshot: () => undefined },
    registerGenerationSource: () => () => {}, start: () => ({ stop() {} }),
    rpc: { open: async function* () {}, call: async () => { throw Error('No RPC expected during registration') } },
  })
  await client.plugin(await browserModule('@deepseek-ai/dsh-api-gateway/client'))
  await client.plugin(Loader)
  const modules = await browserModule('@deepseek-ai/dsh-client-modules/client')
  const target = { mode: 'queue', pendingQueue: [] }
  const system = modules.createClientModuleSystem(target, { id: 'test-bootstrap', exports: {} }, {
    boot: graph,
    staticModules: {
      react: require('react'), 'react/jsx-runtime': require('react/jsx-runtime'),
      // Controls are not rendered here; this test exercises discovery and activation.
      '@deepseek-ai/dsh-client-ui-primitives': {},
    },
    loadBundle: async url => {
      const response = await host.clientModules.fetchBundle(new Request(new URL(url, 'http://localhost/')))
      assert.equal(response.status, 200)
      runInNewContext(await response.text(), { ...globals, window: { __ModuleLoader__: target } })
    },
  })
  client.loader.internal = system
  await system.entries.start(client.loader, system.manifest)
  assert.deepEqual(Array.from(system.entries.state.getSnapshot().failures), [])
  const entry = [...client.loader.entries()].find(entry => entry.options.name === id)
  assert.equal(entry.fiber.state, 2, 'Client plugin must be ACTIVE')
  // The manager declares its slots after the plugin starts. Test real deferred
  // injection and collapse/redeclaration instead of invoking callbacks directly.
  const declare = () => client.slots.register({ name: 'root', children: {
    'plugins.bundle.config': { kind: 'keyed', scope: 'root' },
    'plugins.row.config': { kind: 'keyed', scope: 'root' },
  } }, () => null)
  for (let pass = 0; pass < 2; pass++) {
    const dispose = declare()
    assert.equal(client.slots.entries('plugins.bundle.config')[0]?.options.key, id)
    assert.equal(client.slots.entries('plugins.row.config')[0]?.options.key, `${id}#${id}`)
    // Rendering evaluates the slot's inject closure in the plugin context,
    // whose Cordis permissions differ from the unrestricted root context.
    for (const name of ['plugins.bundle.config', 'plugins.row.config']) {
      const props = client.slots.entries(name)[0].inject()
      assert.equal(typeof props.api.getState, 'function')
      assert.equal(typeof props.api.save, 'function')
      assert.equal(typeof props.api.selectBrave, 'function')
    }
    assert.equal(typeof client.remote.braveSearchSettings.save, 'function')
    await dispose()
    assert.equal(client.slots.entries('plugins.bundle.config').length, 0)
  }
})
