# 系统核心设计

更新日期：2026-11-05。此文件描述当前实现；每次变更记录见 `changes/`。完整方案参见 [设计文档](../docs/design.md)。

## 产品范围

单博主个人博客。访客可阅读文章；读者注册后留言、点赞、收藏并查看自己的记录；管理员维护文章与草稿、预览、发布、处理及回复评论、配置站点、查看审计。

博客名、英文名、简介、背景动态开关由后台配置，前台 Header、Footer、登录窗口共享 `Site` 数据，默认名称为 `Clarence Liu`，不在组件中硬编码站名。当前首页诗句为王维《终南别业》中的“行到水穷处，坐看云起时。”，这是独立的首页文案，不是博客名称。

## 架构与目录

```text
server/
  config/config.example.yaml     # 可提交的示例
  config/config.yaml             # 本机私有配置，不提交
  src/
    cmd/{api,admin,gen}/          # 服务、首次管理员初始化、Query 生成入口
    config/                      # 严格 YAML 读取与校验
    router/                      # 统一注册路由与权限组
    handler/                     # HTTP 参数绑定、调用业务、统一响应
    service/                     # 业务、权限、事务与审计编排
    infrastructure/db/           # 所有数据库访问、连接池、迁移与测试
      query/                     # GORM Gen 产物
      generator/                 # 生成规则
      migrations/                # DDL
      testkit/                   # 真实 PG 测试隔离
    models/{entity,dto,vo,enums}/       # 持久化实体、请求、响应
      vo/common/                 # Response[T]、PageData[T]、Pagination
    middleware/                  # 会话、CSRF、限流、访问日志
    audit/                       # 审计上下文、失败持久化与重放
    logger/                      # JSON 日志与轮换
    storage/                     # 上传处理
web/
  server-config.mjs              # 仅服务端读取同一份 YAML
  src/
    app/                         # Next.js App Router，SSR 阅读页面
    router/                      # 页面地址与 /v1 封装
    api/                         # 接口地址、统一请求、类型、服务端请求
    models/enums.ts              # 前端业务候选枚举
    components/                  # 共享布局、认证弹窗、确认框、打字机、媒体弹框
    features/                    # 账号、文章编辑、评论、收藏、后台
    styles/{global,editorial}.css # 基础布局 + 当前视觉主题
    telemetry/                   # 页面浏览、阅读时长及进度埋点
  public/images/                 # 自托管背景视频与海报
harness/                         # 设计上下文与逐次变更记录
```

Go + Gin + GORM / GORM Gen + PostgreSQL；React + Next.js + TypeScript。不要引入平行的请求层、数据库层或第二套 UI 框架。

## 数据与事务

只保留六张表：`users`、`audit_logs`、`posts`、`drafts`、`reactions`、`comments`。会话与站点配置在用户表受控 JSON 字段中；分类、标签是文章属性。新增独立表须先有明确需求与设计变更，不能因为框架默认行为增加表。

`Database` 持有连接池；`Stores` 持有 GORM Gen Query。普通读取通过 `DB.Stores()`；组合写操作由 service 调用 `DB.Within`，所有子方法复用回调传入的 `s`。子方法只操作数据并返回错误，不自行提交外层事务。

```go
return a.DB.Within(ctx, func(s *db.Stores) error {
    // 两个 DB 访问方法使用同一个事务内 Query。
    if err := s.UpdateUser(ctx, userID, values); err != nil {
        return err
    }
    return s.AppendAudit(ctx, event)
})
```

回调返回错误则回滚，包括关键操作成功审计写入失败。不要在回调内调用 `a.DB.Stores()` 或用新连接执行第二个操作，否则会脱离当前事务。`App.mutate` 已封装常用“业务变更 + 成功审计”。版本号和必要的行锁保护并发，不能用 UI 禁用按钮替代。

已发布文章与草稿隔离；编辑不会修改前台正文，发布时校验版本。回收站可恢复，永久删除不可恢复。点赞与收藏按用户、文章、类型分别幂等记录。

## 路由、返回体和安全

- 外部页面及资源前缀 `/v1`，API `/v1/api`；健康检查 `/v1/healthz`、`/v1/readyz`。
- Next.js 配置 `basePath: "/v1"`。`routes` 用逻辑路径，`Link` 自动加前缀；静态资源或原生地址通过 `BASE` / `toPublicPath`，避免重复 `/v1/v1`。
- 前端 API 统一使用 `api` / `write` 及 `endpoints`。写操作沿用 CSRF、会话和错误处理，不能散写 fetch 绕过封装。
- JSON 外壳：`{ code, message, data, request_id, timestamp }`。分页 `data: { list, pagination: { page, page_size, total, total_pages, has_next } }`。空列表是 `[]`。
- DTO 负责输入；VO 负责响应。不可直接序列化带密码散列、会话与内部配置的 Entity。
- API 服务端校验读者与管理员权限。Markdown 禁用原始 HTML；上传沿用现有校验。

