# deepseek-harness-brave-search

Plugin ESM/TypeScript que añade Brave como proveedor de la herramienta nativa `web_search` de DeepSeek Harness. No modifica el core, no crea herramientas duplicadas y no consulta Brave durante la instalación, la compilación ni las pruebas.

## Compatibilidad y arquitectura

La implementación se basa en el repositorio oficial local `../deepseek-harness`, revisión `639ed015397290b3745d163aafe02ffee4aa3f84`, tag `dsh-v0.2.0-rc.2`, versión `0.2.0-rc.2`. Las dependencias peer están fijadas a esa versión y a sus versiones de Cordis/Schemastery; otras versiones de Harness necesitan revisar compatibilidad antes de cambiar los rangos. No se ha usado código de plugins comunitarios.

La versión **0.2.1** del plugin utiliza `@deepseek-ai/dsh-web@0.2.0-rc.2`, `@deepseek-ai/cordis@4.0.4` y `@deepseek-ai/schemastery@3.18.4`. Las pruebas utilizan el Loader `1.0.5` y los paquetes oficiales de herramientas `0.2.0-rc.2`. No requiere excepciones de compatibilidad ni opciones que ignoren las dependencias peer.

Se compararon las interfaces y la implementación del registro web, sus tipos, la herramienta nativa y la configuración volátil con la referencia anterior: las APIs utilizadas por este adaptador no cambiaron. Por ello se conserva íntegra la implementación Brave (HTTP, límites, errores, cancelación y configuración) y se valida con las dependencias de la versión objetivo. El patch del bundle sigue seleccionando `brave` mediante la fila `web` del perfil base.

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

`npm pack` crea `deepseek-harness-brave-search-0.2.1.tgz` localmente; no publica nada. El paquete contiene JavaScript compilado y declaraciones, la fábrica de módulos del cliente, patch, metadatos, icono y README. React y los componentes visuales se obtienen de la tabla de módulos de Harness, sin incluir otra copia de React. No incluye fuentes de pruebas, claves, `.env`, cachés ni `node_modules`. Las dependencias de ejecución son únicamente las APIs oficiales de Harness; el Loader y los paquetes de la herramienta nativa se usan solo en pruebas.

## Instalación posterior en Windows

Estos pasos son para cuando decidas probarlo; durante el desarrollo no se ha instalado en Harness.

1. Compila, prueba y empaqueta en WSL o el contenedor con los comandos anteriores.
2. Copia el `.tgz` a una ruta de Windows, por ejemplo `C:\Users\TU_USUARIO\Downloads\deepseek-harness-brave-search-0.2.1.tgz`. Puedes copiarlo desde el Explorador mediante `\\wsl.localhost\NOMBRE_DISTRO\home\ivan\projects\deepseek-harness-brave-search`. No copies `node_modules` de Linux ni uses `/home/...` como ruta en la aplicación Windows.
3. En Harness abre **Plugins → Add plugin / Install a third-party plugin**, introduce la ruta absoluta del `.tgz`, revisa la procedencia y selecciona **Install**, después **Enable now**. El gestor nativo acepta tarballs y rutas locales. No se necesita `npm publish` ni instalar un plugin comunitario.
4. Para actualizar desde 0.1.1, sigue el flujo de desinstalar/reinstalar del gestor para plugins externos y reinicia completamente Harness para cargar el nuevo módulo de cliente. Configura la clave desde la pantalla indicada abajo. Si el gestor indica `restart-required`, cierra y vuelve a abrir Harness. Una sustitución de una versión ya instalada también requiere seguir el flujo de actualización del gestor y reiniciar según su estado.
5. Verifica que el bundle esté activo y que no aparezcan `failed`, `overridden` ni errores de compatibilidad. Un override del perfil o del home puede prevalecer sobre el bundle y mantener otro buscador.

## Configuración desde la interfaz (0.2.1)

