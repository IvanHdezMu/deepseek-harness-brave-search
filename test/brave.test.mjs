import assert from 'node:assert/strict'
import { beforeEach, afterEach, test, mock } from 'node:test'
import { randomUUID } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import WebRuntime from '@deepseek-ai/dsh-web'
import * as plugin from '../dist/index.js'
import { BRAVE_ENDPOINT, BraveSearchProvider } from '../dist/provider.js'

// Generated test-only values; no real or example credentials are stored.
const options = (overrides = {}) => ({ apiKey: randomUUID(), timeoutMs: 1000, minIntervalMs: 1, maxResults: 5, ...overrides })
const result = { title: 'Example', url: 'https://example.org/page', description: 'Useful description' }
const payload = (results = [result]) => ({ type: 'search', web: { results } })
const json = (body = payload()) => new Response(JSON.stringify(body))
const provider = (overrides) => new BraveSearchProvider(() => options(overrides))
const code = (expected) => (error) => { assert.equal(error.code, expected); return true }
beforeEach(() => mock.method(globalThis, 'fetch', () => { throw Error('Network disabled in tests') }))
afterEach(() => mock.restoreAll())

test('sends GET to the official endpoint and returns native citation fields', async () => {
  const config = options()
  const fetch = mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url.origin + url.pathname, BRAVE_ENDPOINT)
    assert.equal(url.searchParams.get('q'), 'café & TypeScript')
    assert.equal(url.searchParams.get('count'), '3')
    assert.equal(url.searchParams.get('text_decorations'), 'false')
    assert.equal(url.searchParams.get('result_filter'), 'web')
    assert.equal(init.method, 'GET')
    assert.equal(init.redirect, 'error')
    assert.equal(init.headers['X-Subscription-Token'], config.apiKey)
    assert.equal(url.toString().includes(config.apiKey), false)
    return json()
  })
  assert.deepEqual(await new BraveSearchProvider(() => config).search({ query: 'café & TypeScript', maxResults: 3 }), {
    sources: [{ title: result.title, url: result.url, snippet: result.description }], truncated: false,
  })
  assert.equal(fetch.mock.callCount(), 1)
})

test('caps result count and drops malformed/unsafe entries', async () => {
  mock.method(globalThis, 'fetch', async () => json(payload([
    null, {}, { ...result, url: 'javascript:alert(1)' }, { ...result, url: 'https://user:password@example.org' },
    { ...result, description: '' }, result, { ...result, url: 'https://example.org/second' },
  ])))
  const value = await provider({ maxResults: 1 }).search({ query: 'test', maxResults: 100 })
  assert.equal(value.sources.length, 1)
  assert.equal(value.truncated, true)
})

test('accepts an empty search response, with or without web', async () => {
  for (const body of [{ type: 'search' }, payload([])]) {
    mock.method(globalThis, 'fetch', async () => json(body))
    assert.deepEqual(await provider().search({ query: 'empty' }), { sources: [], truncated: false })
    mock.restoreAll()
  }
})

test('availability and invalid requests never use the network', async () => {
  const fetch = mock.method(globalThis, 'fetch', () => { throw Error('Unexpected network') })
  assert.equal(provider({ apiKey: '' }).available(), false)
  assert.equal(provider({ timeoutMs: 0 }).available(), false)
  assert.equal(provider().available(), true)
  await assert.rejects(provider({ apiKey: '' }).search({ query: 'x' }), code('WEB_PROVIDER_CONFIGURED_UNAVAILABLE'))
  for (const request of [{ query: ' ' }, { query: 'a'.repeat(601) }, { query: 'word '.repeat(76) }, { query: 'x', maxResults: 0 }]) {
    await assert.rejects(provider().search(request), code('WEB_INVALID_REQUEST'))
  }
  assert.equal(fetch.mock.callCount(), 0)
})

for (const [status, expected] of [[401, 'WEB_AUTH_ERROR'], [403, 'WEB_AUTH_ERROR'], [422, 'WEB_PROVIDER_ERROR'], [500, 'WEB_PROVIDER_ERROR']]) {
  test(`sanitizes HTTP ${status} and never retries`, async () => {
    const secret = randomUUID()
    const fetch = mock.method(globalThis, 'fetch', async () => new Response(secret, { status }))
    await assert.rejects(provider().search({ query: 'test' }), error => {
      assert.equal(error.code, expected)
      assert.match(error.message, new RegExp(String(status)))
      assert.equal(String(error).includes(secret), false)
      assert.equal(error.cause, undefined)
      return true
    })
    assert.equal(fetch.mock.callCount(), 1)
  })
}

