# 前端视觉调研与本次落地

调研日期：2026-11-01。目标是把现有 Go + React 博客调整为更柔和、安静的阅读空间，重点改善首页字体、诗句动画和弹窗。以下“采用”指本项目的设计判断，不代表上游项目对本站的推荐。

## 开源项目比较

Star 为调研时 GitHub 页面显示的约数，会随时间变化；只用作项目成熟度的辅助信息。链接均为项目或官方文档。

| 项目 | Star 约数 | 调研重点 | 本次取舍 |
| --- | ---: | --- | --- |
| [shadcn/ui](https://github.com/shadcn-ui/ui) | 127.1k | 组件可组合性、清晰层级、统一的 Dialog 和表单 | 参考低对比边框、输入框与按钮层级，自建符合本站风格的组件；未迁移整站到另一套样式框架 |
| [Radix Primitives](https://github.com/radix-ui/primitives) | 19.5k | 无样式交互基础、键盘与焦点行为 | 实际引入 Dialog 和 AlertDialog，由本站 CSS 控制视觉 |
| [Magic UI](https://github.com/magicuidesign/magicui) | 23.0k | 文字呈现、轻量动效、首屏节奏 | 参考逐字出现的节奏，用 React 定时器实现本项目诗句；无需引入整套动画依赖 |
| [React Bits](https://github.com/DavidHDev/react-bits) | 50.9k | 文字动画和氛围效果 | 参考文字表现方式，本次选择缓慢单次打字，不增加粒子和 3D 场景 |
| [HeroUI](https://github.com/heroui-inc/heroui) | 31.1k | 表单状态、控件尺寸、Modal 排布 | 参考表单分组、明确的选中态与反馈，保留现有 React 功能层 |
| [AFFiNE](https://github.com/toeverything/AFFiNE) | 74.0k | 面向内容的编辑界面、安静的工具区 | 作为信息密度和留白参考，未复制源码或品牌素材 |
| [Sonner](https://github.com/emilkowalski/sonner) | 13.1k | 非阻塞消息提示 | 实际引入，用右下角堆叠提示替代原来页面中央提示 |
| [霞鹜文楷](https://github.com/lxgw/LxgwWenKai) | 26.7k | 更柔和的中文笔画与阅读气质 | 实际采用 Regular 字体，用于诗句、标题和正文 |

Radix、shadcn/ui、Magic UI、Sonner 仓库标注 MIT；HeroUI 标注 Apache-2.0。React Bits 与 AFFiNE 这里只作设计参考，未复制其代码，也不将其全部内容概括为 MIT。霞鹜文楷字体使用 OFL-1.1，字体包保留上游授权声明。

## 与用户参考图的对应关系

用户给出的窗口有明确的“左边沉浸影像，右边集中完成任务”的结构。本站将其用于登录／注册：

- 桌面约 1050px 宽窗口，左边雨夜影像，右边账号表单；边框低对比、圆角 28px，遮罩变暗并轻微模糊背景。
- 左侧底部加入关于文字与远方的短句；右侧站名和英文名读取后台配置。
- 关闭按钮固定在窗口右上角；小屏采用上方短幅影像、下方表单，内容过高时窗口内部滚动。
- 实际登录方式仍是现有用户名／密码，注册成功后登录。参考图的微信二维码及其他第三方登录不属于已实现能力，界面不展示此类入口。

## 视觉规范

主题为雨夜、窗边、纸上文字。背景炭黑 `#101110`，面板带少量苔绿，正文米白 `#eeeae1`，强调色黄铜 `#d1bc92`。按钮、表单、卡片和后台使用共享主题变量，避免鲜艳粉橙渐变与粗黑标题抢占阅读注意力。

| 元素 | 规范 |
| --- | --- |
| 诗句、标题、正文 | 霞鹜文楷 Regular，400 字重 |
| 导航、表单、后台控件 | PingFang SC / Hiragino Sans GB / 系统无衬线，主要使用 400 字重 |
| 代码块和编辑区 | 保留等宽字体 |
| 首屏 | 全屏本地雨夜视频与海报，导航覆盖其上，渐变遮罩帮助阅读 |
| 标题 | 适度字距、单行小字号诗句，页面不展示作者行 |
| 控件 | 10–12px 圆角，低对比边框，明确聚焦态 |
| 卡片 | 18px 圆角、留白、轻微悬浮；减少动态效果时不位移 |
| 消息 | 右下角非阻塞提示，错误不套用成功图标 |

字体采用 [lxgw-wenkai-webfont 的中文分片方案](https://github.com/chawyehsu/lxgw-wenkai-webfont)，只引入 Regular。构建后资源由本站提供，浏览器按 `unicode-range` 下载所需字形分片，不访问字体 CDN。原始字体及授权见 [字体项目](https://github.com/lxgw/LxgwWenKai) 和 [OFL](https://github.com/lxgw/LxgwWenKai/blob/main/OFL.txt)。

## 首页诗句与打字机

诗句：“行到水穷处，坐看云起时。”，作者王维，出自《终南别业》，原文见 [维基文库](https://zh.wikisource.org/wiki/終南別業)。

逐字显示的交互方向参考 [Magic UI Typing Animation](https://magicui.design/docs/components/typing-animation)，本项目独立实现：

1. 首次进入约 400ms 后开始，每字约 165ms。
2. 写完后保留全文，光标淡出，不反复擦除重打。
3. 预留单行完整尺寸，不因打字挤动简介或按钮。
4. 读屏直接获取完整诗句，动画文字不反复播报。
5. 页面不可见时暂停；开启 `prefers-reduced-motion` 时直接显示全文、关闭闪烁并暂停背景动画。

诗句与动态站名是两个独立元素，后台站点名称配置继续生效。此版没有新增“诗句配置”接口或数据库字段。

## 弹框与反馈的实现约束

- 登录：`AuthWindow` + `AuthFields`。导航、评论、点赞收藏和权限提示复用打开入口，登录后留在当前页面。独立 `/v1/login`、`/v1/register` 页复用同一表单。
- 确认：`ConfirmProvider` + `useConfirm()`。覆盖文章回收／永久删除、评论删除、冲突时重新载入；文案说明具体影响。优先聚焦取消，ESC 取消，退出后恢复触发焦点。
- 底层交互依据：[Radix Dialog 文档](https://www.radix-ui.com/primitives/docs/components/dialog)、[Radix AlertDialog 文档](https://www.radix-ui.com/primitives/docs/components/alert-dialog)。保留语义标题、说明、焦点约束和键盘关闭。
- 消息：`useApp().notify()` 接入 Sonner，调用端仍用原有统一入口。实现方式依据 [Sonner 官方 README](https://github.com/emilkowalski/sonner)。
- 未保存草稿离开页面的浏览器 `beforeunload` 属于浏览器保护机制，无法用自定义 CSS 改造，继续保留。

## 文件入口

```text
web/src/components/AppContext.tsx     # Site、用户与认证窗口入口
web/src/components/AuthWindow.tsx     # 登录弹窗、影像、共享表单
web/src/components/ConfirmDialog.tsx  # 可 await 的确认对话框
web/src/components/Typewriter.tsx     # 诗句、计时与减少动态效果
web/src/components/Hero.tsx           # 全屏背景和首页构图
web/src/components/Providers.tsx      # 布局、全局弹窗与消息
web/src/styles/editorial.css          # 当前视觉规范与移动端适配
```

后续 Agent 应先读根目录 `AGENTS.md` 和 `harness/`，沿用以上共享组件。验证记录放入本次独立修改记录，不在调研文档里虚构已验证状态。

## 最终细化

按用户后续要求，诗句改为单行，桌面 24–44px、手机 20–27px，不显示作者行；站名改为后台动态配置的 `Clarence Liu`。Next.js 的开发指示器关闭，页面左下角不展示开发工具入口。

## 编辑器与媒体预览补充（2026-11-02）

对比 [react-md-editor](https://github.com/uiwjs/react-md-editor) 和 [ByteMD v1](https://github.com/pd4d10/bytemd) 后，实际使用 MIT 授权的 `@uiw/react-md-editor@4.2.0`，复用等高双栏、同步滚动、中文工具栏与视图切换。预览仍交给本站 React Markdown 组件，保留一致的渲染与原始 HTML 限制。

截图中的 CSDN 图片经实测：带来源页信息返回 403，不带返回 200；因此缩略图和放大预览统一设置 no-referrer，并提供错误占位及本地图片上传。媒体预览复用已有 Radix Dialog：柔和模糊遮罩、炭黑面板、圆角和关闭后恢复焦点；视频只在打开时加载播放器，关闭即停止播放。

测试采用 [Vitest](https://vitest.dev/guide/) 与 [React Testing Library](https://testing-library.com/docs/react-testing-library/setup/)，先验证缺少弹框／不正确卸载导致的行为失败，再实现并回归，不以构建替代组件测试。

## 平台体验检查（2026-11-06）

本轮依据实际页面和真实浏览器操作整理现有界面，沿用雨夜、文楷、炭黑与黄铜配色。

- 首页删除与“最新文章”重复的首篇“本期精选”，后台侧栏删除与全局首页导航重复的返回入口。保留登录／注册深链接、个人记录、站点说明等有实际用途的页面。
- 阅读页仅在存在二级标题时展示目录；无目录时正文居中。目录与 Markdown 渲染规则一致，不把代码里的 `##` 误认为章节。
- 手机文章管理改为卡片，每张依次展示标题、状态／单行日期和操作；桌面仍是表格。
- 列表加载、失败重试、空列表各自明确；筛选不会被较早请求覆盖，取消最后一项收藏后回到有内容的页码。
- 写作页离开时使用现有柔和确认框，明确“保存并离开”，保存失败保留编辑内容。已发布文章的草稿预览明确说明不影响已发布内容。
- 登录验证暂时失败展示重试，避免突然显示为退出；点赞／收藏在确认个人状态前暂不可操作，避免反向修改。

桌面、手机与键盘验证结果逐次记入 Harness，浏览器自动回归入口为 `scripts/smoke_platform.mjs`。浏览器同文档前进／后退的草稿保护尚未统一接入确认框，不能把站内链接保护写成覆盖所有导航。
