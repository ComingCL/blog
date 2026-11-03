# Clarence Liu · Go + React 个人博客

第一版已实现：Go API、React / Next.js 前后台、真实 PostgreSQL 持久化及浏览审计。保留全屏雨夜动态背景，站名可在后台配置。

## 已实现

- 读者注册、登录、注销、昵称与密码修改；管理员由命令行创建。
- 后台文章新建、自动保存草稿、分屏预览、独立预览、发布 / 更新、撤回、回收与永久删除。
- 前台文章列表 / 搜索 / 分类、SSR 正文、Markdown、文章目录、RSS、sitemap。
- 文章评论、留言板、博主回复及修改、隐藏 / 删除、已读 / 未读筛选。
- 幂等点赞、收藏、个人记录；撤回文章在个人记录中仅显示不可用占位。
- 站点名称、英文名、简介及动态背景开关保存至数据库。
- 页面浏览、阅读停留与进度埋点，服务端操作审计、审计查询、访问日志及失败重放；记录访问 IP 和登录用户名，支持后台筛选。
- Markdown 双栏编辑器、同步滚动、正文图片上传，图片／直接视频链接可点击弹框预览。

## 本地启动

需要 **Go 1.26.10、Node.js 22、Docker Desktop**。旧版 Go 可通过工具链自动下载使用项目要求的版本。Docker 需要处于运行状态。

在项目根目录执行：

```sh
(cd web && npm ci)
python3 scripts/setup.py
docker compose -f deploy/compose.yaml up -d postgres
./scripts/admin.sh
./scripts/dev.sh
```

`admin.sh` 仅在首次初始化时执行。管理员用户名和随机初始密码写在本机 `server/config/config.yaml` 的 `admin.username`、`admin.password`，不会在控制台输出，也不提交 Git。已有管理员时重复初始化会明确失败，不会覆盖账号。