**Corrección 0.2.1:** se reprodujo el error de 0.2.0 `cannot get property "remote.braveSearchSettings" without inject`. Montar el namespace con `$mount` no autoriza al contexto padre a leerlo. Ahora ambos formularios se registran dentro de `ctx.inject(['remote.braveSearchSettings'], scope => ...)`, después del montaje, y obtienen la API desde `scope`. No se añade esa dependencia al `inject` inicial porque el propio `apply` debe ejecutarse para crear el namespace. La regresión ejecuta las funciones de propiedades de ambos slots con Cordis real: fallaba con el error original y pasa con la corrección. La comprobación visual final en Windows sigue pendiente.

1. En **Plugins**, abre el paquete **Brave Search**. La pantalla aparece en los detalles del paquete y mediante **Configure** en el componente `deepseek-harness-brave-search`.
2. Introduce la clave en **Brave API key**. El campo es de contraseña y siempre empieza vacío; **Key configured** indica si ya existe una clave, sin devolver ni mostrar su valor guardado. Dejar el campo vacío conserva la clave actual.
3. Ajusta **Results per query**, **Timeout (ms)** y **Minimum request interval (ms)** si lo necesitas. **Use default** restaura el valor inicial de cada campo; pulsa **Save** para guardar los cambios.
4. Para sustituir la clave, escribe la nueva y pulsa **Save**. Para eliminarla, pulsa **Delete key** y luego **Save**; **Keep saved key** cancela la eliminación pendiente.
5. Si aparece **Brave is not selected for web_search**, pulsa **Use Brave for web_search** después de guardar la clave y los cambios pendientes. La pantalla mostrará **Brave is selected for web_search** cuando el servicio confirme la selección. El botón conserva el resto de la configuración del servicio `web`, incluido tu proveedor de fetch.
6. Pide al agente: «Usa la herramienta nativa web_search para buscar la documentación oficial de Brave Search API y muestra los títulos y enlaces». Esta búsqueda real consume cuota; guardar los ajustes o seleccionar Brave no realiza ninguna petición a Brave.

No necesitas editar YAML para el uso normal. Los ajustes se guardan mediante `settings.mutate` en el perfil activo y se aplican mediante las referencias volátiles del plugin. La selección usa `configEditor.edit`, porque `web.searchProvider` no es volátil en Harness 0.2.0-rc.2. Las operaciones pasan por el Gateway/Remote oficial con validación de entrada; los contratos pequeños se registran mediante las APIs públicas `typert.register` y `remote.$mount`. La interfaz usa `SettingsForm`, `SettingsSecretField` y `SettingsValueField`, y se registra en `plugins.bundle.config` y `plugins.row.config`. Sus traducciones utilizan los idiomas que admite esta versión de Harness: inglés y chino.

Tras actualizar el paquete debes reiniciar Harness para cargar su cliente nuevo. Una vez cargado 0.2.1, guardar ajustes o seleccionar Brave aplica los cambios mediante la reconciliación oficial sin necesitar un reinicio manual. Una búsqueda ya iniciada conserva su configuración hasta terminar.

**Persistencia de la clave:** se conserva el campo `config.apiKey` de 0.1.1, declarado `role('secret').volatile()`, de modo que las claves ya configuradas en el perfil siguen funcionando. El servicio solo devuelve un indicador booleano. La clave se guarda en el archivo privado del perfil de Harness: el rol secreto oculta las lecturas pero **no cifra el archivo en disco**. Eliminar establece un valor vacío para evitar que reaparezca una clave heredada de una capa inferior; no borra copias anteriores ni valores de archivos de entorno externos. No se escriben claves ni cuerpos de error en los logs del plugin.

Si aparece un error al guardar, pulsa **Reload settings** y revisa de nuevo los valores; una edición simultánea puede invalidar la revisión del formulario. El botón descarta los cambios pendientes. Un override del home o de la línea de comandos puede impedir que la edición del perfil sea efectiva: el editor oficial la rechaza y la pantalla no muestra éxito. En ese caso hay que resolver ese override externo; la API pública no permite saltárselo. La página oficial **Web search** sigue configurando el proveedor DeepSeek y no esta pantalla.

