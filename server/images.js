// In-memory image blob store.
// Swap this module for an R2/S3 adapter to offload image data from server RAM.
// The room state no longer carries dataUrl — items reference images by ID,
// and clients fetch them via GET /api/image/:id.
//
// R2 migration: replace put/get/del/delMany with Cloudflare R2 or AWS S3
// SDK calls. No handler code changes needed.

const store = new Map(); // imageId -> base64 dataUrl

export async function put(id, dataUrl) {
  store.set(id, dataUrl);
}

export async function get(id) {
  return store.get(id) ?? null;
}

export async function del(id) {
  store.delete(id);
}

// Batch delete — called on room cleanup to free all image memory at once.
export async function delMany(ids) {
  for (const id of ids) store.delete(id);
}
