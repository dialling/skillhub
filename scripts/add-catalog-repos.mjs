#!/usr/bin/env node
/**
 * Add newly discovered repositories to the curated catalog, in bulk.
 *
 *   node scripts/probe-candidates.mjs   # writes /tmp/probed-new.json first
 *   node scripts/add-catalog-repos.mjs [--dry-run]
 *
 * Facts (stars, tree, license, branch) come from the probe. Everything a human
 * writes — the bilingual tagline, the use-case, the long descriptions and the
 * functional category — lives in COPY below, because the catalog's rule is that
 * every entry is authored in both languages at the moment it is listed. The
 * `npm run catalog` gate and the selftest enforce that afterwards; this script
 * refuses to write an entry that would fail them.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const catalogPath = join(root, 'data', 'curated-catalog.json')
const probedPath = '/tmp/probed-new.json'
const dryRun = process.argv.includes('--dry-run')

/** fn: the "what do you want to do" axis the store browses by. */
const COPY = {
  // --- official / vendor skills -------------------------------------------------
  'android/skills': {
    taglineZh: '安卓官方技能集，覆盖现代应用开发',
    taglineEn: "Android's official skills for modern app development",
    useWhen: '要写或改安卓应用', useWhenEn: 'writing or changing an Android app',
    fn: 'coding', category: 'official',
    aboutZh: '安卓官方维护的技能集，覆盖现代 Android 应用开发的主流场景，用于让编程智能体遵循官方的 API 用法、项目结构与最佳实践。',
    descriptionEn: "Android's officially maintained skill collection for modern app development, giving coding agents the platform's current APIs, project structure and best practices instead of outdated patterns."
  },
  'google-deepmind/science-skills': {
    taglineZh: 'DeepMind 官方科研工作流技能',
    taglineEn: "DeepMind's official scientific workflow skills",
    useWhen: '要做科学计算与研究', useWhenEn: 'running scientific computation and research',
    fn: 'research', category: 'official',
    aboutZh: 'Google DeepMind 发布的科研技能集，把科学工作流中的常见步骤交给智能体执行，用于加速文献处理、数据分析与实验设计等研究环节。',
    descriptionEn: 'Scientific skills published by Google DeepMind, handing common research workflow steps to an agent to speed up literature handling, data analysis and experiment design.'
  },
  'expo/skills': {
    taglineZh: 'Expo 官方技能，写跨平台移动应用',
    taglineEn: "Expo's official skills for cross-platform mobile apps",
    useWhen: '用 Expo 写移动端', useWhenEn: 'building a mobile app with Expo',
    fn: 'coding', category: 'official',
    aboutZh: 'Expo 官方技能集，覆盖使用 Expo 开发跨平台移动应用的工作流，让智能体按官方约定处理路由、构建与原生依赖等环节。',
    descriptionEn: "Expo's official skill collection covering cross-platform mobile development with Expo, so an agent follows the framework's conventions for routing, builds and native dependencies."
  },
  'Kotlin/kotlin-agent-skills': {
    taglineZh: 'Kotlin 官方技能，写好 JVM 与安卓代码',
    taglineEn: "Kotlin's official skills for idiomatic JVM and Android code",
    useWhen: '写 Kotlin 代码', useWhenEn: 'writing Kotlin code',
    fn: 'coding', category: 'official',
    aboutZh: 'Kotlin 官方推出的智能体技能集，覆盖惯用的 Kotlin 写法、协程与多平台工程，用于让生成的代码符合官方风格而非泛化的 Java 式写法。',
    descriptionEn: "Kotlin's official agent skills covering idiomatic Kotlin, coroutines and multiplatform projects, steering generated code toward the language's own style rather than a Java-shaped approximation."
  },
  'hashicorp/agent-skills': {
    taglineZh: 'HashiCorp 官方技能，管云上基础设施',
    taglineEn: "HashiCorp's official skills for cloud infrastructure",
    useWhen: '用 Terraform 管云资源', useWhenEn: 'managing cloud resources with Terraform',
    fn: 'cloud', category: 'official',
    aboutZh: 'HashiCorp 官方技能集，面向 Terraform 等基础设施即代码工具，用于让智能体按官方规范编写与审查云资源配置。',
    descriptionEn: "HashiCorp's official skill collection for Terraform and its other infrastructure-as-code tooling, so an agent writes and reviews cloud resource configuration to the vendor's own conventions."
  },
  'Unity-Technologies/skills': {
    taglineZh: 'Unity 官方技能，写游戏逻辑与编辑器脚本',
    taglineEn: "Unity's official skills for game logic and editor scripting",
    useWhen: '用 Unity 做游戏', useWhenEn: 'building a game in Unity',
    fn: 'coding', category: 'official',
    aboutZh: 'Unity 官方发布的智能体技能集，覆盖引擎内的脚本编写、资源组织与编辑器扩展，用于让智能体按官方推荐的方式改动工程。',
    descriptionEn: "Unity's official agent skills covering scripting, asset organisation and editor extensions, so an agent changes a project the way the engine intends rather than by guesswork."
  },
  'forcedotcom/sf-skills': {
    taglineZh: 'Salesforce 官方技能，做企业级定制',
    taglineEn: "Salesforce's official skills for enterprise customisation",
    useWhen: '做 Salesforce 定制开发', useWhenEn: 'doing Salesforce custom development',
    fn: 'coding', category: 'official',
    aboutZh: 'Salesforce 官方技能集，覆盖平台上的定制开发与部署流程，用于让智能体遵循官方的元数据模型与发布规范。',
    descriptionEn: "Salesforce's curated agent skills covering custom development and deployment on the platform, keeping an agent inside the official metadata model and release conventions."
  },
  'browserbase/skills': {
    taglineZh: 'Browserbase 官方技能，让 AI 操作浏览器',
    taglineEn: "Browserbase's official skills for driving a browser",
    useWhen: '要让 AI 真的上网操作', useWhenEn: 'an agent needs to actually drive a browser',
    fn: 'tooling', category: 'official',
    aboutZh: 'Browserbase 官方技能集，封装云端浏览器会话能力，用于让智能体稳定地打开页面、抓取内容并完成多步网页操作。',
    descriptionEn: "Browserbase's official skills wrapping cloud browser sessions, so an agent can reliably open pages, extract content and carry out multi-step web interactions."
  },
  'apify/agent-skills': {
    taglineZh: 'Apify 官方技能，抓取网站数据',
    taglineEn: "Apify's official skills for scraping websites",
    useWhen: '要抓取结构化网页数据', useWhenEn: 'scraping structured data from websites',
    fn: 'tooling', category: 'official',
    aboutZh: 'Apify 官方技能集，对接其抓取平台，用于让智能体直接取得网页上的结构化数据而不必自己写爬虫。',
    descriptionEn: "Apify's official skills wiring into its scraping platform, letting an agent obtain structured data from websites without hand-writing a crawler."
  },
  'greensock/gsap-skills': {
    taglineZh: 'GSAP 官方技能，写网页动效',
    taglineEn: "GSAP's official skills for web animation",
    useWhen: '要做网页动画与滚动效果', useWhenEn: 'building web animation and scroll effects',
    fn: 'design', category: 'official',
    aboutZh: 'GSAP 官方技能集，教智能体正确使用这个动画库的时间轴、缓动与滚动触发能力，用于产出能直接跑的动效代码。',
    descriptionEn: "GSAP's official skills teaching an agent to use the library's timelines, easing and scroll triggers correctly, so the animation code it writes actually runs."
  },
  'callstackincubator/agent-skills': {
    // Callstack contributes to React Native core but is not the platform owner,
    // so this is a vendor skill set, not an official one. The distinction
    // matters — the catalog says "official" only when the org owns the thing.
    taglineZh: 'React Native 开发技能，来自 Callstack',
    taglineEn: 'React Native skills from the Callstack team',
    useWhen: '写 React Native 应用', useWhenEn: 'building a React Native app',
    fn: 'coding', category: 'vendor',
    aboutZh: '由 React Native 核心贡献团队整理的技能集，针对移动端性能、原生模块与导航等常见难点给出智能体可执行的规范。',
    descriptionEn: 'Skills assembled by a core React Native contributor team, giving an agent actionable rules for mobile performance, native modules and navigation.'
  },
  // --- community collections ----------------------------------------------------
  'phuryn/pm-skills': {
    taglineZh: '一百多个产品经理技能，从需求到上线',
    taglineEn: '100+ product skills, from discovery to launch',
    useWhen: '要做产品规划与需求文档', useWhenEn: 'doing product planning and specs',
    fn: 'docs', category: 'community',
    aboutZh: '产品经理技能合集，覆盖用户调研、需求拆解、竞品分析、路线图与上线评审等环节，把常见的产品工作流变成智能体可以直接执行的步骤。',
    descriptionEn: 'A product-management skill marketplace covering user research, requirement breakdown, competitive analysis, roadmaps and launch review, turning familiar PM workflows into steps an agent can execute.'
  },
  'deanpeters/Product-Manager-Skills': {
    taglineZh: '产品方法论工具箱，按框架做事',
    taglineEn: 'A product toolkit organised around proven frameworks',
    useWhen: '要按方法论做产品决策', useWhenEn: 'making product decisions by the book',
    fn: 'docs', category: 'community',
    aboutZh: '以经典产品框架组织起来的技能集，覆盖机会评估、优先级排序、指标设计与复盘，用于让智能体按方法论而不是凭感觉给建议。',
    descriptionEn: 'Skills organised around established product frameworks — opportunity assessment, prioritisation, metric design and retrospectives — so an agent advises by method rather than by vibes.'
  },
  'Jeffallan/claude-skills': {
    taglineZh: '全栈开发专项技能，六十七个方向',
    taglineEn: '67 specialised skills across the full stack',
    useWhen: '做全栈开发的具体环节', useWhenEn: 'working on a specific part of the stack',
    fn: 'coding', category: 'community',
    aboutZh: '面向全栈开发者的专项技能合集，按前端、后端、数据库、测试与运维等方向拆分，用于让智能体在具体环节里按该领域的成熟做法办事。',
    descriptionEn: 'A collection of specialised skills for full-stack developers, split by frontend, backend, database, testing and operations, so an agent applies the settled practice of whichever area it is in.'
  },
  'MengTo/Skills': {
    taglineZh: '给设计师和前端工程师的技能集',
    taglineEn: 'Agent skills for designers and front-end builders',
    useWhen: '做界面设计与前端实现', useWhenEn: 'doing interface design and front-end work',
    fn: 'design', category: 'community',
    aboutZh: '面向设计师与前端工程师的技能合集，覆盖视觉规范、组件设计与界面实现，用于让智能体产出的界面更接近成熟设计稿而非默认样式。',
    descriptionEn: 'Skills aimed at designers and front-end engineers covering visual systems, component design and interface implementation, so the UI an agent produces looks intentional rather than default.'
  },
  'Owl-Listener/designer-skills': {
    taglineZh: '设计师技能合集，覆盖完整设计流程',
    taglineEn: 'A designer skill collection covering the whole design process',
    useWhen: '要跑完整设计流程', useWhenEn: 'running a full design process',
    fn: 'design', category: 'community',
    aboutZh: '设计师技能合集，从用户研究、信息架构到视觉与交付逐段拆解，用于让智能体参与设计流程的各个环节。',
    descriptionEn: 'A designer skill collection breaking the work into stages from user research and information architecture through to visual design and handoff, so an agent can take part in each.'
  },
  'muratcankoylan/Agent-Skills-for-Context-Engineering': {
    taglineZh: '上下文工程技能，管好 AI 的记忆',
    taglineEn: 'Context-engineering skills for managing what an agent remembers',
    useWhen: '上下文太长或 agent 忘事', useWhenEn: 'context gets too long or the agent forgets',
    fn: 'tooling', category: 'community',
    aboutZh: '专注上下文工程的技能合集，覆盖信息压缩、检索、记忆组织与长任务续接，用于解决智能体在长会话中丢失关键信息的问题。',
    descriptionEn: 'Skills focused on context engineering — compaction, retrieval, memory organisation and long-task resumption — aimed at the problem of an agent losing key information in a long session.'
  },
  'kangarooking/cangjie-skill': {
    taglineZh: '把书和长视频蒸馏成可执行技能',
    taglineEn: 'Distil books and long videos into runnable skills',
    useWhen: '想把长内容变成可执行方法', useWhenEn: 'turning long content into something executable',
    fn: 'content', category: 'community',
    aboutZh: '把书、播客、长视频等高信息密度内容拆解成结构化技能的工具集，用于把看过的东西变成智能体下次能直接照着做的步骤。',
    descriptionEn: 'Turns books, podcasts and long videos into structured skills, so what you have watched or read becomes steps an agent can follow next time instead of notes you never reopen.'
  },
  'Orchestra-Research/AI-Research-SKILLs': {
    taglineZh: 'AI 科研技能库，覆盖实验全流程',
    taglineEn: 'An AI research skill library covering the experiment loop',
    useWhen: '做 AI 研究实验', useWhenEn: 'running AI research experiments',
    fn: 'research', category: 'community',
    aboutZh: '开源的 AI 研究与工程技能库，覆盖文献综述、实验设计、训练调参与结果分析，用于让智能体在研究流程中承担可复用的具体环节。',
    descriptionEn: 'An open research and engineering skill library covering literature review, experiment design, training runs and result analysis, so an agent takes on the repeatable parts of a research loop.'
  },
  'Weizhena/Deep-Research-skills': {
    taglineZh: '结构化深度研究，一步步查证',
    taglineEn: 'Structured deep research that verifies as it goes',
    useWhen: '要做多来源的深度调研', useWhenEn: 'doing multi-source deep research',
    fn: 'research', category: 'community',
    aboutZh: '把深度研究拆成结构化步骤的技能，覆盖问题分解、多来源检索、交叉验证与结论整理，用于避免智能体给出未经核实的综述。',
    descriptionEn: 'Breaks deep research into structured steps — question decomposition, multi-source search, cross-checking and synthesis — to stop an agent producing a survey it never actually verified.'
  },
  'elementalsouls/Claude-BugHunter': {
    taglineZh: '漏洞挖掘技能包，按流程做安全测试',
    taglineEn: 'A bug-hunting skill bundle for methodical security testing',
    useWhen: '做渗透测试与漏洞排查', useWhenEn: 'doing pentesting and vulnerability hunting',
    fn: 'security', category: 'community',
    aboutZh: '面向安全测试的技能包，把侦察、可疑点定位、验证与报告拆成可执行步骤，用于让智能体按流程排查漏洞而不是随机试错。',
    descriptionEn: 'A bundle for security testing that splits reconnaissance, suspect identification, verification and reporting into steps, so an agent hunts methodically instead of guessing.'
  },
  'ljagiello/ctf-skills': {
    taglineZh: 'CTF 解题技能，覆盖常见题型',
    taglineEn: 'CTF skills covering the usual challenge categories',
    useWhen: '打 CTF 或做安全练习', useWhenEn: 'playing CTFs or practising security',
    fn: 'security', category: 'community',
    aboutZh: '面向 CTF 竞赛的技能集，按逆向、密码、杂项等题型组织解题思路与工具用法，用于让智能体在安全练习中给出可执行的攻击路径。',
    descriptionEn: 'Skills for CTF competitions, organised by challenge category — reversing, crypto, misc — with the reasoning and tooling each needs, so an agent proposes a concrete attack path.'
  },
  'RKiding/Awesome-finance-skills': {
    taglineZh: '金融分析技能，做行情与研究',
    taglineEn: 'Finance skills for market data and research',
    useWhen: '做金融数据分析', useWhenEn: 'doing financial data analysis',
    fn: 'research', category: 'community',
    aboutZh: '金融领域的技能合集，覆盖行情获取、财务数据处理与研究分析，用于让智能体处理金融数据时遵循该领域的口径与规范。',
    descriptionEn: 'A finance skill collection covering market data retrieval, financial statement handling and research analysis, so an agent works with the field’s own conventions rather than generic data habits.'
  },
  'tanweai/pua': {
    taglineZh: '把「P8 级工程师」人格装进智能体',
    taglineEn: 'Installs a hard-driving senior-engineer persona',
    useWhen: '想给 agent 加点狠劲', useWhenEn: 'your agent is being too agreeable',
    fn: 'content', category: 'community',
    aboutZh: '一组带强烈人格设定的技能，让智能体以资深工程师的口吻推动任务、追问含糊需求并对敷衍的产出提出异议，用于纠正智能体过于顺从的倾向。',
    descriptionEn: 'A set of strongly characterised skills that make an agent push tasks forward in a senior engineer’s voice, interrogate vague requirements and object to sloppy output — a corrective to an agent that agrees with everything.'
  },
  'jaechang-hits/SciAgent-Skills': {
    taglineZh: '近两百个生信与生命科学技能',
    taglineEn: 'Nearly 200 bioinformatics and life-science skills',
    useWhen: '做生物信息分析', useWhenEn: 'doing bioinformatics analysis',
    fn: 'research', category: 'community',
    aboutZh: '面向生物信息学与生命科学的技能合集，覆盖序列分析、组学数据处理与常用工具调用，用于让智能体在实验数据分析中少走弯路。',
    descriptionEn: 'A bioinformatics and life-science skill collection covering sequence analysis, omics data handling and the standard toolchain, so an agent spends less time rediscovering analysis steps.'
  },
  'SamurAIGPT/Generative-Media-Skills': {
    taglineZh: '生成式媒体技能，出图出片出音',
    taglineEn: 'Generative media skills for images, video and audio',
    useWhen: '要生成图片视频或配音', useWhenEn: 'generating images, video or voice',
    fn: 'content', category: 'community',
    aboutZh: '多模态生成技能合集，覆盖图像、视频与音频的生成流程与参数调试，用于让智能体调用各家生成模型时给出可复现的参数而不是碰运气。',
    descriptionEn: 'Multi-modal generative skills covering image, video and audio pipelines and their parameter tuning, so an agent produces reproducible settings instead of guessing at prompts.'
  },
  'samber/cc-skills-golang': {
    taglineZh: 'Go 语言专项技能，写得地道',
    taglineEn: 'A Go-specific agent skill collection',
    useWhen: '写 Go 代码', useWhenEn: 'writing Go code',
    fn: 'coding', category: 'community',
    aboutZh: '面向 Go 语言的技能合集，覆盖并发模型、错误处理、测试与工程结构等该语言特有的约定，用于让智能体写出的 Go 代码地道而非「别的语言翻译过来的」。',
    descriptionEn: 'Go-specific skills covering the concurrency model, error handling, testing and project layout, so the Go an agent writes reads as Go rather than as another language translated.'
  },
  'dpearson2699/swift-ios-skills': {
    taglineZh: 'Swift 与 iOS 开发技能',
    taglineEn: 'Swift and iOS development skills',
    useWhen: '写 iOS 应用', useWhenEn: 'building an iOS app',
    fn: 'coding', category: 'community',
    aboutZh: '面向 iOS 开发的技能合集，覆盖新版 Swift 语法、SwiftUI 界面与系统能力调用，用于让智能体使用当前推荐的 API 而不是过时写法。',
    descriptionEn: 'Skills for modern iOS development covering current Swift syntax, SwiftUI and platform APIs, so an agent reaches for the recommended API rather than a deprecated one.'
  },
  'softaworks/agent-toolkit': {
    taglineZh: '通用技能工具箱，覆盖日常开发',
    taglineEn: 'A general-purpose toolkit of agent skills',
    useWhen: '需要一组通用技能', useWhenEn: 'you want a general skill set',
    fn: 'collections', category: 'community',
    aboutZh: '精选的通用技能合集，按常见开发场景组织，用于作为起点快速给智能体补上一批覆盖日常任务的技能。',
    descriptionEn: 'A curated general-purpose collection organised by common development situations, useful as a starting set that covers day-to-day tasks in one install.'
  },
  'wondelai/skills': {
    taglineZh: '商业与营销方向的智能体技能集',
    taglineEn: 'Agent skills for business and marketing work',
    useWhen: '做营销与商业分析', useWhenEn: 'doing marketing and business analysis',
    fn: 'content', category: 'community',
    aboutZh: '面向商业、营销与增长场景的技能合集，覆盖内容策划、渠道分析与运营复盘，用于让智能体参与非技术类的业务工作。',
    descriptionEn: 'Skills for business, marketing and growth covering content planning, channel analysis and campaign review, so an agent is useful outside purely technical work too.'
  },
  'zLanqing/codex-claude-academic-skills': {
    taglineZh: '学术科研技能：读文献到写作',
    taglineEn: 'Academic skills from literature reading to writing',
    useWhen: '写论文或做科研', useWhenEn: 'writing papers or doing research',
    fn: 'research', category: 'community',
    aboutZh: '面向科研人员的技能集，覆盖文献阅读、论文写作与科学计算三段流程，用于让智能体在学术工作中承担可复用的具体环节。',
    descriptionEn: 'Skills for academic researchers covering literature reading, paper writing and scientific computing as three stages, so an agent handles the repeatable parts of research work.'
  },
  'ConardLi/garden-skills': {
    taglineZh: '前端与设计方向的开源技能集',
    taglineEn: 'An open skill collection for front-end and design',
    useWhen: '做前端页面与视觉', useWhenEn: 'building front-end pages and visuals',
    fn: 'design', category: 'community',
    aboutZh: '面向网页设计与前端实现的技能合集，覆盖视觉风格、页面结构与交互细节，用于让智能体做出来的界面有明确的审美取向。',
    descriptionEn: 'Skills for web design and front-end implementation covering visual style, page structure and interaction detail, so the interfaces an agent produces have a considered look.'
  },
  'antfu/skills': {
    taglineZh: 'Anthony Fu 的精选智能体技能',
    taglineEn: "Anthony Fu's curated agent skills",
    useWhen: '做前端工程化', useWhenEn: 'doing front-end tooling work',
    fn: 'collections', category: 'community',
    aboutZh: '知名前端开发者 Anthony Fu 维护的精选技能集，围绕现代前端工程化工具链组织，用于把该生态里的成熟做法交给智能体。',
    descriptionEn: 'A curated collection maintained by a well-known front-end developer, organised around the modern tooling ecosystem so an agent applies practices that ecosystem has settled on.'
  },
  'jakubkrehel/skills': {
    taglineZh: '构建产品时用得上的智能体技能',
    taglineEn: 'Skills for building a product end to end',
    useWhen: '做一个完整产品', useWhenEn: 'building a complete product',
    fn: 'collections', category: 'community',
    aboutZh: '面向产品构建过程的技能合集，覆盖从原型到实现再到上线的常见环节，用于让智能体在产品开发中承担连贯的角色。',
    descriptionEn: 'Skills covering the arc of building a product — prototype, implementation, release — so an agent holds a coherent role across the work rather than only one task.'
  },
  'zebbern/claude-code-guide': {
    taglineZh: '把智能体工具的使用方法做成技能',
    taglineEn: 'A guide skill for getting more out of an agent',
    useWhen: '想让 agent 用得更顺', useWhenEn: 'getting more out of your agent',
    fn: 'docs', category: 'community',
    aboutZh: '把智能体工具链的配置、命令与工作流整理成可查询的技能，用于让智能体自己解释该工具怎么用，减少翻文档的时间。',
    descriptionEn: 'Turns an agent toolchain’s configuration, commands and workflows into a queryable skill, so the agent explains how to use it instead of you going back to the docs.'
  },
  'michaelshimeles/skills': {
    taglineZh: '轻量技能集，附带协作规范模板',
    taglineEn: 'A small skill set plus an AGENTS.md workflow template',
    useWhen: '想快速搭起工作流', useWhenEn: 'setting up a workflow quickly',
    fn: 'collections', category: 'community',
    aboutZh: '体量不大但直接可用的技能集，附带一份协作规范模板，用于快速给项目建立起智能体该遵守的基本约定。',
    descriptionEn: 'A small, immediately usable skill set shipped with an AGENTS.md template, for giving a project a baseline of agent conventions without assembling one yourself.'
  },
  'sunchaokun/PPT-Design-Skill': {
    taglineZh: 'PPT 版式设计技能，讲究排版',
    taglineEn: 'Presentation design skills with a focus on layout',
    useWhen: '要做汇报或路演 PPT', useWhenEn: 'making a deck for a report or pitch',
    fn: 'design', category: 'community',
    aboutZh: '专注演示文稿版式设计的技能，覆盖信息层级、图文配比与配色规范，用于让智能体生成的幻灯片在排版上经得起看。',
    descriptionEn: 'A skill focused on presentation layout — information hierarchy, image-to-text balance and colour rules — so the slides an agent generates hold up typographically.'
  },
  // --- Codex-specific and single-purpose visual skills --------------------------
  'Dimillian/Skills': {
    taglineZh: '一套为 Codex 打磨的日常技能',
    taglineEn: 'A set of everyday skills tuned for Codex',
    useWhen: '用 Codex 干活', useWhenEn: 'working in Codex',
    fn: 'collections', category: 'community',
    aboutZh: '作者日常使用并持续打磨的 Codex 技能集，围绕实际工作流组织，用于给 Codex 补上一批直接能用的常用能力。',
    descriptionEn: 'A set of Codex skills the author actually uses and keeps refining, organised around real workflows rather than a feature list.'
  },
  'am-will/codex-skills': {
    taglineZh: 'Codex 技能合集，覆盖常见开发任务',
    taglineEn: 'A Codex skill collection for common development tasks',
    useWhen: '给 Codex 补技能', useWhenEn: 'filling out your Codex skills',
    fn: 'collections', category: 'community',
    aboutZh: '面向 Codex 的技能合集，覆盖日常开发中的常见任务，用于快速给 Codex 配上一批覆盖面广的可用技能。',
    descriptionEn: 'A Codex-oriented skill collection covering the tasks that come up most in day-to-day development, useful as a broad starting set.'
  },
  'helloianneo/ian-xiaohei-illustrations': {
    taglineZh: '给中文文章配统一的手绘插图',
    taglineEn: 'Hand-drawn illustrations for Chinese articles',
    useWhen: '文章需要配图', useWhenEn: 'an article needs illustrations',
    fn: 'design', category: 'community',
    aboutZh: '生成白底手绘风格正文配图的技能，带少量红橙蓝批注与固定画幅，用于给中文长文快速配上一套风格统一的插图。',
    descriptionEn: 'Generates hand-drawn body illustrations on a white ground with restrained red, orange and blue annotation marks at a fixed aspect ratio, for giving a long Chinese article a consistent set of figures.'
  },
  'LiamGvchi/gc-minimal-zine-poster': {
    taglineZh: '生成极简杂志风格的海报视觉',
    taglineEn: 'Makes quiet, minimal zine-style posters',
    useWhen: '要做极简风格海报', useWhenEn: 'making a minimal poster',
    fn: 'design', category: 'community',
    aboutZh: '生成极简杂志风格海报的技能，以克制的排版与留白为特征，用于产出不像模板、有明确编辑设计取向的视觉稿。',
    descriptionEn: 'A skill for producing minimal zine-style posters, characterised by restrained typography and generous whitespace, for visuals that read as edited design rather than a template.'
  },
  'ningzimu/image-to-editable-ppt-skill': {
    taglineZh: '把图片和 PDF 变回可编辑幻灯片',
    taglineEn: 'Turns slide images and PDFs back into editable decks',
    useWhen: '只有截图没有源文件', useWhenEn: 'you only have screenshots, not the source deck',
    fn: 'docs', category: 'community',
    aboutZh: '把幻灯片截图、PDF 还原成可继续编辑的演示文稿的技能，用于在拿不到原始文件时重建一份能改的稿子。',
    descriptionEn: 'Reconstructs an editable presentation from slide screenshots or a PDF, for when the original file is gone and all you have is the output.'
  },
  'DrCatHicks/learning-opportunities': {
    taglineZh: '把日常任务变成刻意练习的机会',
    taglineEn: 'Turns everyday tasks into deliberate practice',
    useWhen: '想边干活边提升', useWhenEn: 'you want to improve while working',
    fn: 'content', category: 'community',
    aboutZh: '把当前任务转成技能练习机会的技能，在完成工作的同时刻意训练相关能力，用于避免长期重复劳动而不见长进。',
    descriptionEn: 'Reframes the task at hand as a deliberate practice opportunity, so doing the work also trains the underlying skill instead of repeating it on autopilot.'
  },
  'dekart-xyz/geosql': {
    taglineZh: '让 AI 直接查地理空间数据',
    taglineEn: 'Lets an agent query geospatial data directly',
    useWhen: '处理地图与地理数据', useWhenEn: 'working with maps and geospatial data',
    fn: 'research', category: 'community',
    aboutZh: '面向地理空间数据的技能，把空间查询的常见写法交给智能体，用于处理地图、坐标与区域统计这类容易被通用模型搞错的任务。',
    descriptionEn: 'A geospatial skill handing an agent the usual spatial query patterns, for map, coordinate and regional-aggregate work that general models tend to get wrong.'
  },
  'M1n-n9/paper-lifecycle': {
    taglineZh: '论文全流程助手，从选题到投稿',
    taglineEn: 'A paper-lifecycle assistant from topic to submission',
    useWhen: '要写论文或投稿', useWhenEn: 'writing or submitting a paper',
    fn: 'research', category: 'community',
    aboutZh: '覆盖论文生命周期各阶段的技能，从选题、文献与写作到投稿准备，用于让智能体在学术写作流程中承担可复用的具体环节。',
    descriptionEn: 'A skill covering the stages of a paper — topic selection, literature, writing and submission preparation — so an agent handles the repeatable parts of academic writing.'
  },
  'aklofas/kicad-happy': {
    taglineZh: 'KiCad 电路设计，从原理图到布线',
    taglineEn: 'Skills for designing circuits in KiCad',
    useWhen: '画电路板与原理图', useWhenEn: 'drawing schematics and boards',
    fn: 'coding', category: 'community',
    aboutZh: '面向硬件设计的技能集，覆盖 KiCad 中的原理图绘制、元件选型与布线检查，用于让智能体参与电路设计的具体环节。',
    descriptionEn: 'Skills for hardware work covering schematic capture, part selection and layout review in KiCad, so an agent can take part in the concrete steps of circuit design.'
  }
}

