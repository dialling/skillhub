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
  'library.addedDone': ['{name} 入库完成（{count} 个技能）', '{name} added ({count} skills)'],
  'library.addFailed': ['{name} 入库失败：{error}', 'Failed to add {name}: {error}'],
  'library.dirMissing': ['目录不存在：{dir}', 'Directory does not exist: {dir}'],
  'library.syncing': ['正在同步 {name}…', 'Syncing {name}…'],
  'library.synced': ['同步 {name}', 'Synced {name}'],
  'library.syncFailed': ['同步失败：{error}', 'Sync failed: {error}'],
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

  /* catalog */


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
  'launch.noteLocalSource': ['- 来源：本机已有技能 `{path}`', '- Source: skill already on this machine at `{path}`'],
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
  'cli.usage.stars': ['用法：stars <owner/repo>', 'Usage: stars <owner/repo>'],
  /* startup */
  'boot.nodeModeDetail': [
    'Electron 以纯 Node 模式启动。\n\n启动它的环境里设置了 ELECTRON_RUN_AS_NODE，这会关闭 Electron 运行时，\n所有 app.* 调用都会是 undefined。\n\n请从访达或程序坞启动，或先清掉这个变量：\n  env -u ELECTRON_RUN_AS_NODE open -a SkillHub',
    'Electron started in Node mode.\n\nELECTRON_RUN_AS_NODE is set in the environment that launched this app, which\ndisables the Electron runtime and leaves every app.* call undefined.\n\nLaunch it from the Finder or the Dock, or clear the variable first:\n  env -u ELECTRON_RUN_AS_NODE open -a SkillHub'
  ],
  'boot.nodeModeTitle': ['SkillHub 无法启动', 'SkillHub could not start'],
  'boot.ok': ['好', 'OK'],

  /* submissions */
  'submit.readFailed': ['无法读取技能目录：{msg}', 'Could not read the skill folder: {msg}'],
  'submit.empty': ['这个目录是空的', 'That folder is empty'],
  'submit.noSkillFile': ['这个目录里没有 SKILL.md，不是一个技能', 'No SKILL.md in that folder — it is not a skill'],
  'submit.tooManyFiles': ['文件太多（{n} 个，上限 {max}）', 'Too many files ({n}, limit {max})'],
  'submit.tooLarge': ['体积过大（超过 {mb} MB）', 'Too large (over {mb} MB)'],
  'submit.partial': ['上传了 {n} 个文件后中断：{msg}', 'Uploaded {n} files, then stopped: {msg}'],
  'submit.failed': ['上传失败：{msg}', 'Upload failed: {msg}'],
  'submit.noTextFiles': ['这个目录里没有可提交的文本文件', 'No submittable text files in that folder'],
  'submit.doneSkipped': ['已上传 {n} 个文本文件到 submissions/{slug}/，跳过 {skipped} 个媒体或大文件', 'Uploaded {n} text files to submissions/{slug}/, skipped {skipped} media or oversized files'],
  'submit.done': ['已上传 {n} 个文件到 submissions/{slug}/，等待审核', 'Uploaded {n} files to submissions/{slug}/, awaiting review'],
  'cli.arg.term': ['<关键词>', '<term>'],
  'cli.title': ['智能体技能管理器 (CLI)', 'agent skill manager (CLI)'],
  'cli.help.search': ['在 GitHub 上搜索技能仓库', 'Search GitHub for skill repositories'],
  'cli.help.add': ['入库（git clone + 解析 SKILL.md）', 'Add to the library (git clone + parse SKILL.md)'],
  'cli.help.list': ['列出库中内容', 'List what is in the library'],
  'cli.help.sync': ['更新库中仓库', 'Re-sync a repository in the library'],
  'cli.help.remove': ['移出库（并卸载关联技能）', 'Remove from the library and uninstall its skills'],
  'cli.help.agents': ['列出智能体与技能目录', 'List agents and their skill directories'],
  'cli.help.install': ['安装技能到智能体目录', 'Install skills into agent directories'],
  'cli.help.agentsFlag': ['指定目标（默认：所有已启用且已检测到的）', 'Target agents (default: every enabled, detected one)'],
  'cli.help.copyFlag': ['使用复制而非软链接', 'Copy instead of symlinking'],
  'cli.help.uninstall': ['从所有智能体卸载', 'Uninstall from every agent'],
  'cli.help.installed': ['列出已安装技能', 'List installed skills'],
  'cli.help.growth': ['星标增长排行榜', 'Star-growth leaderboard'],
  'cli.help.doctor': ['环境自检', 'Check the local environment'],
  'cli.help.example': ['示例：node out/main/cli.js install --all --agents dsh', 'Example: node out/main/cli.js install --all --agents dsh'],
  'cli.doctor.credentials': ['凭据', 'Credentials'],
  'cli.doctor.libraryDir': ['库目录', 'Library dir'],
  'cli.doctor.catalog': ['目录', 'Catalog'],
  'cli.doctor.catalogMissing': ['（未找到 data/curated-catalog.json）', '(data/curated-catalog.json not found)'],
  'cli.doctor.agents': ['智能体', 'Agents'],
  'cli.doctor.detected': ['{n}/{total} 已检测', '{n}/{total} detected'],
  'cli.doctor.library': ['库', 'Library'],
  'cli.doctor.libraryLine': ['{repos} 个仓库 · {installs} 条安装记录', '{repos} repos · {installs} install records'],
  'cli.searchResults': ['{n} 个结果 / {ms}ms', '{n} results / {ms}ms'],
  'cli.adding': ['入库 {target} …', 'Adding {target} …'],
  'cli.addFailed': ['入库失败', 'Failed to add'],
  'cli.libraryEmpty': ['库是空的。用 `add <owner/repo>` 入库。', 'The library is empty. Add one with `add <owner/repo>`.'],
  'cli.itemLine': ['· {n} 个技能 · {status}', '· {n} skills · {status}'],
  'cli.synced': ['{name} 已更新（{n} 个技能）', '{name} updated ({n} skills)'],
  'cli.removed': ['已移出库，卸载 {n} 条安装记录', 'Removed from the library; {n} install records cleaned up'],
  'cli.noTargets': ['没有匹配的目标智能体。用 `agents` 查看。', 'No matching agents. Run `agents` to see them.'],
  'cli.target': ['目标 {name} → {path}', 'Target {name} → {path}'],
  'cli.installSummary': ['成功 {ok} · 跳过 {skipped} · 失败 {failed}', '{ok} installed · {skipped} skipped · {failed} failed'],
  'cli.uninstalled': ['已卸载 {n} 处', 'Uninstalled {n} copies'],
  'cli.noInstallRecords': ['没有找到对应的安装记录', 'No matching install records'],
  'cli.noneInstalled': ['还没有安装任何技能。', 'No skills installed yet.'],
  'cli.computingGrowth': ['计算最近 {days} 天的星标增长 …', 'Computing star growth over the last {days} days …'],
  'cli.localSnapshots': ['本地快照: {list}', 'Local snapshots: {list}'],
  'cli.notExist': ['(不存在)', '(missing)'],
  'cli.error': ['错误', 'Error'],
  'cli.crashed': ['崩溃:', 'Crashed:']
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