for (const retry of ['60', new Date(Date.now() + 120000).toUTCString(), 'invalid', null]) {
  test(`429 cooldown prevents a second HTTP request (${retry ?? 'missing header'})`, async () => {
    const fetch = mock.method(globalThis, 'fetch', async () => new Response('', {
      status: 429, headers: retry === null ? {} : { 'retry-after': retry },
    }))
    const brave = provider({ timeoutMs: 20 })
    await assert.rejects(brave.search({ query: 'first' }), code('WEB_RATE_LIMITED'))
    await assert.rejects(brave.search({ query: 'second' }), code('WEB_TIMEOUT'))
    assert.equal(fetch.mock.callCount(), 1)
  })
}

test('spaces concurrent searches used by the native multi-query tool', async () => {
  const starts = []
  mock.method(globalThis, 'fetch', async () => { starts.push(Date.now()); return json() })
  const brave = provider({ minIntervalMs: 25 })
  await Promise.all(['one', 'two', 'three'].map(query => brave.search({ query })))
  assert.equal(starts.length, 3)
  assert.ok(starts[1] - starts[0] >= 25)
  assert.ok(starts[2] - starts[1] >= 25)
})

test('timeout includes waiting and cancellation releases queued calls', async () => {
  const fetch = mock.method(globalThis, 'fetch', async () => json())
  const brave = provider({ minIntervalMs: 1000 })
  await brave.search({ query: 'first' })
  const controller = new AbortController()
  const queued = brave.search({ query: 'second' }, controller.signal)
  controller.abort()
  await assert.rejects(queued, code('WEB_ABORTED'))
  await assert.rejects(brave.search({ query: 'third' }, controller.signal), code('WEB_ABORTED'))
  assert.equal(fetch.mock.callCount(), 1)
})

test('bounds pending requests and cancels every queued request without HTTP', async () => {
  const fetch = mock.method(globalThis, 'fetch', async () => json())
  const brave = provider({ minIntervalMs: 1000 })
  await brave.search({ query: 'first' })
  const controller = new AbortController()
  const queued = Array.from({ length: 10 }, () => assert.rejects(
    brave.search({ query: 'waiting' }, controller.signal), code('WEB_ABORTED'),
  ))
  await assert.rejects(brave.search({ query: 'overflow' }), code('WEB_RATE_LIMITED'))
  controller.abort()
  await Promise.all(queued)
  assert.equal(fetch.mock.callCount(), 1)
})

test('times out a stalled fetch before response headers', async () => {
  mock.method(globalThis, 'fetch', (_url, init) => new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })
  }))
  await assert.rejects(provider({ timeoutMs: 10 }).search({ query: 'slow headers' }), code('WEB_TIMEOUT'))
})

test('in-flight timeout and abort during body reading are normalized', async () => {
  mock.method(globalThis, 'fetch', async (_url, init) => ({
    ok: true,
    json: () => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })),
  }))
  await assert.rejects(provider({ timeoutMs: 10 }).search({ query: 'slow body' }), code('WEB_TIMEOUT'))
  const controller = new AbortController()
  const pending = provider().search({ query: 'cancel body' }, controller.signal)
  await new Promise(resolve => setTimeout(resolve, 1))
  controller.abort()
  await assert.rejects(pending, code('WEB_ABORTED'))
})

test('network errors and invalid JSON never leak underlying error text', async () => {
  const secret = randomUUID()
  for (const response of [() => { throw Error(secret) }, () => new Response(secret), () => json({ web: { results: 'invalid' } })]) {
    mock.method(globalThis, 'fetch', response)
    await assert.rejects(provider().search({ query: 'test' }), error => {
      assert.equal(error.code, 'WEB_PROVIDER_ERROR')
      assert.equal(String(error).includes(secret), false)
      assert.equal(error.cause, undefined)
      return true
    })
    mock.restoreAll()
  }
})

test('native Cordis registration, live key update and disposal', async () => {
  const ctx = new Context()
  try {
    await ctx.plugin(WebRuntime, { searchProvider: 'brave' })
    await ctx.plugin(Loader)
    ctx.loader.builtins.brave = plugin
    const first = options()
    const id = await ctx.loader.create({ id: plugin.name, name: 'cordis:brave', config: first })
    const entry = ctx.loader.resolve(id)
    const fiber = entry.fiber
    await fiber.await()
    const seen = []
    mock.method(globalThis, 'fetch', async (_url, init) => { seen.push(init.headers['X-Subscription-Token']); return json() })
    await ctx.web.search({ query: 'first' })
    const second = options()
    await entry.update({ config: second })
    await entry.fiber.await()
    assert.equal(entry.fiber, fiber)
    await ctx.web.search({ query: 'second' })
    assert.deepEqual(seen, [first.apiKey, second.apiKey])
    await fiber.dispose()
    await assert.rejects(ctx.web.search({ query: 'disposed' }), code('WEB_PROVIDER_CONFIGURED_MISSING'))
    assert.equal(plugin.Config.dict.apiKey.meta.role, 'secret')
  } finally {
    await ctx.fiber.dispose()
  }
})
