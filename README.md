# SkillHub

> 像 Steam 管理游戏一样管理 AI 智能体技能 — 搜索、入库、一键安装到你自己选的目录。

SkillHub 是一个 macOS 桌面应用（Electron 44 + electron-vite + Vite 7 + React 19 + TypeScript + zustand），
把「登录 GitHub → 搜索技能 → 入库（只建索引）→ 从 GitHub 取最新版装到你选的目录」这条链路图形化。
界面是 **Steam 的浏览模型**（卡片墙、商店详情页、库、排行榜、个人资料）+ **VSCode 的骨架**（活动栏、侧边栏、命令面板、状态栏），中英双语。

**本机不保留任何仓库副本。** 入库只读一次 GitHub 的目录清单，磁盘上什么都不写；安装只把这个技能的
那几个文件取下来，放进你指定目录下以技能名命名的文件夹里。没有本地 checkout，没有缓存，也不替你
启动智能体 —— 对源仓库和你自己的文件，都是**完全不动它的本体**。

## 界面

| 技能商店 | 场景页（「我要做…」） |
|---|---|
| ![商店](docs/screenshots/store.jpg) | ![场景](docs/screenshots/scenario.jpg) |
| 按功能分类 + 场景入口 + 本周热门（按真实星标增长排序） | 按「我现在要干什么」挑，比翻领域更快 |

| 仓库详情页 | 我的库 |
|---|---|
| ![详情](docs/screenshots/detail.jpg) | ![库](docs/screenshots/library.jpg) |
| 一句话说清做什么、什么时候用、技能清单、右侧一键安装栏 | 已入库仓库，选中后一键安装到你选的目录 |

| 排行榜 | 我的库 |
|---|---|
| ![排行榜](docs/screenshots/charts.jpg) | ![库](docs/screenshots/library.jpg) |
| 总星数榜与 24h / 7d / 30d 增长榜，每行标注数据来源 | 已入库仓库，选中后一键安装到你选的目录 |

| 设置 | 英文界面 |
|---|---|
| ![设置](docs/screenshots/settings.jpg) | ![英文](docs/screenshots/detail-en.jpg) |
| 已登录时直接显示账号与凭据来源，不再要求输入 Token | 完整双语，切换后界面无一处语言混杂 |

---

## 下载安装

