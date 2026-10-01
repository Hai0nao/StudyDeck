import { createStore, del, delMany, get, keys, set } from "idb-keyval";
import { useEffect, useSyncExternalStore } from "react";
import { uid } from "./id";

/**
 * Card images are stored as compressed blobs in IndexedDB (localStorage is far too
 * small), keyed by an image id that cards reference via termImage / defImage.
 * Signed-in users also get them uploaded to Supabase Storage by the sync engine.
 */

const store = createStore("studydeck-images", "images");
const MAX_EDGE = 1000;
export const MAX_INPUT_BYTES = 15 * 1024 * 1024;

/* ---------- object-URL cache shared by every <CardImage> ---------- */

const urls = new Map<string, string>();
const pending = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Fetches an image this device doesn't have yet (set by the sync engine). */
let remoteLoader: ((id: string) => Promise<Blob | null>) | null = null;
export function setRemoteImageLoader(fn: typeof remoteLoader) {
  remoteLoader = fn;
}

function remember(id: string, blob: Blob) {
  const old = urls.get(id);
  if (old) URL.revokeObjectURL(old);
  urls.set(id, URL.createObjectURL(blob));
  emit();
}

async function load(id: string) {
  if (urls.has(id) || pending.has(id)) return;
  pending.add(id);
  try {
    let blob = (await get<Blob>(id, store)) ?? null;
    if (!blob && remoteLoader) {
      blob = await remoteLoader(id);
      if (blob) await set(id, blob, store);
    }
    if (blob) remember(id, blob);
  } catch {
    /* shown as a placeholder; retried next time it's rendered */
  } finally {
    pending.delete(id);
  }
}

/** Object URL for an image id, loading it from IndexedDB or the cloud on first use. */
export function useImageUrl(id: string | null | undefined): string | null {
  const url = useSyncExternalStore(subscribe, () => (id ? (urls.get(id) ?? null) : null));
  useEffect(() => {
    if (id) void load(id);
  }, [id]);
  return url;
}

/* ---------- storage ---------- */

export const getImageBlob = (id: string) => get<Blob>(id, store);

export async function putImageBlob(id: string, blob: Blob) {
  await set(id, blob, store);
  remember(id, blob);
}

export async function deleteImages(ids: string[]) {
  if (!ids.length) return;
  await delMany(ids, store);
  for (const id of ids) {
    const u = urls.get(id);
    if (u) URL.revokeObjectURL(u);
    urls.delete(id);
  }
}

export const allImageIds = () => keys<string>(store);
export const deleteImage = (id: string) => del(id, store);

/* ---------- processing ---------- */

async function decode(file: Blob): Promise<CanvasImageSource & { width: number; height: number }> {
  try {
    return await createImageBitmap(file);
  } catch {
    // e.g. SVG in some browsers: fall back to an <img>
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** Downscale to MAX_EDGE px and re-encode as WebP (JPEG where WebP isn't supported). */
export async function compressImage(file: Blob): Promise<Blob> {
  if (file.size > MAX_INPUT_BYTES) throw new Error("That image is larger than 15 MB.");
  const img = await decode(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't process the image.");
  ctx.drawImage(img, 0, 0, w, h);
  const encode = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.82));
  const blob = (await encode("image/webp")) ?? (await encode("image/jpeg"));
  if (!blob) throw new Error("Couldn't process the image.");
  // toBlob silently falls back to PNG when WebP isn't supported; prefer JPEG then.
  return blob.type === "image/png" ? ((await encode("image/jpeg")) ?? blob) : blob;
}

/** Images added in this session (maybe not saved to a card yet) — never garbage-collected. */
const addedThisSession = new Set<string>();

/** Compress, store and return the new image id. */
export async function addImage(file: Blob): Promise<string> {
  const blob = await compressImage(file);
  const id = `img_${uid()}`;
  addedThisSession.add(id);
  await putImageBlob(id, blob);
  return id;
}

/** First image found on a clipboard / drag-and-drop transfer. */
export function imageFromTransfer(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind === "file" && item.type.startsWith("image/")) return item.getAsFile();
  }
  for (const f of Array.from(data.files ?? [])) if (f.type.startsWith("image/")) return f;
  return null;
}

/* ---------- backups ---------- */

const toDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

export async function exportImages(ids: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const id of ids) {
    const blob = await getImageBlob(id);
    if (blob) out[id] = await toDataUrl(blob);
  }
  return out;
}

export async function importImages(images: Record<string, string>) {
  for (const [id, dataUrl] of Object.entries(images)) {
    const blob = await (await fetch(dataUrl)).blob();
    await putImageBlob(id, blob);
  }
}

/** Remove locally stored images no card refers to (e.g. replaced, or picked but never saved). */
export async function collectLocalImageGarbage(referenced: Set<string>) {
  const stale = (await allImageIds()).filter(
    (id) => !referenced.has(id) && !addedThisSession.has(id),
  );
  await deleteImages(stale);
  return stale.length;
}
