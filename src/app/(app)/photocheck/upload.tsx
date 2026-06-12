"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DoodleCam } from "@/components/doodles";

export function UploadForm() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function onFile(file: File | undefined) {
    if (!file || busy) return;
    setBusy(true);
    const fd = new FormData();
    fd.append("photo", file);
    await fetch("/api/photocheck", { method: "POST", body: fd });
    setBusy(false);
    router.refresh();
  }

  return (
    <div
      className="drop"
      onDragOver={e => e.preventDefault()}
      onDrop={e => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]); }}
      onClick={() => inputRef.current?.click()}
      style={{ cursor: "pointer" }}
    >
      <DoodleCam />
      {busy
        ? <span className="typing">Анализирую<i /><i /><i /></span>
        : <>Перетащите фото товара сюда или <b>выберите файл</b> (jpg/png)</>}
      <input
        ref={inputRef} type="file" accept="image/*" hidden
        onChange={e => onFile(e.target.files?.[0] ?? undefined)}
      />
    </div>
  );
}
