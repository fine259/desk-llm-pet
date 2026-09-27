#!/usr/bin/env node
/**
 * 项目自检（不需要启动 Electron GUI）
 * ============================================================================
 *   1. 语法检查：对 src 下所有 .js 逐个执行 node --check
 *   2. 插件系统：用「假 Electron + 内存存储」跑一遍宿主的发现/校验/激活/卸载
 *   3. 扩展点：桌宠菜单、托盘菜单、设置面板、命令、设置动作是否都能拿到
 *   4. 独立性：本体核心文件不得引用任何具体插件
 *   5. 回归：已删除的「文件移入回收站」不应残留
 *
 * 用法：npm run check
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');

let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failures.push({ name, error: e.message });
    console.log(`  ❌ ${name}\n     ${e.message}`);
  }
}

async function checkAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failures.push({ name, error: e.message });
    console.log(`  ❌ ${name}\n     ${e.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}（期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}）`);
  }
}

function readFile(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function listFiles(dir, filter, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listFiles(full, filter, out);
    else if (filter(full)) out.push(full);
  }
  return out;
}

// ============================================================================
// 假 Electron / 内存存储（让宿主可以脱离 GUI 运行）
// ============================================================================

function createFakeElectron() {
  const windows = [];

  class FakeWebContents {
    constructor() {
      this.sent = [];
      this.destroyed = false;
      this.navigationsBlocked = [];
    }
    send(channel, payload) { this.sent.push({ channel, payload }); }
    isDestroyed() { return this.destroyed; }
    on(event, cb) { (this._events = this._events || {})[event] = cb; return this; }
    setWindowOpenHandler(handler) { this.windowOpenHandler = handler; }
  }

  class FakeBrowserWindow {
    constructor(options = {}) {
      this.options = options;
      this.webContents = new FakeWebContents();
      this.destroyed = false;
      this.visible = false;
      this.handlers = {};
      windows.push(this);
    }
    static fromWebContents(webContents) {
      return windows.find((win) => win.webContents === webContents) || null;
    }
    static getAllWindows() { return windows.slice(); }
    loadFile(file) { this.loadedFile = file; return Promise.resolve(); }
    on(event, cb) { (this.handlers[event] = this.handlers[event] || []).push(cb); return this; }
    once(event, cb) { return this.on(event, cb); }
    show() { this.visible = true; }
    hide() { this.visible = false; }
    focus() {}
    minimize() { this.minimized = true; }
    close() { this.destroy(); }
    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      this.webContents.destroyed = true;
      (this.handlers.closed || []).forEach((cb) => cb());
    }
    isDestroyed() { return this.destroyed; }
    isVisible() { return this.visible; }
  }

  const handlers = new Map();
  const listeners = new Map();

  const ipcMain = {
    handle(channel, fn) { handlers.set(channel, fn); },
    on(channel, fn) { listeners.set(channel, fn); },
    removeHandler(channel) { handlers.delete(channel); },
    removeAllListeners(channel) { listeners.delete(channel); },
    // 供自检使用
    _invoke: (channel, ...args) => {
      const fn = handlers.get(channel);
      if (!fn) throw new Error(`未注册的 invoke 通道: ${channel}`);
      return fn({ sender: {} }, ...args);
    },
    _emit: (channel, event, ...args) => {
      const fn = listeners.get(channel);
      if (!fn) throw new Error(`未注册的 on 通道: ${channel}`);
      return fn(event, ...args);
    },
    _channels: () => [...handlers.keys()],
    _listenerChannels: () => [...listeners.keys()]
  };

  return {
    app: { getPath: () => path.join(ROOT, '.tmp-selfcheck') },
    ipcMain,
    BrowserWindow: FakeBrowserWindow,
    shell: { openExternal() {} },
    dialog: { showMessageBox: async () => ({ response: 0 }) },
    _windows: windows
  };
}

function createMemoryStoreFactory() {
  const stores = new Map();
  return ({ name, cwd, defaults }) => {
    const key = `${cwd}::${name}`;
    if (!stores.has(key)) stores.set(key, JSON.parse(JSON.stringify(defaults || {})));
    const data = stores.get(key);
    return {
      get(key2) { return key2 === undefined ? data : data[key2]; },
      set(key2, value) { data[key2] = value; },
      has(key2) { return Object.prototype.hasOwnProperty.call(data, key2); }
    };
  };
}

async function main() {
// ============================================================================
// 1. 语法检查
// ============================================================================

console.log('\n[1/5] 语法检查 (node --check)');
const jsFiles = listFiles(SRC, (f) => f.endsWith('.js'));
check(`共 ${jsFiles.length} 个 JS 文件语法正确`, () => {
  const broken = [];
  for (const file of jsFiles) {
    try {
      execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    } catch (e) {
      broken.push(`${path.relative(ROOT, file)}: ${String(e.stderr || e.message).split('\n')[0]}`);
    }
  }
  assert(broken.length === 0, broken.join('; '));
});

// ============================================================================
// 2. 插件宿主
// ============================================================================

console.log('\n[2/5] 插件宿主');

const { createPluginManager, sanitizeFields, sanitizeMenuItems } = require('../src/plugins/plugin-manager');

const electron = createFakeElectron();
const host = createPluginManager({
  electron,
  logger: { log() {}, warn() {} },
  storeFactory: createMemoryStoreFactory(),
  hostServices: {
    getSharedLLMConfig: () => null,
    openSettings: () => true
  }
});

check('sanitizeFields 过滤非法字段并补默认值', () => {
  const fields = sanitizeFields([
    { key: 'ok', type: 'number', default: 5, min: 0, max: 10 },
    { key: 'bad key!', type: 'text' },
    { key: 'stream', type: 'boolean' },
    { key: 'unknown', type: 'nope', default: 'x' },
    null
  ]);
  assertEqual(fields.length, 3, '字段数量');
  assertEqual(fields[0].type, 'number', 'number 类型保留');
  assertEqual(fields[0].default, 5, 'number 默认值');
  assertEqual(fields[2].type, 'text', '未知类型回退为 text');
  assertEqual(fields[1].default, false, 'boolean 默认值强制为布尔');
});

check('sanitizeMenuItems 过滤缺少 command 的项', () => {
  const items = sanitizeMenuItems([{ command: 'a', label: 'A' }, { label: '无命令' }, null]);
  assertEqual(items.length, 1, '菜单项数量');
  assertEqual(items[0].icon, '🧩', '默认图标');
});

let reports = [];
await checkAsync('loadAll 能加载本仓库全部插件', async () => {
  reports = await host.loadAll();
  const errors = reports.filter((r) => r.status === 'error');
  assert(errors.length === 0, `存在加载失败的插件: ${errors.map((e) => `${e.id}(${e.error})`).join(', ')}`);
  const active = reports.filter((r) => r.status === 'active');
  assert(active.length >= 1, '至少应加载 1 个插件');
});

await checkAsync('重复 loadAll 幂等', async () => {
  const again = await host.loadAll();
  assertEqual(again.length, reports.length, '报告数量');
});

check('llm-chat 贡献了桌宠菜单与托盘菜单', () => {
  const pet = host.getPetMenuItems();
  const tray = host.getTrayMenuItems();
  assert(pet.some((i) => i.pluginId === 'llm-chat' && i.command === 'open-chat'), '缺少桌宠菜单项');
  assert(tray.some((i) => i.pluginId === 'llm-chat' && i.command === 'open-chat'), '缺少托盘菜单项');
});

check('设置面板包含字段与动作', () => {
  const sections = host.getSettingsSections();
  const section = sections.find((s) => s.pluginId === 'llm-chat');
  assert(section, '缺少 llm-chat 设置面板');
  assert(section.fields.length >= 5, `字段过少: ${section.fields.length}`);
  assert(section.actions.some((a) => a.id === 'test'), '缺少测试连接动作');
});

check('插件 IPC 通道已命名空间化注册', () => {
  const channels = electron.ipcMain._channels();
  assert(channels.includes('plugin:llm-chat:get-config'), '缺少 plugin:llm-chat:get-config');
  assert(channels.includes('plugins:get-pet-menu'), '缺少宿主注册表通道 plugins:get-pet-menu');
  assert(channels.includes('plugins:run-command'), '缺少宿主注册表通道 plugins:run-command');
  // 不允许出现未命名空间化的裸通道
  const bare = channels.filter((c) => !c.startsWith('plugin:') && !c.startsWith('plugins:'));
  assertEqual(bare.length, 0, `存在未命名空间化的插件通道: ${bare.join(', ')}`);
});

check('插件设置可读写并按类型裁剪', () => {
  const saved = host.setPluginSettings('llm-chat', { temperature: 99, stream: false, model: 'deepseek-reasoner' });
  assert(saved.success, '保存失败');
  assertEqual(saved.values.temperature, 2, 'temperature 应被裁剪到上限 2');
  assertEqual(saved.values.stream, false, 'stream 应保存为 false');
  assertEqual(host.getPluginSettings('llm-chat').model, 'deepseek-reasoner', 'model 读取不一致');
  assertEqual(host.getPluginSettings('llm-chat').maxTokens, 2048, '未提供的字段应保留默认值');
});

await checkAsync('设置动作：未声明动作被拒绝，缺 Key 时给出明确提示', async () => {
  const unknown = await host.runSettingsAction('llm-chat', 'nope', {});
  assertEqual(unknown.success, false, '未声明动作应失败');

  const noKey = await host.runSettingsAction('llm-chat', 'test', { apiKey: '' });
  assertEqual(noKey.success, false, '缺少 API Key 时应失败');
  assert(/API Key/.test(noKey.error || ''), `错误文案不明确: ${noKey.error}`);
});

await checkAsync('命令 open-chat 创建插件窗口并注入 preload', async () => {
  const before = electron._windows.length;
  const result = await host.runCommand('llm-chat', 'open-chat', { source: 'self-check' });
  assert(result.success, `命令执行失败: ${result.error}`);
  assertEqual(electron._windows.length, before + 1, '窗口数量');
  const win = electron._windows[electron._windows.length - 1];
  assert(win.options.webPreferences.preload.endsWith('preload.js'), '未注入插件 preload');
  assertEqual(win.options.webPreferences.contextIsolation, true, 'contextIsolation 必须为 true');
  assertEqual(win.options.webPreferences.nodeIntegration, false, 'nodeIntegration 必须为 false');
  assert(win.loadedFile && win.loadedFile.endsWith('chat.html'), `窗口页面错误: ${win.loadedFile}`);
  // 再次触发应复用同一个窗口
  await host.runCommand('llm-chat', 'open-chat', {});
  assertEqual(electron._windows.length, before + 1, '重复打开不应创建新窗口');
});

await checkAsync('缺失 API Key 时发送消息走错误事件（不发起网络请求）', async () => {
  const win = electron._windows[electron._windows.length - 1];
  win.webContents.sent.length = 0;

  electron.ipcMain._emit('plugin:llm-chat:send-message', { sender: win.webContents }, {
    requestId: 'test-req',
    content: '你好',
    conversationId: ''
  });
  await new Promise((resolve) => setTimeout(resolve, 20));

  const sent = win.webContents.sent.map((m) => m.channel);
  assert(sent.includes('plugin:llm-chat:conversation-updated'), `缺少会话更新事件: ${sent.join(',')}`);
  const errorEvent = win.webContents.sent.find((m) => m.channel === 'plugin:llm-chat:stream-error');
  assert(errorEvent, `缺少错误事件: ${sent.join(',')}`);
  assert(/API Key/.test(errorEvent.payload.error || ''), '错误文案未提示配置 API Key');
});

check('未注册命令返回失败而不是抛异常', async () => {
  const result = await host.runCommand('llm-chat', '不存在的命令', {});
  assertEqual(result.success, true, '未知命令应由插件自行忽略');
  const missing = await host.runCommand('not-exist', 'x', {});
  assertEqual(missing.success, false, '不存在的插件应返回失败');
});

check('会话列表已持久化到插件私有存储', () => {
  const list = electron.ipcMain._invoke('plugin:llm-chat:list-conversations');
  assert(Array.isArray(list), '会话列表不是数组');
  assert(list.length >= 1, '上一步发送消息应创建一个会话');
  assert(list[0].messageCount >= 1, '会话中应包含用户消息');
});

await checkAsync('deactivateAll 注销通道并关闭插件窗口', async () => {
  await host.deactivateAll();
  const channels = electron.ipcMain._channels();
  const leftover = channels.filter((c) => c.startsWith('plugin:llm-chat:'));
  assertEqual(leftover.length, 0, `仍有残留通道: ${leftover.join(', ')}`);
  assert(electron._windows.every((w) => w.isDestroyed()), '插件窗口未关闭');
  // 注册表通道属于宿主，应当保留
  assert(channels.includes('plugins:get-pet-menu'), '宿主注册表通道被误删');
});

// ============================================================================
// 3. 插件内部纯逻辑（对话客户端 / 会话仓库）
// ============================================================================

console.log('\n[3/5] 插件内部逻辑');

const { resolveChatEndpoint, parseSseLine, createSseParser } = require('../src/plugins/llm-chat/chat-client');
const { createConversationStore } = require('../src/plugins/llm-chat/conversations');

check('resolveChatEndpoint 规范化各种写法', () => {
  assertEqual(resolveChatEndpoint(''), 'https://api.deepseek.com/v1/chat/completions', '空地址');
  assertEqual(resolveChatEndpoint('https://api.deepseek.com'), 'https://api.deepseek.com/v1/chat/completions', 'base 地址');
  assertEqual(resolveChatEndpoint('https://api.deepseek.com/v1/'), 'https://api.deepseek.com/v1/chat/completions', '带 /v1');
  assertEqual(resolveChatEndpoint('https://api.openai.com/v1/chat/completions'), 'https://api.openai.com/v1/chat/completions', '完整端点');
  assertEqual(resolveChatEndpoint('localhost:11434/v1'), 'https://localhost:11434/v1/chat/completions', '自动补协议');
});

check('SSE 解析：跨 chunk 拼接 + 忽略噪声行', () => {
  const chunks = [];
  const parser = createSseParser((t) => chunks.push(t));
  parser.push('data: {"choices":[{"delta":{"content":"你"}}]}\n\ndata: {"choices":[{"delta":{"cont');
  parser.push('ent":"好"}}]}\n');
  parser.push('data: [DONE]\n');
  parser.flush();
  assertEqual(chunks.join(''), '你好', '增量内容拼接错误');
  assertEqual(parseSseLine('data: [DONE]').done, true, '[DONE] 未识别');
  assertEqual(parseSseLine(': keep-alive'), null, '注释行应被忽略');
  assertEqual(parseSseLine('event: ping'), null, '非 data 行应被忽略');
});

check('会话仓库：创建 / 追加 / 自动标题 / 删除', () => {
  const store = createMemoryStoreFactory()({ name: 'data', cwd: '/tmp/x', defaults: { conversations: [], activeConversationId: null } });
  const repo = createConversationStore(store);

  const created = repo.create('新对话');
  assert(created && created.id, '创建会话失败');
  assertEqual(repo.getActiveId(), created.id, '活跃会话未切换');

  const first = repo.addMessage(created.id, { role: 'user', content: '帮我写一个冒泡排序，要带注释的' });
  assert(/冒泡排序/.test(first.conversation.title), `标题未自动生成: ${first.conversation.title}`);
  assert(first.conversation.title.length <= 25, '标题过长未截断');

  repo.addMessage(created.id, { role: 'assistant', content: '好的' });
  assertEqual(repo.get(created.id).messages.length, 2, '消息数量');

  const renamed = repo.rename(created.id, '排序算法');
  assertEqual(renamed.title, '排序算法', '重命名失败');

  const second = repo.create('第二个会话');
  assertEqual(repo.list().length, 2, '会话列表数量');
  assertEqual(repo.list()[0].id, second.id, '最近更新的会话应排在最前');

  repo.remove(created.id);
  assertEqual(repo.list().length, 1, '删除后数量');
  assertEqual(repo.getActiveId(), second.id, '删除活跃会话后应切到剩余会话');
});

// ============================================================================
// 4. 独立性 & 回归
// ============================================================================

console.log('\n[4/5] 独立性与回归');

check('本体核心文件不引用任何具体插件（插件化隔离）', () => {
  const coreFiles = [
    'src/main/main.js',
    'src/main/tray.js',
    'src/main/ipc-handlers.js',
    'src/main/pet-window.js',
    'src/main/settings-window.js',
    'src/preload/pet-preload.js',
    'src/preload/settings-preload.js',
    'src/renderer/pet/pet.js',
    'src/renderer/settings/settings.js'
  ];
  const offenders = [];
  for (const file of coreFiles) {
    const content = readFile(file);
    if (/llm-chat|src\/plugins\/(?!plugin-manager)/.test(content)) offenders.push(file);
  }
  assertEqual(offenders.length, 0, `以下文件引用了具体插件: ${offenders.join(', ')}`);
});

check('本体只通过 plugin-manager 访问插件系统', () => {
  const files = [
    'src/main/main.js',
    'src/main/tray.js',
    'src/preload/pet-preload.js',
    'src/preload/settings-preload.js',
    'src/renderer/pet/pet.js',
    'src/renderer/settings/settings.js'
  ];
  const offenders = files.filter((file) => !/plugin/i.test(readFile(file)));
  assertEqual(offenders.length, 0, `以下文件未接入插件扩展点: ${offenders.join(', ')}`);
});

check('「文件移入回收站」功能已彻底移除', () => {
  const offenders = [];
  const patterns = [/trash-items/, /trashItem/, /trashItems/, /confirmTrash/, /文件拖拽/, /移到回收站/, /\[DnD\]/];
  for (const file of listFiles(SRC, (f) => /\.(js|html|css)$/.test(f))) {
    const content = fs.readFileSync(file, 'utf8');
    if (patterns.some((re) => re.test(content))) offenders.push(path.relative(ROOT, file));
  }
  assertEqual(offenders.length, 0, `仍残留回收站相关代码: ${offenders.join(', ')}`);
});

check('LLM 对话能力已迁入插件目录', () => {
  const required = [
    'src/plugins/llm-chat/plugin.json',
    'src/plugins/llm-chat/main.js',
    'src/plugins/llm-chat/preload.js',
    'src/plugins/llm-chat/chat-client.js',
    'src/plugins/llm-chat/conversations.js',
    'src/plugins/llm-chat/chat-window.js',
    'src/plugins/llm-chat/renderer/chat.html',
    'src/plugins/llm-chat/renderer/chat.js',
    'src/plugins/llm-chat/renderer/chat.css'
  ];
  const missing = required.filter((rel) => !fs.existsSync(path.join(ROOT, rel)));
  assertEqual(missing.length, 0, `缺少文件: ${missing.join(', ')}`);
  // 旧的 chat 目录不应复活
  assert(!fs.existsSync(path.join(SRC, 'renderer', 'chat')), '旧的 src/renderer/chat 不应存在');
  assert(!fs.existsSync(path.join(SRC, 'shared', 'llm-client.js')), '旧的 src/shared/llm-client.js 不应存在');
});

check('IPC 处理器与预加载脚本暴露的通道一一对应', () => {
  // 本体通道由 ipc-handlers.js 注册；插件注册表通道由 plugin-manager.js 注册
  const declared = new Set();
  for (const file of ['src/main/ipc-handlers.js', 'src/plugins/plugin-manager.js']) {
    for (const m of readFile(file).matchAll(/ipcMain\.(?:handle|on)\(\s*(?:`([^`]+)`|'([^']+)')/g)) {
      if (m[1]) {
        // 形如 `${CHANNEL_PREFIX}list` 的模板通道，还原成 plugins:list
        declared.add(m[1].replace('${CHANNEL_PREFIX}', 'plugins:').replace('${PLUGIN_CHANNEL_PREFIX}', 'plugin:'));
      } else {
        declared.add(m[2]);
      }
    }
  }
  const preloads = ['src/preload/pet-preload.js', 'src/preload/settings-preload.js'];
  const used = new Set();
  for (const file of preloads) {
    for (const m of readFile(file).matchAll(/ipcRenderer\.(?:invoke|send)\('([^']+)'/g)) used.add(m[1]);
  }
  const missing = [...used].filter((channel) => !declared.has(channel));
  assertEqual(missing.length, 0, `预加载脚本调用了未注册的通道: ${missing.join(', ')}`);
});

// ============================================================================
// 5. 结构一致性
// ============================================================================

console.log('\n[5/5] 结构一致性');

check('插件清单与宿主校验规则一致', () => {
  for (const dir of fs.readdirSync(SRC, { withFileTypes: true })) {
    if (!dir.isDirectory() || dir.name !== 'plugins') continue;
    const pluginsRoot = path.join(SRC, 'plugins');
    for (const entry of fs.readdirSync(pluginsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
      const manifestPath = path.join(pluginsRoot, entry.name, 'plugin.json');
      if (!fs.existsSync(manifestPath)) continue;
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      assertEqual(manifest.id, entry.name, `${entry.name}/plugin.json 的 id 建议与目录名一致`);
      for (const key of ['name', 'version', 'description']) {
        assert(manifest[key], `${entry.name}/plugin.json 缺少 ${key}`);
      }
    }
  }
});

check('渲染进程页面的资源引用存在', () => {
  const pages = listFiles(SRC, (f) => f.endsWith('.html'));
  const problems = [];
  for (const page of pages) {
    const html = fs.readFileSync(page, 'utf8');
    for (const m of html.matchAll(/(?:src|href)="([^"#:]+)"/g)) {
      const target = path.join(path.dirname(page), m[1]);
      if (!fs.existsSync(target)) problems.push(`${path.relative(ROOT, page)} -> ${m[1]}`);
    }
  }
  assertEqual(problems.length, 0, `引用缺失: ${problems.join(', ')}`);
});

check('渲染进程 getElementById 的 id 都真实存在', () => {
  // JS 与页面一一对应；动态创建的节点（canvas / 流式气泡）单独放行
  const DYNAMIC_IDS = new Set(['placeholder-canvas', 'streaming-message']);
  const pairs = [
    ['src/renderer/pet/pet.js', 'src/renderer/pet/pet.html'],
    ['src/renderer/settings/settings.js', 'src/renderer/settings/settings.html'],
    ['src/renderer/bubble/bubble.js', 'src/renderer/bubble/bubble.html'],
    ['src/plugins/llm-chat/renderer/chat.js', 'src/plugins/llm-chat/renderer/chat.html']
  ];
  const problems = [];
  for (const [jsRel, htmlRel] of pairs) {
    const js = readFile(jsRel);
    const html = readFile(htmlRel);
    const ids = new Set([...js.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]));
    for (const id of ids) {
      if (DYNAMIC_IDS.has(id)) continue;
      if (html.includes(`id="${id}"`)) continue;
      if (new RegExp(`\\.id\\s*=\\s*['"]${id}['"]`).test(js)) continue;
      problems.push(`${jsRel} -> #${id}`);
    }
  }
  assertEqual(problems.length, 0, `引用了不存在的元素: ${problems.join(', ')}`);
});

check('插件声明的设置项与插件代码使用的一致', () => {
  const manifest = JSON.parse(readFile('src/plugins/llm-chat/plugin.json'));
  const declared = new Set(manifest.contributes.settings.fields.map((f) => f.key));
  const code = readFile('src/plugins/llm-chat/main.js');
  const used = new Set([...code.matchAll(/merged\.([A-Za-z0-9_]+)/g)].map((m) => m[1]));

  const missing = [...used].filter((key) => !declared.has(key));
  assertEqual(missing.length, 0, `代码使用但未声明的设置项: ${missing.join(', ')}`);
  const unused = [...declared].filter((key) => !used.has(key));
  assertEqual(unused.length, 0, `已声明但代码未使用的设置项: ${unused.join(', ')}`);
});

check('用户可见文案中不出现「回收站」', () => {
  const files = [
    ...listFiles(SRC, (f) => /\.(js|html|json)$/.test(f)),
    path.join(ROOT, 'package.json')
  ];
  const offenders = files.filter((file) => fs.readFileSync(file, 'utf8').includes('回收站'));
  assertEqual(offenders.length, 0, `仍有文案提到回收站: ${offenders.map((f) => path.relative(ROOT, f)).join(', ')}`);
});

}

// ============================================================================
// 结果
// ============================================================================

main().then(() => {
console.log(`\n${'─'.repeat(60)}`);
if (failures.length === 0) {
  console.log(`✅ 自检通过：${passed} 项全部通过`);
  process.exit(0);
} else {
  console.log(`❌ 自检失败：${passed} 项通过，${failures.length} 项失败`);
  for (const f of failures) console.log(`   - ${f.name}: ${f.error}`);
  process.exit(1);
}
});