打开 [博客首页](http://127.0.0.1:3100/v1)，登录后进入 [文章管理](http://127.0.0.1:3100/v1/admin/posts)。不要把 `localhost:3000` 当作本站地址，本机该端口已有其他服务。

默认端口：Web `3100`、API `8080`、数据库 `5432`；都仅绑定本机。API 健康检查为 `http://127.0.0.1:8080/v1/readyz`。应用配置统一读取 `server/config/config.yaml`，不再从 `.env` 或环境变量读取。修改 `server.origin`（站点地址）、`server.port`（Go 端口）、`server.api_origin`（API 地址）后重启前后端即可。Web 监听地址可由 `server.web_host`／`server.web_port` 配置；未指定端口时从 `server.origin` 获取（默认 3100），通过 `npm run dev/start` 使用统一入口；不要绕过入口直接运行 next dev/start。

如果 Docker Hub 连接超时，可先下载同一官方镜像的 ECR 公共镜像，再启动：

```sh
docker pull public.ecr.aws/docker/library/postgres:16-alpine
docker tag public.ecr.aws/docker/library/postgres:16-alpine postgres:16-alpine
```

## YAML 配置

- 默认文件：`server/config/config.yaml`，Go 与 Next.js 服务端读取同一份文件。
- 示例文件：`server/config/config.example.yaml`，可直接复制后修改；`setup.py` 会生成随机密钥与初始密码。
- `setup.py` 不覆盖已有 YAML；首次迁移时会保留旧本机配置中的连接信息及凭据，之后启动无需环境变量。全新配置的数据库密码也随机生成。
- 开发 Compose 从忽略的 `deploy/runtime/development/db_password` 读取密码文件，不在 Compose 或脚本中保存明文。初始化会从私有 YAML 同步生成此文件，已有文件与 YAML 不一致时拒绝覆盖，避免误以为修改配置已经轮换了运行中数据库的密码。
- `storage.path` 相对配置文件目录解析，默认 `../storage` 指向 `server/storage`。
- 修改配置后重启。管理员初始化密码只用于首次创建账号，修改 YAML 不会直接修改数据库内已有账号密码。
- 配置内容仅供后端和 Next.js 服务端使用，密钥不传给浏览器。

在 `server` 目录可指定其他 YAML：

```sh
CGO_ENABLED=0 go run ./src/cmd/api -config config/config.yaml -migrate
CGO_ENABLED=0 go run ./src/cmd/admin -config config/config.yaml -migrate
```

`CGO_ENABLED` 属于 Go 构建工具设置，不是应用配置。PostgreSQL 镜像通过文件型 secret 初始化密码，业务程序只读取 YAML。CI 使用隔离运行环境中生成的随机凭据，不复用开发者密码。

登录会话、Cookie、CSRF、改密失效和用户维护范围见 [认证设计说明](docs/authentication.md)。

## 一键生产部署

在已准备 Docker Engine／Compose v2、Python 3.10+ 和域名的服务器上执行：

```sh
python3 scripts/deploy.py --origin https://blog.example.com
```

替换成自己的域名。脚本构建并启动 Go／Next.js、PostgreSQL、Caddy HTTPS，执行迁移、按需创建管理员并检查就绪。首次部署独立生成高强度随机数据库密码、管理员初始密码及审计密钥，保存在忽略的 `deploy/runtime/production/`；重复部署保留凭据和数据。开发数据库与本机 YAML 不受影响。

更新部署直接再次执行 `python3 scripts/deploy.py`；状态、日志、备份分别使用 `status`、`logs`、`backup` 子命令。完整前提、密码位置、镜像源、隔离测试和恢复边界见 [生产部署](docs/deployment.md)；监控建议与日志规则见 [监控与日志](docs/monitoring.md)。

## 代码结构

```text
server/src/
  router/                      # 唯一后端路由注册位置
  handler/                     # HTTP 参数与统一响应
  service/                     # 业务编排、权限、事务组合
  infrastructure/db/           # 全部数据库操作
    connection.go              # 连接池与六表迁移执行
    query/                     # GORM Gen 生成
    generator/                 # 生成规则
    migrations/                # 仅六张表的 DDL
    *_test.go                  # 真实 PostgreSQL 集成测试
  models/
    enums/                       # 角色、状态、响应码、审计等有限候选
    entity/                    # 六个实体
    dto/                       # 请求结构
    vo/common/                 # Response[T]、PageData[T]、Pagination
  middleware/                  # 会话、CSRF、限流、访问日志
  audit/                       # 审计上下文、持久化失败重放
  logger/                      # JSON 日志与轮换
web/src/
  app/                         # 前台、个人中心、后台 React 页面
  router/                      # 页面路径统一封装
  api/                         # 统一请求、接口地址与类型
  features/                    # 写作、评论、账号、收藏、审计
  telemetry/                   # 浏览与阅读埋点
```

所有应用路由以 `/v1` 开头，API 前缀 `/v1/api`。六张表固定为 `users`、`audit_logs`、`posts`、`drafts`、`reactions`、`comments`；没有独立 repository 或 database 目录。

## 测试与构建

先启动 PostgreSQL，再执行：

```sh
./scripts/test.sh
```

集成测试使用随机独立 schema，结束后清理；不会清空博客数据。覆盖权限、统一返回体、草稿隔离、版本冲突、审计故障回滚、点赞收藏共存、评论回复、不可用占位、站点改名、注销和六表约束。

只编译 / 检查类型：

```sh
(cd server && CGO_ENABLED=0 go test ./... && go vet ./...)
(cd web && npm run test:unit && npm run typecheck && npm run build)
```

数据库集成测试通过 `-args -integration-config /绝对路径/config.yaml` 选择数据库，使用 `scripts/test.sh` 会自动传入本机 YAML；未传此参数时明确跳过，不把跳过视为数据库测试通过。新增功能先写失败测试、再实现并通过回归，具体规范见 AGENTS；前端单元测试为 `npm run test:unit`，已接入脚本和 CI。重新生成 Query：

```sh
(cd server && CGO_ENABLED=0 go run ./src/cmd/gen)
```

## 数据、日志与当前边界

- 数据库存储在 Compose 的 PostgreSQL 卷中；上传、JSON 滚动日志及审计补偿文件在 `server/storage`。停止容器不删除卷。
- `server/config/config.yaml`、会话密钥、凭据、数据库、上传及日志均不提交 Git。只提交 `config.example.yaml`。旧环境文件已归档为 `.env.legacy`、`web/.env.local.legacy`，仅供本机恢复参考，应用与启动脚本不再读取它们。
- 业务变更与成功审计在同一事务中提交；审计失败使关键操作回滚。SSR 内容读取与客户端埋点分开记录，客户端记录不能证明绝对完整的真人阅读历史。
- 审计接口只向管理员开放，服务不提供修改审计内容的接口。生产环境仍应使用独立迁移 / 应用数据库角色、TLS、独立备份及外部日志归档；此版不宣称具备不可篡改审计存储。
- 暂未实现定时任务自动清理历史日志、邮件找回、第三方 OAuth、多作者协作和历史版本回滚。审计保留周期的设计目标见设计文档，当前需由维护者执行保留与归档策略。
- 离线视觉评审可运行 `python3 scripts/build-preview.py` 生成 `prototype/index.html`；Git 保留原型源码 `prototype/ui.fragment.html` 与设计素材，忽略生成的 HTML。真实功能请从运行中的 `/v1` 访问。

## Git 文件范围

提交源码、测试、迁移、GORM Gen 生成的 Query、配置示例、依赖锁文件、设计素材和 Harness。`.gitignore` 排除本机 YAML／旧环境文件、IDE 设置、依赖目录、构建产物、运行数据、备份、测试报告及工具缓存；这些文件保留在本机，不进入提交。

[Agent 工作指引](AGENTS.md) · [项目 Harness 与迭代记录](harness/README.md) · [前端视觉调研](docs/frontend-redesign.md) · [完整设计文档](docs/design.md) · [背景素材与生成说明](docs/assets/README.md)

## IP 记录与媒体预览

`server.trusted_proxies` 默认空数组，直接访问按 TCP 来源地址记录。若部署在 Nginx 等反向代理后，仅配置实际代理 IP／CIDR，并让代理覆盖或正确追加 `X-Forwarded-For`；不要配置为信任全部来源。API 继续绑定本机，外部流量通过 Web 入口；SSR 与浏览器请求使用同一来源 IP。历史记录未采集的 IP 不能还原。

图片可以点击放大；视频写成 `[视频标题](https://example.com/video.mp4)` 或 `![视频标题](https://example.com/video.webm)` 后点击预览。关闭弹框会停止播放。当前上传接口支持 JPEG / PNG / WebP，视频使用直接媒体 URL；不会执行文章中的原始 HTML 或嵌入任意 iframe。
