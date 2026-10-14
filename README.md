# deepseek-harness-brave-search

Plugin ESM/TypeScript que añade Brave como proveedor de la herramienta nativa `web_search` de DeepSeek Harness. No modifica el core, no crea herramientas duplicadas y no consulta Brave durante la instalación, la compilación ni las pruebas.

## Compatibilidad y arquitectura

La implementación se basa en el repositorio oficial local `../deepseek-harness`, revisión `571902028a75c64c1d767f4ae5fd099485f0ddf0`, versión `0.2.1-alpha.3`. Las dependencias peer están fijadas a esa versión y a sus versiones de Cordis/Schemastery; otras versiones de Harness necesitan revisar compatibilidad antes de cambiar los rangos. No se ha usado código de plugins comunitarios.

Referencias examinadas en ese repositorio:

- `packages/web/web/src/{index,types}.ts`: interfaz `WebSearchProvider`, `WebError`, selección y registro con limpieza automática al descargar el plugin.
- `packages/web/tool-web/src/{index,search}.ts`: herramienta nativa, búsquedas múltiples y presentación de fuentes.
- `packages/web/web-search-deepseek/src/index.ts`: proveedor oficial y configuración `Volatile` con campos secretos.
- `packages/web/web-search-exa/src/{index,provider}.ts`: ejemplo oficial de proveedor de resultados web.
- `packages/bundle/base/cordis.patch.yml`: servicios `web`, `tool-web` y selección original `deepseek-official`.
- `packages/preset/agent-preset/skills/cordis-plugin-development/references/host-plugin.md`: manifiesto de bundle, metadatos y patch de instalación.
- `packages/boot/{app-boot,plugin-manager}/README.md` y `packages/settings/settings/README.md`: instalación, perfiles y configuración.

`src/index.ts` exporta `name`, `inject`, `Config` y `apply`, y registra un `BraveSearchProvider` con id `brave` en `ctx.web`. Se reutilizan la herramienta, sus límites, citas y presentación. `src/provider.ts` realiza un GET exclusivamente a `https://api.search.brave.com/res/v1/web/search`, con autenticación `X-Subscription-Token`; rechaza redirecciones y no permite cambiar el endpoint. Devuelve `title`, `url` y `snippet` a partir de `description`. No genera respuestas ni descarga las páginas encontradas.

El bundle selecciona `searchProvider: brave` en la fila `web` y conserva `fetchProvider: http` del perfil base. No desinstala DeepSeek Search. **Cordis sustituye el objeto `config` completo**: si tu perfil tiene otro proveedor de fetch, conserva su valor en un override del perfil. Este bundle requiere un perfil basado en el bundle base; no añade los servicios que faltan en `sdk-minimal`. También requiere que el agente tenga habilitada la herramienta nativa `web_search`.

## Desarrollo en WSL2 / Dev Container

Requisitos: Node.js `^22.19.0 || >=24.0.0` (el contenedor usa Node 24), npm y la extensión Dev Containers de VS Code. El plugin usa `fetch`, `AbortController` y el runner de pruebas integrados en Node. TypeScript 6.0.3 coincide con la versión declarada por Harness; npm permite trabajar de forma independiente, sin el workspace pnpm del core.

Abre **este repositorio** desde VS Code en WSL y ejecuta **Dev Containers: Reopen in Container**. `postCreateCommand` instala desde `package-lock.json`, sin scripts de dependencias. También puedes desarrollar directamente en WSL:

```sh
npm ci --ignore-scripts
npm run build
npm test
npm pack
```

`npm pack` crea `deepseek-harness-brave-search-0.1.0.tgz` localmente; no publica nada. El paquete contiene JavaScript compilado y declaraciones, patch, metadatos, icono y README. No incluye fuentes de pruebas, claves, `.env`, cachés ni `node_modules`. Las dependencias de ejecución son únicamente las APIs oficiales de Harness; el Loader adicional se usa solo en pruebas.

## Instalación posterior en Windows

Estos pasos son para cuando decidas probarlo; durante el desarrollo no se ha instalado en Harness.

1. Compila, prueba y empaqueta en WSL o el contenedor con los comandos anteriores.
2. Copia el `.tgz` a una ruta de Windows, por ejemplo `C:\Users\TU_USUARIO\Downloads\deepseek-harness-brave-search-0.1.0.tgz`. Puedes copiarlo desde el Explorador mediante `\\wsl.localhost\NOMBRE_DISTRO\home\ivan\projects\deepseek-harness-brave-search`. No copies `node_modules` de Linux ni uses `/home/...` como ruta en la aplicación Windows.
3. En Harness abre **Plugins → Add plugin / Install a third-party plugin**, introduce la ruta absoluta del `.tgz`, revisa la procedencia y selecciona **Install**, después **Enable now**. El gestor nativo acepta tarballs y rutas locales. No se necesita `npm publish` ni instalar un plugin comunitario.
4. Configura la clave como se indica abajo. Si el gestor indica `restart-required`, cierra y vuelve a abrir Harness. Una sustitución de una versión ya instalada también requiere seguir el flujo de actualización del gestor y reiniciar según su estado.
5. Verifica que el bundle esté activo y que no aparezcan `failed`, `overridden` ni errores de compatibilidad. Un override del perfil o del home puede prevalecer sobre el bundle y mantener otro buscador.

