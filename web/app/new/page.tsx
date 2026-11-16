"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, fmtRp } from "@/lib/api";
import { AppHeader, Camera, Close, Plus, Spinner, Upload } from "@/lib/ui";

type Item = { id: string; name: string; qty: number; price: number };

const DRAFT_KEY = "sb_draft";

/** Shrink big phone photos before upload: faster, and stays under the API's 12MB cap. */
async function downscale(file: File, maxSide = 2000): Promise<File> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 3 * 1024 * 1024) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.88));
    return blob ? new File([blob], "receipt.jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file; // e.g. HEIC the browser can't decode: let the server/LLM try
  }
}

let seq = 0;
const newId = () => `it${Date.now().toString(36)}${(seq++).toString(36)}`;

export default function NewBill() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const [title, setTitle] = useState("Receipt");
  const [items, setItems] = useState<Item[]>([]);
  const [subtotal, setSubtotal] = useState(0);
  const [total, setTotal] = useState(0);
  const [carry, setCarry] = useState<Record<string, unknown>>({});

  // Coming back from the participants step: restore what was already parsed/edited.
  useEffect(() => {
    try {
      const d = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null");
      if (d?.items?.length) {
        setTitle(d.title || "Receipt");
        setItems(d.items);
        setSubtotal(d.subtotal || 0);
        setTotal(d.total || 0);
        const { title: _t, items: _i, subtotal: _s, total: _o, ...rest } = d;
        setCarry(rest);
        setEditing(true);
      }
    } catch {
      /* corrupt draft: start fresh */
    }
  }, []);

  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  // Attach the stream once the <video> element is actually mounted.
  useEffect(() => {
    if (cameraOn && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraOn]);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const openCamera = async () => {
    setError(null);
    // Phones: the native camera app is much better than an in-page stream.
    if (window.matchMedia("(pointer: coarse)").matches) {
      captureRef.current?.click();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera isn't available here (it needs HTTPS). Upload a photo instead.");
      return;
    }
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } },
        audio: false,
      });
      setCameraOn(true);
    } catch (err: any) {
      setError(
        err?.name === "NotAllowedError"
          ? "Camera permission denied. Allow camera access in your browser, or upload a photo instead."
          : "Camera unavailable: " + (err?.message || err?.name || "unknown error")
      );
    }
  };

  const closeCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        closeCamera();
        handleUpload(new File([blob], "camera.jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92
    );
  };

  const handleUpload = async (f: File) => {
    if (!f.type.startsWith("image/") && !/\.(heic|heif)$/i.test(f.name)) {
      setError("Please choose an image file.");
      return;
    }
    setPreview(URL.createObjectURL(f));
    setError(null);
    setParsing(true);
    try {
      const fd = new FormData();
      fd.append("image", await downscale(f));
      const d = await api("/parse", { method: "POST", body: fd });
      const parsed: Item[] = (d.items || []).map((it: any) => ({
        id: newId(),
        name: String(it.name ?? ""),
        qty: Math.max(1, Number(it.qty) || 1),
        price: Number(it.price) || 0,
      }));
      if (!parsed.length) throw new Error("No items found. Try a sharper photo, or add items manually.");
      setTitle(d.title || "Receipt");
      setItems(parsed);
      setSubtotal(Number(d.subtotal) || 0);
      setTotal(Number(d.total) || 0);
      setCarry({});
      setEditing(true);
    } catch (err: any) {
      setError(err.message || "Couldn't read the receipt");
      setPreview(null);
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = "";
      if (captureRef.current) captureRef.current.value = "";
    }
  };

  const startManual = () => {
    setError(null);
    setPreview(null);
    setTitle("Receipt");
    setItems([{ id: newId(), name: "", qty: 1, price: 0 }]);
    setSubtotal(0);
    setTotal(0);
    setCarry({});
    setEditing(true);
  };

  const startOver = () => {
    sessionStorage.removeItem(DRAFT_KEY);
    setPreview(null);
    setItems([]);
    setCarry({});
    setError(null);
    setEditing(false);
  };

  const updateItem = (id: string, patch: Partial<Item>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const removeItem = (id: string) => setItems((prev) => prev.filter((it) => it.id !== id));
  const addItem = () => setItems((prev) => [...prev, { id: newId(), name: "", qty: 1, price: 0 }]);

  const itemsSum = items.reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.qty) || 0), 0);
  const fees = total - itemsSum;
  const emptyName = items.some((it) => !it.name.trim());
  const canProceed = items.length > 0 && total > 0 && itemsSum > 0 && !emptyName && !parsing;
  const hint = emptyName
    ? "Every item needs a name"
    : total <= 0
      ? "Enter the grand total"
      : itemsSum <= 0
        ? "Add at least one priced item"
        : null;

  const next = () => {
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        ...carry,
        title: title.trim() || "Receipt",
        items: items.map((it) => ({ ...it, name: it.name.trim() })),
        subtotal,
        total,
      })
    );
    router.push("/new/assign");
  };

  const fileInputs = (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
      />
      <input
        ref={captureRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
      />
    </>
  );

  /* ── Desktop webcam ───────────────────────────────────────────────────── */
  if (cameraOn) {
    return (
      <main className="fixed inset-0 z-50 flex flex-col bg-black">
        <div className="relative min-h-0 flex-1">
          <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-contain" />
          <button
            onClick={closeCamera}
            className="icon-btn absolute right-3 top-3 !h-10 !w-10 bg-black/60"
            aria-label="Close camera"
          >
            <Close size={18} />
          </button>
          <div className="pointer-events-none absolute inset-5 rounded-2xl border border-white/25 sm:inset-12" />
        </div>
        <div className="flex items-center justify-center gap-10 py-6">
          <span className="w-20 text-center text-[11px] text-zinc-500">
            Fit the receipt
            <br />
            in the frame
          </span>
          <button
            onClick={capture}
            aria-label="Take photo"
            className="h-16 w-16 rounded-full bg-white ring-4 ring-white/25 active:scale-95"
          />
          <div className="w-20" />
        </div>
      </main>
    );
  }

  const showPicker = !editing && !parsing;

  return (
    <main className={`page page-bar ${editing && !parsing ? "page-wide" : ""}`}>
      <AppHeader
        title="New split"
        subtitle={editing ? "check the items before splitting" : "snap or upload the receipt"}
        back="/"
        right={
          editing && !parsing ? (
            <button onClick={startOver} className="btn btn-ghost btn-sm">
              <Camera size={14} /> <span className="hidden sm:inline">Scan again</span>
            </button>
          ) : undefined
        }
      />
      {fileInputs}

      {showPicker && (
        <div className="fade-up space-y-2.5">
          <button
            onClick={openCamera}
            className="card flex w-full items-center gap-3.5 px-4 py-4 text-left transition-colors hover:border-zinc-700"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-800 text-zinc-200">
              <Camera size={19} />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-medium text-zinc-100">Take a photo</span>
              <span className="mt-0.5 block text-[11px] text-zinc-500">Fastest, straight from your camera</span>
            </span>
            <span className="text-zinc-600">›</span>
          </button>

          <button
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) handleUpload(f);
            }}
            className={`card flex w-full items-center gap-3.5 px-4 py-4 text-left transition-colors hover:border-zinc-700 ${
              dragOver ? "!border-blue-500 !bg-blue-500/10" : ""
            }`}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-800 text-zinc-200">
              <Upload size={19} />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-medium text-zinc-100">Upload an image</span>
              <span className="mt-0.5 block text-[11px] text-zinc-500">
                <span className="lg:hidden">A receipt photo from your gallery</span>
                <span className="hidden lg:inline">Click to browse, or drag & drop a file here</span>
              </span>
            </span>
            <span className="text-zinc-600">›</span>
          </button>

          <button onClick={startManual} className="btn btn-ghost btn-sm mt-1">
            <Plus size={14} /> Enter items manually
          </button>

          <p className="pt-3 text-[11px] leading-relaxed text-zinc-600">
            AI reads the item names, prices, tax and total. You can correct anything before splitting
            it with friends.
          </p>
        </div>
      )}

      {parsing && (
        <div className="card fade-up flex flex-col items-center gap-3 px-6 py-12">
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Receipt" className="mb-2 h-28 w-20 rounded-lg object-cover opacity-60" />
          )}
          <Spinner size={22} />
          <p className="text-sm text-zinc-300">Reading your receipt…</p>
          <p className="text-[11px] text-zinc-500">usually takes 5–15 seconds</p>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-xl border border-red-900/60 bg-red-950/30 px-3.5 py-2.5 text-[13px] leading-relaxed text-red-300">
          {error}
        </p>
      )}

      {editing && !parsing && (
        <div className="fade-up lg:grid lg:grid-cols-[22rem_1fr] lg:items-start lg:gap-6">
          {/* Sidebar: receipt, title, totals, CTA */}
          <aside className="side-sticky mb-3 lg:order-none lg:mb-0">
            {preview && (
              <a
                href={preview}
                target="_blank"
                rel="noreferrer"
                title="Open full image"
                className="card hidden max-h-[22rem] overflow-hidden lg:block"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="Receipt" className="w-full object-cover object-top" />
              </a>
            )}

            <div className="card flex items-center gap-3 p-3">
              {preview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Receipt" className="h-16 w-16 shrink-0 rounded-lg object-cover lg:hidden" />
              )}
              <div className="min-w-0 flex-1">
                <label className="label mb-1.5 block" htmlFor="title">
                  Bill name
                </label>
                <input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="input !h-10"
                  placeholder="e.g. Friday dinner"
                />
              </div>
            </div>

            <div className="card grid grid-cols-2 gap-3 p-4">
              <div>
                <label className="label mb-1.5 block" htmlFor="sub">
                  Subtotal
                </label>
                <input
                  id="sub"
                  type="number"
                  inputMode="numeric"
                  value={subtotal || ""}
                  placeholder="0"
                  onChange={(e) => setSubtotal(parseFloat(e.target.value) || 0)}
                  className="input num !h-10 text-sm"
                />
              </div>
              <div>
                <label className="label mb-1.5 block" htmlFor="tot">
                  Grand total
                </label>
                <input
                  id="tot"
                  type="number"
                  inputMode="numeric"
                  value={total || ""}
                  placeholder="0"
                  onChange={(e) => setTotal(parseFloat(e.target.value) || 0)}
                  className="input num !h-10 text-sm font-semibold"
                />
              </div>
              <dl className="col-span-2 space-y-1 border-t border-[var(--line)] pt-3 text-[12px]">
                <div className="flex justify-between text-zinc-500">
                  <dt>Items add up to</dt>
                  <dd className="num text-zinc-300">{fmtRp(itemsSum)}</dd>
                </div>
                <div className="flex justify-between text-zinc-500">
                  <dt>Tax / service / discount</dt>
                  <dd className="num text-zinc-300">
                    {fees >= 0 ? "+" : ""}
                    {fmtRp(fees)}
                  </dd>
                </div>
              </dl>
              {subtotal > 0 && Math.round(itemsSum) !== Math.round(subtotal) && (
                <p className="col-span-2 text-[11px] leading-relaxed text-amber-400/90">
                  Items add up to {fmtRp(itemsSum)} but the receipt subtotal is {fmtRp(subtotal)}. Double-check
                  the prices and quantities.
                </p>
              )}
            </div>

            <div className="bottom-bar">
              <div className="bottom-bar-inner">
                {hint && <p className="mb-2 text-center text-[11px] text-zinc-500">{hint}</p>}
                <button onClick={next} disabled={!canProceed} className="btn btn-primary btn-block">
                  Next: add people
                </button>
              </div>
            </div>
          </aside>

          {/* Items */}
          <section className="card overflow-hidden">
            <div className="flex items-center justify-between px-4 pb-1 pt-3.5">
              <h2 className="label">Items ({items.length})</h2>
              <button onClick={addItem} className="flex items-center gap-1 text-[12px] font-medium text-blue-400">
                <Plus size={13} /> Add
              </button>
            </div>

            {/* column headings, desktop only */}
            <div className="hidden grid-cols-[1fr_4.5rem_8rem_7.5rem_2rem] gap-2 px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-600 sm:grid">
              <span>Name</span>
              <span className="text-center">Qty</span>
              <span className="text-right">Unit price</span>
              <span className="text-right">Line total</span>
              <span />
            </div>

            {items.map((it, i) => (
              <div
                key={it.id}
                className="border-t border-[var(--line)] px-4 py-3 first:border-t-0 sm:grid sm:grid-cols-[1fr_4.5rem_8rem_7.5rem_2rem] sm:items-center sm:gap-2 sm:py-2"
              >
                <div className="flex items-center gap-2 sm:contents">
                  <input
                    value={it.name}
                    onChange={(e) => updateItem(it.id, { name: e.target.value })}
                    placeholder={`Item ${i + 1}`}
                    aria-label="Item name"
                    className={`min-w-0 flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600 sm:h-9 sm:rounded-xl sm:border sm:border-[var(--line)] sm:bg-[var(--surface)] sm:px-3 sm:focus:border-[var(--accent)] ${
                      !it.name.trim() ? "placeholder:text-amber-500/60" : ""
                    }`}
                  />
                  <button
                    onClick={() => removeItem(it.id)}
                    className="text-zinc-600 transition-colors hover:text-red-400 sm:hidden"
                    aria-label="Remove item"
                  >
                    <Close size={15} />
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2 sm:contents">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={it.qty || ""}
                    placeholder="1"
                    onChange={(e) => updateItem(it.id, { qty: Math.max(0, parseInt(e.target.value) || 0) })}
                    onBlur={() => !it.qty && updateItem(it.id, { qty: 1 })}
                    className="input num !h-8 !w-14 !px-2 text-center text-xs sm:!h-9 sm:!w-full"
                    aria-label="Quantity"
                  />
                  <input
                    type="number"
                    inputMode="numeric"
                    value={it.price || ""}
                    placeholder="Unit price"
                    onChange={(e) => updateItem(it.id, { price: parseFloat(e.target.value) || 0 })}
                    className="input num !h-8 flex-1 !px-2 text-right text-xs sm:!h-9"
                    aria-label="Unit price"
                  />
                  <span
                    className={`num w-24 shrink-0 text-right text-[12px] sm:w-auto ${
                      it.price < 0 ? "text-emerald-400" : "text-zinc-400"
                    }`}
                  >
                    {fmtRp(it.qty * it.price)}
                  </span>
                  <button
                    onClick={() => removeItem(it.id)}
                    className="hidden justify-center text-zinc-600 transition-colors hover:text-red-400 sm:flex"
                    aria-label="Remove item"
                  >
                    <Close size={15} />
                  </button>
                </div>
              </div>
            ))}

            {items.length === 0 && (
              <p className="border-t border-[var(--line)] px-4 py-8 text-center text-sm text-zinc-500">
                No items. Add one to continue.
              </p>
            )}

            <div className="border-t border-[var(--line)] p-3">
              <button onClick={addItem} className="btn btn-ghost btn-sm btn-block border-dashed">
                <Plus size={14} /> Add item
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
