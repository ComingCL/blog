# 单机生产部署

本方案在一台 Linux 服务器上通过 Docker Compose 部署 PostgreSQL、应用和 Caddy。应用镜像内运行 Go API 与 Next.js 两个独立进程，由进程管理入口统一处理故障和退出；任一进程异常退出会停止另一进程，使容器按策略重启。Go 仅监听容器内回环地址，Web 仅由 Caddy 访问，数据库不发布宿主机端口。

## 第一次部署

前提：服务器已安装并启动 Docker Engine、Docker Compose v2（支持 `up --wait`，建议 v2.20+）、Python 3.10+；域名 A／AAAA 正确指向服务器，80／443 TCP、443 UDP 可用。不要保留指向其他服务器的 AAAA。服务器需要能下载镜像、Go 与 npm 依赖，并有足够内存完成 Next.js 构建；可先从 2 核、4 GiB 内存起步，再按实际测量调整。这是容量起点建议，不是压测结论。

将仓库代码放到服务器，在项目根目录执行（替换成自己的域名）：

```sh
python3 scripts/deploy.py --origin https://blog.example.com
```

`--origin` 是生产站点的规范公网 Origin（协议 + 域名 + 可选端口），不是数据库地址，也不是 Go API 的内部监听地址。脚本用它校验生产必须使用 HTTPS，写入 Go／Web 共享配置，生成 Caddy 的站点和自动 HTTPS 证书入口，构造公网就绪检查 URL，并决定生产 Cookie 的 Secure 属性。它会写入私有 `state.json`；已有部署不能直接把根域名换成子域名。浏览器最终访问的域名必须与它一致，例如使用 `https://www.blog.clarenceliu.xin` 时，DNS、备案、Caddy 和这项参数都应使用同一个域名。

脚本依次生成独立生产配置、构建 Go／Next.js、等待 PostgreSQL 就绪、执行迁移并按需初始化管理员、启动应用和 HTTPS 代理，最后检查公网 `/v1/readyz`。任何一步失败都会停止后续步骤并保留已有数据，不自动删除容器或卷。

完成后首页是 `https://blog.example.com/v1`，后台是 `https://blog.example.com/v1/admin/posts`。Caddy 负责证书申请／续期和 HTTP 跳转。第一次证书签发需要域名和网络条件成立；本项目没有替用户购买域名或修改 DNS。

## 私有文件和密码

首次运行创建 `deploy/runtime/production/`（目录 0700，文件 0600，Git 和 Docker 构建上下文都忽略）：

- `config.yaml`：Go／Next.js 共享配置，包含初始管理员密码和数据库连接信息。
- `db_password`：独立应用数据库角色 `nightlog` 的随机密码；角色无超级用户、创建数据库或创建角色权限。
- `db_root_password`：独立 PostgreSQL 管理角色的随机密码，不提供给应用。
- `app-init.sql`：仅用于空数据卷初始化应用角色和 schema 所有权，不新增业务表。
- `compose.yaml`、`Caddyfile`、`state.json`：实际部署拓扑和部署身份。

数据库密码、管理员初始密码各自独立随机生成，至少 52 个 URL 安全字符，包含大小写字母、数字和符号；随机部分来自操作系统安全随机源。审计密钥也独立生成。密码不写入脚本、镜像、命令行参数或部署输出。

通过服务器上权限受控的编辑器查看 `config.yaml` 中的 `admin.username`／`admin.password`，首次登录后在个人设置修改密码。YAML 中的初始密码不再代表数据库里修改后的账号密码。

配置文件使用缩进 JSON，属于 YAML 1.2 的合法子集，Go、Node、Compose 均可读取，因此宿主机不需安装 PyYAML。镜像构建只使用 `deploy/build-config.yaml` 的公开占位值，实际凭据通过 Compose 文件型 secrets 注入。容器入口复制到容器内的私有路径后降低权限；Go 和 Web 进程运行 UID 10001。Compose secrets 的本机源文件仍需另行加密备份，不是密钥保险库。

重复执行不会生成新密码、重置管理员或清空数据；生成的 Compose／Caddy 文件会刷新为当前代码模板，因此不要在这些产物中维护手工改动。配置缺了一部分时会失败并要求恢复完整文件，避免新密码与旧数据卷错配。不要只编辑密码文件来“轮换”现有数据库密码；真正轮换需要协调数据库 `ALTER ROLE` 与连接配置，本脚本不自动操作已有开发库。

生产构建默认通过 DaoCloud 镜像代理拉取官方镜像：`m.daocloud.io/docker.io/library`。Go 构建阶段使用 `golang:1.26`，Node 构建和运行阶段使用 `node:22-slim`；Go 模块下载使用 `GOPROXY=https://goproxy.cn,direct`，并固定 `GOTOOLCHAIN=local`，避免构建时自动切换工具链。需要改用其他镜像源时，在首次部署传入 `--registry`。

