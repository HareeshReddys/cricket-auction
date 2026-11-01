export const API = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
export function route(path: string) {
  return import.meta.env.BASE_URL + "#" + path;
}
export function saveSession(token: string) {
  sessionStorage.setItem("boundary_session", token);
  window.dispatchEvent(new Event("boundary-auth"));
}
export async function request(path: string, options: RequestInit = {}) {
  const token = sessionStorage.getItem("boundary_session");
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", "Bearer " + token);
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  const r = await fetch(API + path, { ...options, headers, cache: "no-store" });
  const d: any = await r.json();
  if (!r.ok) throw new Error(d.error || "Request failed");
  return d;
}
export async function logout() {
  try {
    await request("/api/auth/logout", { method: "POST", body: "{}" });
  } finally {
    sessionStorage.clear();
    location.hash = "/login";
    window.dispatchEvent(new Event("boundary-auth"));
  }
}
export async function originalImage(file: File): Promise<string> {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 12 * 1024 * 1024
  )
    throw new Error("Choose a JPEG, PNG or WebP under 12 MB.");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read image."));
    reader.readAsDataURL(file);
  });
}
