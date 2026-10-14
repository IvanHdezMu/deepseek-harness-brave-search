/** Register a lazy browser plugin in Harness's native bundle and row settings slots. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { remoteContribution, PLUGIN_ID } from '../settings-contract.js'
import { BraveSettingsPage } from './page.js'
import { NS, en, zh } from './locales.js'

export const inject = ['slots', 'locale', 'remote']
export async function apply(ctx: Context): Promise<void> {
  await ctx.remote.$mount(remoteContribution)
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'brave settings locale')
  // $mount publishes the namespace, but does not authorize this parent fiber
  // to read it. Inject it into a child context after mounting: requiring it in
  // the parent inject list would prevent apply() from running its own mount.
  ctx.inject(['remote.braveSearchSettings'], scope => {
    const props = () => ({ api: scope.remote.braveSearchSettings })
    scope.slots.inject('plugins.bundle.config', () => scope.slots.register({
      name: 'plugins.bundle.config', key: PLUGIN_ID, locale: NS, inject: props,
    }, BraveSettingsPage))
    scope.slots.inject('plugins.row.config', () => scope.slots.register({
      name: 'plugins.row.config', key: `${PLUGIN_ID}#${PLUGIN_ID}`, locale: NS, inject: props,
    }, BraveSettingsPage))
  })
}