认证采用数据库有状态 Session，随机 secret 仅保存 SHA-256 散列，会话放在 `users.sessions`，固定 30 天有效且最多 5 个；不是 JWT。HttpOnly 登录 Cookie 自动随同源请求发送，CSRF 使用绑定会话的 HMAC 签名并校验 Origin。改密增加 `auth_version` 并撤销全部会话；管理员 YAML 密码只用于初始化，日常登录验证数据库中的 Argon2id 散列。完整流程和现有用户管理边界见 [认证说明](../docs/authentication.md)。

## 留痕与配置

访问日志和审计记录同时记录 `client_ip`；已登录用户保存用户 ID 和用户名快照 `actor_username`（API 返回 `username`），身份从会话校验推导，禁止使用客户端上报的用户名或 IP 代替。后台可按用户名、IP、事件和会话筛选。旧记录没有采集的 IP／用户名保持为空，并明确显示历史缺失，不伪造回填。

Web 使用 `npm run dev/start` 启动 `web/server.mjs`，先从 TCP socket 确定来源 IP，再交给 Next.js。默认忽略客户端自带的转发头；只有 YAML `server.trusted_proxies` 配置的真实上游代理可以提供转发链，按从右到左的信任边界解析。Go API 仅监听本机并信任本机前端代理；SSR 转发已验证 IP、User-Agent 与会话。不要绕过入口直接启动 `next dev/start`，也不要信任所有代理。

关键操作审计和业务写入同事务；SSR 内容访问和客户端浏览、阅读进度分别留痕。保留事件 ID 去重、request ID、有限队列、离线补偿与审计失败重放。客户端埋点不能保证用户绝对完整轨迹；当前日志与 DB 不宣称不可篡改。

日志不得记录密码、认证 Cookie、完整 SQL 参数等敏感信息。审计页面仅管理员可看，不能为了排查关闭审计。配置统一为 YAML，Go 与 Next.js 服务端读取 `server/config/config.yaml`；只提交示例配置。业务配置不读环境变量。Go 构建参数与 Docker 镜像初始化变量是工具设置，不等同应用配置。

开发数据库密码也不写在跟踪的 Compose、脚本或 CI 中：安装 Web 依赖后运行 `scripts/setup.py`，全新配置使用随机密码，已有 YAML 保留；从 YAML 导出到忽略的 `deploy/runtime/development/db_password` 供开发 Compose 文件型 secret 使用。已存在的密码文件与 YAML 不一致时失败，不自动更改真实数据库密码。`server/config/` 仅允许示例文件纳入 Git，运行文件、旧环境文件、密钥和备份均忽略；提交前仍须扫描暂存内容，忽略规则不会自动清除旧提交历史。

## 当前 UI 风格

依据用户提供的电影式窗口参考，采用全屏雨夜影像、炭黑／苔绿底色、米白文字、少量黄铜色。详细调研及来源见 [前端视觉调研](../docs/frontend-redesign.md)。

- 大标题、诗句、正文用自托管霞鹜文楷 Regular；控件用 PingFang / Hiragino / 系统字体，降低字重，保留代码等宽字体。字体按中文 Unicode 分片下载，不依赖外部字体 CDN。
- 首页逐字呈现单行小字号诗句，页面不展示作者行，完成后停留；预留全文尺寸防止跳动，读屏直接获取全文。切换后台暂停计时，减少动态效果时直接显示全文并暂停背景。
- 站点名称由 `Site` 动态配置。共享色板与主题在 `editorial.css`，不要逐页堆叠不同渐变、圆角和字体。
- `AuthWindow`：桌面左影像、右账号表单；手机为上图下表单。真实用户名密码登录／注册，密码可见切换；登录后保留当前页面及留言草稿。独立登录／注册页复用同一表单。
- `ConfirmProvider` / `useConfirm`：全站统一异步确认，默认取消焦点，ESC 取消，恢复触发控件焦点。删除操作用明确文案和柔和危险色。
- Sonner：右下角消息提示；`notify` 兼容原有调用，默认中性，不把错误显示成成功。
- 写作复用 `@uiw/react-md-editor`，双栏等高、同步滚动、中文工具栏和正文图片上传，继续复用本站 Markdown 渲染与自动保存。
- `MediaPreview` 复用 Radix：图片点击放大；MP4 / WebM 等直接视频链接点击播放，ESC／关闭按钮返回并停止播放。外链图片统一 no-referrer，失败显示明确占位。视频支持 `[标题](视频URL)` 和 `![标题](视频URL)`，不启用原始 HTML／任意 iframe；目前上传接口仍只支持图片。
- 有状态的 Markdown 图片／链接渲染组件须定义在模块级，避免编辑器重渲染时卸载弹框。
- 弹框使用 Radix Dialog / AlertDialog，保留标题、说明、焦点约束与键盘交互。Portal 位于 `#nightlog` 外，必须使用自己的 `nl-*` 样式。

## 验证与当前边界

