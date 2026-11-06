import { Comments } from "@/features/Comments";

export const metadata = { title: "留言板" };

export default function Page() {
  return (
    <section className="nl-page" style={{ maxWidth: 800 }}>
      <div className="nl-pagehead">
        <div className="nl-eyebrow">Leave a little light</div>
        <h1>
          很高兴，<span className="nl-gradient">你来过。</span>
        </h1>
        <p>一个问候，一个想法，或是最近让你开心的小事。</p>
      </div>
      <Comments />
    </section>
  );
}