const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
const have = new Set(catalog.repos.map((r) => r.fullName))
const probed = existsSync(probedPath) ? JSON.parse(readFileSync(probedPath, 'utf8')) : []
const probeByName = new Map(probed.map((p) => [p.fullName, p]))

const MANIFESTS = /^(package\.json|Cargo\.toml|pyproject\.toml|setup\.py|go\.mod|CMakeLists\.txt|Makefile|build\.gradle|pom\.xml|Gemfile|composer\.json|requirements\.txt|tsconfig\.json)$/i
const SRC_DIRS = /^(src|lib|app|packages|crates|internal|cmd)\//
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|py|rs|go|java|kt|rb|php|c|cc|cpp|h|hpp|swift|cs|scala|dart)$/i
const SCAFFOLD = /(^|\/)(templates?|fixtures?|examples?)(\/|$)/i

const added = []
const problems = []
const skipped = []

for (const [fullName, copy] of Object.entries(COPY)) {
  // Re-running this script is normal; an entry already present is skipped.
  if (have.has(fullName)) { skipped.push(fullName); continue }
  const p = probeByName.get(fullName)
  if (!p) { problems.push(`${fullName}: 探测结果里没有（请先跑 probe）`); continue }

  // --- the authoring rules the gates enforce, checked before writing ---
  const tl = [...copy.taglineZh].length
  if (tl < 13 || tl > 32) problems.push(`${fullName}: 中文简介 ${tl} 字，超出 13–32`)
  if (!copy.taglineEn) problems.push(`${fullName}: 缺英文简介`)
  if ([...copy.aboutZh].length < 25) problems.push(`${fullName}: 中文详情过短`)
  if (copy.descriptionEn.length < 25) problems.push(`${fullName}: 英文详情过短`)
  if (copy.aboutZh.trim() === copy.taglineZh.trim()) problems.push(`${fullName}: 详情与简介雷同`)
  if (!copy.useWhen || !copy.useWhenEn) problems.push(`${fullName}: 缺使用场景`)
  if (!copy.fn) problems.push(`${fullName}: 缺功能分类`)

  const [owner, name] = fullName.split('/')
  /*
    A skill that lives at the repository root arrives as an empty path and used
    to be dropped by the scaffold filter — silently turning single-skill repos
    into "reference material". Its folder name when installed is the repository
    name, so that is what the catalog records, matching what discover.ts does
    when it matches an on-disk skill back to a source.
  */
  const skillDirs = p.skillDirs
    .map((d) => (d === '' ? name : d))
    .filter((d) => !SCAFFOLD.test(d))
  const manifests = p.manifests
  const srcFiles = p.srcFiles
  const repoKind = skillDirs.length === 0 ? 'reference' : manifests.length > 0 && srcFiles >= 8 ? 'software' : 'skills'

  added.push({
    fullName, owner, name,
    descriptionEn: copy.descriptionEn,
    descriptionZh: copy.aboutZh,
    stars: p.stars,
    forks: 0,
    openIssues: 0,
    topics: p.topics,
    category: copy.category,
    license: p.license,
    homepage: p.homepage,
    avatarUrl: p.avatarUrl,
    defaultBranch: p.branch,
    pushedAt: p.pushedAt,
    archived: false,
    htmlUrl: `https://github.com/${fullName}`,
    skillDirs,
    skillCount: skillDirs.length,
    truncatedTree: p.truncatedTree,
    installHint: `npx skills add ${fullName}`,
    fn: copy.fn,
    taglineZh: copy.taglineZh,
    taglineEn: copy.taglineEn,
    useWhen: copy.useWhen,
    useWhenEn: copy.useWhenEn,
    aboutZh: copy.aboutZh,
    skillDirsAll: skillDirs.length,
    repoKind,
    repoFacts: { language: null, markdown: 0, codeFiles: 0, srcFiles, manifests }
  })
}

if (problems.length) {
  console.error('以下条目未通过上架前的自检，未写入：')
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}

if (skipped.length) console.log(`跳过已在目录中的 ${skipped.length} 个`)
console.log(`准备新增 ${added.length} 个仓库：`)
for (const a of added) {
  console.log(`  ${String(a.stars).padStart(7)}  ${a.fullName.padEnd(48)} ${String(a.skillCount).padStart(4)} 技能  ${a.repoKind.padEnd(9)} ${a.fn.padEnd(11)} ${a.taglineZh}`)
}

if (dryRun) { console.log('\n--dry-run，未写入'); process.exit(0) }

catalog.repos.push(...added)
catalog.repos.sort((a, b) => (b.stars || 0) - (a.stars || 0))
catalog.addedAt = new Date().toISOString()
writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + '\n', 'utf8')
console.log(`\n已写入。目录现共 ${catalog.repos.length} 个仓库 · ${catalog.repos.reduce((n, r) => n + (r.skillCount || 0), 0)} 个技能`)
