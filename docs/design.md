# 个人博客设计文档

> 版本：v0.7 · 日期：2026-11-02 · 状态：设计基线，第一版核心功能已实现，实施状态见 README。\
> 技术方向：Go + Gin + GORM / GORM Gen Query + React / Next.js。本文描述正式系统，配套包含独立演示原型，以及 web/src 与 server/src 中已连接 PostgreSQL 的正式工程。\
> 本版约束：全部应用路由以 `/v1` 开头；后端 `server/src`、前端 `web/src`；数据库操作全部位于 `server/src/infrastructure/db`；仅六张业务表；浏览留痕与审计纳入第一版。\
> 默认站名：「Clarence Liu」。博客名称通过后台「站点设置」动态配置，不硬编码在业务组件中。

## 目录

1. [目标与设计假设](#1-目标与设计假设)
2. [角色与权限](#2-角色与权限)
3. [主要功能与业务规则](#3-主要功能与业务规则)
4. [页面与交互](#4-页面与交互)
5. [UI 风格与样式规范](#5-ui-风格与样式规范)
6. [技术架构](#6-技术架构)
7. [项目目录结构](#7-项目目录结构)
8. [数据模型：只保留六张业务表](#8-数据模型只保留六张业务表)
9. [路由、统一返回体与分页](#9-路由统一返回体与分页)
10. [代码风格与工程约定](#10-代码风格与工程约定)
11. [安全、性能与部署](#11-安全性能与部署)
12. [开发顺序与验收标准](#12-开发顺序与验收标准)
13. [原型说明与参考](#13-原型说明与参考)

## 1. 目标与设计假设

搭建一个可以长期使用的个人博客：博主在后台写作和管理互动，读者在前台阅读、留言、点赞、收藏，并能找回自己的互动记录。

本设计采用以下默认规则，后续可调整：

- 单博主、多读者；管理员由命令行创建，不开放管理员注册。
- 所有人可阅读已发布文章及公开留言；登录后可发表评论、留言、点赞、收藏。
- 第一版使用用户名和密码注册、登录。邮箱与第三方 OAuth 登录作为后续扩展，不依赖邮件服务即可运行。
- 「留言」包括文章评论，以及独立留言板，两者均可由博主回复。
- 收藏和点赞列表仅本人可查看，不对其他读者公开。
- 文章使用 Markdown，支持代码块、表格、图片、引用及自动目录；正文不执行任意 HTML、脚本或 MDX。
- 第一版支持草稿、发布、撤回、回收站，不实现定时发布、多人协同和复杂角色系统。

## 2. 角色与权限

| 行为 | 未登录访客 | 登录读者 | 博主 / 管理员 |
| --- | --- | --- | --- |
| 阅读已发布文章、公开评论和留言 | ✓ | ✓ | ✓ |
| 查看草稿或回收站文章 | — | — | ✓ |
| 留言、评论、点赞、收藏 | 提示登录 | ✓ | ✓ |
| 查看个人点赞、收藏 | — | 仅本人 | 仅自己的记录 |
| 删除自己的评论或留言 | — | ✓ | ✓ |
| 回复评论、留言 | — | 第一版不开放读者互相回复 | ✓ |
| 发布和编辑文章、预览草稿 | — | — | ✓ |
| 管理所有评论、隐藏内容 | — | — | ✓ |

前端隐藏操作用于改善体验，真实权限由 Go API 在每次请求时校验。

## 3. 主要功能与业务规则

### 3.1 后台：文章 CRUD

- 列表：按草稿、已发布、回收站筛选，支持标题搜索、分页、按更新时间排序。
- 新建：填写标题、固定链接 slug、摘要、分类、标签、封面、Markdown 正文。
- 编辑：手动保存；内容变更后 3 秒自动保存到草稿，显示「保存中 / 已保存 / 保存失败」。自动保存不等于发布。
- 发布：校验标题、正文、slug；首次发布生成发布时间。已发布文章再次编辑时仍保留线上版本，显式点击「更新发布」才替换。
- 撤回：文章退出公开列表，公开详情返回 404；重新发布时保留首次发布时间，更新修改时间。
- 删除：移入回收站并取消公开可见性，可恢复为草稿。永久删除需要二次确认，删除相关评论、点赞、收藏关系；审计记录独立保留。媒体通过文件存储管理，不单独建表，不随文章立即删除。
- 冲突保护：保存携带 version，版本过期返回 409，提示重新载入，避免多标签页覆盖。
- 第一版 slug 首次发布后不可改，避免已有链接失效；未来若开放修改必须增加 301 重定向。

### 3.2 后台：博客预览

- 编辑器支持「写作 / 分屏 / 预览」；前后台共享 Markdown 渲染组件、代码高亮与正文排版。
- 独立预览地址 `/v1/admin/posts/{id}/preview`，通过当前管理员会话读取工作草稿；禁止匿名访问，不采用公开可猜测链接。
- 预览标注「草稿预览」，隐藏读者互动按钮，返回 `noindex` 和 `Cache-Control: private, no-store`。
- 未保存内容可在编辑器内即时预览；打开独立预览前先完成保存，失败则留在编辑器并提示。

### 3.3 后台：查看、回复与管理评论

- 统一收件箱包含文章评论与留言板留言，支持按来源、可见状态、是否已读、是否已回复筛选。
- 展示用户、时间、正文、来源文章和上下文；管理员查看后记录已读。
- 博主可以回复、修改自己的回复、隐藏违规内容、删除内容；回复旁显示「博主」标识。
- 显示状态与阅读状态独立：`visible / hidden / deleted` 控制前台可见性，`read_at` 表示博主已读，是否回复由可见管理员回复计算。
- 第一版采用两层结构：读者评论为根节点，博主回复位于第二层；回复不再嵌套。
- 删除根评论后保留「该评论已删除」占位及可见回复；隐藏根评论时整条讨论不向前台展示。删除和隐藏均不作为公开分页计数。
- 第一版合法留言立即可见，提供服务端限流及后台隐藏操作；垃圾内容增多后再引入发布前审核。

### 3.4 前台：展示与阅读

- 首页：摄影背景、个人主张、精选文章、最新文章。
- 列表：按分类、标签筛选，按发布时间倒序，支持标题和摘要关键词搜索、分页。
- 详情：标题、分类、发布时间、更新日期、预计阅读时间、正文、目录、上一篇 / 下一篇。
- SEO：服务端输出正文、标题、摘要、canonical、Open Graph；生成 sitemap、RSS；草稿和后台不被收录。
- 状态：加载、空列表、搜索无结果、文章不存在、网络失败均有明确页面与重试入口。

### 3.5 前台：留言与评论

- 文章底部评论区；独立 `/v1/guestbook` 留言板。
- 未登录可以阅读讨论，提交时打开登录界面，登录后回到原页面并保留未提交文字。
- 评论和留言使用纯文本，长度 1–2000 字符；禁止空白内容、任意 HTML 与脚本。
- 提交期间防止重复点击；成功插入列表，失败保留输入并允许重试。
- 用户可以删除自己的内容；第一版不开放修改已发内容，减少引用上下文变化。

### 3.6 前台：点赞、收藏与个人记录

- 同一用户对同一文章最多一条点赞、一条收藏；再次点击取消，后端幂等。
- 前端可乐观更新，失败则回滚并提示；切换文章、刷新和重新登录后从后端读取状态。
- `/v1/me/likes` 与 `/v1/me/bookmarks` 分别展示自己的记录，按发生时间倒序分页；取消操作后当前列表同步更新。
- 列表中被撤回或回收的文章显示通用「文章暂不可用」占位，不返回其标题、摘要、封面或正文；用户仍可取消关系。重新发布后恢复可见。
- 文章永久删除后级联删除对应关系；点赞总数由有效关系计算，读者无须公开自己的收藏记录。

### 3.7 账号

- 用户名 3–24 个字符，规范化后唯一；密码 10–128 个字符，服务端只保存密码哈希。
- 注册成功后进入阅读态；登录页支持回到站内来源路径，拒绝外部跳转地址。
- 设置页允许修改昵称、修改密码、退出登录；修改密码使其他会话失效。
- 第一版不收集邮箱，因此无邮件找回；站点维护者可通过服务器上的受限命令重置用户密码。

### 3.8 后台：站点设置

- 仅管理员可修改。支持博客名称（必填，1–24 字符）、英文名称（可选，最多 40 字符）、博客简介（最多 120 字符）、首页背景动画开关。
- 保存后统一更新导航、页脚、浏览器标题、博主回复署名，以及正式系统的页面 metadata、Open Graph、RSS 中的站点名称。
- 名称作为纯文本渲染，不接受 HTML。读者昵称、文章标题和正文不随站点名称修改。
- 正式配置保存到站点所有者用户行的 `site_settings` JSONB 字段，不单独建表；管理更新携带 version，冲突返回 409。公开配置接口只返回展示字段，不暴露存储凭据或管理员信息。
- 原型使用当前浏览器 localStorage 保存站点设置，刷新或重新打开后继续生效；受限环境下回退为当前预览状态。

### 3.9 后台：浏览留痕、埋点与审计

- 所有页面访问、文章读取、登录 / 退出、搜索、点赞收藏、评论回复、文章发布删除和配置变更均记录相应事件或审计。
- 管理员在「审计与访问轨迹」按时间、用户 / 匿名访客标识、事件、资源、结果和 request_id 查询，查看单次访问的页面轨迹。
- 读者只能访问自己的业务记录，不能查询全站审计；管理员读取审计本身也要留痕。
- 浏览轨迹是服务端访问记录与客户端埋点共同形成的证据链，不把预取、SSR 请求或客户端上报等同于真实阅读。实现规则见第 11 节。

## 4. 页面与交互

| 路径 | 页面 | 主要内容 |
| --- | --- | --- |
| `/v1` | 首页 | 全幅摄影 Hero、精选文章、最新文章 |
| `/v1/posts` | 文章列表 | 搜索、分类、标签、分页 |
| `/v1/posts/[slug]` | 文章详情 | 正文、目录、点赞、收藏、评论 |
| `/v1/guestbook` | 留言板 | 留言表单、公开留言和博主回复 |
| `/v1/about` | 关于 | 博主介绍、站点说明 |
| `/v1/login`、`/v1/register` | 账号 | 登录和注册 |
| `/v1/me/likes`、`/v1/me/bookmarks` | 我的记录 | 点赞 / 收藏 Tab、记录列表 |
| `/v1/me/settings` | 账号设置 | 昵称、密码、退出登录 |
| `/v1/admin/posts` | 文章管理 | 搜索、状态筛选、新建、编辑、回收站 |
| `/v1/admin/posts/new` | 新建文章 | 元信息与 Markdown 编辑器 |
| `/v1/admin/posts/[id]/edit` | 编辑文章 | 草稿、自动保存、预览、发布 |
| `/v1/admin/posts/[id]/preview` | 草稿预览 | 与前台一致的阅读样式 |
| `/v1/admin/comments` | 评论管理 | 筛选、已读、回复、隐藏、删除 |
| `/v1/admin/settings` | 站点设置 | 博客名称、英文名称、简介、背景动画开关 |
| `/v1/admin/audits` | 审计与访问轨迹 | 访问轨迹、操作记录、异常事件筛选 |

主要流程：

```text
博主：登录 → 新建文章 → 保存草稿 → 预览 → 发布 → 查看评论 → 回复
读者：首页 → 文章 → 登录 → 点赞 / 收藏 / 评论 → 我的记录 → 再次阅读
留言：首页导航 → 留言板 → 留言 → 博主后台查看 → 回复 → 留言板可见
```

## 5. UI 风格与样式规范

### 5.1 参考方向

当前视觉以 [前端视觉调研](frontend-redesign.md) 为准：全屏雨夜摄影、炭黑／苔绿底、米白文字、黄铜色细节、柔和文楷。登录窗口参考用户提供的大幅影像＋内容分栏，使用 Radix 实现键盘与焦点交互。每次迭代按 [Harness](../harness/README.md) 记录。

- 首页有摄影氛围与留白；文章区、评论区和后台保持稳定实色底，减少背景干扰。
- 采用克制的实色、细边框和留白；首页单行小字号打字诗句，完成后停留，不展示作者行。
- 后台沿用暗色材质与细边框，但以表格和编辑器为核心，提高信息密度。
- 首页使用静音循环动态雨夜背景，提供「暂停 / 播放背景」按钮；系统设置减少动态效果时使用静态封面，页面不可见或背景离开视口时暂停。播放失败时保留静态背景，不阻塞正文与按钮。
- 页面外壳铺满浏览器窗口，无外层黑边、留白和圆角；摄影背景始终覆盖首屏。阅读区域仍保留适当最大宽度，保证长文阅读舒适。

### 5.2 设计 Token

```css
:root {
  --bg: #101110;
  --surface: #181a18;
  --surface-raised: #232622;
  --glass: rgba(28, 30, 36, 0.78);
  --border: rgba(255, 255, 255, 0.12);
  --text: #eeeae1;
  --text-secondary: #b4b6aa;
  --text-muted: #969b90;
  --accent-amber: #d1bc92;
  --accent-pink: #cdb5a5;
  --success: #a1dbb5;
  --danger: #ff9494;
  --radius-control: 12px;
  --radius-panel: 24px;
  --content-width: 1200px;
  --reading-width: 740px;
}
```

### 5.3 排版、布局与组件

| 元素 | 样式 |
| --- | --- |
| 字体 | 标题／正文自托管霞鹜文楷 Regular，控件用 PingFang SC 等系统字体；代码等宽 |
| 首页标题 | 单行诗句，桌面 24–44px、移动端 20–27px，逐字呈现，不显示作者行 |
| 文章标题 | 桌面 42–52px，移动端 30–36px |
| 正文 | 19px、行高 2.1，段落间距 20–24px，最大宽度 740px |
| 辅助文字 | 13–14px；可交互内容至少 14px |
| 间距 | 4px 基础倍数：8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 |
| 容器 | 页面外壳全宽；首屏背景 cover 铺满；内容区最大 1200px，桌面内部留白至少 40px，移动端 20px |
| 玻璃面板 | 1px 半透明边框、24px 圆角、18px 模糊；浏览器不支持时回退实色 |
| 主按钮 | 暖色浅底、深色文字，胶囊或 12px 圆角；悬停轻微提亮 |
| 次按钮 | 深色半透明底 + 细边框，禁用状态保留可读文本 |
| 输入框 | 深色实底，独立可见 label，聚焦显示暖色描边 |
| 图标 | Lucide，常规 18–20px；纯图标按钮必须有可访问名称 |
| 动效 | 150–220ms，悬停位移最多 2px，减少动态效果时关闭 |

组件清单：SiteHeader、Hero、PostCard、PostList、ArticleBody、TableOfContents、LikeButton、BookmarkButton、CommentThread、CommentComposer、AuthDialog、CollectionTabs、AdminSidebar、PostTable、MarkdownEditor、PublishPanel、CommentInbox、EmptyState、ErrorState、Toast、ConfirmDialog。

### 5.4 响应式与无障碍

- ≥1200px：文章双列卡片，阅读区 + 目录，后台侧栏常驻。
- 768–1199px：容器收紧，编辑器可切换分屏；目录折叠。
- <768px：首页卡片单列，标题缩小；导航换行或收纳；后台侧栏转为顶部菜单，编辑器单栏。
- 控件触摸目标不少于 44px；键盘能完成登录、收藏、评论和后台发布。
- 所有表单有可见 label；错误与保存结果使用 aria-live；颜色以外提供文字状态。
- 背景摄影必须叠加足够遮罩，最终实现检查文字对比度达到 WCAG AA。

## 6. 技术架构

采用 **Next.js + React + TypeScript / Go + Gin + GORM + GORM Gen / PostgreSQL / Docker Compose**。

```text
浏览器：/v1、/v1/posts/*、/v1/admin/*
  │ HTTPS，同源、统一 request_id
  ▼
Caddy / Nginx
  ├── /v1/api/* ───→ Go Router → 中间件 → Handler → Service
  │                                             └→ infrastructure/db（UnitOfWork / Stores）
  │                                                  └→ GORM Gen query → PostgreSQL
  │                                                      ├→ 业务表
  │                                                      └→ audit_logs
  ├── /v1/healthz、/v1/readyz ─→ Go 健康检查
  └── /v1/* ───────→ Next.js（公开页面 SSR + React 交互）

访问日志 / 应用日志 → 结构化 JSON 文件 → 轮换与持久化
背景与图片 → /v1/uploads/* 或 /v1 下的构建静态资源
```

- Go 是业务、权限、会话、审计和数据写入的唯一入口；前端不直连数据库。
- Service 通过 `infrastructure/db` 暴露的 UnitOfWork / Stores 组合数据操作；具体数据库操作在 db 内使用同一个 `*query.Query`，禁止在事务中逃回全局连接。
- GORM Gen 在构建期从 `models/entity` 六个实体生成 `src/infrastructure/db/query`；`query` 是本项目的生成包，不是可直接导入的 `gorm.io/gorm/query` 包。采用官方提供的 `query.Use(db)` 和 `q.Transaction(...)` 模式。[GORM Gen 官方说明](https://gorm.io/gen/index.html)、[事务说明](https://gorm.io/gen/transaction.html)
- 公开文章服务端渲染，初版内容响应不缓存；个人页、后台、预览及身份状态接口使用 `private, no-store`。
- SSR、预取、站点地图和 RSS 与用户浏览事件区分，不能从 API 调用次数直接推导真人浏览量。
- 不引入 Redis、消息队列或独立埋点服务；日志、埋点与审计由现有进程和审计表完成，失败补偿使用持久化日志文件。

## 7. 项目目录结构

后端最上层目录为 `server`，核心 Go 代码统一在 `server/src`；数据库初始化、GORM 查询、事务、迁移、分页查询与审计落库全部收敛到 `server/src/infrastructure/db`，不保留独立 `repository`、`database` 或顶层 `query` 目录。前端最上层目录为 `web`，前台、后台均为 React 代码，核心代码位于 `web/src`。`prototype` 仍是独立评审材料，不混入正式 React 工程。

```text
blog/
├── README.md
├── server/config/config.example.yaml   # 配置模板，私有 config.yaml 不入库
├── docs/
│   ├── design.md
│   ├── openapi.yaml
│   └── assets/
├── prototype/                         # 已有设计预览，非正式业务代码
├── web/                               # 只放 Web / React 工程及其配置
│   ├── package.json
│   ├── next.config.ts                 # basePath: /v1
│   ├── tsconfig.json
│   ├── public/
│   └── src/
│       ├── app/                       # Next.js 页面，统一挂在 /v1
│       │   ├── (site)/                # 首页、文章、留言、关于
│       │   ├── (auth)/                # 登录、注册
│       │   ├── me/                    # 点赞、收藏、账号设置
│       │   ├── admin/                 # 文章、编辑、预览、评论、站点设置、审计
│       │   ├── sitemap.ts
│       │   ├── robots.ts
│       │   └── feed.xml/route.ts
│       ├── router/
│       │   ├── index.ts               # 导航与跳转统一出口
│       │   ├── routes.ts              # 逻辑路由常量、动态参数编码
│       │   └── guards.ts              # 交互守卫，真实权限仍由后端校验
│       ├── api/
│       │   ├── client.ts              # 统一请求、CSRF、错误与 request_id
│       │   ├── endpoints.ts           # API_BASE=/v1/api，集中定义接口
│       │   └── generated.ts           # 从 OpenAPI 生成响应类型
│       ├── components/ui/
│       ├── features/                  # auth/posts/editor/comments/collections/settings/audits
│       ├── telemetry/                 # 统一页面埋点、停留与阅读进度
│       ├── lib/markdown/              # 正文与草稿预览共用
│       └── styles/tokens.css
├── server/
│   ├── go.mod
│   ├── go.sum
│   ├── config/                        # YAML 进程配置（config.yaml / config.example.yaml）
│   ├── storage/                       # 上传文件、滚动日志、失败重放文件，不入库
│   ├── src/
│   │   ├── cmd/
│   │   │   ├── api/main.go
│   │   │   ├── admin/main.go           # 创建管理员、密码重置
│   │   │   └── gen/main.go             # 仅调用 db/generator 的生成入口
│   │   ├── config/
│   │   ├── router/
│   │   │   ├── router.go              # /v1 根分组、中间件与统一兜底
│   │   │   ├── public.go              # 公开与认证接口注册
│   │   │   ├── reader.go              # 登录读者接口注册
│   │   │   └── admin.go               # 管理与审计接口注册
│   │   ├── middleware/                # request_id、访问日志、认证、CSRF、限流
│   │   ├── handler/                   # HTTP 绑定、VO 转换，禁止直接组织 SQL
│   │   ├── service/                   # 文章、评论、关系、认证、设置、埋点、审计
│   │   ├── models/
│   │   │   ├── entity/                # User/AuditLog/Post/Draft/Reaction/Comment
│   │   │   ├── dto/                   # 请求参数，不承载 ORM 实体
│   │   │   └── vo/                    # 全部对外响应模型
│   │   │       ├── common/
│   │   │       │   ├── response.go     # Response[T]，统一返回消息体
│   │   │       │   ├── pagination.go   # PageData[T] / Pagination
│   │   │       │   └── error.go        # 业务错误码与安全的错误展示字段
│   │   │       ├── user.go
│   │   │       ├── post.go
│   │   │       ├── comment.go
│   │   │       ├── reaction.go
│   │   │       ├── audit.go
│   │   │       └── site.go
│   │   ├── infrastructure/
│   │   │   └── db/                    # 数据库操作唯一入口，Go 包名 db
│   │   │       ├── connection.go      # GORM 初始化、连接池、日志适配、关闭
│   │   │       ├── transaction.go     # UnitOfWork，统一事务出口
│   │   │       ├── stores.go          # 绑定当前事务的 Stores / NewStores
│   │   │       ├── scopes.go          # 公共筛选、排序白名单、可见性
│   │   │       ├── pagination.go      # Count/List 查询组合，不重复定义分页 VO
│   │   │       ├── user.go            # 账号、会话相关操作
│   │   │       ├── post.go            # 文章查询与发布
│   │   │       ├── draft.go           # 草稿保存、锁与版本校验
│   │   │       ├── reaction.go        # 点赞 / 收藏查询与幂等变更
│   │   │       ├── comment.go         # 留言、评论、博主回复
│   │   │       ├── audit.go           # 审计追加、轨迹查询、幂等落库
│   │   │       ├── settings.go        # 用户行中站点配置的局部更新
│   │   │       ├── query/             # GORM Gen 生成的六实体 Query，禁止手改
│   │   │       ├── generator/         # Query 生成配置与实现
│   │   │       ├── migrations/        # 六张业务表的版本化 DDL 与执行器
│   │   │       └── tests/             # 数据库集成测试与事务故障注入
│   │   ├── response/                  # Success/Fail/Page，使用 common VO 序列化
│   │   ├── audit/                     # 事件白名单、编排、失败补偿，落库委托 db
│   │   ├── logger/                    # slog、轮换、脱敏、关联字段
│   │   └── storage/                   # 媒体文件接口
│   └── tests/integration/             # API 集成测试，通过 db 测试入口准备数据
├── deploy/
│   ├── compose.yaml
│   ├── Caddyfile
│   ├── api.Dockerfile
│   └── web.Dockerfile
└── scripts/
    ├── build-preview.py
    ├── dev.sh
    └── backup.sh
```

路由封装约定：

- 后端只在 `src/router` 注册路由；`/v1`、`/api`、认证和管理分组集中定义，Handler 内不注册路由。
- 前端页面由 `web/src/app` 路由文件承载，导航只能使用 `web/src/router` 的常量与 helper；API 地址只在 `web/src/api` 定义，组件中不拼接路径。
- Next.js 的 `basePath: "/v1"` 只负责页面与构建资源前缀。内部 Link / router helper 接收不含前缀的逻辑地址，由 Next.js 添加一次 `/v1`；埋点、canonical、RSS 等外部完整地址使用单独的 `toPublicPath` helper。不得出现 `/v1/v1`。
- 前端 API client 固定访问 `/v1/api`；不要把 Next.js 页面 basePath 再叠加到 API 地址。
- 正式业务代码已按此结构落地；prototype 是单独保留的离线设计评审材料，不参与正式运行。

## 8. 数据模型：只保留六张业务表

| 表 | GORM 实体 | 关键字段与约束 |
| --- | --- | --- |
| `users` | User | id、username、display_name、password_hash、role、is_site_owner、sessions JSONB、site_settings JSONB、settings_version、auth_version、created_at、updated_at；规范化 username 唯一 |
| `audit_logs` | AuditLog | id、event_id、event_type、category、source、actor_id、actor_username、client_ip、visitor_id、visit_id、page_view_id、seq、request_id、target_type、target_id、route、method、status_code、result、duration_ms、ip_hash、user_agent_summary、payload JSONB、occurred_at、received_at |
| `posts` | Post | id、slug、status、title、excerpt、markdown、category、tags JSONB、cover JSONB、published_at、updated_at、deleted_at、version；只保存当前已发布内容 |
| `drafts` | Draft | post_id（主键兼外键）、title、excerpt、markdown、category、tags JSONB、cover JSONB、version、updated_at；每篇文章一条工作副本 |
| `reactions` | Reaction | user_id、post_id、kind、created_at；kind=like/bookmark，联合主键 (user_id,post_id,kind) |
| `comments` | Comment | id、post_id、parent_id、author_id、body、status、read_at、created_at、updated_at、deleted_at；post_id 为空表示留言板，parent_id 为空表示根留言 |

### 8.1 压表后的归属

- 分类保存为字符串，标签保存为规范化字符串数组；公开分类 / 标签列表由已发布文章去重产生，不建分类、标签和关联表。
- 点赞与收藏放在 `reactions`，按 kind 分别查询和统计；同一用户可同时点赞并收藏同一文章。
- `posts` 保存公开版本，`drafts` 保存编辑版本；删除 `post_revisions` 设计，第一版不提供完整历史版本回滚。审计中记录变更字段和摘要哈希，不用审计表伪装版本库。
- 封面只保存文件 key、类型、尺寸等小型元信息；正文图片引用受控上传地址。文件实际放磁盘或对象存储，不建媒体表。
- 仅站点所有者用户行承载 `site_settings`；用部分唯一索引保证最多一名 `is_site_owner=true` 用户，约束该用户必须是 admin。初始化创建所有者并写默认配置，不建配置表。账号常规接口永不序列化该列。
- 不建会话表；`users.sessions` 保存最多 5 个活动会话的 session_id、secret_hash、expires_at、auth_version。Cookie 携带随机凭据和仅用于定位的 user_id/session_id；服务端必须校验凭据哈希、过期时间和版本，不能凭 user_id 确认身份。登录、退出、密码修改对该用户行加锁后更新指定列，禁止全对象 Save 覆盖站点配置。
- 合并表会增加用户行中 JSONB 的职责，这是六表限制下的明确取舍；通过独立类型、局部更新和db 内专用数据操作封装隔离，而非用任意 JSON 代替全部关系建模。
- GORM 关闭隐式关联建表，不声明会创建额外表的 many2many；迁移工具用文件 / 已有部署记录管理迁移状态，不隐式增加第七张业务或元数据表。若未来必须引入迁移状态表，应单独变更本约束。

### 8.2 事务与约束

- 发布：锁定文章和草稿 → 校验 draft.version 与 post.version → 将草稿完整写入 posts（含标签和封面）→ 更新状态和版本 → 追加发布审计 → 提交。任何一步失败则全部回滚；日常保存草稿不能改公开正文。
- 互动：先按文章固定顺序锁定并校验可见性 → 创建 / 删除指定 kind 关系 → 根据实际 RowsAffected 记录成功变更。重复 PUT/DELETE 为成功无变化，访问日志仍记录请求，审计明确 `no_change`，不伪造新增记录。
- 回复：只能由管理员回复根留言，父子必须处于同一文章或同一留言板上下文，最多两层；写回复和审计在同一事务内。
- 永久删除文章：固定顺序清理留言、关系、草稿、文章并追加删除审计。`audit_logs.target_id` 是历史引用，不级联删除审计，不用外键绑定文章存活状态；不得在审计里保留可恢复的已删除全文。
- 修改站点配置：锁定所有者用户行，只更新 site_settings、settings_version 与 updated_at，并在同一事务写审计。
- 所有需要锁定文章的操作统一使用 `FOR UPDATE` 和相同锁顺序；外键与唯一约束仍由数据库兜底，不能只依赖前端或 ORM。
- 索引：posts(status,published_at,id)、comments(post_id,status,created_at,id)、reactions(user_id,kind,created_at,post_id)；审计按 (actor_id,occurred_at,id)、(visitor_id,visit_id,occurred_at,id)、(event_type,occurred_at,id)、request_id 建索引，event_id 唯一用于防重放。

## 9. 路由、统一返回体与分页

### 9.1 路由规则

**所有应用地址均以 `/v1` 开头；前台 `/v1/...`，Go API `/v1/api/...`，管理接口 `/v1/api/admin/...`。** 页面与 JSON API 分开，避免 `/v1/posts` 同时充当页面和接口。健康检查为 `/v1/healthz`、`/v1/readyz`，上传资源为 `/v1/uploads/...`；sitemap、RSS 和构建资源也需带前缀。

```go
// server/src/router/router.go：结构示意
v1 := engine.Group("/v1")
api := v1.Group("/api")
RegisterPublic(api, handlers)
RegisterReader(api, middleware.RequireUser(), handlers)
RegisterAdmin(api.Group("/admin", middleware.RequireAdmin()), handlers)
```

路由层统一安装 request_id、访问日志、错误映射、恢复、会话与限流；写请求额外校验 CSRF / Origin；不存在和不支持的方法也返回统一 VO。Next.js HTML 页面、媒体字节流、RSS 和健康检查响应按各自内容类型处理，不能把图片包装为 JSON。

### 9.2 公开与账号接口

| 方法 | 完整路径 | 说明 |
| --- | --- | --- |
| GET | `/v1/api/posts` | 公开列表，q/category/tag/page/page_size |
| GET | `/v1/api/posts/{slug}` | 公开详情，记录服务端内容读取事件 |
| GET | `/v1/api/posts/{id}/comments` | 可见评论与回复 |
| GET / POST | `/v1/api/guestbook` | 读取公开留言 / 登录后发布留言 |
| GET | `/v1/api/categories`、`/v1/api/tags` | 从公开文章中去重获取 |
| GET | `/v1/api/site` | 站点展示配置白名单 |
| GET | `/v1/api/auth/csrf` | 与匿名或登录会话绑定的 CSRF token |
| POST | `/v1/api/auth/register`、`/v1/api/auth/login` | 注册 / 登录与审计 |
| POST | `/v1/api/auth/logout` | 撤销当前会话并清除 cookie |
| POST | `/v1/api/events` | 前端埋点批量上报；允许匿名，字段白名单和限流 |

### 9.3 登录用户接口

| 方法 | 完整路径 | 说明 |
| --- | --- | --- |
| GET / PATCH | `/v1/api/me` | 当前用户 / 修改昵称 |
| PUT | `/v1/api/me/password` | 修改密码、撤销其他会话 |
| GET | `/v1/api/me/posts/{id}/reactions` | 私有点赞收藏状态 |
| PUT / DELETE | `/v1/api/posts/{id}/like` | 幂等点赞 / 取消 |
| PUT / DELETE | `/v1/api/posts/{id}/bookmark` | 幂等收藏 / 取消 |
| GET | `/v1/api/me/likes`、`/v1/api/me/bookmarks` | 个人分页记录，含 unavailable 占位 |
| POST | `/v1/api/posts/{id}/comments` | 评论已发布文章 |
| DELETE | `/v1/api/me/comments/{id}` | 删除自己的留言 |

文章不可见时禁止新增互动，允许本人取消旧关系；用户、访问身份都从服务端认证上下文推导，禁止相信上报的 user_id。

### 9.4 管理与审计接口

| 方法 | 完整路径 | 说明 |
| --- | --- | --- |
| GET / POST | `/v1/api/admin/posts` | 所有状态列表 / 新建草稿 |
| GET / PATCH | `/v1/api/admin/posts/{id}/draft` | 工作副本，version 冲突保护 |
| POST | `/v1/api/admin/posts/{id}/publish` | 发布草稿，事务与审计 |
| POST | `/v1/api/admin/posts/{id}/unpublish` | 撤回 |
| DELETE | `/v1/api/admin/posts/{id}` | 回收 |
| POST | `/v1/api/admin/posts/{id}/restore` | 恢复为草稿 |
| DELETE | `/v1/api/admin/posts/{id}/purge` | 永久删除 |
| POST | `/v1/api/admin/media` | 上传图片，文件留痕但无媒体表 |
| GET / PATCH / DELETE | `/v1/api/admin/comments[/{id}]` | 收件箱 / 设置状态 / 删除 |
| POST | `/v1/api/admin/comments/{id}/replies` | 回复根留言 |
| PATCH | `/v1/api/admin/replies/{id}` | 修改自己的管理员回复 |
| GET / PUT | `/v1/api/admin/settings` | 所有者行配置，带 version |
| GET | `/v1/api/admin/audits` | 审计分页，时间 / 用户 / 事件 / request_id 筛选 |
| GET | `/v1/api/admin/audits/visits/{visit_id}` | 单次访问轨迹，仅白名单字段 |

`comments[/{id}]` 是表格缩写，实际分别注册 collection GET 与 item PATCH / DELETE 三条路由，不能注册一个模糊路径。

### 9.5 统一返回消息体：models/vo/common

所有 Go JSON API（包括注册、删除、埋点、错误、401/404/405/429）必须使用同一个消息体。Handler 只能调用 `response.Success / response.Page / response.Fail`，禁止自行拼 gin.H 或直接序列化 Entity；返回模型集中在 `server/src/models/vo`，通用部分位于其 `common` 子目录。

```go
// server/src/models/vo/common/response.go
// 设计契约：HTTP 写出函数位于 src/response，VO 不依赖 Gin。
type Response[T any] struct {
    Code      string `json:"code"`       // OK 或稳定业务错误码
    Message   string `json:"message"`
    Data      T      `json:"data"`
    RequestID string `json:"request_id"`
    Timestamp string `json:"timestamp"`  // RFC 3339 UTC
}

// server/src/models/vo/common/pagination.go
type Pagination struct {
    Page       int   `json:"page"`
    PageSize   int   `json:"page_size"`
    Total      int64 `json:"total"`
    TotalPages int64 `json:"total_pages"`
    HasNext    bool  `json:"has_next"`
}

type PageData[T any] struct {
    List       []T        `json:"list"`
    Pagination Pagination `json:"pagination"`
}
```

列表成功示例：

```json
{
  "code": "OK",
  "message": "success",
  "data": {
    "list": [],
    "pagination": { "page": 1, "page_size": 12, "total": 0, "total_pages": 0, "has_next": false }
  },
  "request_id": "req_example",
  "timestamp": "2026-10-31T08:00:00Z"
}
```

失败示例（HTTP 409）：

```json
{
  "code": "POST_VERSION_CONFLICT",
  "message": "文章已在其他页面更新，请重新载入。",
  "data": null,
  "request_id": "req_example",
  "timestamp": "2026-10-31T08:00:00Z"
}
```

- 创建成功为 HTTP 201；其余成功（包括幂等 DELETE 和埋点持久化确认）为 HTTP 200，data 无内容时为 null。取消原来的 204，保证 JSON API 总有统一返回体。
- 失败同时保留真实 HTTP 400/401/403/404/405/409/413/429/500/503；业务 code 不替代 HTTP 状态，不把所有响应伪装成 200。
- ID 序列化为字符串，时间统一 RFC 3339 UTC；空列表必须为 []，不能是 null；密码、会话、内部栈与 SQL 不得出现在 VO。
- `X-Request-ID` 响应头与消息体中的 request_id 一致；校验错误若需要字段级提示，定义受控 ErrorData VO，不泄漏数据库细节。

### 9.6 统一分页

- 请求 DTO 位于 `models/dto/common/pagination.go`；page 默认 1、page_size 默认 12，最大 50。非整数、负数、0 和超限值返回 400；缺省值由统一 Normalize/Validate 处理。
- `offset=(page-1)*page_size`，检测整数溢出；统一 `created_at DESC,id DESC` 或明确的业务排序，排序字段走白名单。
- DTO 只处理入参；VO 只表示结果。Count 和 List 复用同一组权限 / 可见性 / 过滤条件，不能 Count 全表再 List 当前用户。
- total_pages 为向上取整；total=0 时为 0；page 超出总页数返回当前页空列表，保留真实 total，has_next=false。
- 普通列表使用 GORM Gen 的 Where / Count / Order / Limit / Offset；跨模块共享参数校验与结果组装，业务筛选保留在 infrastructure/db 各业务数据操作文件中。需要 count/list 同时点一致性的管理列表，放在同一 REPEATABLE READ 只读事务中。
- 访问轨迹按 visit_id + 时间 + id 排序，后续规模增大再增加游标分页 VO，不静默改变现有 page 契约。

## 10. 代码风格与工程约定

### 10.1 Go

- 使用 gofmt、go vet；CI 使用 golangci-lint，规则及工具版本固定在仓库。
- 包名小写单词；公开类型 UpperCamelCase，局部变量 lowerCamelCase，缩写遵循 Go 惯例，例如 userID、HTTPClient。
- handler 处理 HTTP 绑定和响应，service 负责权限与业务事务，infrastructure/db 通过生成的 query 包组织 ORM 查询；业务代码不依赖 Gin Context。
- ctx 为第一个参数，传递请求取消和超时；数据库参数化查询，不拼接用户输入。
- 错误包装使用 fmt.Errorf("...: %w", err)，通过 errors.Is/As 映射领域错误，禁止用字符串判断错误类型。
- 使用 slog 结构化日志，带 request_id；不记录密码、cookie、会话 token 或完整评论正文。
- 接口由使用方定义，只在替换实现或隔离重要依赖时创建；不生成无实际用途的通用基础业务类或数据访问类。
- 数据访问统一使用 GORM + GORM Gen 生成的 query 包，不采用 pgx / 手写 SQL 作为业务查询主路径。迁移保留版本化 SQL；运行时禁止 AutoMigrate 隐式扩表。

### 10.2 React / TypeScript

- TypeScript strict；禁止业务代码 any，禁止忽略类型错误构建。
- 组件名 PascalCase；变量和函数 camelCase；Hook 使用 use 前缀；路由文件遵循 Next.js 约定。
- Server Component 负责公开数据与页面渲染；仅对编辑器、表单、点赞收藏等交互边界使用 use client。
- UI 状态保持局部；服务端状态可使用 TanStack Query，避免把 API 数据重复存进全局 store。
- 表单使用统一 schema 校验；前端校验改善体验，后端仍完整校验。
- API snake_case 在 API 边界统一处理，内部保持一致；OpenAPI 生成响应类型，禁止各页面手写不同版本的结构。
- 基础组件放 web/src/components/ui，业务代码按 features 组织；复杂页面按可读职责拆分，不设置机械行数限制。
- ESLint + Prettier；2 空格、双引号、分号，具体以配置和格式化结果为准。
- 样式使用 Tailwind 与 CSS tokens；复杂正文样式集中维护，禁止每个页面复制自己的颜色值。
- 注释解释业务原因与边界；不用注释逐行复述代码。

### 10.3 Git 与依赖

- 分支按仓库约定使用 `codex/功能名`；提交使用 feat/fix/docs/refactor/test/chore 前缀。
- 提交 lockfile，固定包管理器和工具链；开发时确认选定版本的官方文档，不直接沿用调研样例中的老版本号。
- 本机 `server/config/config.yaml`、数据库、上传文件、构建缓存不入库；`config.example.yaml` 仅提供开发默认值和字段说明。应用不读取环境变量覆盖配置。

### 10.4 infrastructure/db：可复用查询与事务

本节“复用”落实为依赖显式、事务可传递、查询不共享可变状态和失败可回滚，不把“使用 ORM”当作事务保证。

1. 唯一数据库操作目录为 `server/src/infrastructure/db`：连接池、健康探测、查询、事务、迁移执行、分页查询、审计落库、会话与站点配置更新都由此实现。`src/cmd/api`、`src/cmd/admin`、`src/cmd/gen` 仅组装依赖或调用 db 公开入口，不直接操作数据库。
2. 生成配置位于 `infrastructure/db/generator`，Query 输出为 `infrastructure/db/query`。仅 db 内部接收和操作 `*gorm.DB` / `*query.Query`；Handler、Service、Middleware、audit 编排与健康检查 Handler 不导入 GORM 或生成 Query，不直接拼接 ORM 查询。db 内不调用 query.Q / query.SetDefault，不共享可变 Where 链，每次查询显式 WithContext；CI 校验生成文件无差异。
3. `UnitOfWork.Within` 是最外层 Service 的统一事务入口；它基于绑定请求 ctx 的 DB 建立事务，再用事务 Query 构造全套 Stores。Post、Draft、Reaction、Comment、User、Audit 共用同一连接。
4. 子服务接受本次 `*db.Stores` 或其所需的数据操作接口；已处于事务的子操作不重新开独立事务。需要局部回滚时显式定义 SavePoint，不能吞错后继续声称全部成功。
5. error 必须向上返回，业务操作或审计任何一步失败均不提交；panic 交给 ORM 回滚后由统一恢复中间件处理；提交失败同样返回错误。
6. 事务内不上传文件、不发网络请求、不启动使用该事务的 goroutine。文件先写临时区，业务提交后完成归档；中断后通过文件清理任务收敛孤儿文件，不宣称数据库事务能回滚外部存储。
7. 在 infrastructure/db 内分别定义 PublishedOnly、ByActor、ByReactionKind 等可组合筛选；响应分页复用 common VO。更新 false、0、空字符串时显式指定列或 map，避免 ORM 忽略零值。
8. 写操作统一采用乐观 version + 必要行锁；检查 RowsAffected，区分冲突、幂等无变化和实际修改。禁止盲目 Save 全实体或拼接用户排序字段。

事务边界示意（UnitOfWork、Stores / NewStores 均定义在 infrastructure/db，query 为其下生成包）：

```go
func (u *UnitOfWork) Within(ctx context.Context, fn func(*Stores) error) error {
    q := query.Use(u.db.WithContext(ctx))
    return q.Transaction(func(tx *query.Query) error {
        return fn(NewStores(tx))
    })
}

```

```go
// 应用层只依赖 db 的公开类型，不导入 GORM 或生成的 query 包。
// db 为 server/src/infrastructure/db 的导入包名。
return uow.Within(ctx, func(stores *db.Stores) error {
    draft, err := stores.Drafts.LockForPublish(ctx, postID, expectedVersion)
    if err != nil {
        return err
    }
    if err := stores.Posts.PublishFromDraft(ctx, draft); err != nil {
        return err
    }
    return stores.Audits.Append(ctx, publishEvent)
})
```

这里的数据操作方法都是 db 内待实现的项目封装，不是 GORM 自带 API。`q.Transaction` 的提交 / 回滚语义来自 [GORM Gen 官方事务文档](https://gorm.io/gen/transaction.html)，类型安全查询来自 [Query 文档](https://gorm.io/gen/query.html)。复用正确性必须通过不同用户、并发请求、真实 PostgreSQL 事务及故障注入验证。

### 10.5 YAML 应用配置

- 默认读取 `server/config/config.yaml`；API 与管理员 CLI 支持 `-config` 指定文件，Go 配置加载不使用 `os.Getenv` 或环境变量覆盖。
- 分组包括 server（端口 / 站点地址 / API 地址）、database（DSN）、security（审计密钥 / Secure cookie）、storage（路径）、admin（首次初始化凭据）。站名等展示设置仍保存在用户表，由后台配置。
- Next.js 的代理、SSR、metadata、RSS、sitemap 读取同一份 YAML，密钥只存在于服务端。修改配置后重启前后端。
- 示例文件可提交，本机文件不入库且权限为 0600。配置校验未知字段、重复 / 多文档、端口范围、地址、必填连接、密钥长度和 64KiB 文件上限；不输出完整配置或凭据。
- 相对存储路径以 YAML 文件所在目录为基准。集成测试使用显式 `-integration-config` 参数，不依赖 TEST_DATABASE_URL。

## 11. 安全、性能与部署

- 会话凭据仅在 users.sessions 中保存哈希及过期信息，不增加 sessions 表；使用随机不透明 Session，cookie 设置 HttpOnly、Secure、SameSite=Lax、Path=/；生产环境建议 `__Host-` 前缀，不设置 Domain。
- 所有修改请求校验 CSRF token 与 Origin，包含登录 / 注册流程；SSR GET 不触发业务状态修改，访问留痕单独记录。同源代理简化跨域配置。
- 密码使用 Argon2id，登录 / 注册 / 留言服务端限流；读者 token 无法调用管理接口。
- Markdown 禁用原始 HTML，再做输出净化；评论按纯文本转义。普通链接禁止 javascript 等危险协议。
- 上传只接受验证后的 JPEG/PNG/WebP，限制 10MB、尺寸和解码像素，服务端重新编码去除元数据；不接受 SVG 或任意可执行文件。文件名由服务器生成。
- 初版图片落持久化磁盘，预留对象存储接口；反向代理禁止把上传文件当脚本执行。首页动态背景使用随构建部署的已优化 MP4；不扩展读者上传格式，管理员自定义视频上传列为后续功能。
- 图片按显示尺寸输出 WebP，首屏 Hero 使用响应式尺寸，非首屏图片懒加载；控件使用系统字体，文楷以中文分片自托管按需加载。
- Go 设置 HTTP 读写超时、数据库连接池与优雅退出；仅反向代理公开端口，数据库不暴露公网。
- 每日备份数据库与上传目录，备份写入独立位置，至少保留 7 个日备份和 4 个周备份；正式上线前演练恢复。
- 记录结构化错误与健康检查，不部署复杂监控集群；提供容器健康检查和日志轮换。
- Next SSR 与 Go 部署在同一台服务器的内网；运行资源需实际测量后决定，不承诺未经验证的内存或吞吐量。

### 11.1 浏览埋点与访问轨迹

第一版必须实现“浏览有记录，操作可关联”，不只写普通应用日志。

| 事件 | 可信来源 | 触发时机与记录内容 |
| --- | --- | --- |
| http_access | 反向代理 / Next.js / Go 日志 | 每次请求（包括失败、未登录、404），记录 request_id、标准化路由、状态、耗时，不落请求体和任意查询串 |
| content_access | Go 服务端审计 | 成功返回文章正文时记录 target_id、调用来源（browser/ssr/prefetch/bot）、用户上下文；不等于真人已阅读 |
| page_view | 客户端埋点 | 路由完成且页面可见时上报一次，含 page_view_id、visit_id、标准化页面路径、来源站点域名 |
| article_read | 客户端埋点 | 正文可见且前台有效停留累计超过 5 秒后一次上报，含 post_id 与 page_view_id，不信任客户端声明的文章权限 |
| engagement | 客户端埋点 | 每 30 秒、隐藏或离开时上报累计前台停留与最大阅读进度；page_view_id + seq 去重，不逐像素记录滚动 |
| auth / reaction / comment / post / settings | Go Service 审计 | 服务端实际完成或拒绝业务操作后记录，客户端不能代报成功操作 |
| audit_view | Go 服务端审计 | 管理员查询访问轨迹、审计列表时记录查询范围摘要，不记录整份查询结果 |

- 匿名访客使用本站随机、第一方 visitor_id；一次浏览会话使用 visit_id，空闲 30 分钟开启新 visit。登录用户 actor_id 从会话校验结果推导。cookie 标识不是身份认证；不使用设备指纹或跨站追踪。
- React 统一 TelemetryProvider 接入路由完成与可见性事件；同页重复渲染不新增 PV，浏览器前进 / 后退按实际新页面实例记录。站外 referrer 只保留来源域名，过滤 query、邮箱与 token 等内容。
- 每次真实页面导航生成 page_view_id，SSR、浏览器 API 与客户端埋点通过受控关联字段连接；SSR 透传的浏览器身份由服务端会话验证，外部调用方不能伪造可信的 source / actor。未能关联的记录明确标记 unknown。
- `/v1/api/events` 支持 1–20 条事件，整个请求不超过 32KiB；事件类型、页面路径、进度、时长和时间戳严格校验，客户端不能写入任意审计 payload。
- 客户端使用 event_id（UUID）和 seq；服务端 event_id 唯一约束幂等写入。收到既有 ID 只返回已接受，不覆盖旧记录；受控重试必须使用相同 ID。
- 客户端行为记录另建 (visitor_id,page_view_id,event_type,seq) 部分唯一索引，seq 为递增序号，单次 page_view / article_read 固定为 1。重复重试不能通过更换 event_id 再次计入；客户端身份与事件仍标记为低可信来源。
- 埋点使用同源 POST、CSRF token 与限流；离开时 fetch keepalive 尝试发送，失败写入受大小 / 时效限制的本地待发队列，下一次打开重试。只有服务端提交成功才确认 accepted，不能在入内存队列时声称已落库。
- 页面关闭、断网、拦截器和禁用 JavaScript 都可能令客户端事件缺失；日志与服务端 content_access 保证已处理请求可追溯，不能承诺所有真人浏览动作零丢失，也不能只凭前端事件作为安全证据。

### 11.2 审计字段、持久化与失败处理

- `audit_logs` 是浏览 / 操作留痕的唯一业务表，category 区分 behavior/security/admin；source 区分 server/client。记录 actor、匿名标识、访问关联、资源、事件时间 / 接收时间、结果和 request_id。
- 发布、撤回、回收、删除、管理员回复、账号与配置修改等关键写操作：**业务变更 + 成功审计同事务**。审计写入失败时业务回滚，不返回成功。
- 登录失败、权限拒绝与事务回滚等失败事件不能写在即将回滚的事务里；由外层审计器在回滚后单独追加。业务错误仍返回真实状态。
- 服务端内容读取：正文返回成功前提交 content_access。若审计库不可用，先向持久化 append-only JSONL 补偿文件写入并确认落盘；重放时沿用 event_id 防重。数据库和补偿文件均不可写时返回 503，不能无声丢弃后继续返回正文成功。
- 全链路 request_id 由可信入口生成 / 校验后传递；访问日志、应用错误、GORM 慢查询摘要和审计用相同 ID。GORM 日志开启参数脱敏，不记录完整 SQL 参数、密码、Cookie、token、草稿正文和留言全文。
- 请求进入时和完成时分别写 access_start / access_end；进程崩溃留下仅有 start 的记录，状态标记 incomplete。前端页请求由反向代理 / Next.js 留痕，不依赖 Go 能看见所有 HTML 请求。
- 审计只追加；业务账号不提供编辑 / 删除审计接口。定时保留策略使用独立维护权限，清理范围与归档数量本身留痕；普通应用账号不拥有任意 UPDATE/DELETE audit_logs 的权限。
- 默认留存：行为审计 30 天，安全 / 管理审计 180 天，原始访问日志 7 天；到期归档或清理，并在站点说明中公开采集范围。按用户要求，访问日志和管理员审计均保存来源 IP，登录行为保存用户 ID 与用户名快照；IP HMAC 继续保留以便关联；不采集键盘输入、密码、浏览器指纹或站外历史。
- 可配置保留天数、日志轮换体积与失败重放上限，避免浏览日志拖垮磁盘。写入 / 补偿失败必须输出错误并告警，不能无限占用请求资源。

## 12. 开发顺序与验收标准

### 阶段一：设计确认与骨架

确认 UI、账号规则、留言板范围；按 server/src 与 web/src 创建正式工程、六表迁移、GORM Gen、统一路由、VO 分页、事务封装、访问日志和审计基础设施，再接业务。当前原型用于此阶段的评审。

### 阶段二：写作与公开阅读

实现管理员登录、文章 CRUD、独立草稿、预览和发布；完成首页、列表、详情、目录及 Markdown 渲染。

### 阶段三：读者与互动

实现读者注册登录、评论、留言板、博主回复、点赞收藏和个人记录。

### 阶段四：上线

完成 SEO、图片处理、移动端、埋点轨迹、审计后台、限流、备份恢复、HTTPS 和部署文档。

关键验收：

- 管理员完成「新建 → 保存 → 预览 → 发布 → 修改草稿」，读者仍看到上一发布版本；再次发布后才看到更新。
- 匿名访问草稿 API、预览地址、后台均无法获得草稿内容，公开缓存不包含任何用户私有信息。
- 普通用户无法写文章、回复成博主、删除别人的评论或读取别人的收藏列表。
- 同一用户并发点赞或收藏不会重复；取消操作幂等，失败能恢复界面。
- 文章撤回后个人记录仅显示通用占位，无法借个人列表读取草稿信息。
- 文章评论和留言板都能提交、后台查看、博主回复；回复上下文不能跨文章串联。
- 保存冲突返回 409，不静默覆盖；自动保存不会自动替换线上文章。
- 恶意 Markdown、留言与上传不能执行脚本；退出后旧会话不能继续使用。
- 360px、768px 和桌面宽度下无页面横向溢出，键盘可完成主要操作。
- 站点外壳在 1440px、1920px 窗口下覆盖全宽，页面两侧不出现外层黑边；内容区内部留白不视为黑边。
- 动态背景可静音循环、暂停和继续，减少动态效果时回退封面；播放失败不出现空白背景。
- 管理员更改站名后，前台导航、页脚、博主回复与浏览器标题同步更新；正式系统还需验证 metadata 与 RSS，普通读者不能修改配置。
- 前端所有页面、API、资源和元信息 URL 均正确使用 /v1，无遗漏前缀和重复 /v1/v1；统一路由清单与 OpenAPI 对齐。
- 数据库操作依赖检查：GORM / Query 的业务引用仅存在于 infrastructure/db 内；不存在独立 repository、database 或 src/query 目录。db 外只调用公开接口；分页响应模型仍只在 models/vo/common 定义。
- 数据库仅六张表：users、audit_logs、posts、drafts、reactions、comments；生成 query 和迁移不会隐式建关联表。
- 成功、失败、分页、删除和埋点响应使用 common.Response；page 参数边界、[] 与 null 区别和 HTTP 状态均通过合同测试。
- 事务故障注入：文章写成功后令审计失败，验证文章与审计均回滚；跨 db 数据操作封装不得产生事务外写入。并发用户不得共享查询条件或事务状态。
- 验证点赞与收藏共存、同 kind 幂等、草稿与发布隔离、所有者配置与会话并发更新不互相覆盖。
- 验证匿名 / 登录、SSR / 预取、客户端事件重复、关闭页面、断网重试、审计库故障和磁盘故障；有 request_id 可定位完整或 incomplete 轨迹，缺失来源明确标记。
- 普通读者无法读取全站审计；管理员查看审计也被追加记录，删除文章不删除历史审计，日志中没有凭据或正文泄露。
- 集成测试覆盖上述权限、草稿隔离、事务和幂等约束；端到端测试覆盖写作发布与读者收藏评论两条主路径。

## 13. 原型说明与参考

配套 `prototype/index.html` 为无需安装依赖的 UI 预览。可切换首页、文章、留言、个人记录、后台文章、编辑器与评论收件箱，体验本地演示互动。

原型与正式功能的边界：

- 原型默认处于演示用户身份，不代表真实登录权限。
- 文章与互动内容保存在页面内存，刷新重置；站点设置单独保存到当前浏览器。真实注册登录、自动保存、上传、服务端数据持久化、邮件、数据库和 SEO 均需后续实现。
- 编辑器只演示有限 Markdown 排版，正式版本使用受控解析库和净化管线。
- UI 可用于直接评审颜色、排版、布局和主要流程；不作为生产系统直接上线。

参考来源：

- 用户提供的视觉参考截图：雨窗摄影、暗色遮罩、暖色渐变、大标题、玻璃面板。
- [Next.js Server / Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- [GORM Gen 类型安全 Query](https://gorm.io/gen/query.html) 与 [GORM Gen 事务](https://gorm.io/gen/transaction.html)
- [Gin 官方文档](https://gin-gonic.com/en/docs/)
- [Memos：Go + React 自托管项目参考](https://github.com/usememos/memos)

背景素材的生成方式与完整提示词记录于 `docs/assets/README.md`。

## 实施补充：枚举、媒体与测试

有限候选值改用 `server/src/models/enums` 的具名类型和类型化常量；VO `common.Response.Code` 使用 `enums.ResponseCode`，用户角色、文章／评论状态等不再用普通 string 表达。React 侧统一引用 `web/src/models/enums.ts`，保持协议值不变。输入筛选参数校验未知候选，返回统一 INVALID_INPUT。

写作组件复用 @uiw/react-md-editor，图片与直接视频链接通过 Radix 媒体弹框预览。Markdown 仍禁用原始 HTML，外链图片使用 no-referrer。请求来源 IP 由 Web TCP 入口及受信代理链确定，登录用户名由服务端会话确定；历史缺失值不补造。

每次功能开发先写行为失败测试，再实现并完成回归；记录 Red/Green 命令、结果及边界。完整 Agent 工作规范和当前实现见 `../AGENTS.md`、`../harness/system-design.md`。
