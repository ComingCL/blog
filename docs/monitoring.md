# 个人博客监控与日志

调研日期：2026-11-03。以下是针对当前单机个人博客的选型建议，不表示相关监控已经部署或通知已经配置。

## 选型结论

建议第一阶段组合 **Uptime Kuma + Netdata**：前者从站外确认读者是否能访问，后者定位服务器／容器资源问题。网站规模增加、需要按接口聚合延时／错误率或集中查日志时，再选择 Prometheus + Grafana + Loki。当前应用没有暴露 Prometheus 指标接口，也没有接入这些外部服务。

| 方案 | 解决的问题 | 本项目取舍 |
| --- | --- | --- |
| [Uptime Kuma](https://github.com/louislam/uptime-kuma) | HTTP(S)、关键词／JSON 响应检查、可用率、延时及通知 | 优先部署在另一台机器或独立运行环境，检查公网入口；同机实例不能可靠通知整机断电 |
| [Netdata](https://learn.netdata.cloud/docs/collecting-metrics/collectors/containers-and-vms/docker) | 主机与 Docker 的资源、容器状态、健康情况及告警 | 用于单机排障；按官方最小权限方式配置采集，管理页面通过内网／SSH 访问 |
| [Prometheus](https://prometheus.io/docs/introduction/overview/) + [Grafana](https://grafana.com/docs/grafana/latest/introduction/) | 指标采集、查询、仪表盘和告警规则 | 需要应用埋指标、配置采集与告警；适合后续需要请求量、错误率、P95、连接池／Go 运行时指标时使用 |
| [Loki](https://grafana.com/docs/loki/latest/) | 集中查询结构化日志、关联 request ID | 目前可先用 Docker logs；需要跨机器检索时再接入。日志和指标承担不同职责 |

这是基于维护成本的工程判断，未在本服务器做监控工具内存／性能对比，不给出未经测量的资源承诺。

## 上线后先监控什么

- **公网就绪**：`https://域名/v1/readyz`，HTTP 200 且 JSON `code` 为 `OK`、`data.status` 为 `ready`。这条路径经过 DNS、TLS、Caddy、Web 转发和 Go 数据库 Ping。
- **页面可用**：`https://域名/v1/posts`，HTTP 200 且包含文章列表页面标识。只检查 readiness 不能证明前端渲染／登录／发布可用。
- **证书与外网**：HTTPS 证书到期、连接超时与持续不可达。公网探测建议 60 秒一次、连续三次失败告警、恢复后只发一次恢复通知；这是初始阈值建议。
- **机器与容器**：磁盘剩余空间、内存、CPU、容器重启／不健康。磁盘使用率持续超过 80% 可作为初始预警，按实际容量调整。
- **数据库和备份**：连接数／查询延时／连接失败、最近成功备份时间；备份文件存在不代表恢复成功，需定期做隔离恢复演练。
- **业务错误**：连续发布失败、审计持久化／重放失败；正常 404、单次输错密码、自动保存成功不应触发故障告警。

选择自己能收到的通知渠道，在监控工具中配置后做一次测试告警与恢复。此项目没有自动向任何人发送通知，也没有保存通知密钥。保护监控面板，勿公开暴露 Docker socket 或未经认证的管理入口。

## 本次日志规则

- HTTP 以 **`access_end` 一次完成记录**为准；移除重复的 `access_start`。保存 request ID、方法、路由／路径、状态、耗时、来源 IP、用户 ID／用户名和访客标识，不打印查询串、Cookie、Authorization、请求体或密码。
- 成功访问为 INFO，4xx 为 WARN，5xx 为 ERROR；正常健康探针、成功的 CSRF 取令牌与静态图片请求静默；这些请求失败时照常记录。WARN 不等于必须告警，单次用户输入错误不需要报警。
- 数据库正常查询和快速查无记录／预期重复记录静默；超过一秒的慢查询告警，真实查询错误为 ERROR。只记 request ID、耗时、行数、失败标志，不打印 SQL、参数或原始数据库错误。
- 成功发布、撤回、删除、密码变更、登录、站点配置等关键操作，在事务成功提交后打印 `operation_committed` 并携带事件枚举、目标、request ID、IP／用户名。事务回滚不打印成功日志。
- 自动保存、普通点赞等操作仍保留原有持久化审计及必要访问留痕，不额外打印业务成功行，避免高频重复。
- 迁移完成／失败、管理员初始化是否创建、API／Web 启动和停止、子进程异常、审计补偿失败保留明确事件。启动错误不回显私有 YAML 原文。
- 运维日志用于定位问题，数据库审计用于业务追溯；日志降噪不删除浏览审计或关键操作审计。

生产应用日志直接落到宿主机 `deploy/runtime/production/logs/app/`（相对服务器项目根目录），部署脚本打印绝对路径。`error.jsonl` 为 Go ERROR，`web-error.jsonl` 为 Next.js 错误，`application.jsonl`／`web.jsonl` 为对应应用输出，`runtime.jsonl` 记录进程生命周期。每文件 10 MiB、最多 5 份归档；查询命令及历史卷边界见 [生产部署](deployment.md)。

API 内部错误附带安全的 Go 错误类型、根因类型及可用 SQLSTATE，保留 request ID、路由、IP 和已认证用户名，不写原始数据库 Detail/Hint 或 SQL。Web `server_api_failed` 区分网络、超时、HTTP、无效响应；Next.js `onRequestError` 记录 `web_render_failed`、错误分类及 digest。客户端/服务端调用边界错误归类为 `CLIENT_BOUNDARY`。框架错误文本经进程日志捕获后仅保留诊断字段，不能用完整异常 payload 代替脱敏日志。

Prometheus 标签只应使用有限的路由模板／状态类别，不把用户名、IP、原始文章 ID、request ID 当标签；这些高基数字段留在受限日志或审计中。日志保留、访问权限和异机备份需要随实际运行维护配置；当前体积轮换不代表实现了 7／30／180 天自动清理。
