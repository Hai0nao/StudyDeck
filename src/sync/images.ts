import type { SupabaseClient } from "@supabase/supabase-js";
import { getImageBlob } from "@/lib/images";
import { DAY } from "@/lib/time";
import { referencedImages, useStore } from "@/store/useStore";
import type { CardRow } from "./payload";
import { useSync } from "./syncState";

const BUCKET = "card-images";
const path = (userId: string, imageId: string) => `${userId}/${imageId}`;

/** Download one image for this user (used when a synced card shows an image we don't have). */
export async function downloadImage(sb: SupabaseClient, imageId: string): Promise<Blob | null> {
  const userId = useSync.getState().userId;
  if (!userId) return null;
  const { data, error } = await sb.storage.from(BUCKET).download(path(userId, imageId));
  if (error || !data) return null;
  useSync.setState((s) => ({ uploadedImages: { ...s.uploadedImages, [imageId]: true } }));
  return data;
}

const imagesOf = (rows: CardRow[]) => {
  const ids = new Set<string>();
  for (const r of rows) {
    if (r.deleted || !r.data) continue;
    if (r.data.termImage) ids.add(r.data.termImage);
    if (r.data.defImage) ids.add(r.data.defImage);
  }
  return ids;
};

/** Images on pulled cards already live in the cloud. */
export function markRemoteImages(rows: CardRow[]) {
  const ids = imagesOf(rows);
  if (!ids.size) return;
  useSync.setState((s) => {
    const next = { ...s.uploadedImages };
    for (const id of ids) next[id] = true;
    return { uploadedImages: next };
  });
}

/** Upload images used by cards about to be pushed, so other devices can fetch them. */
export async function uploadImages(sb: SupabaseClient, rows: CardRow[]) {
  const { userId, uploadedImages } = useSync.getState();
  if (!userId) return;
  for (const id of imagesOf(rows)) {
    if (uploadedImages[id]) continue;
    const blob = await getImageBlob(id);
    if (!blob) continue; // not on this device; whoever added it uploads it
    const { error } = await sb.storage
      .from(BUCKET)
      .upload(path(userId, id), blob, { contentType: blob.type || "image/webp", upsert: true });
    if (error) throw new Error(`Image upload failed: ${error.message}`);
    useSync.setState((s) => ({ uploadedImages: { ...s.uploadedImages, [id]: true } }));
  }
}

/**
 * Once a day, delete cloud images no card uses any more. Only images older than a
 * day are touched, so one another device just uploaded (before pushing its card) is safe.
 */
export async function cleanUpRemoteImages(sb: SupabaseClient) {
  const { userId, lastImageCleanup } = useSync.getState();
  if (!userId || Date.now() - lastImageCleanup < DAY) return;
  const used = referencedImages(useStore.getState().sets);
  const stale: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb.storage.from(BUCKET).list(userId, { limit: 1000, offset });
    if (error || !data) return;
    for (const f of data) {
      const age = Date.now() - Date.parse(f.created_at ?? "");
      if (!used.has(f.name) && age > DAY) stale.push(f.name);
    }
    if (data.length < 1000) break;
  }
  if (stale.length) {
    const { error } = await sb.storage.from(BUCKET).remove(stale.map((n) => path(userId, n)));
    if (error) return;
  }
  useSync.setState((s) => {
    const next = { ...s.uploadedImages };
    for (const n of stale) delete next[n];
    return { uploadedImages: next, lastImageCleanup: Date.now() };
  });
}
