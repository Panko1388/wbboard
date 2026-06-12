"use client";
// Глобальная страница ошибки — вместо белого экрана Next
export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="login-wrap">
      <div className="card login-card" style={{ textAlign: "center" }}>
        <div className="logo">!</div>
        <h1>Что-то пошло не так</h1>
        <p className="sub">{error.message?.slice(0, 200) || "Неизвестная ошибка"}</p>
        <button className="btn acc" onClick={reset}>Попробовать ещё раз</button>
        <p style={{ marginTop: 10 }}><a href="/pulse">На главную</a></p>
      </div>
    </div>
  );
}
