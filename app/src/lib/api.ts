/**
 * Base URL for API requests. Empty in local dev (same-origin); set to API Gateway URL in S3 deployment.
 */
export function getApiBase(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
}

export function apiUrl(path: string): string {
  const base = getApiBase();
  const p = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base.replace(/\/$/, "")}${p}` : p;
}
