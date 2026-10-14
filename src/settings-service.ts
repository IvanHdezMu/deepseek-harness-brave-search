/** Host-side settings operations; persistence belongs to Harness, never this plugin. */
import type { Context } from '@deepseek-ai/cordis'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-config-editor'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-typert-registry'
import type { Config } from './index.js'
import { descriptors, PLUGIN_ID, SETTINGS_SERVICE, parseSave } from './settings-contract.js'
import type { SaveSettings, SettingsState } from './settings-contract.js'

export class BraveSettingsService extends TypertRemoteService {
  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, SETTINGS_SERVICE)
    ctx.typert.register({ package: PLUGIN_ID, face: 'host', schemas: [],
      model: { services: [], events: [], objects: [] }, invocations: descriptors })
  }

  @Remote
  getState(): SettingsState {
    const descriptor = this.ctx.settings.describe({ redactSecrets: true }).find(row => row.ns === PLUGIN_ID)
    if (!descriptor) throw new RemoteError('gateway/bad-request', 'Brave settings are unavailable.', {})
    const web = this.webEntry()
    return {
      maxResults: this.config.maxResults.get(), timeoutMs: this.config.timeoutMs.get(),
      minIntervalMs: this.config.minIntervalMs.get(), configured: Boolean(this.config.apiKey.get()?.trim()),
      revision: descriptor.revision,
      selected: (web?.fiber?.config?.searchProvider ?? process.env.DSH_WEB_SEARCH_PROVIDER) === 'brave',
    }
  }

  @Remote
  async save(request: SaveSettings): Promise<SettingsState> {
    try {
      const next = parseSave(request)
      await this.ctx.settings.mutate(PLUGIN_ID, [
        { op: 'set', path: ['maxResults'], value: next.maxResults },
        { op: 'set', path: ['timeoutMs'], value: next.timeoutMs },
        { op: 'set', path: ['minIntervalMs'], value: next.minIntervalMs },
        ...(next.keyAction === 'keep' ? [] : [{ op: 'set' as const, path: ['apiKey'], value: next.keyAction === 'delete' ? '' : next.key! }]),
      ], next.revision)
    } catch {
      // Validation and transport diagnostics must not echo a submitted secret.
      throw new RemoteError('gateway/bad-request', 'Could not save Brave settings. Reload the form; check values and higher-priority overrides.', {})
    }
    return this.getState()
  }

  @Remote
  async selectBrave(): Promise<SettingsState> {
    const entry = this.webEntry()
    if (!entry) throw new RemoteError('gateway/bad-request', 'The native web service is unavailable.', {})
    try {
      await this.ctx.configEditor.edit(entry, current => ({ ...current, searchProvider: 'brave' }))
    } catch {
      throw new RemoteError('gateway/bad-request', 'Could not select Brave. A home patch or command-line override may take precedence.', {})
    }
    return this.getState()
  }

  private webEntry() {
    return this.ctx.configEditor.entries().find(entry => entry.options.id === 'web' && entry.options.name === '@deepseek-ai/dsh-web')
  }
}
