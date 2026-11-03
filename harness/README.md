# 项目 Harness

这里保存系统核心设计及每次提交的独立记录，帮助后续 Agent 在相同架构与视觉规范下迭代。根目录 `AGENTS.md` 指引 Agent 执行本范式；本目录承担可持续积累的项目上下文。

```text
AGENTS.md                         # Agent 入口、代码规范、记录规则
harness/
  README.md                       # 本说明
  system-design.md                # 当前架构、核心约束、风格、实现边界
  templates/
    change.md                     # 每次提交的记录模板
  changes/
    YYYY-MM-DD-HH时mm分ss秒-主题.md       # 一次提交／交付一份，保留历史
```

## 阅读顺序

1. 根目录 `AGENTS.md`：如何工作、验证和记录。
2. [系统设计](system-design.md)：当前系统如何组织、哪些约束必须保留。
3. `changes/` 中按文件名倒序最近的记录：最近改了什么、验证到哪里。
4. 任务涉及的代码及设计资料：[完整设计](../docs/design.md)、[前端视觉调研](../docs/frontend-redesign.md)、[启动说明](../README.md)。
5. 涉及上线或可观测性时，阅读 [生产部署](../docs/deployment.md) 和 [监控与日志](../docs/monitoring.md)。
6. 涉及账号与权限时，阅读 [登录、Cookie 与用户维护](../docs/authentication.md)，以实际实现为准。

## 写入规则

- 每次提交新增一个文件，不覆盖之前的记录。
- 文件名使用北京时间 `YYYY-MM-DD-HH时mm分ss秒`，正文明确日期、时间及 `+08:00 / Asia/Shanghai`。
- 使用 [模板](templates/change.md)，必填时间、摘要、修改详情和验证；说明未完成项及影响。
- 修改详情按功能说明原因、最终行为和关联文件，避免只罗列文件名。
- 不记录密码、密钥、会话、私人配置、原始访问轨迹等敏感内容。
- 未创建 Git 提交时如实标注，不虚构哈希或测试结果。
- 核心设计有变化时更新 `system-design.md`，同时新增此次修改记录，历史记录保持原样。
