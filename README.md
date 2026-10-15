# deepseek-harness-brave-search

Brave Search API provider for DeepSeek Harness's native `web_search` tool, with graphical settings for the API key and request limits.

**Version 0.2.1 has been tested successfully in DeepSeek Harness 0.2.0-rc.2 on Windows.**

## Requirements

- DeepSeek Harness **0.2.0-rc.2**, using a profile based on the official base bundle.
- An official Brave Search API key.
- The native `web_search` tool enabled for the agent.
- For development: Node.js `^22.19.0 || >=24.0.0` and npm.

The plugin uses the official Harness plugin APIs and does not modify the core. Peer dependencies are pinned to Harness `0.2.0-rc.2`, Cordis `4.0.4`, and Schemastery `3.18.4`. Other Harness versions require a compatibility review before changing those ranges. No compatibility overrides are required.

## Build and package

```sh
npm ci --ignore-scripts
npm run build
npm test
npm pack
```

`npm pack` creates `deepseek-harness-brave-search-0.2.1.tgz` locally; it does not publish the package. The archive includes compiled JavaScript, type declarations, the browser client bundle, the configuration patch, metadata, icon, and README. It excludes test sources, credentials, caches, and `node_modules`.

For VS Code development in WSL2, open this repository and run **Dev Containers: Reopen in Container**. The Dev Container uses Node.js 24 and installs dependencies from `package-lock.json` without running dependency scripts. You can also run the commands directly in WSL.

TypeScript is pinned to `6.0.3`, matching the Harness reference version. This repository uses npm independently of Harness's pnpm workspace. React and UI components come from Harness's shared browser module table rather than a bundled copy of React.

## Install on Windows

1. Build, test, and package the plugin using the commands above.
2. Copy the archive to a Windows path, such as `C:\Users\YOUR_USER\Downloads\deepseek-harness-brave-search-0.2.1.tgz`. Files built in WSL are accessible through `\\wsl.localhost\YOUR_DISTRO\home\YOUR_USER\projects\deepseek-harness-brave-search`. Copy the archive, not Linux's `node_modules` directory.
3. In Harness, open **Plugins → Add plugin / Install a third-party plugin** and enter the archive's absolute Windows path.
4. Review the package source, select **Install**, then **Enable now**.
5. When replacing an existing version, follow the plugin manager's update or uninstall/reinstall flow. Restart Harness completely after updating to load the new browser client, including when the manager reports `restart-required`.

The bundle selects `brave` as the native search provider and retains the base profile's `http` fetch provider. Cordis replaces the entire `config` object: if you use a different fetch provider, preserve its value in a profile override. Higher-priority profile or home overrides can take precedence over the bundle's selection.

## Configure Brave Search

1. Open **Plugins → Brave Search**. The settings form is available in the package details and through **Configure** on the `deepseek-harness-brave-search` component.
2. Enter your key in **Brave API key**. The password field starts empty; **Key configured** indicates whether a key is already stored. The saved value is never returned to the form or displayed. Leaving the field blank preserves the existing key.
3. Set **Results per query**, **Timeout (ms)**, and **Minimum request interval (ms)** as needed. **Use default** restores a field's default value. Click **Save** to apply changes.
4. To replace the key, enter a new value and click **Save**. To remove it, click **Delete key**, then **Save**. **Keep saved key** cancels a pending deletion.
5. If the form shows **Brave is not selected for web_search**, save any pending changes and click **Use Brave for web_search**. The confirmation reads **Brave is selected for web_search**. This action preserves the current fetch provider.
6. Ask the agent: “Use the native web_search tool to find the official Brave Search API documentation and show the titles and links.” A real search uses your Brave API quota; saving settings or selecting the provider does not call Brave.

No manual YAML editing is needed. Saved settings and provider selection take effect without a manual restart. Requests already in progress retain the configuration with which they started. The plugin's labels and descriptions are in English, including when Harness uses another supported locale.

| Setting | Default | Behavior |
| --- | --- | --- |
| `apiKey` | Unset | Required for searches. The saved value is hidden from the form. |
| `maxResults` | `5` | Results per query, from 1 to 20. A lower limit requested by Harness is also respected. |
| `timeoutMs` | `15000` | Total request budget, including queue time and reading the response body; 1–120000 ms. |
| `minIntervalMs` | `1100` | Minimum time between HTTP request starts per provider instance; 1–3600000 ms. Adjust to your Brave plan. |