`./scripts/test.sh` 涵盖 Go 测试、真实 PG 隔离 schema 测试、vet、前端 IP／配置测试、Vitest 组件／请求测试、类型检查和生产构建；集成测试需要显式 YAML 路径，不能把跳过算成功。

界面改动验证首页、文章阅读、登录／注册、留言草稿、管理表格及危险确认；至少覆盖桌面和手机宽度、焦点恢复、减少动态效果。不要在用户真实文章上执行删除来测试弹框，可只检查并取消。

尚未实现 OAuth / 微信扫码、邮件找回、多作者、定时发布与历史版本回滚；不在 UI 暗示这些功能可用。管理员从 YAML 初始化，一次性初始密码修改不等于数据库账号密码被重置。

本机服务 Web `127.0.0.1:3100`，API `127.0.0.1:8080`，PG `127.0.0.1:5432`。保留 PostgreSQL 运行，不停止用户已开启的服务。

## 枚举与测试优先（后续 Agent 必须遵守）

Go 的有限业务值统一在 `server/src/models/enums/enums.go`，使用具名字符串类型及类型化常量；前端统一在 `web/src/models/enums.ts`。角色、文章／评论状态、点赞收藏、操作、审计事件／类别／来源／结果、响应码等通过枚举引用，实体、DTO、VO 和业务方法保留该类型；外部筛选值必须校验。GORM Gen 的字符串谓词仅在 DB 层显式转换枚举，禁止把业务判断退回魔法字符串。修改生成规则后重新生成 Query。

数据库和 JSON 保留原有字符串值，不能借重构更改历史协议。昵称、分类、标签、文案、配置键等自由文本不是枚举。标准 HTTP 方法沿用 `net/http` 常量。

每次功能／缺陷修改按根目录 AGENTS 的 Red → Green → Refactor 执行：先设计反事实、先运行行为失败测试，再实现；已有实现后补的测试明确记作回归补测。前端 `npm run test:unit`（Vitest + Testing Library），网络入口 `npm run test:config`，后端 `go test ./...`；真实事务与权限不能只用 mock。不要把构建通过等同单元测试通过，不虚构 Red 证据。

## 单机生产部署与运行日志

生产使用 `python3 scripts/deploy.py --origin https://自己的域名`，具体前提及边界见 [生产部署](../docs/deployment.md)。Compose 部署 Caddy、PostgreSQL 和包含 Go／Next.js 两个进程的应用镜像；进程管理入口负责信号转发与任一子进程异常时退出整个应用。应用进程降权至 UID 10001，Go 仍只监听容器内回环地址，Web 使用共享 YAML `server.web_host`／`server.web_port`，与公网 HTTPS origin 分开。默认开发配置仍只监听本机。

生产配置、独立的应用／数据库管理密码、管理员初始密码与审计密钥均随机生成，保存在忽略的 `deploy/runtime/production/`。采用文件型 secrets，构建只读取公开占位值；数据库不发布宿主机端口，应用数据库角色无超级用户权限。重复部署保持凭据、管理员和数据，刷新生成的 Compose／Caddy 配置；私有文件不完整时失败，不擅自重新生成密码。开发库及开发配置不参与生产初始化。

生产镜像构建默认使用 DaoCloud 的 Docker 官方镜像代理 `m.daocloud.io/docker.io/library`，Go 基础镜像标签为 `golang:1.26`，Node 基础镜像标签为 `node:22-slim`。Go 构建阶段使用 `GOPROXY=https://goproxy.cn,direct` 和 `GOTOOLCHAIN=local`；镜像源可在首次部署或后续通过 `--registry` 切换，切换不轮换凭据或数据。

生产更新提供 `python3 scripts/deploy.py redeploy`：先构建镜像，成功后停止当前 Compose 项目并保留卷，再按数据库、迁移、应用和 Caddy 的顺序启动；不执行 `down -v`，预计有短暂中断。`origin` 是规范公网站点 Origin，用于 HTTPS 校验、共享配置、Caddy 证书入口、就绪检查和 Cookie Secure 属性，必须与用户实际访问的域名一致。

HTTP 只记录一次 `access_end`，正常健康探针、CSRF 取令牌与静态图片请求静默，失败时保留；正常查无记录和快速预期冲突不打印数据库告警。关键业务成功日志在事务成功提交后打印 `operation_committed`；自动保存等高频操作保持原有审计，不额外打印成功行。保留 request ID、来源 IP 和已确认的用户身份，禁止打印 SQL、参数、请求正文、Cookie、令牌、密码或私有 YAML 原文。数据库慢查询／失败、迁移、启动退出、审计补偿失败保留明确事件。

监控首选公网 Uptime Kuma + 主机／容器 Netdata；按接口聚合指标和集中日志可在后续引入 Prometheus／Grafana／Loki。选型与告警起点见 [监控与日志](../docs/monitoring.md)，当前未自动安装监控，也未接入外部通知或 Prometheus 指标接口。现有备份是手动执行，不宣称已有自动异机备份、恢复自动化、证书生产签发验收或按天清理审计。