到 [Releases](https://github.com/dialling/skillhub/releases) 下载对应平台的安装包。

| 平台 | 下载 | 说明 |
|---|---|---|
| **macOS Apple 芯片**（M 系列） | `SkillHub-<版本>-arm64.dmg` | 打开后把 SkillHub 拖进「应用程序」 |
| **macOS Intel** | `SkillHub-<版本>.dmg` | 同上 |
| **Windows 64 位** | `SkillHub-<版本>-x64-setup.exe` | 安装版，可自选安装目录 |
| **Windows 免安装** | `SkillHub-<版本>-x64-portable.exe` | 双击即用，不写注册表 |

### 首次打开会被系统拦下来 —— 这是正常的

安装包**没有做代码签名**（Apple 的 Developer ID 证书每年 99 美元，Windows 代码签名证书也要钱），
所以系统会警告。应用本身没问题，按下面的方式打开一次即可，之后就不再提示。

**macOS** —— 双击会提示「无法验证开发者」或「已损坏」：

- 方式一：在「应用程序」里**右键点 SkillHub → 打开 → 再点「打开」**
- 方式二：终端执行
  ```bash
  xattr -dr com.apple.quarantine /Applications/SkillHub.app
  ```

> 「已损坏，请移到废纸篓」这个提示具有误导性，它不代表文件损坏，只是 Gatekeeper 对未签名应用的默认措辞。
> 安装包已做 ad-hoc 签名，所以正常会走到「无法验证开发者」这个可操作的提示。

**Windows** —— SmartScreen 会提示「Windows 已保护你的电脑」：

- 点「更多信息」→「仍要运行」

### 运行前提

- **需要能访问 GitHub**：搜索、入库、安装都走 GitHub API 与 `git`；内置精选目录（147 个仓库的简介与
  技能清单）随应用分发，离线也看得到
- **`git` 只在安装时需要**：取文件用的是 sparse checkout，一个仓库一次，只下载这次要的那几个技能的文件。
  没有 `git` 也能浏览、搜索、入库，只是装不了。Windows 装
  [Git for Windows](https://git-scm.com/download/win)，macOS 执行 `xcode-select --install`
- **可选的**：`gh`（GitHub CLI）。应用会复用它的登录凭据；没有也行，在设置里填 Personal Access Token
- **装到哪里由你选**：安装弹窗把本机检测到的智能体技能目录列成一键选项，也可以「选择其他文件夹…」
  指到任意目录（详见下文「安装」）

## 平台支持

| 平台 | 打包目标 | 状态 |
|---|---|---|
| **macOS** | `.dmg` / `.zip`（arm64 + x64） | 已打包并**实机启动验证通过** |
| **Windows** | `.exe` 安装程序（NSIS）+ 免安装版 | 已打包，**未在 Windows 上运行验证**（本机没有 Windows） |
| Linux | AppImage / deb | 未打包（electron-builder 在 macOS 上构建 Linux 目标不可靠，需要 Linux 主机或 Docker） |

代码层面已按平台差异逐项处理（`npm run xplat` 会检查，详见下节）：

- **二进制探测**：Windows 用 `where`，macOS/Linux 用 `/bin/sh -c 'command -v'`（`platform.ts` 的 `which()`）
- **符号链接**：审计禁止创建 POSIX 目录软链接（Windows 上需要管理员或开发者模式，应该用 `junction`）。
  新流程里安装**根本不再创建软链接** —— 每次都是真实副本；只有早期版本留下的软链接还留在识别逻辑里
- **路径比较**：统一走 `platform.ts` 的 `isInside` / `normalizePath`，不再假设分隔符是 `/`
- **窗口外观**：macOS 用 `hiddenInset` 内嵌红绿灯；Windows 用 `titleBarOverlay` 把系统按钮叠在右侧；
  Linux 保留标准边框。标题栏留白也随之切换（`html[data-platform]`）
- **应用身份**：打包后的 Bundle ID 是独立的 `com.dialling.skillhub`，
  不再与 Electron 默认的 `com.github.Electron` 冲突

**运行时外部依赖**：安装技能时调用 `git`（`--sparse` 按需取文件），所以安装那一步需要 PATH 上有 `git`；
搜索、浏览、入库不需要。`gh` 可选，仅用于复用已登录凭据，没有它也能用 Personal Access Token。

## 快速开始

```bash
git clone https://github.com/dialling/skillhub.git
cd skillhub
npm install
npm run build        # 构建 main / preload / renderer
npm run app          # 启动桌面应用
```

开发模式（渲染层热更新）：

```bash
npm run dev
```

> **关于 `ELECTRON_RUN_AS_NODE`**：某些终端环境会全局导出 `ELECTRON_RUN_AS_NODE=1`，而 Electron 只检查该变量
> **是否存在**（空值也算），此时它会以纯 Node 模式启动 —— 表现为 `require('electron')` 返回二进制路径字符串、
> `app` 为 undefined。所有 npm 脚本都通过 `scripts/run.mjs` 显式删除该变量后再启动，`npm run app` 可直接使用。

---

## 功能

### 商店（Discover）

**按功能分类，不按仓库类型分。** 原来的分类（官方 / 合集 / 工具 / 框架）描述的是「这个仓库是什么」，
用户看到的却是「我想做什么」。现在十个功能类目回答后者：

| 文档与办公 | 设计与前端 | 编程与开发 | 科研与数据 | 安全与合规 |
|---|---|---|---|---|
| 云与自动化 | 内容与创意 | 技能管理 | 技能合集 | 规范与标准 |

**场景入口（「我要做…」）** —— 参照 agent skill 目录站的 Popular Scenarios：
不问你属于哪个领域，而问你现在要干什么。13 个场景，如「做一份好看的演示文稿」
「让 AI 的前端不再一眼假」「长任务不丢上下文」「处理 PDF / Word / Excel」，
每个场景给出经过挑选的仓库清单（人工置顶 + 关键词补充）。

**一句话说清做什么。** 商店里每条目都有一行「一眼看懂」的简介，写法有硬性标准：
13–30 字、动词开头、说产出不说身份、禁止实现细节与「技能/工具」自指。
60 条简介的中位字数从 **50 字降到 20 字**，最长的从 89 降到 31。
标准与逐字语料见 [`docs/blurb-formula.md`](docs/blurb-formula.md) 与
[`docs/research/corpus-own.md`](docs/research/corpus-own.md)。

- **目录里区分「技能包」和「软件项目」**：靠「有没有 SKILL.md」判断一个仓库是不是技能来源是不够的 ——
  很多**应用**会附带一个描述自己的 SKILL.md，很多 **awesome 列表**一个技能都没有。
  所以每个条目都会被分类，并给出依据：

  | 类型 | 含义 | 界面表现 |
  |---|---|---|
  | **技能包**（112） | 主要产出就是技能 | 正常安装 |
  | **软件项目**（26） | 是应用，附带若干技能 | 黄色「软件项目」徽章 + 详情页说明「仓库本身需单独安装或构建」 |
  | **资料规范**（9） | 完全没有 SKILL.md | 虚线「不含技能」徽章，**安装按钮禁用**，只能入库收藏 |

  分类规则是确定性的（`scripts/classify-catalog.mjs`）：没有技能 → 资料；
  有构建清单且 `src/` 下有 ≥8 个源码文件 → 软件项目；否则算技能包。
  依据（语言、markdown 数、源码数、命中的构建清单）也一并写进目录数据，可复核。

- **内置精选目录**：随应用分发的 **147 个来源仓库、11,354 个去重后的技能**，每个仓库都有
  「一眼看懂」的中文简介、英文简介、功能分类、来源标签（官方 / 合集 / 工具）、星数与技能数。

  > **关于技能计数**：原始抓取按「含 SKILL.md 的目录」计数会严重虚高。大型仓库会为不同 agent
  > 把同一批技能重复打包（`sickn33/agentic-awesome-skills` 贡献 6,670 条，实际只有 2,119 个技能），
  > 也有仓库把模板脚手架算进来（`gotalab/cc-sdd` 的 137 条里 136 条在 `templates/` 下，真技能只有 1 个）。
  > 清洗规则同时存在于 `scripts/dedupe-catalog-skills.mjs`（批量）与
  > `src/main/core/skilldirs.ts`（运行时，供详情页计数使用），按目录名去重并剔除脚手架。
- **GitHub 实时搜索**：多个定向查询合并去重（`topic:agent-skills`、`topic:claude-skills`、`SKILL.md in:readme`…），
  而不是把关键词直接丢给 GitHub 的相关性排序。

### 入库（Library）
入库**不下载仓库**。读一次仓库的目录树（GitHub 的 trees API，`listSkillDirs()`），把含 `SKILL.md`
的目录清单写进 `~/.skillhub/state/library.json` 就结束了。**库是一份索引，不是一个副本。**

- 之前每个入库仓库都会 `git clone --depth 1` 到 `~/.skillhub/library/<owner>__<repo>`，实测 9 个仓库
  575 MB，而这些字节只有一个用途：让后面的安装从本地复制。现在安装直接从 GitHub 取，这 575 MB 不再需要 ——
  `addRepo()` / `syncItem()` 里没有 clone，也没有 `git pull`。
- 全树递归扫描换成了读远端清单，解析规则不变（目录里有没有 `SKILL.md`、frontmatter 的名称与描述），
  重复的目录名仍在读取时去重，取路径最浅的那个。
- 「同步更新」= 重新读一次远端清单（本地没有 checkout 可 pull）并刷新星数等元信息；「移出库」= 删掉索引条目、
  关联安装记录，以及由这个仓库装出去的技能。
- 仍然支持**导入本地目录**：登记一个本地技能文件夹，它的路径就是库里唯一真实存在的那种 `sourcePath`。
- 私有仓库用已登录凭据读 API 清单（不再有「克隆失败后重试、再把 token 从 `.git/config` 里抹掉」这一步）。

### 安装（Install）
技能从 GitHub **按需取**，落到**你选的目录**里。

- **只取需要的文件**（`src/main/core/fetch.ts`）：每个仓库跑一次
  `git clone --depth 1 --filter=blob:none --sparse`，再用**一条** `git sparse-checkout set --no-cone '<path>/*'`
  把这次要的所有技能路径一次选中（逐条调用只会留下最后一条），复制出来、删掉 `.git`，临时目录随即释放。
  实测一个 69 技能的仓库：取一个技能 264 KB，整仓 tarball 要 5.3 MB —— 约二十分之一，落地内容一模一样。
- **一个仓库只取一次**（`installer.ts` 的 `installFromGithub()`）：同一仓库要装 5 个技能也只克隆一次；
  **安装之间没有任何缓存**，每次都重新读源仓库的当前版本 —— 多花几秒，换掉「本地那份是旧的」这一整类问题。
- **落点由你选**（`InstallModal.tsx`）：弹窗把本机**检测到的**每个智能体自己的技能目录列成一键选项
  （智能体就是去那里找技能），另有「选择其他文件夹…」打开原生选择器；写入前，弹窗底部显示**完整目标路径**
  （`<目录>/<技能名>`）。
- **每一次安装都是真实副本**：取来的技能在本机没有「原件」可以指向，所以软链接模式连同「默认安装模式」
  这个设置一起取消了。
- **每次安装都写 `.skillhub-install.json`**，这个标记就是「这是 SkillHub 装的」的全部依据：重装时能否替换
  这个文件夹、`reconcileInstalls` 能否找回丢失的记录、界面上的「由 SkillHub 管理」标记，都看它。
- **同名冲突按归属判断，不按存在判断**（`entryOwner()`）：空位直接写，是自己就替换（这就是升级），
  是**别的技能**占着同名文件夹（实测 12 个技能名出现在不止一个仓库里）或那**根本不是 SkillHub 的目录**，
  都跳过并给出对应的明确说明，绝不覆盖。
- **多个智能体共享同一物理目录**时（注册表里 **50 个 agent** 会读通用目录 `~/.agents/skills`，
  例如 Zed / Goose / OpenHands）只做一次文件操作，但为每个智能体各留一条安装记录。
- **本机已有的技能同样能装**：它的目录就是源，请求里带 `localPath`，走同一套落地逻辑，不联网。
- 三个入口打开的是同一个目录选择弹窗：库里的「安装仓库」、库工具栏的「安装待装」、商店详情页的
  「一键安装」。详情页里已经没有「勾选装到哪些智能体」的列表了。

### 排行榜（Charts）
- **总星数榜** 与 **增长榜（24 小时 / 7 天 / 30 天）**。
- GitHub 没有星标历史接口，所以 SkillHub 按可靠性依次尝试几种数据源，并在每一行标注来源：
  - **共享的预计算序列**（本项目自己的 GitHub Action 发布，见下文「共享数据」）—— 一次请求，不花 API 额度；
  - **本地每日快照**（最精确，免费）— 应用每天记录一次星数，累积几天后增长数据完全精确；
  - **星标接口** `/repos/{o}/{r}/stargazers`（`star+json`，二分查找定位日期边界，结果精确）；
  - **活动事件流** `/repos/{o}/{r}/events` 中的 `WatchEvent`（真实数据；热门仓库的事件流有上限，此时显示 `≥` 表示下界）。
- **无法测量的仓库不会以「+0」假装有数据**，而是直接不列出。

### 个人资料（Profile）
- GitHub 登录（Personal Access Token 或直接复用 `gh` CLI 凭据），显示头像、昵称、仓库数、关注者。
- 本地统计：入库仓库数、已安装技能数、启用 agent 数、占用空间。
- 最近活动时间线、我的 Star 列表。

### 智能体（Agents）
- **注册表里 92 条，应用列出 80 个**（`data/agent-registry.json`）：另外 12 条是网页版对话
  （ChatGPT / Claude / Gemini …），既没有全局技能目录也没有项目级目录 —— 没地方可装，所以干脆不列出。
- 每条都带 `confidence` 与 `sourceUrl`，UI 上可直接点开查看依据；非高置信度的条目会显示置信度角标。
- **按厂商分组**：同一家公司的 agent 归在一起（Moonshot AI 下面是 Kimi Code CLI 与 Kimi CLI，
  Alibaba 下面是 Qwen Code / Qoder / 灵码…），已经装了的厂商排在前面。
- 支持搜索（匹配名称、厂商或路径 —— 搜 `kimi` 找 agent，搜 `moonshot` 找厂商）
  与 全部 / 已检测 / 已启用 分段视图。
- 检测同时看目录、配置文件与命令行；若某个二进制位于**另一个** agent 的目录内（例如 Kimi CLI 与
  Kimi Code 的二进制都叫 `kimi`），则不计入该 agent 的证据，避免误报。
- 只记录项目级目录的 agent（如 ona / qodo / replit）也会列出，并显示解析到「设置」里配置的项目目录
  下的路径；它们不在安装弹窗的推荐列表里（那里只放本机检测到的全局技能目录），装进项目目录请用
  「选择其他文件夹…」。
- 展示每个目录里已有的技能、哪些是 SkillHub 装的（带 `.skillhub-install.json` 标记；早期装的软链接则
  指向库目录）、哪些没有 `SKILL.md`。
- 不跟随符号链接的 agent（`supportsSymlink: false`，如 dsh、cursor、kimi-code、pi）必须拿到真实副本 ——
  现在每次安装本来就是副本，这个字段只剩「识别早期遗留软链接」的用途。
- 支持自定义目录（例如你自己的 agent）。

<!-- AGENT-TABLE:START -->
共 **80** 个 agent。

| Agent | 全局技能目录 | 项目级目录 |
|---|---|---|
| Claude Code | `~/.claude/skills` | `.claude/skills` |
| OpenAI Codex CLI | `~/.codex/skills` | `.codex/skills` ·ᵁ |
| Cursor | `~/.cursor/skills` | `.cursor/skills` ·ᵁ |
| Gemini CLI | `~/.gemini/skills` | `.gemini/skills` ·ᵁ |
| GitHub Copilot | `~/.copilot/skills` | `.github/skills` ·ᵁ |
| Kimi Code CLI | `~/.kimi-code/skills` | `.kimi-code/skills` ·ᵁ |
| Kimi CLI | `~/.kimi/skills` | `.kimi/skills` ·ᵁ |
| Windsurf | `~/.codeium/windsurf/skills` | `.windsurf/skills` ·ᵁ |
| Cline | `~/.cline/skills` | `.cline/skills` |
| Qwen Code | `~/.qwen/skills` | `.qwen/skills` ·ᵁ |
| Roo Code | `~/.roo/skills` | `.roo/skills` ·ᵁ |
| Kilo Code | `~/.kilo/skills` | `.kilo/skills` ·ᵁ |
| OpenCode | `~/.config/opencode/skills` | `.opencode/skills` ·ᵁ |
| Trae | `~/.trae/skills` | `.trae/skills` ·ᵁ |
| Kiro | `~/.kiro/skills` | `.kiro/skills` |
| Amp | `~/.config/agents/skills` | `.agents/skills` ·ᵁ |
| Goose | `~/.agents/skills` | `.agents/skills` ·ᵁ |
| Continue ᵐ | `~/.continue/skills` | `.continue/skills` |
| Zed | `~/.agents/skills` | `.agents/skills` ·ᵁ |
| Warp | `~/.warp/skills` | `.warp/skills` ·ᵁ |
| Factory Droid | `~/.factory/skills` | `.factory/skills` ·ᵁ |
| DeepSeek Harness | `~/.dsh/skills` | `.dsh/skills` ·ᵁ |
| Agent Skills portable .agents convention | `~/.agents/skills` | `.agents/skills` ·ᵁ |
| Tongyi Lingma (Qoder CN IDE) | `~/.lingma/skills` | `.lingma/skills` |
| Qoder | `~/.qoder/skills` | `.qoder/skills` |
| CodeBuddy Code | `~/.codebuddy/skills` | `.codebuddy/skills` |
| Comate (Wenxin Kuaixiang) | `~/.comate/skills` | `.comate/skills` ·ᵁ |
| Qoder CN CLI | `~/.qoder-cn/skills` | `.qoder/skills` |
| Huawei CodeArts Agent (CodeArts Doer / Snap) | `~/.codeartsdoer/skills` | `.codeartsdoer/skills` |
| MiniMax Code | `~/.minimax/skills` | `.minimax/skills` ·ᵁ |
| WorkBuddy ᵐ | `~/.workbuddy/skills` | `.workbuddy/skills` |
| Neovate | `~/.neovate/skills` | `.neovate/skills` |
| Pochi | `~/.pochi/skills` | `.pochi/skills` ·ᵁ |
| CodeRider | `~/.coderider/skills` | `.coderider/skills` |
| iFlow CLI | `~/.iflow/skills` | `.iflow/skills` |
| ZCode | `~/.zcode/skills` | `.zcode/skills` ·ᵁ |
| CoStrict | `~/.costrict/skills` | `.costrict/skills` ·ᵁ |
| JoyCode ᵐ | `~/.joycode/skills` | `.joycode/skills` |
| QoderWork | `~/.qoderwork/skills` | — |
| Deep Code | `~/.deepcode/skills` | `.deepcode/skills` ·ᵁ |
| DeepSeek-TUI ᵐ | `~/.deepseek/skills` | `.deepseek/skills` |
| Kode CLI | `~/.kode/skills` | `.kode/skills` |
| Junie | `~/.junie/skills` | `.junie/skills` ·ᵁ |
| Augment Code | `~/.augment/skills` | `.augment/skills` ·ᵁ |
| Google Antigravity | `~/.gemini/config/skills` | `.agents/skills` ·ᵁ |
| Grok Build / xAI Grok CLI | `~/.grok/skills` | `.grok/skills` ·ᵁ |
| Devin CLI (Devin for Terminal) | `~/.config/devin/skills` | `.devin/skills` ·ᵁ |
| OpenHands | `~/.agents/skills` | `.agents/skills` ·ᵁ |
| Tabnine CLI | `~/.tabnine/agent/skills` | `.tabnine/agent/skills` ·ᵁ |
| Rovo Dev CLI | `~/.rovodev/skills` | `.rovodev/skills` ·ᵁ |
| Mistral Vibe | `~/.vibe/skills` | `.vibe/skills` ·ᵁ |
| Crush | `~/.config/crush/skills` | `.crush/skills` |
| Letta Code | `~/.letta/skills` | `.agents/skills` ·ᵁ |
| AiderDesk | `~/.aider-desk/skills` | `.aider-desk/skills` |
| OpenClaw | `~/.openclaw/skills` | `.agents/skills` ·ᵁ |
| Hermes Agent | `~/.hermes/skills` | `.hermes/skills` ·ᵁ |
| Mux / Xum | `~/.xum/skills` | `.xum/skills` ·ᵁ |
| Firebender | `~/.firebender/skills` | `.firebender/skills` ·ᵁ |
| Ona | — | `.ona/skills` ·ᵁ |
| Qodo | — | `.qodo/skills` ·ᵁ |
| Snowflake Cortex Code | `~/.snowflake/cortex/skills` | `.cortex/skills` |
| Command Code | `~/.commandcode/skills` | `.commandcode/skills` ·ᵁ |
| pi coding agent | `~/.pi/agent/skills` | `.pi/skills` ·ᵁ |
| Autohand Code CLI | `~/.autohand/skills` | `.autohand/skills` |
| Emdash | `~/.agentskills` | — |
| fast-agent | — | `.fast-agent/skills` ·ᵁ |
| nanobot | `~/.nanobot/workspace/skills` | — |
| VT Code ᵐ | `~/.agents/skills` | `.agents/skills` ·ᵁ |
| Bub ᵐ | `~/.agents/skills` | `.agents/skills` ·ᵁ |
| Sarvam Code ᵐ | `~/.agents/skills` | `.agents/skills` ·ᵁ |
| Zencoder ᵐ | `~/.zencoder/skills` | `.zencoder/skills` |
| Zenflow ᵐ | `~/.zencoder/skills` | `.zencoder/skills` |
| Deep Agents ᵐ | `~/.deepagents/agent/skills` | `.agents/skills` ·ᵁ |
| IBM Bob ᵐ | `~/.bob/skills` | `.bob/skills` |
| Posit Assistant ᵐ | `~/.posit/assistant/skills` | `.posit/assistant/skills` |
| Replit Agent | — | `.agents/skills` ·ᵁ |
| AdaL ᵐ | `~/.adal/skills` | `.adal/skills` |
| ForgeCode ᵐ | `~/.forge/skills` | `.forge/skills` |
| Kimchi ᵐ | `~/.config/kimchi/harness/skills` | `.kimchi/skills` |
| Dexto ᵐ | `~/.agents/skills` | `.agents/skills` ·ᵁ |

> `ᵁ` = 同时读取通用目录 `~/.agents/skills`；`ᵐ` / `ˡ` = 中等 / 低置信度，
> 表示该路径来自厂商源码或未能从官方文档核实，可在应用内「智能体」页点开查看出处。

*由 `scripts/update-readme-agents.mjs` 从 `data/agent-registry.json` 生成，请勿手改。*
<!-- AGENT-TABLE:END -->

### 界面配色
八套**完整配色**，设置里一键切换。每套换的是整套色板 —— 背景层级、面板、边框、
文字四级灰阶、浮层底色、光晕与强调色一起变，不是只换一个高亮色：

| 深色（6 套） | 浅色（2 套） |
|---|---|
| 深空蓝 · 纯黑 OLED · 石墨灰 · 深林绿 · 午夜紫 · 暖褐 | 亮色·日光 · 亮色·纸张 |

其中「纯黑 OLED」是真正的 `#000` 底，「暖褐」和「亮色·纸张」带暖色调，
「亮色·日光」是标准浅色 —— 切换后是完全不同的观感，不只是强调色变了。

实现：主题就是往 `:root` 写一组 CSS 自定义属性（`--bg-0..5` / `--text-0..3` /
`--border-rgb` / `--tint-rgb` / `--shadow-rgb` / `--glass-rgb` / `--field-rgb` /
`--scrim-rgb` / `--accent*` / `--ambient-*`），
组件完全不需要知道「主题」这个概念。为此把 CSS 里 70 处硬编码颜色全部参数化，
并区分了「叠加色」（`--tint-rgb`：深色主题是白，浅色主题是深色）与
「阴影色」（`--shadow-rgb`），否则浅色主题不可能成立。
另外会同步 `documentElement.dataset.scheme` 与 `color-scheme`，
让滚动条等原生控件也跟着切换。

### 顶部图标
标题栏左侧用的是 Electron 风格的原子图标（浅色圆角底板 + 深色圆盘 + 三条轨道 + 中心核）。
原始素材是位图、无法换色，所以按同样的几何重绘成了矢量，由 CSS 变量驱动：

| 部位 | 变量 |
|---|---|
| 圆角底板 | `--text-0` |
| 内部圆盘 | `--bg-0` |
| 轨道、电子、中心核 | `--accent-hi` |

因此它会随配色实时变化 —— 深空蓝下是蓝轨道、深林绿下是绿轨道、午夜紫下是紫轨道；
在两套亮色主题下底板与圆盘会自动反转（深底板 + 浅圆盘），
否则白色底板在浅色标题栏上会直接消失。

### 库（Steam 式布局）
选中项的大横幅 + 下方胶囊网格，而不是一格格等权重的小卡片：

- **横幅**：当前选中仓库的整幅渐变封面、大头像、大号标题、一句话简介与统计数据，
  右侧是 Steam 式的大号按钮 —— 它是「**安装仓库**」（把这个仓库里还没装的技能装到你选的目录，
  选完目录才落盘），下面一排是 详情 / 同步 / 打开目录 / 移除
- **卡片网格**：小头像（34px）在左上角，作者名紧随其后，下面是加粗的仓库名与
  一句话简介，底部一行是技能数与星数；每张卡片带一层该仓库配色的淡淡色晕作为身份标识。
  早期版本用所有者头像铺满整块作为「封面」，结果是每张卡片都在抢注意力、还压住了文字，
  已改掉 —— 图片只占一小部分
- 工具栏：全部 / 已安装 / 未安装、排序（最近 / 星数 / 名称）、网格 / 列表切换、导入本地目录、安装待装
- 选中项有高亮边框，与横幅联动

### 商店：仓库之外的技能视图
商店顶部有「仓库 / 技能」两个视图。

- **仓库视图**：147 个来源仓库，按功能分 10 类，另有 13 个「我要做…」场景入口
- **技能视图**：**10,791 个技能本体**，每个都带作者自己写的简介

技能视图把合集拆开了。一个「技能合集」仓库的价值本来就在里面那一个个技能，
而在此之前商店只能展示这些技能所在的「盒子」。现在可以：

- 跨全部分片搜索技能名与功能
- 按功能分类筛选（技能合集 4508 · 编程与开发 1567 · 安全与合规 1178 …）
- 按**适用智能体**筛选 —— 2,231 个技能标注了专用目标（Codex 985 · Copilot 435 ·
  Gemini CLI 385 · Claude Code 382 …），其余 8,560 个不标注，因为不专属于某一个
  就是都能用

判定专用 agent 只用两个**结构性**信号：仓库自己声明了目标（「My Codex Skills」），
或技能存放在某个 agent 自己的目录下（`.claude/skills/`）。刻意不用「简介里提到某
个 agent」——那压倒性地指向另一件事：`Automate Gemini tasks via Rube MCP` 是
**调用 Gemini 服务**的技能，不是写给 Gemini CLI 的。

### 在商店里给 GitHub 点 Star
登录后，商店里点星形按钮就是**真的在你的 GitHub 账号上** star 这个仓库。

已 star 状态来自一次性读取的完整列表，所以屏幕上所有按钮在同一时刻保持一致；
星数在 GitHub 接受写入之后才增减，界面上的数字不会声称账号没做过的事。

### 上传商店没有的技能
把技能目录上传到仓库的 `submissions/`，并登记一条待审记录，**完全不碰目录数据**，
所以商店不受影响 —— 商店条目需要手工撰写的中英简介、使用场景和详细描述。

> **界面上已经没有这个按钮了。** 后端还在（`core/submit.ts`、IPC 的 `submit:skill`、仓库里的 `submissions/`），
> 因为它是「本项目自己往目录里加条目」的开发步骤，不是普通用户会做的事。

上传内容的判定：优先取 `SKILL.md`、再取 `SKILL.md` 里链接到的文件、最后按路径
深浅补齐。深浅是「属于这个技能」与「属于它所寄居的那个项目」的良好近似 ——
一个实测的技能目录有 22,005 个文件、837MB（完整的 Remotion 项目），
按这个规则取到 120 个文本文件并如实报出跳过了多少。

### 开发时的两条路径

改完代码，**默认只装到本机**：

```bash
npm run install:app     # 构建 + 装进 /Applications，约一分钟
```

**不要每次改都发版本。** 发布是为了让别人能下载——而磁盘映像有 124 MB，
经代理实测约 100 KB/s，一次上传二十分钟。对开发这台机器来说，`/Applications`
更新才是唯一需要的东西；给别人下载的产物可以攒着。

攒到值得发布时（一个完整的功能、一次修复告一段落）：

```bash
npm run release patch|minor|major
```

它会跑门禁、升版本、打标签、建立 Release，然后**把上传放到后台**并立刻返回——
不等它传完。进度可以随时用 `gh release view vX.Y.Z` 查看。

### 关于上传功能的安全性

这个应用可以（通过后端，界面上已无按钮）把本机的技能上传到本仓库的 `submissions/` 待审区。有人会问：那不是谁都能往你的库里写东西吗？**不是**，这一点值得写清楚，因为它是整个设计成立的前提。

**写入的前提是「对仓库有 push 权限」。**

- 应用里**没有任何内置令牌**。写入用的是**运行者自己的** GitHub 凭据（设置里填的，或本机 `gh` CLI 的）。
- 本仓库的协作者**只有仓库所有者一人**。别人在自己的机器上运行这个应用，用的是他们自己的令牌，那个令牌对本仓库没有权限，写入会被 GitHub 以 403 拒绝 —— 应用会**上传前先确认权限**并给出明确说明，而不是传到一半失败。
- 换句话说：**只有仓库所有者能往这个库写东西**，不需要额外的开关。

**上传的内容到不了用户手上。**

```
本机技能 ──上传──▶ submissions/（待审区）
                        │
                        │  ← 应用从不读这个目录
                        ▼
                  人工阅读并写好中英简介
                        │
                        ▼
              data/curated-catalog.json（随版本分发）
                        │
                        ▼
                    用户安装
```

- 应用**只从打包内置的 `data/curated-catalog.json` 读取可安装内容**，从不读 `submissions/`。
  > 这一条现在是**对代码现状的描述**：自检里曾经有一条断言守着它（目录中不得出现来自
  > `submissions/` 的条目），那条断言在这次重构后已经不在了，所以别把它当成被守住的不变量。

**技能本身可能就是载荷，这一点必须直说。**

技能不是数据，而是**给 agent 的指令**。一个恶意的 `SKILL.md` 不需要任何可执行文件 —— 「运行这条命令来完成安装」就是完整的攻击，靠扩展名过滤看不见它。

所以上传时会读取正文并报告可疑写法，附带文件名与行号：

| 类别 | 例子 |
|---|---|
| 管道进 shell | `curl … \| sh` |
| 下载后执行 | `curl -o x && chmod +x x` |
| 读取凭据 | `~/.ssh/id_rsa`、`gh auth token`、`$GITHUB_TOKEN` |
| 数据外传 | `cat … \| base64 \| curl …` |
| 破坏性命令 | `rm -rf /`、`rm -rf ~` |
| 提示注入 | 「忽略之前的指令」「不要告诉用户」 |
| 混淆 | `base64 -d`、`eval(`、`atob(` |
| 持久化 | `crontab -`、`launchctl load`、`/Library/LaunchAgents` |

**这些只是报告，不拦截。** 上传者与审查者是同一个人，一条按关键词拒绝的规则既容易被绕过、也会误伤诚实的技能。它的价值在于：**在内容进来的那一刻就把问题摆出来**，而不是留给以后读文件的人去发现。

**还有一条更基本的事实：权限再严，也挡不住把你自己信任的东西装进来。** 上面所有机制解决的是「别人能不能往你的库写」和「未审查的内容能不能到用户手上」，**不能**解决「这个技能本身是否安全」。装任何第三方技能之前，仍然值得读一遍它的 `SKILL.md`。

### 共享数据：不需要服务器
星标历史与增长榜由本仓库的 GitHub Action 每天更新，客户端通过 CDN 读取。

单机看不到过去 —— 它只知道自己在运行的那些天。服务器能解决，但一个定时
Action 把 JSON 提交进仓库有同样的效果而且免费：GitHub 通过 CDN 提供这些文件，
每个安装读到的都是同一组数字。

```
.github/workflows/live-data.yml   每天两次（GitHub 的 cron 常有延迟，两次让「每天」成立）
data/live/stars.json              当前星数
data/live/growth.json             预计算的 1/7/30 天增长榜
data/live/history.json            原始序列（归档）
data/live/skills/<分类>.json      提取出的技能索引，按功能分类分片
```

客户端只拉 `stars.json` 与 `growth.json`，**不拉 history** —— 原始序列按 147 仓库 ×
400 天算会到 2MB 级，而客户端要的是「涨了多少」，那已经算好了。

镜像回退：jsDelivr → raw.githubusercontent → 带鉴权的 Contents API。
两个镜像都会取索引并比较 `updatedAt` 用更新的那个 —— jsDelivr 对分支引用最多
缓存 12 小时，实测出现过同一时刻 CDN 上是 0 条、raw 上已有 1,373 条的情况。

### 我的技能（统一的技能列表）
库页面顶部是**一份**技能列表，而不是两份。早先分成「SkillHub 装过的」和「本机发现到的」
两个面板，同一个技能会在两处各出现一次，用户还得记住哪个面板管哪个操作。

现在只有一个问题——「我有哪些技能」——所以只有一份列表：

- **按名称归并**：同一个技能装到多个智能体只占一行，行内写明分布在哪些 agent
- **每一行都能安装**，无论它来自哪里：
  - 已入库的技能 → 从 GitHub 取最新版，装到你选的目录
  - 本机已有、没入库的技能 → **以它自己的文件夹为源**装到别处，原文件不动、也不上网
- 能在商店找到来源但还没入库的，旁边给一个「+」直接入库
- SkillHub 管理的技能带绿色「SkillHub 管理」标记，并可一键卸载
- 行首圆点表示是否能在商店里找到来源

匹配按技能目录名，并处理了两种容易出错的情况：技能位于仓库根目录时（目录记为 `.`）
要用仓库名匹配；智能体目录里混着的索引文件（如 WorkBuddy 的
`_bm_skillid_migration.json`）不是技能，会被过滤。多个智能体共享同一物理目录时只报告一次。

### 技能安装位置（推荐位置）
这个设置是**建议**，不是安装目的地 —— 真正的落点每次都在安装弹窗里由你指定。它只在「首次入库时弹
一次的那个提示」和设置里起作用，建议顺序是：

1. 你已经指定过的位置
2. 已经在用、且技能最多的那个智能体目录（沿用你的习惯）
3. 通用目录 `~/.agents/skills` —— 50 个 agent 会读取，兼容性最好
4. 电脑上还没有任何技能目录时，新建通用目录，而不是猜一个厂商目录

**首次入库时会弹出提示**，展示推荐位置、推荐理由，以及所有已存在目录的清单（含各自已有多少技能）
供你改选，也可以手填路径。事后随时可在「设置 → 推荐的技能安装位置」更改。

> 注意区分：这个建议值**不会**替安装弹窗预选目录 —— 弹窗默认选中的是本机检测到的第一个智能体自己的
> 技能目录（智能体就是去那里找技能），也可以改成任意目录。

### 界面细节
- **文字可框选复制**：技能简介、agent 路径、错误信息等都能直接选中复制，
  并且鼠标移到这些文本上会变成文本光标，先告诉你「这里能选」；
  只有按钮、标签、导航这类控件不参与选择，避免拖拽时误选。
- **刷新动画**：标题栏的刷新按钮在请求进行期间持续旋转并禁用，完成才恢复。
- **可收起的侧边栏**：活动栏底部（左下角）的按钮收起/展开，状态会记住（下次启动保持原样）。
  侧边栏只放「当前页面能做的选择」——例如商店里只保留「全部 / 我要做…」两个入口加功能分类，
  13 个场景在内容区以卡片挑选。
- **命令面板**：`⌘K` / `⌘P`，可跳转页面、切换语言、刷新，或直接搜索库/精选目录/GitHub。
- **状态栏**：GitHub 连接状态与账号、库统计、已启用 agent、已安装数、语言、版本。
  API 额度不再常驻显示 —— 它几乎永远是 5000/5000，纯属噪声；鼠标悬停可看具体数字，
  只在剩余低于 15% 时才自动冒出一条黄色提醒。
- **完整中英双语**：标题栏、状态栏或设置页一键切换，**原生应用菜单也会跟着重建**。
  简介、标签、按钮、提示、活动日志全部双语，仓库数据（tagline / useWhen）也都有中英两份。
  默认不混杂：英文模式下不出现中文，中文模式下不出现英文（品牌与 agent 专有名词除外）；
  另一种语言的简介折叠在「Show Chinese / 中文原文」按钮后面，需要时才展开。
  完整性由 `npm run i18n` 强制校验，作为构建门禁。
- **实时进度**：技能文件的获取、库的同步、安装都有底部进度条与逐条进度事件。

---

## 打包分发

```bash
npm run dist:mac     # macOS：.dmg + .zip（arm64 与 x64 各一份）
npm run dist:win     # Windows：NSIS 安装程序 + 免安装版（x64）
npm run dist         # 按当前平台打包
```

产物在 `release/`（已在 .gitignore 中，体积 500 MB+ 不入库）。

| 产物 | 体积 |
|---|---|
| `SkillHub-<版本>-arm64.dmg` | 约 124 MB（0.2.7 实测 124.2 MB） |
| `SkillHub-<版本>.dmg`（x64） | 约 131 MB（0.2.7 实测 131.1 MB） |
| `SkillHub-<版本>-x64-setup.exe` | 约 108 MB |
| `SkillHub-<版本>-x64-portable.exe` | 约 108 MB |

> 版本号随每次发布变化，以 `release/` 或 Releases 页面上的实际文件名为准。
> macOS 两行是 0.2.7 的实测体积；Windows 两行沿用本 README 早先记录的数字 ——
> 这台机器是 macOS，`release/` 里没有 `.exe` 产物可复测。

> **本机环境的坑**：这个 shell 里的 `node` 被 DSH 接管（`~/.local/.../harness/.desktop-bin/node`
> 是一个 `ELECTRON_RUN_AS_NODE=1` 的包装脚本），会导致 electron-builder 的 yargs 把脚本路径
> 当成参数而报 `Unknown argument`。打包时需用一个真正的 Node：
> ```bash
> /Users/a27/.local/share/pi-node/node-v22.23.2-darwin-arm64/bin/node \
>   node_modules/electron-builder/cli.js --mac   # 或 --win
> ```
> 普通机器上 `npm run dist:mac` 直接可用。

**尚未做的**：真正的代码签名（macOS 需要 Developer ID 证书，Windows 需要代码签名证书）。
安装包只做了 ad-hoc 签名（`identity: "-"`），所以 macOS 首次打开需要右键 →「打开」，
或 `xattr -dr com.apple.quarantine`；也因为没有签名证书，**没有自动更新** ——
应用会提示有新版本，升级要自己下载新的 `.dmg`。

## 命令行（同一套核心）

桌面应用和 CLI 共用同一个状态目录 `~/.skillhub/state`，所以两边看到的库、安装记录完全一致。

```bash
node out/main/cli.js doctor                          # 环境自检
node out/main/cli.js search "pdf document"           # 搜索
node out/main/cli.js add obra/superpowers            # 入库（只建索引，不克隆）
node out/main/cli.js list                            # 库内容
node out/main/cli.js agents                          # agent 与目录
node out/main/cli.js install --all --agents dsh      # 全装到 dsh 的技能目录
node out/main/cli.js install "obra/superpowers::skills/brainstorming" --to ~/.cursor/skills
node out/main/cli.js installed                       # 已安装技能
node out/main/cli.js uninstall "obra/superpowers::skills/brainstorming"
node out/main/cli.js growth 7                        # 7 天增长榜
```

`install` 会真的去 GitHub 取文件，所以它需要一个落点：`--to <目录>` 是显式写法，
不写时用**第一个已启用 agent** 自己的技能目录；`--agents dsh,cursor` 用来指定对齐到哪个 agent。
**没有 `--copy` 了** —— 每次安装都是副本，这个开关不再有意义。

---

## 自检

```bash
npm run verify     # 类型检查 + 双语审计 + 跨平台审计 + 目录审计 + 构建 + 端到端自检
npm run selftest   # 只跑端到端自检
npm run i18n       # 只跑双语审计
```

`npm run selftest` 会真实跑完 **47 项检查**，12 个小节串起来：GitHub 凭据 → 状态存储（两个写入者
不互相覆盖）→ 精选目录（中英简介、分类、依据）→ 实时搜索 → 仓库详情与技能树 → 星标增长（多数据源）
→ 排行榜（每行必须有真实来源，不允许悄悄报 0）→ **入库（断言「什么都没被克隆」，且列出的技能没有
本地路径）** → 从源目录安装到临时 agent 目录（**断言落地的是真实目录而不是软链接**，且
**副本里带 `.skillhub-install.json` 标记**）→ 两个技能抢同一个文件夹名（第二个必须被拒绝，第一个的
文件一字不动）→ 一个目录被多个智能体共享（卸载要报出受影响的每一个）→ 卸载与清理（**断言库目录下
从来没写过任何东西**）。全程使用 `SKILLHUB_HOME` 指向的临时目录，不碰你真实的 agent 目录 ——
这条隔离也是被事故逼出来的：测试曾经跑在真实 home 上，清理步骤卸载了 201 个真实安装。

---

## 架构

```
src/
  shared/types.ts         主进程 / 渲染进程共用的类型契约
  main/
    index.ts              窗口、菜单、每日星标快照、raw 主机探测、无头截图探针
    ipc.ts                全部 IPC handler（统一 { ok, data } 信封）
    cli.ts                命令行入口
    selftest.ts           端到端自检
    core/
      paths.ts            路径解析（含 Electron 不可用时的降级）
      platform.ts         平台判定与差异（二进制探测、路径比较、登录 shell 的 PATH）
      store.ts            无依赖 JSON 存储：原子写入 + 防抖落盘
      db.ts               集合定义：settings / library / installs / stars / activity / cache
      msg.ts              主进程消息目录（进度、安装错误、任务状态，跟随界面语言）
      github.ts           API 客户端、搜索、技能树（技能目录清单）、星标增长多源计算
      agents.ts           agent 注册表、探测、目录扫描、技能目录解析
      library.ts          入库 = 读远端技能清单建索引（不克隆）/ 同步 / 移除 / 导入本地目录
      fetch.ts            按需取文件：sparse clone 一次取走本次要的所有技能路径，用完即删
      installer.ts        安装引擎（从 GitHub 或本地目录取、归属判断、冲突、记录、对账）
      managed.ts          「这个是 SkillHub 装的」唯一判定：.skillhub-install.json 标记 / 指向库的软链接
      skills.ts           SKILL.md 解析、技能条目构建
      skilldirs.ts        技能目录去重与脚手架剔除（计数用）
      skillsindex.ts      技能索引分片（按功能分类，按需拉取并缓存）
      discover.ts         本机已发现的技能、安装位置建议、目录审计
      catalog.ts          精选目录加载与星标刷新
      live.ts             共享星标数据（GitHub Action 发布，CDN 多镜像回退）
      leaderboard.ts      排行榜（快照优先，API 兜底）
      starring.ts         在商店里给 GitHub 点 Star（真的写进你的账号）
      submit.ts           上传待审技能到 submissions/ 与内容扫描
      update.ts           版本检查（app / 目录数据 / 技能索引各自独立）
  preload/index.ts        contextBridge API
  renderer/src/           React 界面（components/InstallModal.tsx 是安装落点选择弹窗）
data/
  curated-catalog.json    147 个精选技能仓库（含功能分类、中英双语「一眼看懂」简介）
  scenarios.json          13 个场景（「我要做…」）及其推荐仓库
  agent-registry.json     92 个 agent 的技能目录（含出处与置信度；其中 12 个没有技能目录，应用不列出）
  live/                   由 GitHub Action 每天两次更新的共享数据与技能索引分片
```

### 存储位置

| 内容 | 路径 |
|---|---|
| 应用状态（设置、库索引、安装记录、星标历史、活动日志、缓存） | `~/.skillhub/state/` |
| 技能索引分片缓存 | `~/.skillhub/state/skills-index/` |
| Electron 缓存 | `~/Library/Application Support/skillhub/` |

> `~/.skillhub/library/` **已经不再写入**：安装每次现取，没有本地副本要放。这个路径只剩一个用途 ——
> 识别早期版本留下的、指向库目录的软链接安装（`isManagedPath` 仍然认它）。

状态用一个无依赖的 JSON 存储（原子写入 + 防抖），而不是原生 SQLite —— 数据量只有几千条记录，
而 `better-sqlite3` 需要按 Electron ABI 重新编译，代价大于收益。

---

## 开发辅助参数

```bash
# 直接打开某个页面 / 仓库 / 搜索词
node scripts/run.mjs --electron . --view=charts
node scripts/run.mjs --electron . --repo=obra/superpowers
node scripts/run.mjs --electron . --q="pdf"

# 渲染窗口并写出 PNG 后退出（用于无头验证界面）
node scripts/run.mjs --electron . --view=agents --shot=/tmp/agents.png --shot-delay=8000

# 探针：先驱动页面（点按钮、翻列表），再截图
node scripts/run.mjs --electron . --view=library --shot=/tmp/lib.png \
  --script="document.querySelector('.btn-play').click(); return 'clicked'"

# 打印每个阶段的耗时
SKILLHUB_TRACE=1 node scripts/run.mjs --electron . --repo=obra/superpowers
```

> **两个坑，都踩过：**
>
> 1. **`--script` 不叫 `--eval`。** Electron 主进程会先解析 Node 自己的命令行选项再交给应用，而 `--eval`
>    正是其中之一：脚本被吞掉，探针每次都静默返回 `undefined`，报告写成「一张截图 + 空结果」，
>    读起来像「页面什么都没做」，其实是参数根本没送到。
> 2. **脚本是一个函数体，必须自己 `return`** —— 它被拼成 `(async () => { <脚本> })()` 执行，
>    只写表达式拿不到返回值，写 `return <表达式>` 才会被打印出来。

---

## 双语审计

`scripts/i18n-audit.mjs` 是双语完整性的强制门禁，检查四件事：

| 检查 | 含义 |
|---|---|
| 缺失词条 | 代码里 `t('some.key')` 在字典里不存在 → 界面会直接显示 `some.key` |
| 渲染层硬编码 | 渲染代码里的中文字面量 → 英文模式下会显示中文 |
| 主进程硬编码 | 经 IPC 传给界面的中文消息 → 同上（终端工具 `cli.ts` / `selftest.ts` 与字典文件已排除） |
| 未翻译词条 | 中英两个值完全相同且含字母 → 中文模式下会显示英文 |

审计会剥离注释后再扫描，因此中文注释不会被误报；`*Zh` 这类成对的数据字段
（例如 `descriptionZh` 配 `descriptionEn`）被视为内容而非界面文案，不计入。

## 已知限制

- **只有商店内的条目有中文**：精选目录里的中英简介、使用场景是人工写好的，随版本分发；
  GitHub 实时搜索出来的仓库只有它自己的英文描述。机器翻译面板（原「设置 → AI 翻译」）已随重构移除。
- **增长榜的 `≥`**：热门仓库的事件流只有最近约 300 条，`≥` 表示这是下界。累积几天本地快照后会自动变成精确值。
- **安装需要 `git`**：取文件走的是 `git clone --sparse`。这不是应用主动选择的依赖 ——
  GitHub 的 tarball 接口一次只能拿整棵树，而稀疏检出能只下载这个技能的那几个文件。
- **签名与自动更新**：安装包只做 ad-hoc 签名，没有 Developer ID / 代码签名证书，
  所以**没有自动更新**，升级要手动下载新的磁盘映像。
- **agent 目录**：注册表基于厂商文档/源码核实，但仍可能随 agent 版本变化；
  非高置信度条目在 UI 上会标出，也可以用「添加自定义目录」覆盖。
