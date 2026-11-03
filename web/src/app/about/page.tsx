export const metadata = { title: "关于与隐私说明" };
export default function Page() {
  return (
    <article className="nl-page" style={{ maxWidth: 800 }}>
      <div className="nl-pagehead">
        <div className="nl-eyebrow">About this little corner</div>
        <h1>
          文字有光，<span className="nl-gradient">生活有岸。</span>
        </h1>
        <p>一个记录技术、日常与思考的个人空间。</p>
      </div>
      <div className="nl-prose">
        <h2>关于这里</h2>
        <p>写下正在学习的知识，留住不想忘记的瞬间。欢迎阅读，也欢迎在留言板留下你的声音。</p>
        <h2>访问记录与隐私</h2>
        <p>
          本站会记录页面访问、文章阅读进度、有效停留时间，以及登录、留言、点赞和收藏等操作，用于访问分析、安全审计与问题排查。匿名访问使用本站随机标识，登录后相关操作关联到账号。
        </p>
        <p>
          行为记录默认保留 30 天，安全与管理审计 180 天，原始访问日志 7
          天。记录只供站点管理员查看，不采集密码、键盘输入、设备指纹或站外浏览历史。访问日志和审计记录包含来源
          IP；登录后的行为同时关联用户 ID 和用户名，仅管理员可查看。凭据和留言全文不写入访问日志。
        </p>
        <p>
          点赞和收藏列表仅本人可见。你可以取消点赞、收藏或删除自己的留言。账号与数据相关问题可通过留言板联系博主。
        </p>
      </div>
    </article>
  );
}
