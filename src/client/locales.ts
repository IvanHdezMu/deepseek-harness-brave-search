export const NS = 'braveSearch.settings'
export const en = {
  title: 'Brave Search', description: 'Configure Brave Search for the native web_search tool.',
  apiKey: 'Brave API key', keyHint: 'Leave blank to keep the saved key. The saved value is never displayed.',
  configured: 'Key configured', missing: 'No key configured', deleteKey: 'Delete key',
  deleting: 'Key will be deleted when you save.', cancelDelete: 'Keep saved key',
  maxResults: 'Results per query', timeoutMs: 'Timeout (ms)', minIntervalMs: 'Minimum request interval (ms)',
  range: 'Enter an integer within the allowed range.', reset: 'Use default', overridden: 'Changed',
  unavailable: 'Settings are unavailable. Check that the plugin is running and reload.', readOnly: 'Settings are read-only.',
  save: 'Save', saving: 'Saving…', saveFailed: 'Could not apply the change. Reload, check values and higher-priority configuration overrides.',
  reload: 'Reload settings', saved: 'Settings saved.', selected: 'Brave is selected for web_search.',
  notSelected: 'Brave is not selected for web_search.', select: 'Use Brave for web_search',
  selectionHint: 'Save pending changes first. Selecting Brave preserves your fetch provider.',
}
export type TextKey = keyof typeof en
export const zh: Record<TextKey, string> = {
  title: 'Brave Search', description: '为原生 web_search 工具配置 Brave Search。',
  apiKey: 'Brave API 密钥', keyHint: '留空保留已保存的密钥。不会显示已保存的值。',
  configured: '已配置密钥', missing: '尚未配置密钥', deleteKey: '删除密钥',
  deleting: '保存时将删除密钥。', cancelDelete: '保留已保存的密钥',
  maxResults: '每次查询的结果数', timeoutMs: '超时（毫秒）', minIntervalMs: '最小请求间隔（毫秒）',
  range: '请输入允许范围内的整数。', reset: '使用默认值', overridden: '已修改',
  unavailable: '设置不可用。请确认插件已运行并重新加载。', readOnly: '设置为只读。',
  save: '保存', saving: '正在保存…', saveFailed: '无法应用更改。请重新加载并检查数值及优先级更高的配置。',
  reload: '重新加载设置', saved: '设置已保存。', selected: 'web_search 已选择 Brave。',
  notSelected: 'web_search 尚未选择 Brave。', select: '为 web_search 使用 Brave',
  selectionHint: '请先保存待处理的更改。选择 Brave 不会更改抓取服务。',
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'braveSearch.settings': TextKey }
}
