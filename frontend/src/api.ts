// Calls to the Seatora API on the same site. The login travels in the
// HTTP-only session cookie, which the browser sends by itself; this code
// never sees or stores a token.

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Method = "GET" | "POST" | "PUT" | "DELETE";

export const api = async <T>(method: Method, path: string, body?: unknown): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }

  if (response.status === 204) {
    return undefined as T;
  }
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, json?.message ?? `Something went wrong (${response.status})`);
  }
  return json?.data as T;
};

export const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : "Something went wrong. Please try again.";

export type { User } from "./types";
