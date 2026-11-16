"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, fmtMoney } from "@/lib/api";
import { type Draft, type Item, clearDraft, itemsSum, loadDraft, saveDraft } from "@/lib/split";
import { ActionBar, Alert, Container, Icon, Spinner, Stepper, TopBar, btn, input, label } from "@/components/ui";

type Stage = "pick" | "camera" | "parsing" | "edit";

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
    return file; // e.g. HEIC the browser can't decode — let the server/LLM try
  }
}

let idSeq = 0;
const newId = () => `it${Date.now().toString(36)}${(idSeq++).toString(36)}`;

export default function NewBill() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>("pick");
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [title, setTitle] = useState("Receipt");
  const [currency, setCurrency] = useState("Rp");
  const [items, setItems] = useState<Item[]>([]);
  const [subtotal, setSubtotal] = useState(0);
  const [total, setTotal] = useState(0);
  const [carry, setCarry] = useState<Pick<Draft, "participants" | "assignments">>({});

  // Restore an in-progress draft (e.g. user tapped "Back" on the assign step)
  useEffect(() => {
    const d = loadDraft();
    if (d && d.items?.length) {
      setTitle(d.title || "Receipt");
      setCurrency(d.currency || "Rp");
      setItems(d.items);
      setSubtotal(d.subtotal || 0);
      setTotal(d.total || 0);
      setCarry({ participants: d.participants, assignments: d.assignments });
      setStage("edit");
    }
  }, []);

  // Stop camera on unmount
  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  // Attach the stream once the <video> is actually mounted
  useEffect(() => {
    if (stage === "camera" && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [stage]);

  // Release blob URLs we no longer show
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const isTouch = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

  const takePhoto = async () => {
    setError(null);
    // On phones the native camera UI is far better than an in-page stream
    if (isTouch()) {
      captureRef.current?.click();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera isn't available here (it requires HTTPS). Upload a photo instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } },
        audio: false,
      });
      streamRef.current = stream;
      setStage("camera");
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
    setStage("pick");
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
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        handleUpload(new File([blob], "camera.jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.9
    );
  };

  const handleUpload = async (original: File) => {
    if (!original.type.startsWith("image/") && !/\.(heic|heif)$/i.test(original.name)) {
      setError("Please choose an image file.");
      return;
    }
    setError(null);
    setPreview(URL.createObjectURL(original));
    setStage("parsing");
    try {
      const f = await downscale(original);
      const fd = new FormData();
      fd.append("image", f);
      const d = await api("/parse", { method: "POST", body: fd });
      const parsed: Item[] = (d.items || []).map((it: any) => ({
        id: newId(),
        name: String(it.name ?? ""),
        qty: Math.max(1, Number(it.qty) || 1),
        price: Number(it.price) || 0,
      }));
      if (!parsed.length) throw new Error("No items found on this receipt. Try a sharper photo or add items manually.");
      setTitle(d.title || "Receipt");
      setCurrency(typeof d.currency === "string" && d.currency.trim() ? d.currency.trim() : "Rp");
      setItems(parsed);
      const sum = itemsSum(parsed);
      setSubtotal(Number(d.subtotal) || sum);
      setTotal(Number(d.total) || Number(d.subtotal) || sum);
      setCarry({});
      setStage("edit");
    } catch (err: any) {
      setError(err.message || "Couldn't read the receipt");
      setPreview(null);
      setStage("pick");
    } finally {
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
    setStage("edit");
  };

  const restart = () => {
    clearDraft();
    setPreview(null);
    setItems([]);
    setCarry({});
    setError(null);
    setStage("pick");
  };

  const updateItem = (id: string, patch: Partial<Item>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const removeItem = (id: string) => setItems((prev) => prev.filter((it) => it.id !== id));
  const addItem = () => setItems((prev) => [...prev, { id: newId(), name: "", qty: 1, price: 0 }]);

  const sum = itemsSum(items);
  const extra = total - sum;
  const subtotalMismatch = subtotal > 0 && Math.abs(subtotal - sum) >= 1;
  const emptyNames = items.some((it) => !it.name.trim());
  const canProceed = items.length > 0 && total > 0 && sum > 0 && !emptyNames;

  const next = () => {
    const ids = new Set(items.map((i) => i.id));
    const assignments = carry.assignments
      ? Object.fromEntries(Object.entries(carry.assignments).map(([p, a]) => [p, a.filter((x) => ids.has(x))]))
      : undefined;
    saveDraft({
      title: title.trim() || "Receipt",
      currency,
      items: items.map((it) => ({ ...it, name: it.name.trim() })),
      subtotal,
      total,
      participants: carry.participants,
      assignments,
    });
    router.push("/new/assign");
  };

  /* ── Camera (desktop webcam) ─────────────────────────────────────────── */
  if (stage === "camera") {
    return (
      <main className="fixed inset-0 z-50 bg-black flex flex-col">
        <div className="relative flex-1 min-h-0">
          <video ref={videoRef} playsInline muted className="absolute inset-0 size-full object-contain" />
          <div className="pointer-events-none absolute inset-8 sm:inset-16 rounded-3xl border-2 border-white/30" />
          <p className="absolute top-4 inset-x-0 text-center text-sm text-white/80 pt-safe">Fit the whole receipt inside the frame</p>
        </div>
        <div className="flex items-center justify-between gap-6 px-8 pt-5 pb-safe-3 bg-black max-w-md mx-auto w-full">
          <button onClick={closeCamera} className="text-white/80 text-sm font-medium w-20 text-left">
            Cancel
          </button>
          <button
            onClick={capture}
            aria-label="Capture receipt"
            className="size-[72px] rounded-full bg-white ring-4 ring-white/30 ring-offset-4 ring-offset-black active:scale-95 transition-transform"
          />
          <span className="w-20" />
        </div>
      </main>
    );
  }

  const hiddenInputs = (
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

  return (
    <>
      <TopBar
        title="New split"
        back="/"
        right={
          stage === "edit" ? (
            <button onClick={restart} className={btn.ghost}>
              <Icon name="camera" /> <span className="hidden sm:inline">Scan again</span>
            </button>
          ) : undefined
        }
      />
      {hiddenInputs}

      <Container className={`py-6 ${stage === "edit" ? "pb-32 lg:pb-12" : "pb-12"}`}>
        <div className="mb-6">
          <Stepper step={1} />
        </div>

        {error && (
          <div className="mb-5">
            <Alert>{error}</Alert>
          </div>
        )}

        {/* ── Pick source ─────────────────────────────────────────────── */}
        {stage === "pick" && (
          <div className="mx-auto max-w-3xl">
            <h2 className="text-2xl sm:text-3xl font-bold text-zinc-50">Add your receipt</h2>
            <p className="text-sm text-zinc-500 mt-1 mb-6">AI will read the items and prices — you can fix anything afterwards.</p>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                onClick={takePhoto}
                className="group text-left rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/15 to-zinc-900 p-6 hover:border-emerald-400/60 transition-colors"
              >
                <span className="inline-grid place-items-center size-12 rounded-2xl bg-emerald-500 text-emerald-950 mb-4">
                  <Icon name="camera" className="size-6" />
                </span>
                <p className="font-semibold text-zinc-100">Take a photo</p>
                <p className="text-sm text-zinc-500 mt-0.5">Use your camera</p>
              </button>

              <div
                role="button"
                tabIndex={0}
                onClick={() => fileRef.current?.click()}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileRef.current?.click()}
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
                className={`cursor-pointer rounded-3xl border-2 border-dashed p-6 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 ${
                  dragOver ? "border-emerald-400 bg-emerald-500/10" : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700"
                }`}
              >
                <span className="inline-grid place-items-center size-12 rounded-2xl bg-zinc-800 text-zinc-300 mb-4">
                  <Icon name="upload" className="size-6" />
                </span>
                <p className="font-semibold text-zinc-100">Upload image</p>
                <p className="text-sm text-zinc-500 mt-0.5">
                  <span className="lg:hidden">From gallery or files</span>
                  <span className="hidden lg:inline">Click or drag & drop a file here</span>
                </p>
              </div>
            </div>

            <button onClick={startManual} className={`${btn.ghost} mt-4 w-full sm:w-auto`}>
              <Icon name="pencil" /> Enter items manually
            </button>
          </div>
        )}

        {/* ── Parsing ─────────────────────────────────────────────────── */}
        {stage === "parsing" && (
          <div className="mx-auto max-w-md text-center">
            <div className="relative mx-auto w-48 sm:w-56 aspect-[3/4] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
              {preview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Receipt" className="size-full object-cover opacity-60" />
              )}
              <div className="absolute inset-x-0 h-16 bg-gradient-to-b from-transparent via-emerald-400/40 to-transparent animate-[scan_1.8s_ease-in-out_infinite]" />
            </div>
            <div className="mt-6 inline-flex items-center gap-2 text-sm text-zinc-300">
              <Spinner className="size-4 text-emerald-400" /> Reading your receipt…
            </div>
            <p className="text-xs text-zinc-500 mt-1">This usually takes 5–15 seconds.</p>
            <style>{`@keyframes scan{0%{top:-4rem}100%{top:100%}}`}</style>
          </div>
        )}

        {/* ── Review & edit ───────────────────────────────────────────── */}
        {stage === "edit" && (
          <div className="grid gap-6 lg:grid-cols-[300px_1fr] xl:grid-cols-[340px_1fr] lg:items-start">
            {/* Left: receipt + totals (sticky on desktop) */}
            <aside className="space-y-4 lg:sticky lg:top-24">
              {preview && (
                <a
                  href={preview}
                  target="_blank"
                  rel="noreferrer"
                  className="block overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 max-h-40 lg:max-h-[420px]"
                  title="Open full image"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="Receipt" className="w-full object-cover object-top" />
                </a>
              )}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-4">
                <div>
                  <label htmlFor="title" className={label}>
                    Title
                  </label>
                  <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} className={input} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="subtotal" className={label}>
                      Subtotal
                    </label>
                    <input
                      id="subtotal"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      value={subtotal || ""}
                      placeholder="0"
                      onChange={(e) => setSubtotal(parseFloat(e.target.value) || 0)}
                      className={`${input} tabular-nums`}
                    />
                  </div>
                  <div>
                    <label htmlFor="total" className={label}>
                      Grand total
                    </label>
                    <input
                      id="total"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      value={total || ""}
                      placeholder="0"
                      onChange={(e) => setTotal(parseFloat(e.target.value) || 0)}
                      className={`${input} tabular-nums font-semibold !text-emerald-300`}
                    />
                  </div>
                </div>
                <dl className="text-xs space-y-1.5 border-t border-zinc-800 pt-3 tabular-nums">
                  <div className="flex justify-between text-zinc-400">
                    <dt>Items sum</dt>
                    <dd>{fmtMoney(sum, currency)}</dd>
                  </div>
                  <div className="flex justify-between text-zinc-400">
                    <dt>Tax / service / discount</dt>
                    <dd className={extra < 0 ? "text-sky-300" : ""}>
                      {extra >= 0 ? "+" : ""}
                      {fmtMoney(extra, currency)}
                    </dd>
                  </div>
                </dl>
                {subtotalMismatch && (
                  <Alert tone="warn">
                    Items add up to {fmtMoney(sum, currency)} but the receipt subtotal is {fmtMoney(subtotal, currency)}.
                    Check quantities and prices.
                  </Alert>
                )}
                {total > 0 && sum > 0 && total < sum * 0.5 && (
                  <Alert tone="warn">Grand total is much lower than the items sum — is it correct?</Alert>
                )}
              </div>
            </aside>

            {/* Right: items */}
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60">
              <div className="flex items-center justify-between px-4 py-3.5 border-b border-zinc-800">
                <h2 className="text-sm font-semibold text-zinc-200">
                  Items <span className="text-zinc-500 font-normal">({items.length})</span>
                </h2>
                <button onClick={addItem} className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-400 hover:text-emerald-300">
                  <Icon name="plus" /> Add item
                </button>
              </div>

              {/* column headers — desktop only */}
              <div className="hidden sm:grid grid-cols-[1fr_72px_130px_120px_40px] gap-2 px-4 pt-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                <span>Name</span>
                <span className="text-center">Qty</span>
                <span className="text-right">Unit price</span>
                <span className="text-right">Line total</span>
                <span />
              </div>

              <ul className="divide-y divide-zinc-800/70">
                {items.map((it, idx) => (
                  <li
                    key={it.id}
                    className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_72px_130px_120px_40px] gap-2 px-4 py-3 sm:items-center"
                  >
                    <input
                      value={it.name}
                      onChange={(e) => updateItem(it.id, { name: e.target.value })}
                      placeholder={`Item ${idx + 1}`}
                      aria-label="Item name"
                      className={`${input} h-10 ${!it.name.trim() ? "border-amber-500/40" : ""}`}
                    />
                    {/* mobile: remove sits next to the name */}
                    <button
                      onClick={() => removeItem(it.id)}
                      aria-label="Remove item"
                      className="sm:hidden size-10 grid place-items-center rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                    >
                      <Icon name="x" />
                    </button>

                    <div className="col-span-2 sm:col-span-1 sm:contents grid grid-cols-[72px_1fr_auto] gap-2 items-center">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        value={it.qty || ""}
                        placeholder="1"
                        onChange={(e) => updateItem(it.id, { qty: Math.max(0, parseInt(e.target.value) || 0) })}
                        onBlur={() => !it.qty && updateItem(it.id, { qty: 1 })}
                        aria-label="Quantity"
                        className={`${input} h-10 text-center tabular-nums`}
                      />
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        value={it.price || ""}
                        placeholder="Unit price"
                        onChange={(e) => updateItem(it.id, { price: parseFloat(e.target.value) || 0 })}
                        aria-label="Unit price"
                        className={`${input} h-10 text-right tabular-nums`}
                      />
                      <span className="text-right text-sm font-medium text-zinc-300 tabular-nums whitespace-nowrap min-w-[90px]">
                        {fmtMoney(it.qty * it.price, currency)}
                      </span>
                    </div>
                    <button
                      onClick={() => removeItem(it.id)}
                      aria-label="Remove item"
                      className="hidden sm:grid size-10 place-items-center rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                    >
                      <Icon name="x" />
                    </button>
                  </li>
                ))}
              </ul>

              {items.length === 0 && <p className="px-4 py-8 text-center text-sm text-zinc-500">No items — add one to continue.</p>}

              <div className="px-4 py-3 border-t border-zinc-800">
                <button onClick={addItem} className={`${btn.secondary} w-full border-dashed`}>
                  <Icon name="plus" /> Add item
                </button>
              </div>
            </section>

            <ActionBar className="lg:col-start-2 lg:flex lg:justify-end">
              <button onClick={next} disabled={!canProceed} className={`${btn.primary} w-full lg:w-auto`}>
                Next: assign people <Icon name="arrow" />
              </button>
              {!canProceed && (
                <p className="lg:hidden text-center text-[11px] text-zinc-500 mt-1.5">
                  {emptyNames ? "Every item needs a name" : total <= 0 ? "Enter the grand total" : "Add at least one priced item"}
                </p>
              )}
            </ActionBar>
          </div>
        )}
      </Container>
    </>
  );
}
