"use client";
// Строка кабинета в Настройках: статус токена + «Заменить токен» (инлайн-форма) + «Удалить» (с подтверждением).
import { useState } from "react";
import { replaceToken, deleteCabinet } from "@/app/actions";

export function CabinetRow({
  sid, name, hasToken, daysLeft,
}: {
  sid: string;
  name: string;
  hasToken: boolean;
  daysLeft: number | null;
}) {
  const [showReplace, setShowReplace] = useState(false);

  return (
    <div className="cabrow">
      <div className="cabrow-head">
        <b>{name}</b> <span className="sm mut">{sid}</span>
        <span style={{ flex: 1 }} />
        {hasToken
          ? <span className={`chip ${daysLeft !== null && daysLeft < 14 ? "warn" : "ok"}`}>
              токен есть{daysLeft !== null ? ` · ${daysLeft} дн` : ""}
            </span>
          : <span className="chip bad">нет токена</span>}
        <button
          type="button"
          className={`btn sm${showReplace ? " acc" : ""}`}
          onClick={() => setShowReplace(v => !v)}
        >
          {hasToken ? "Заменить токен" : "Добавить токен"}
        </button>
        <form
          action={deleteCabinet}
          onSubmit={e => {
            if (!confirm(`Удалить кабинет «${name}»?\n\nКабинет отключится от сбора и токен будет удалён. История заказов и остатков сохранится — кабинет можно вернуть, добавив его заново.`)) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="sid" value={sid} />
          <button type="submit" className="btn sm danger">Удалить</button>
        </form>
      </div>

      {showReplace && (
        <form action={replaceToken} className="frm cabrow-replace" onSubmit={() => setShowReplace(false)}>
          <input type="hidden" name="sid" value={sid} />
          <input
            type="password"
            name="token"
            required
            placeholder="Новый WB-токен (персональный, read-only)"
            style={{ flex: 1, minWidth: 240 }}
          />
          <button type="submit" className="btn acc">Сохранить</button>
        </form>
      )}
    </div>
  );
}
