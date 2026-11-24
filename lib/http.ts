import { MAX_BYTES } from "./experiments/schema";
export async function readBoundedJson(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new Error("Нужен Content-Type: application/json");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Пустой запрос");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new Error("Запрос больше 2 MiB");
      }
      chunks.push(value);
    }
    const data = new Uint8Array(size);
    let offset = 0;
    for (const c of chunks) {
      data.set(c, offset);
      offset += c.length;
    }
    return JSON.parse(new TextDecoder().decode(data));
  } catch (e) {
    if (e instanceof SyntaxError) throw new Error("Некорректный JSON");
    throw e;
  } finally {
    reader.releaseLock();
  }
}
export const apiHeaders = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}