### Storage and configuration overrides

Settings are saved to the active Harness profile through the official settings service. The API key is marked as a secret, but this **does not encrypt the profile file on disk**. The plugin never writes keys or upstream response bodies to logs. Existing `config.apiKey` settings remain compatible.

Deleting the key writes an empty value so a key inherited from a lower-priority configuration layer does not become active again. It does not remove backups or values stored in external environment files.

If saving fails, use **Reload settings** to discard the draft and read the current values. Concurrent edits can invalidate a form's configuration revision. Home or command-line overrides may prevent profile changes from taking effect; the official editor rejects those changes instead of reporting success.

The official **Web search** settings page configures the DeepSeek provider. Use **Brave Search** to configure this plugin.

The [YAML example](examples/profile.patch.yml) is an optional alternative for headless installations. When using its environment variable, ensure the Windows process that launches Harness inherits `BRAVE_SEARCH_API_KEY`; WSL environment variables are not automatically passed to Windows.

## Request handling

The provider calls only the official endpoint, `https://api.search.brave.com/res/v1/web/search`, using `X-Subscription-Token` authentication. Redirects are rejected. Results map Brave's title, URL, and description to Harness's `title`, `url`, and `snippet` fields. The native tool handles presentation and citations.

Concurrent calls wait for a request slot, with at most ten pending or active calls per instance. Waiting respects cancellation and the request timeout. HTTP 429 responses trigger a shared cooldown using `Retry-After` in seconds or HTTP-date form, falling back to 60 seconds when absent or invalid. There are no automatic retries or pagination.

Errors distinguish authentication failures, rate limits, other HTTP failures, invalid responses, timeouts, and cancellation. Upstream error bodies and transport exception details are not exposed. Results without a valid title, HTTP(S) URL, or description are discarded. Harness's `truncated` flag indicates sources omitted by a result limit, not exhaustion of all available search results.

Request spacing is local to each provider instance. Multiple applications using the same key share Brave's quota but not this local limiter. Each query can consume one Brave request, including each query in a native multi-query search.

Official references: [Brave Web Search API](https://api-dashboard.search.brave.com/api-reference/web/search/get) and [authentication](https://api-dashboard.search.brave.com/documentation/guides/authentication).

## Architecture

The implementation follows the official Harness source at tag `dsh-v0.2.0-rc.2`, commit `639ed015397290b3745d163aafe02ffee4aa3f84`. No community plugin code is used.

- `src/index.ts` registers `BraveSearchProvider` as `brave` through `ctx.web.registerSearchProvider`. Configuration fields are volatile, allowing live updates.
- `src/provider.ts` implements the Brave HTTP adapter, result conversion, cancellation, timeouts, and request limits.
- `src/settings-service.ts` exposes configuration operations through the official Typert/Gateway APIs. It persists settings with `settings.mutate` and selects Brave with `configEditor.edit`.
- `src/client/index.tsx` mounts the Remote namespace and injects `remote.braveSearchSettings` into the context that registers the `plugins.bundle.config` and `plugins.row.config` forms.
- `src/client/page.tsx` uses Harness's `SettingsForm`, `SettingsSecretField`, and `SettingsValueField` components.
- `scripts/build-client.mjs` builds the browser module factory consumed by Harness's client loader.

## Tests

```sh
npm test
```

The suite contains **28 tests** and has passed with Node.js 24.22.0. It covers:

- Brave request construction, result mapping, limits, malformed responses, HTTP errors, cooldowns, concurrency, cancellation, and timeouts.
- Native `web_search` execution and provider selection using official Harness services.
- Configuration persistence, live key updates, replacement and deletion, revision checks, and configuration overrides.
- Form interactions and the official Remote/Gateway integration.
- Client discovery, delivery, activation, slot lifecycle, and access to the Remote namespace from both forms' injected properties.

Tests use simulated HTTP responses and generated test values. They do not read real API keys or consume Brave credits. React interaction tests use substitutes for the host UI controls; client lifecycle and configuration integration tests use the official rc.2 services. Windows operation has also been confirmed manually with plugin 0.2.1 and Harness 0.2.0-rc.2.
