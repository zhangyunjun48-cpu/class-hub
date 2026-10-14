import type { ApiError } from "../../shared/types";

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;
  readonly details: unknown;

  constructor(message: string, status: number, code = "REQUEST_FAILED", requestId: string | null = null, details: unknown = null) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.details = details;
  }

  get isAuthError() {
    return this.status === 401;
  }

  get isNetworkError() {
    return this.status === 0;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * 统一 API 客户端：始终使用同源 /api，带 Cookie，统一解析服务端脱敏错误。
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, signal } = options;
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: body === undefined
        ? { Accept: "application/json" }
        : { Accept: "application/json", "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiClientError("无法连接到服务器，请检查网络后重试", 0, "NETWORK_ERROR");
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ApiClientError("服务器返回了无法处理的响应", response.status, "INVALID_RESPONSE", null, text.slice(0, 200));
    }
  }

  if (!response.ok) {
    const error = (payload as ApiError | null)?.error;
    // 500 时把 requestId 带在消息里：服务端日志按 requestId 能查到具体原因
    const message = error?.code === "INTERNAL_ERROR" && error?.requestId
      ? `${error.message}（请把这段编号发给班委：${error.requestId}）`
      : error?.message;
    throw new ApiClientError(
      message ?? "服务器返回了无法处理的响应",
      response.status,
      error?.code ?? "REQUEST_FAILED",
      error?.requestId ?? null,
      error?.details ?? null,
    );
  }

  return payload as T;
}