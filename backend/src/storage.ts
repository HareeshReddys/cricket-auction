import type { Env } from "./types.ts";

// Keep original bytes in small rows below D1's 2 MB row limit.
// R2 remains supported when a bucket is explicitly configured.
export function assetStorage(env: Env) {
  if (env.BUCKET) return env.BUCKET;
  return {
    async put(key: string, input: Uint8Array | ReadableStream, metadata: {
      httpMetadata: { contentType: string };
      customMetadata: { kind: string; tid: string };
    }) {
      const bytes = input instanceof Uint8Array
        ? new Uint8Array(input)
        : new Uint8Array(await new Response(input).arrayBuffer());
      const statements = [env.DB.prepare(
        "INSERT INTO assets(id,mime,kind,tournament_id,size) VALUES(?,?,?,?,?)",
      ).bind(key, metadata.httpMetadata.contentType, metadata.customMetadata.kind,
        metadata.customMetadata.tid, bytes.length)];
      for (let offset = 0, position = 0; offset < bytes.length; offset += 256 * 1024, position++) {
        const chunk = bytes.subarray(offset, offset + 256 * 1024);
        let binary = "";
        for (let i = 0; i < chunk.length; i += 8192)
          binary += String.fromCharCode(...chunk.subarray(i, i + 8192));
        statements.push(env.DB.prepare(
          "INSERT INTO asset_chunks(asset_id,position,data) VALUES(?,?,?)",
        ).bind(key, position, btoa(binary)));
      }
      await env.DB.batch(statements);
    },
    async get(key: string) {
      const asset = await env.DB.prepare("SELECT * FROM assets WHERE id=?")
        .bind(key).first<{mime: string; kind: string; tournament_id: string; size: number}>();
      if (!asset) return null;
      const chunks = await env.DB.prepare(
        "SELECT data FROM asset_chunks WHERE asset_id=? ORDER BY position",
      ).bind(key).all<{data: string}>();
      const bytes = new Uint8Array(asset.size);
      let offset = 0;
      for (const chunk of chunks.results) {
        const binary = atob(chunk.data);
        for (let i = 0; i < binary.length; i++) bytes[offset++] = binary.charCodeAt(i);
      }
      if (offset !== bytes.length) throw new Error("Incomplete image data");
      return { body: bytes, httpMetadata: { contentType: asset.mime },
        customMetadata: { kind: asset.kind, tid: asset.tournament_id } };
    },
    async delete(key: string) {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM asset_chunks WHERE asset_id=?").bind(key),
        env.DB.prepare("DELETE FROM assets WHERE id=?").bind(key),
      ]);
    },
  };
}
