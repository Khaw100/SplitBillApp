"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtRp } from "@/lib/api";
import { AppHeader, Camera, Close, Plus, Spinner, Upload } from "@/lib/ui";

export default function NewBill() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);

  const [title, setTitle] = useState("Struk");
  const [items, setItems] = useState<any[]>([]);
  const [subtotal, setSubtotal] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const openCamera = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOn(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 50);
    } catch (err: any) {
      if (err.name === "NotAllowedError") {
        setError("Izin kamera ditolak. Kasih akses kamera di browser, atau pakai upload file.");
      } else {
        setError("Kamera tidak bisa dipakai: " + (err.message || err.name));
      }
    }
  };

  const closeCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  };

  const capture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const f = new File([blob], "camera.jpg", { type: "image/jpeg" });
        closeCamera();
        handleUpload(f);
      },
      "image/jpeg",
      0.92
    );
  };

  const handleUpload = async (f: File) => {
    setPreview(URL.createObjectURL(f));
    setError(null);
    setParsing(true);
    try {
      const fd = new FormData();
      fd.append("image", f);
      const res = await fetch("/api/parse", { method: "POST", body: fd, credentials: "include" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.detail || `HTTP ${res.status}`);
      setTitle(d.title || "Struk");
      setItems(
        (d.items || []).map((it: any, i: number) => ({
          id: `it${i}`,
          name: it.name,
          qty: it.qty ?? 1,
          price: it.price ?? 0,
        }))
      );
      setSubtotal(d.subtotal || 0);
      setTotal(d.total || 0);
    } catch (err: any) {
      setError(err.message);
      setPreview(null);
    } finally {
      setParsing(false);
    }
  };

  const updateItem = (id: string, field: string, value: any) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, [field]: value } : it)));
  };
  const removeItem = (id: string) => setItems((prev) => prev.filter((it) => it.id !== id));
  const addItem = () =>
    setItems((prev) => [...prev, { id: `it${Date.now()}`, name: "", qty: 1, price: 0 }]);

  const itemsSum = items.reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.qty) || 1), 0);
  const canProceed = items.length > 0 && total > 0 && !parsing;

  const next = () => {
    sessionStorage.setItem("sb_draft", JSON.stringify({ title, items, subtotal, total }));
    router.push("/new/assign");
  };

  if (cameraOn) {
    return (
      <main className="flex min-h-[100dvh] flex-col bg-black">
        <div className="relative flex-1">
          <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
          <button
            onClick={closeCamera}
            className="icon-btn absolute right-3 top-3 !h-10 !w-10 bg-black/60"
            aria-label="Tutup kamera"
          >
            <Close size={18} />
          </button>
          <div className="pointer-events-none absolute inset-5 rounded-2xl border border-white/25" />
        </div>
        <canvas ref={canvasRef} className="hidden" />
        <div className="flex items-center justify-center gap-10 py-6">
          <span className="w-16 text-center text-[11px] text-zinc-500">Struk<br />di dalam kotak</span>
          <button
            onClick={capture}
            aria-label="Ambil foto"
            className="h-16 w-16 rounded-full bg-white active:scale-95"
          />
          <div className="w-16" />
        </div>
      </main>
    );
  }

  return (
    <main className="page page-bar">
      <AppHeader title="Split baru" subtitle="foto atau upload struknya" back="/" />

      {!preview && !parsing && (
        <div className="space-y-2.5 fade-up">
          <button
            onClick={openCamera}
            className="card flex w-full items-center gap-3.5 px-4 py-4 text-left transition-colors hover:border-zinc-700"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-800 text-zinc-200">
              <Camera size={19} />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-medium text-zinc-100">Ambil foto struk</span>
              <span className="mt-0.5 block text-[11px] text-zinc-500">
                Paling cepat, langsung dari kamera
              </span>
            </span>
            <span className="text-zinc-600">›</span>
          </button>

          <button
            onClick={() => fileRef.current?.click()}
            className="card flex w-full items-center gap-3.5 px-4 py-4 text-left transition-colors hover:border-zinc-700"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-800 text-zinc-200">
              <Upload size={19} />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-medium text-zinc-100">Upload dari galeri</span>
              <span className="mt-0.5 block text-[11px] text-zinc-500">
                Foto struk yang sudah kamu ambil
              </span>
            </span>
            <span className="text-zinc-600">›</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
          />

          <p className="pt-3 text-[11px] leading-relaxed text-zinc-600">
            AI membaca nama item, harga, pajak dan total. Setelah itu kamu bisa koreksi manual
            sebelum dibagi ke teman.
          </p>
        </div>
      )}

      {parsing && (
        <div className="card flex flex-col items-center gap-3 px-6 py-12 fade-up">
          <Spinner size={22} />
          <p className="text-sm text-zinc-300">AI sedang membaca struk…</p>
          <p className="text-[11px] text-zinc-500">biasanya 5–15 detik</p>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-xl border border-red-900/60 bg-red-950/30 px-3.5 py-2.5 text-[13px] leading-relaxed text-red-300">
          {error}
        </p>
      )}

      {preview && !parsing && (
        <div className="space-y-3 fade-up">
          <div className="card flex items-center gap-3 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="struk" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
            <div className="min-w-0 flex-1">
              <label className="label mb-1.5 block" htmlFor="title">Nama bill</label>
              <input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="input !h-10"
                placeholder="misal: Makan malam Sate Taichan"
              />
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-4 pb-1 pt-3.5">
              <h2 className="label">Item ({items.length})</h2>
              <button onClick={addItem} className="flex items-center gap-1 text-[12px] font-medium text-blue-400">
                <Plus size={13} /> Tambah
              </button>
            </div>
            {items.map((it) => (
              <div key={it.id} className="border-t border-[var(--line)] px-4 py-3 first:border-t-0">
                <div className="flex items-center gap-2">
                  <input
                    value={it.name}
                    onChange={(e) => updateItem(it.id, "name", e.target.value)}
                    placeholder="Nama item"
                    className="min-w-0 flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
                  />
                  <button
                    onClick={() => removeItem(it.id)}
                    className="text-zinc-600 transition-colors hover:text-red-400"
                    aria-label="Hapus item"
                  >
                    <Close size={15} />
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2 text-[11px] text-zinc-500">
                  <span className="tag">{it.qty}×</span>
                  <input
                    type="number"
                    min={1}
                    value={it.qty}
                    onChange={(e) => updateItem(it.id, "qty", parseInt(e.target.value) || 1)}
                    className="input !h-8 !w-14 !px-2 text-center text-xs"
                    aria-label="Jumlah"
                  />
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={it.price}
                    onChange={(e) => updateItem(it.id, "price", parseFloat(e.target.value) || 0)}
                    className="input num !h-8 flex-1 !px-2 text-right text-xs"
                    aria-label="Harga satuan"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="card grid grid-cols-2 gap-3 p-4">
            <div>
              <label className="label mb-1.5 block" htmlFor="sub">Subtotal</label>
              <input
                id="sub"
                type="number"
                inputMode="numeric"
                value={subtotal}
                onChange={(e) => setSubtotal(parseFloat(e.target.value) || 0)}
                className="input num !h-10 text-sm"
              />
            </div>
            <div>
              <label className="label mb-1.5 block" htmlFor="tot">Total bayar</label>
              <input
                id="tot"
                type="number"
                inputMode="numeric"
                value={total}
                onChange={(e) => setTotal(parseFloat(e.target.value) || 0)}
                className="input num !h-10 text-sm font-semibold"
              />
            </div>
            {Math.round(itemsSum) !== Math.round(subtotal) && (
              <p className="col-span-2 text-[11px] text-amber-400/90">
                Jumlah item {fmtRp(itemsSum)} beda dengan subtotal {fmtRp(subtotal)}. Cek lagi
                harga/quantity-nya.
              </p>
            )}
          </div>

          <div className="bottom-bar">
            <div className="bottom-bar-inner">
              <button onClick={next} disabled={!canProceed} className="btn btn-primary btn-block">
                Lanjut: pilih peserta
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
