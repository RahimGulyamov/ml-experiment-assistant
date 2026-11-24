"use client";
import { useEffect, useState } from "react";
import slides from "@/content/presentation.json";
export default function Presentation() {
  const [index, setIndex] = useState(0);
  const [notes, setNotes] = useState(false);
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        setIndex((i) => Math.min(slides.length - 1, i + 1));
      }
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      if (e.key.toLowerCase() === "n") setNotes((n) => !n);
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);
  const s = slides[index];
  return (
    <div className="presentation">
      <header>
        <a href="/">← Run Notes</a>
        <span>Личный проект / Гулямов Рахим</span>
        <button onClick={() => setNotes((n) => !n)}>
          Заметки {notes ? "вкл" : "выкл"} · N
        </button>
      </header>
      <main key={index}>
        <div className="slide-label">
          {s.n} / {s.label}
        </div>
        <h1>{s.title}</h1>
        <p className="slide-body">{s.body}</p>
        <ol>
          {s.points.map((p, i) => (
            <li key={p}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              {p}
            </li>
          ))}
        </ol>
        {notes && <aside>{s.note}</aside>}
      </main>
      <footer>
        <span>
          {index + 1} / {slides.length}
        </span>
        <div className="slide-dots">
          {slides.map((s, i) => (
            <button
              key={s.n}
              aria-label={`Слайд ${i + 1}`}
              aria-current={i === index ? "step" : undefined}
              className={i === index ? "active" : ""}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
        <div>
          <button disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
            ←
          </button>
          <button
            disabled={index === slides.length - 1}
            onClick={() => setIndex((i) => i + 1)}
          >
            →
          </button>
        </div>
      </footer>
      <style>{`.presentation{min-height:100dvh;background:#f5f7f0;display:flex;flex-direction:column}.presentation header,.presentation footer{display:flex;justify-content:space-between;align-items:center;padding:23px 5vw;font-size:11px;color:#81916f;gap:15px}.presentation header{border-bottom:1px solid #dce4d3}.presentation button{border:1px solid #d1dcc6;background:transparent;border-radius:4px;color:#557341;padding:7px 12px;font-size:11px}.presentation button:disabled{opacity:.3;cursor:default}.presentation main{flex:1;padding:5vh 8vw 4vh;max-width:1300px;width:100%;margin:auto}.slide-label{font:11px ui-monospace,monospace;text-transform:uppercase;letter-spacing:2px;color:#829d6b}.presentation h1{font-size:clamp(30px,4.6vw,62px);font-weight:500;line-height:1.13;letter-spacing:-2px;max-width:1000px;margin:25px 0 20px;color:#34492b}.slide-body{font-size:clamp(13px,1.5vw,19px);line-height:1.7;color:#82916e;max-width:950px}.presentation ol{list-style:none;display:grid;gap:0;padding:10px 0 0;max-width:1000px}.presentation li{display:flex;gap:20px;border-bottom:1px solid #e0e7d8;padding:17px 0;font-size:clamp(12px,1.4vw,18px);line-height:1.6;color:#637c50}.presentation li>span{font:11px ui-monospace,monospace;color:#abbc98;padding-top:5px}.presentation aside{padding:14px 17px;background:#e9f0e1;border-left:2px solid #a1b789;font-size:12px;line-height:1.8;color:#72895e;margin:20px 0}.presentation footer{border-top:1px solid #dce4d3}.presentation footer>div:last-child{display:flex;gap:8px}.slide-dots{display:flex;gap:7px}.slide-dots button{border:0;background:#d5dfca;padding:0;width:7px;height:7px;border-radius:50%}.slide-dots button.active{background:#527343}@media(max-width:600px){.presentation header span{display:none}.presentation main{padding:35px 22px}.presentation h1{letter-spacing:-1px}.presentation li{padding:14px 0;font-size:13px}}@media print{.presentation header,.presentation footer{display:none}.presentation main{padding:20px}.presentation{min-height:auto}}`}</style>
    </div>
  );
}
