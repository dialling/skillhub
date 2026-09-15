import { settings } from './db'

/**
 * Message catalogue for the main process.
 *
 * Progress lines, install errors and job status are produced in the main
 * process but *displayed* in the renderer, so they must follow the UI language.
 * `settings.lang` is the single source of truth for that.
 *
 * Anything that is PERSISTED (the activity log) must not be translated here —
 * a stored string would freeze in whatever language was active when it was
 * written. Those use codes and are translated in the renderer instead.
 */
const M: Record<string, [zh: string, en: string]> = {
  /* install */
  'install.notInLibrary': ['技能不在库中，请先入库', 'Skill is not in the library yet — add the repo first'],
  'install.sourceMissing': ['本地文件缺失，请重新同步', 'Local files are missing — sync the library item again'],
  'install.noSkillFile': ['该目录下没有 SKILL.md', 'That directory has no SKILL.md'],
  'install.noAgentDir': ['无法解析该 agent 的技能目录', 'Could not resolve that agent’s skills directory'],
  'install.sharedDir': ['共享目录 {dir}', 'Shares directory {dir}'],
  'install.skippedAgent': ['跳过 {agent}', 'Skipped {agent}'],
  'install.conflict': [
    '目标已存在且不是 SkillHub 管理的技能：{path}',
    'Target exists and is not managed by SkillHub: {path}'
  ],
  'install.conflictShort': ['冲突：{path}', 'Conflict: {path}'],
  'install.done': ['已安装 {skill} → {agent}', 'Installed {skill} → {agent}'],
  'install.itemFailed': ['安装失败 {skill} → {agent}：{error}', 'Failed {skill} → {agent}: {error}'],
  'install.summary': [
    '完成：成功 {ok}，跳过 {skipped}，失败 {failed}',
    'Done: {ok} installed, {skipped} skipped, {failed} failed'
  ],

  /* library */
  'library.cloning': ['正在入库 {name}…', 'Adding {name}…'],
  'library.alreadyCloned': ['检测到已有克隆，执行更新…', 'Existing clone found — updating…'],
  'library.retryAuth': ['公开克隆失败，使用 GitHub 凭据重试…', 'Public clone failed — retrying with GitHub credentials…'],
  'library.parsing': ['正在解析技能…', 'Reading skills…'],
  'library.added': ['入库 {name}', 'Added {name}'],
  'library.addedDone': ['{name} 入库完成（{count} 个技能）', '{name} added ({count} skills)'],
  'library.addFailed': ['{name} 入库失败：{error}', 'Failed to add {name}: {error}'],
  'library.dirMissing': ['目录不存在：{dir}', 'Directory does not exist: {dir}'],
  'library.dirImported': ['导入本地目录 {dir}', 'Imported local folder {dir}'],
  'library.syncing': ['正在同步 {name}…', 'Syncing {name}…'],
  'library.synced': ['同步 {name}', 'Synced {name}'],
  'library.syncFailed': ['同步失败：{error}', 'Sync failed: {error}'],
  'library.removed': ['移出库 {name}', 'Removed {name} from the library'],
  'library.itemMissing': ['未找到库项 {id}', 'Library item {id} not found'],

  /* agents */
  'agent.customLabel': ['自定义', 'Custom'],
  'agent.customSuffix': ['{name}（自定义）', '{name} (custom)'],
  'agent.projectSuffix': ['{name} · 项目级', '{name} · project'],
  'agent.notFound': ['未找到库项', 'Library item not found'],
  'agent.dirUnresolved': ['无法解析 {name} 的目录', 'Could not resolve the directory for {name}'],

  /* github / auth */
  'auth.tokenInvalid': ['Token 无效', 'Invalid token'],
  'auth.noCredentials': ['未找到可用的 GitHub 凭据（gh CLI 未登录）', 'No usable GitHub credentials (gh CLI is not signed in)'],
  'auth.loggedIn': ['已登录 GitHub', 'Signed in to GitHub'],
  'auth.loggedInCli': ['使用 gh CLI 凭据登录', 'Signed in with gh CLI credentials'],

  /* catalog */
  'catalog.refreshDone': ['刷新星标完成', 'Star counts refreshed'],
  'catalog.loadFailed': ['读取内置目录失败', 'Failed to read the bundled catalog'],

  'translate.notConfigured': ['未启用或缺少 API Key', 'Translation is disabled or the API key is missing'],
  'translate.ok': ['连接正常', 'Connection OK'],

  'dialog.pickDirectory': ['选择目录', 'Choose a folder'],

  /* application menu */
  'menu.edit': ['编辑', 'Edit'],
  'menu.undo': ['撤销', 'Undo'],
  'menu.redo': ['重做', 'Redo'],
  'menu.cut': ['剪切', 'Cut'],
  'menu.copy': ['复制', 'Copy'],
  'menu.paste': ['粘贴', 'Paste'],
  'menu.selectAll': ['全选', 'Select All'],
  'menu.view': ['视图', 'View'],
  'menu.reload': ['重新加载', 'Reload'],
  'menu.devtools': ['开发者工具', 'Developer Tools'],
  'menu.actualSize': ['实际大小', 'Actual Size'],
  'menu.zoomIn': ['放大', 'Zoom In'],
  'menu.zoomOut': ['缩小', 'Zoom Out'],
  'menu.fullscreen': ['全屏', 'Toggle Full Screen'],
  'menu.window': ['窗口', 'Window'],
  'menu.minimize': ['最小化', 'Minimize'],
  'menu.zoomWindow': ['缩放', 'Zoom'],
  'menu.close': ['关闭', 'Close'],

  /* launch */
  'launch.skillNotInLibrary': ['该技能不在库中，请先入库', 'That skill is not in your library yet'],
  'launch.skillFilesMissing': ['本地技能文件缺失，请重新同步', 'The local skill files are missing — sync the library item'],
  'launch.agentNotLaunchable': ['该智能体没有可用的启动方式', 'This agent cannot be started automatically'],
  'launch.prompt': [
    '请使用 {skill} 技能。先阅读它的 SKILL.md，然后按我的要求执行；素材和产出都放在 ./{folder}/ 目录下。',
    'Use the {skill} skill. Read its SKILL.md first, then do what I ask; keep inputs and outputs in ./{folder}/.'
  ],
  'launch.startedCli': ['已在终端启动 {agent}', 'Started {agent} in Terminal'],
  'launch.startedApp': ['已打开 {agent}，提示词已复制到剪贴板', 'Opened {agent}; the prompt is on your clipboard'],
  'launch.detailCli': ['{command}', '{command}'],
  'launch.detailCliPrompt': ['{command} "<提示词>"', '{command} "<prompt>"'],
  'launch.detailApp': ['open -a "{app}" <工作区>', 'open -a "{app}" <workspace>'],
  'launch.noteTitle': ['## 已启用技能：{skill}', '## Active skill: {skill}'],
  'launch.noteSource': ['- 来源：{repo}', '- Source: {repo}'],
  'launch.noteFolder': ['- 工作目录：`./{folder}/`', '- Working folder: `./{folder}/`'],
  'launch.notePurpose': ['- 用途：{text}', '- Purpose: {text}'],
  'launch.noteInstruction': [
    '在本工作区中优先使用 `{skill}` 技能：先读取它的 SKILL.md，再执行我的任务。',
    'Prefer the `{skill}` skill in this workspace: read its SKILL.md first, then carry out my request.'
  ],
  'launch.startedWeb': ['已打开网页端，提示词已复制到剪贴板', 'Opened the web app; the prompt is on your clipboard'],

  /* cli */
  'cli.usage.search': ['用法：search <关键词>', 'Usage: search <term>'],
  'cli.usage.add': ['用法：add <owner/repo>', 'Usage: add <owner/repo>'],
  'cli.usage.sync': ['用法：sync <owner/repo>', 'Usage: sync <owner/repo>'],
  'cli.usage.remove': ['用法：remove <owner/repo>', 'Usage: remove <owner/repo>'],
  'cli.usage.install': ['用法：install <skillId> | --all', 'Usage: install <skillId> | --all'],
  'cli.usage.uninstall': ['用法：uninstall <skillId>', 'Usage: uninstall <skillId>'],
  'cli.usage.stars': ['用法：stars <owner/repo>', 'Usage: stars <owner/repo>']
}

/** Translate a main-process message into the active UI language. */
export function m(key: string, vars?: Record<string, string | number | undefined>): string {
  const entry = M[key]
  const lang = settings.get().lang === 'en' ? 1 : 0
  let out = entry ? entry[lang] : key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      if (v === undefined || v === null) continue
      out = out.split(`{${k}}`).join(String(v))
    }
  }
  return out
}

export function messageKeys(): string[] {
  return Object.keys(M)
}
