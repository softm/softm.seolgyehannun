import { getToken } from "firebase/app-check";
import { getFirebaseServices } from "./firebase";

const apiBase = import.meta.env.VITE_API_BASE || "/api";

export async function authorizedApiHeaders(): Promise<HeadersInit> {
  const services = getFirebaseServices();
  if (!services) return {};
  const headers: Record<string, string> = {};
  if (services.auth.currentUser) headers.Authorization = `Bearer ${await services.auth.currentUser.getIdToken()}`;
  if (services.appCheck) {
    const token = await getToken(services.appCheck, false);
    headers["X-Firebase-AppCheck"] = token.token;
  }
  return headers;
}

export function apiUrl(path: string): string {
  return new URL(`${apiBase}${path}`, window.location.origin).toString();
}

export async function apiErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json() as { error?: string };
    return payload.error || fallback;
  } catch {
    return fallback;
  }
}
