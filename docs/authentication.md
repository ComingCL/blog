# 登录、Cookie 与用户维护

本文核对的是当前实现。系统使用数据库保存状态的 Session，不使用 JWT，也没有 Access Token／Refresh Token 双令牌。登录令牌不写入 localStorage。

## 注册与登录

1. 前端写请求先通过 `/v1/api/auth/csrf` 获取 CSRF 凭据，再提交用户名和密码。公开注册固定创建 `reader`，不能通过传参创建管理员。
2. 用户名会去除首尾空白并转为小写，允许 3～24 个小写字母、数字或下划线。密码要求 10～128 字符、最多 512 字节。
3. 密码保存为带独立随机盐的 Argon2id 散列，数据库不保存明文密码。当前参数为 3 轮、64 MiB 内存、并行度 2、32 字节结果。
4. 登录验证通过后，服务端通过 `crypto/rand` 生成 Session ID 与 256 位随机 secret，组成 `用户ID.SessionID.secret`。
5. `users.sessions` JSONB 保存 Session ID、`SHA-256(secret)`、到期时间和认证版本；不保存可直接拿来登录的原始 secret。会话更新与登录成功审计在同一事务，提交成功后才通过 `Set-Cookie` 发给浏览器。

登录凭据本身没有 JWT／HMAC 签名：其有效性由数据库中的随机 secret 散列、会话 ID、期限和版本共同校验。修改用户 ID 或 Session ID 不能绕过这些检查。

每个会话固定有效 30 天，不自动滑动续期。每个用户最多保留 5 个有效会话，第 6 次登录会淘汰最早的有效会话。

实现：`server/src/service/auth.go`、`server/src/audit/audit.go`、`server/src/handler/handler.go`。

## 浏览器中的 Cookie

| 名称 | 用途 | HttpOnly | MaxAge |
| --- | --- | --- | --- |
| `nightlog_session` | 登录会话凭据 | 是 | 30 天 |
| `nightlog_csrf` | 写请求防跨站伪造 | 否 | 1 小时 |
| `nightlog_visitor` | 关联访客浏览记录，不授予登录权限 | 是 | 30 天 |

三者均使用 `SameSite=Lax`、`Path=/`，不指定 Domain，即当前主机 Cookie。`Secure` 由私有 YAML 的 `security.cookie_secure` 决定；生产部署生成 `true`，本地 HTTP 使用 `false`。

浏览器会自动发送 Cookie。页面 JavaScript 无法直接读取 HttpOnly 的登录 Cookie。每次携带会话的 API 请求，后端都会查询用户，验证 Session ID、secret 散列、过期时间和 `auth_version`，然后取数据库中的真实角色进行权限判断。`/v1/api/me` 仅返回 ID、用户名、昵称和角色，不返回密码散列或内部会话。

实现：`server/src/middleware/middleware.go`、`server/src/models/vo/models.go`。

## CSRF、注销与改密

CSRF 凭据使用 `随机nonce.HMAC-SHA256签名`，签名内容绑定当前 Session Cookie，密钥来自服务端 `security.audit_key`。前端把返回的凭据放到 `X-CSRF-Token`；后端验证 Origin 与站点配置一致、Header 与 Cookie 一致、签名正确。登录和注册也遵守这套校验。这里一小时是 CSRF Cookie 的浏览器寿命，凭据内部不含时间戳，后端没有另行按一小时校验签名期限。

- 注销：数据库删除当前会话，再清除浏览器中的登录 Cookie；其他设备会话保留。
- 修改密码：先验证旧密码，再更新密码散列、增加 `auth_version`、清空全部会话；所有设备需要重新登录。
- 登录／注册目前按来源 IP 共用每分钟 20 次的进程内限流，不是跨实例共享的账号锁定系统。

实现：`server/src/service/auth.go`、`server/src/middleware/middleware.go`、`server/src/router/public.go`、`web/src/api/client.ts`。

## 用户数据与管理边界

全部账号保存在 `users` 表，包括用户名、昵称、密码散列、角色、会话与认证版本。没有独立 Session 表，仍保持六张业务表约束。

读者和管理员都可以在 `/v1/me/settings` 修改昵称和密码、退出登录；目前不能自行修改登录用户名。后台权限由服务端 `RequireAdmin` 检查数据库角色，页面是否显示入口不决定权限。

管理员由命令行读取私有 YAML 的 `admin` 段首次初始化，数据库唯一索引保证只有一个站点 owner。生产重复部署仅在管理员缺失时创建，不重置已有密码。**YAML 中的密码只是初始化值；后续登录核对数据库中的散列，修改 YAML 不会重置账号密码。**

当前没有用户列表、封禁、删除、角色授权管理界面或接口，也没有邮件找回、邮件验证、OAuth／微信登录、MFA 或在线设备管理页面。

实现：`server/src/models/entity/models.go`、`server/src/infrastructure/db/migrations/001_init.sql`、`server/src/service/bootstrap.go`、`server/src/cmd/admin/main.go`。
