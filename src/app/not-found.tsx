import { DoodleBoxMascot } from "@/components/doodles";

export default function NotFound() {
  return (
    <div className="login-wrap">
      <div className="card login-card" style={{ textAlign: "center" }}>
        <DoodleBoxMascot />
        <h1>Страница не найдена</h1>
        <p className="sub">Коробка пуста — такого адреса нет</p>
        <a className="btn acc" href="/pulse">На главную</a>
      </div>
    </div>
  );
}