## Configurar la API key

La clave pertenece a `config.apiKey` de la fila `deepseek-harness-brave-search`. El esquema la declara `role('secret').volatile()`: el sistema de configuración puede ocultarla en sus lecturas y actualizarla para la siguiente búsqueda. Sin clave, el proveedor queda no disponible y falla con un error de configuración, sin tráfico. El plugin no escribe logs ni incluye cuerpos HTTP o causas de errores en sus mensajes.

La vía reproducible es añadir la fila de [examples/profile.patch.yml](examples/profile.patch.yml) al `cordis.patch.yml` del perfil activo. En Desktop se encuentra en `$DSH_HOME/profiles/desktop/cordis.patch.yml`; usa el home efectivo de tu instalación, no el de WSL. Si ya existe la fila, edítala en lugar de duplicarla y conserva las demás filas. El ejemplo no contiene una clave: usa `apiKey: !!js process.env.BRAVE_SEARCH_API_KEY` para que la configuración nativa lea una variable heredada por el proceso de Windows.

Define `BRAVE_SEARCH_API_KEY` en el entorno de Windows desde el que arrancas Harness y reinicia completamente la aplicación para que la herede. Las variables de WSL o del Dev Container no llegan automáticamente al proceso Windows. No pegues el secreto en comandos que queden en el historial, capturas o archivos del repositorio. La expresión se evalúa al cargar la configuración; cambiar solo el entorno de un proceso ya iniciado no rota la clave.

También se admite una cadena literal en `config.apiKey` dentro del archivo privado del perfil, o escribir el campo mediante las APIs nativas de configuración. Una cadena literal queda persistida en la configuración de Harness: el rol secreto **no implica cifrado en disco**. La página oficial **Web search** está vinculada a `web-search-deepseek`; no configura este proveedor. Este plugin no incorpora una página de UI propia ni presupone que tu versión genere formularios para plugins nuevos.

| Campo | Valor inicial | Comportamiento |
| --- | --- | --- |
| `apiKey` | Sin valor | Clave secreta; obligatoria para buscar. |
| `timeoutMs` | 15000 | Presupuesto total por llamada, incluida espera y lectura del cuerpo; 1–120000 ms. |
| `minIntervalMs` | 1100 | Separación mínima entre inicios HTTP por instancia; 1–3600000 ms. Ajustar al plan contratado. |
| `maxResults` | 5 | Límite por consulta, entre 1 y 20; también respeta un límite menor solicitado por Harness. |

Los límites y la clave son campos volátiles. El Loader puede actualizarlos sin registrar de nuevo el proveedor. Una solicitud ya iniciada conserva su configuración hasta terminar.

## Errores y consumo

Las llamadas simultáneas esperan su turno de inicio (máximo diez llamadas pendientes/activas). La espera respeta cancelación y timeout. Un 429 activa una pausa compartida con `Retry-After` en segundos o fecha HTTP, o 60 segundos cuando falta o es inválido. No hay reintentos automáticos ni paginación. Los errores distinguen autenticación (401/403), cuota/frecuencia (429), otros HTTP, JSON/respuestas inválidas, timeout y cancelación. No se propagan cuerpos de error ni excepciones de transporte que pudieran contener datos sensibles.

El límite es local a la instancia: varias aplicaciones/procesos con la misma clave comparten la cuota remota pero no este contador. El plugin no conoce el presupuesto mensual de tu cuenta. Cada consulta válida puede consumir una solicitud de Brave; una llamada nativa con varias consultas realiza una por consulta. Se descartan resultados sin título, URL HTTP(S) o descripción válidos. El valor `truncated` sigue el significado de Harness (fuentes descartadas por límite), no indica que se hayan recorrido todas las páginas del buscador.

Referencia oficial de [Brave Web Search](https://api-dashboard.search.brave.com/api-reference/web/search/get) y [autenticación](https://api-dashboard.search.brave.com/documentation/guides/authentication). Solo se consultó documentación, no el endpoint de búsqueda.

## Pruebas y validación pendiente

Las pruebas sustituyen `fetch` por respuestas simuladas y crean valores aleatorios exclusivamente de prueba; no leen claves del entorno ni consumen créditos. Cubren transformación y límites, resultados vacíos/malformados, errores HTTP, red/JSON, pausa 429, consultas concurrentes, cancelación y timeout. Una prueba usa Cordis, WebRuntime y Loader oficiales para verificar registro, cambios de clave en caliente y limpieza al descargar el plugin.

Queda por comprobar en tu Windows: que la versión instalada sea compatible, la instalación/activación del bundle, metadatos visibles, selección efectiva de Brave, configuración del perfil y una búsqueda real desde un agente con `web_search` habilitado. Esa última prueba requiere tu autorización y clave y consumirá cuota. La imagen del Dev Container también debe arrancarse en tu VS Code; compilar y probar en WSL no equivale a verificar el contenedor ni la UI de Windows.
