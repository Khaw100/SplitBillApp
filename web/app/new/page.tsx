"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function NewBill() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [preview, setPreview] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);

  // parsed + editable
  const [title, setTitle] = useState("Receipt");
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
        setError("Camera permission denied. Please allow camera access in your browser.");
      } else if (location.protocol !== "https:" && location.hostname !== "localhost") {
        setError("Camera requires HTTPS. Open https://splitbill.rakhawiratama.com");
      } else {
        setError("Camera unavailable: " + (err.message || err.name));
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
      setTitle(d.title || "Receipt");
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

  const canProceed = items.length > 0 && total > 0 && !parsing;

  const next = () => {
    sessionStorage.setItem("sb_draft", JSON.stringify({ title, items, subtotal, total }));
    router.push("/new/assign");
  };

  if (cameraOn) {
    return (
      <main className="min-h-screen bg-zinc-950 flex flex-col">
        <video ref={videoRef} playsInline muted className="flex-1 w-full object-cover" />
        <canvas ref={canvasRef} className="hidden" />
        <div className="p-6 flex items-center justify-center gap-8 bg-zinc-950">
          <button onClick={closeCamera} className="text-zinc-400 text-sm px-4 py-2 rounded-full bg-zinc-900 border border-zinc-800">
            Cancel
          </button>
          <button
            onClick={capture}
            aria-label="Capture receipt"
            className="w-16 h-16 rounded-full bg-blue-600 ring-4 ring-blue-600/30 active:scale-95 transition-transform"
          />
          <div className="w-[76px]" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen max-w-2xl mx-auto px-4 py-10">
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-bold text-zinc-100">New split</h1>
        <a href="/" className="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-800 rounded-lg px-3 py-1.5">
          Cancel
        </a>
      </header>

      {!preview && !parsing && (
        <div className="space-y-3">
          <button
            onClick={openCamera}
            className="block w-full bg-zinc-900 hover:border-blue-500/60 border-2 border-dashed border-zinc-700 rounded-2xl p-10 text-center transition-colors"
          >
            <p className="text-4xl mb-3">📷</p>
            <p className="text-sm font-semibold text-zinc-200">Take a photo</p>
            <p className="text-xs text-zinc-500 mt-1">point your camera at the receipt</p>
          </button>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-zinc-800" />
            <span className="text-xs text-zinc-600">or</span>
            <div className="flex-1 h-px bg-zinc-800" />
          </div>
          <label className="block cursor-pointer bg-zinc-900 hover:border-zinc-600 border border-zinc-800 rounded-2xl p-6 text-center transition-colors">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
            />
            <p className="text-sm font-medium text-zinc-300">📁 Upload from gallery / files</p>
          </label>
        </div>
      )}

      {parsing && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
          <div className="animate-pulse text-sm text-zinc-400">🤖 AI is reading your receipt...</div>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-4 py-3 mt-4">{error}</p>
      )}

      {preview && !parsing && (
        <div className="space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex gap-4 items-start">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="receipt" className="h-28 rounded-lg object-cover" />
            <div className="flex-1">
              <label className="text-xs text-zinc-400 uppercase tracking-widest">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm uppercase tracking-widest text-zinc-500 font-semibold">Items</h2>
              <button onClick={addItem} className="text-xs text-blue-400 hover:text-blue-300">
                + Add item
              </button>
            </div>
            <div className="space-y-2">
              {items.map((it) => (
                <div key={it.id} className="flex gap-2 items-center">
                  <input
                    value={it.name}
                    onChange={(e) => updateItem(it.id, "name", e.target.value)}
                    placeholder="Item name"
                    className="flex-1 min-w-0 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm"
                  />
                  <input
                    type="number" min={1}
                    value={it.qty}
                    onChange={(e) => updateItem(it.id, "qty", parseInt(e.target.value) || 1)}
                    className="w-14 bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm"
                  />
                  <input
                    type="number" min={0}
                    value={it.price}
                    onChange={(e) => updateItem(it.id, "price", parseFloat(e.target.value) || 0)}
                    className="w-24 bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-right"
                  />
                  <button onClick={() => removeItem(it.id)} className="text-zinc-600 hover:text-red-400 px-1">✕</button>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-zinc-400 uppercase tracking-widest">Subtotal</label>
              <input
                type="number" value={subtotal}
                onChange={(e) => setSubtotal(parseFloat(e.target.value) || 0)}
                className="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400 uppercase tracking-widest">Total (incl. tax/service)</label>
              <input
                type="number" value={total}
                onChange={(e) => setTotal(parseFloat(e.target.value) || 0)}
                className="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm font-semibold text-blue-400"
              />
            </div>
          </div>

          <button
            onClick={next}
            disabled={!canProceed}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-3 transition-colors"
          >
            Next: Assign participants →
          </button>
        </div>
      )}
    </main>
  );
}