## 更新、状态和日志

```sh
# 在项目目录更新源码后重新构建并部署，沿用已有生产身份和密码
python3 scripts/deploy.py

# 明确停止当前生产 Compose 项目后重新构建并启动；只停止本项目，保留所有数据卷
python3 scripts/deploy.py redeploy

python3 scripts/deploy.py status
python3 scripts/deploy.py logs

# 仅生成文件，审阅后再运行部署
python3 scripts/deploy.py init --origin https://blog.example.com
```

升级前先备份并检查迁移兼容性。当前迁移是幂等 SQL，升级不会自动回退数据库；没有实现跨版本自动回滚或零停机更新。应用升级会有短暂中断。

`redeploy` 先构建新应用镜像，构建成功后执行当前生产 Compose 项目的 `stop`，再启动 PostgreSQL、运行迁移／管理员初始化、启动应用和 Caddy。它不会执行 `down -v`，不会删除容器卷或重新生成凭据；如果构建失败，旧服务会继续运行。执行期间网站会有中断，完成后脚本会检查公网 `/v1/readyz`。

默认生产项目名为 `clarence-blog`，不复用本机开发 Compose 的 `deploy` 项目。生产的数据库、上传／日志、Caddy 证书分别使用独立命名卷。开发环境的 YAML、8080／3100／5432 端口与数据库卷不被此脚本修改。

若默认 Docker 私有网段与现有网络冲突，第一次部署可指定其他未使用的 RFC1918 `/24` 网段；Caddy 使用该网段的 `.2`、应用使用 `.3`，应用只信任实际 Caddy 地址。不要将其改成信任所有代理。若使用 CDN，必须另外设计和验证来源 IP 信任链，默认配置按直接连接 Caddy 的对端记 IP。

```sh
python3 scripts/deploy.py --origin https://blog.example.com --subnet 172.30.241.0/24
```

Docker Hub 不可达时，可在首次部署选择官方公共镜像镜像源：

```sh
python3 scripts/deploy.py --origin https://blog.example.com --registry public.ecr.aws/docker/library
```

`--directory` 和 `--project` 可以隔离另一个实例；仓库内的私有输出仅允许放在被忽略的 `deploy/runtime/` 下，避免自定义目录把密码带入源码，仓库外目录需自行保证不纳入其他版本管理。首次选择的域名、项目名和网段会保存在私有状态中，复用目录时更改这些身份会拒绝执行，防止意外绑定错误数据卷。镜像源不属于数据身份，可以通过 `--registry` 切换；脚本只刷新镜像引用和状态，不轮换密码、不清空卷。

## 备份与恢复

```sh
python3 scripts/deploy.py backup
```

备份写入私有目录的 `backups/UTC时间/`，包含 PostgreSQL 自定义格式 `database.dump` 和 `uploads.tar.gz`。数据库有一致性快照，数据库与上传的两份备份并非跨资源原子快照；需要严格一致时，先进入维护窗口暂停写入，再备份。必须将备份及完整私有配置另存异机；这里只提供手动备份，没有自动排程、异机上传或保留清理。

恢复建议先在新 `--directory`／新 `--project` 的隔离实例演练：启动空 PostgreSQL，再通过 `pg_restore --exit-on-error --no-owner -U nightlog -d nightlog` 恢复数据库、解包上传到应用数据卷，恢复文件 UID／GID 10001，最后启动应用并验收。恢复命令会写入目标数据库，不应直接在唯一生产库上试验；本轮不提供自动覆盖生产库的命令。

## 本机隔离冒烟测试

```sh
python3 scripts/deploy.py --origin http://127.0.0.1:18080 \
  --directory /tmp/blog-smoke --project blog-smoke --subnet 172.30.243.0/24
```

此模式仅允许回环地址上的高位 HTTP 端口，供无公网域名的本机测试使用；不申请公网证书，Cookie Secure 随之关闭。非回环 HTTP 地址会被拒绝。不要用于公网。

部署健康检查检查 Go 数据库就绪和 Web 首页；正常探针不产生应用访问日志，失败仍记录。Caddy 未启用重复的全量访问日志。容器标准输出采用 Docker 体积轮换，Go 文件日志保留现有体积轮换；它们不等于按天自动清理审计表。

## 验证依据

Compose 的文件型 secrets 与健康依赖遵循 [Docker secrets 文档](https://docs.docker.com/compose/how-tos/use-secrets/) 和 [启动顺序文档](https://docs.docker.com/compose/how-tos/startup-order/)。HTTPS 和代理配置参考 [Caddy 自动 HTTPS](https://caddyserver.com/docs/automatic-https) 与 [reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)。Next.js 使用项目安装版本的自定义服务器，不使用不兼容的 standalone 输出。

监控选型和实际指标边界见 [监控与日志](monitoring.md)。