El [ejemplo YAML](examples/profile.patch.yml) permanece como alternativa avanzada para instalaciones sin interfaz. No es necesario para la pantalla nueva. Si usas ese ejemplo con una variable de entorno, recuerda que el proceso Windows debe heredarla; las variables de WSL no se transmiten automáticamente.

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

### Diagnóstico si no aparece el formulario

`Running` en el gestor informa del componente host; no garantiza que su módulo de cliente haya arrancado. En rc.2, `packages/client/modules/src/client/entries.ts` mantiene por separado los fallos del cliente. El gestor obtiene los formularios de los slots registrados, mediante `config-ledger.ts`.

Después de cerrar completamente y volver a abrir Harness, abre las herramientas de desarrollo con **F12** (atajo registrado en `apps/desktop/src/main.ts` del tag rc.2). En **Console**, ejecuta esta lectura del manifiesto del cliente:

```js
JSON.stringify(window.__DSH_BOOT__?.entries?.filter(
  entry => entry.id === 'deepseek-harness-brave-search'
), null, 2)
```

El resultado solo contiene metadatos de carga, no la configuración ni la API key. `[]` indica que el manifiesto de esa ventana no contiene nuestro cliente; `undefined` indica que no hay manifiesto en el contexto de consola seleccionado. Si aparece la entrada, revisa los errores de carga/activación en Console que mencionen el paquete, `client-modules` o `braveSearchSettings`. Para continuar el diagnóstico basta ese resultado y esos errores, sin compartir configuraciones ni claves.

La prueba `test/client-loading.test.mjs` usa el descubrimiento y entrega de archivos de `ClientModuleRegistry`, el cargador `ClientEntries`, Cordis, el Gateway y `SlotRegistry` oficiales de rc.2. Verifica activación y registro diferido de los dos slots, incluso tras retirarlos y declararlos de nuevo. No ejecuta Electron ni sustituye la comprobación en Windows. Con esta prueba, la suite suma **28 pruebas correctas**. La regresión de 0.2.1 también ejecuta las funciones `inject` de los slots, que eran el punto del fallo al renderizar. Las pruebas anteriores solo comprobaban su registro o usaban un contexto simulado y no detectaban la falta de autorización de Cordis.

Las pruebas sustituyen `fetch` por respuestas simuladas y crean valores aleatorios exclusivamente de prueba; no leen claves del entorno ni consumen créditos. Cubren transformación y límites, resultados vacíos/malformados, errores HTTP, red/JSON, pausa 429, consultas concurrentes, cancelación y timeout. Una prueba usa Cordis, WebRuntime y Loader oficiales para verificar registro, cambios de clave en caliente y limpieza al descargar el plugin.

Validación de 0.2.1: compilación TypeScript y **28 pruebas correctas** con Node 24.22.0. Se mantienen las 20 pruebas anteriores, incluida la ejecución nativa de `web_search`. Las nuevas pruebas cubren el contrato y las interacciones del formulario, los límites, el borrado de secretos, los cambios de revisión y la selección del proveedor. Un perfil temporal real utiliza `boot`, Loader, Settings, ConfigEditor, Typert y Gateway de 0.2.0-rc.2 para verificar persistencia, recarga y rechazo de overrides del home. Otra prueba carga el artefacto del cliente Gateway oficial y llama al servicio del plugin a través del transporte simulado. Las pruebas React cargan el bundle final del plugin y usan controles sustitutos con las mismas propiedades públicas; comprueban las interacciones, no el aspecto visual en Windows. No se hacen llamadas reales a Brave.

Queda por comprobar en tu Windows: que la versión instalada sea compatible, la instalación/activación del bundle, metadatos visibles, selección efectiva de Brave, la pantalla de ajustes y una búsqueda real desde un agente con `web_search` habilitado. Esa última prueba requiere tu autorización y clave y consumirá cuota. La imagen del Dev Container también debe arrancarse en tu VS Code; compilar y probar en WSL no equivale a verificar el contenedor ni la UI de Windows.
