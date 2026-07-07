import { ZodType } from 'zod';

type ApiClientConfig = {
  baseUrl: string;
};

export class ApiClientError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  response: Response;

  constructor(
    message: string,
    status: number,
    response: Response,
    errorData?: { code?: string; message?: string; details?: unknown }
  ) {
    super(errorData?.message || message);
    this.name = 'ApiClientError';
    this.status = status;
    this.response = response;
    this.code = errorData?.code;
    this.details = errorData?.details;
  }

  isStatus(status: number): boolean {
    return this.status === status;
  }

  isCode(code: string): boolean {
    return this.code === code;
  }

  isNotFound(): boolean {
    return this.isStatus(404);
  }

  isUnauthorized(): boolean {
    return this.isStatus(401);
  }

  isConflict(): boolean {
    return this.isStatus(409);
  }

  isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }

  isServerError(): boolean {
    return this.status >= 500;
  }

  static isApiClientError(error: unknown): error is ApiClientError {
    return error instanceof ApiClientError;
  }
}

export class ApiClient {
  private config: ApiClientConfig;

  constructor(config?: ApiClientConfig) {
    this.config = config || { baseUrl: '/api' };
  }

  setConfig(config: Partial<ApiClientConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): ApiClientConfig {
    return this.config;
  }

  async fetchAndParse<T>(path: string, schema: ZodType<T>, options: RequestInit = {}): Promise<T> {
    const res = await this.fetchRaw(path, options);
    const data = await res.json();
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      throw new Error(`Error parsing response: ${parsed.error.message}`);
    }

    return parsed.data;
  }

  async fetchRaw(path: string, options: RequestInit = {}): Promise<Response> {
    const hasBody = !!options.body;

    const hasContentType = options.headers && 'Content-Type' in options.headers;

    const res = await fetch(`${this.config.baseUrl}${path}`, {
      ...options,
      headers: {
        ...(hasBody && !hasContentType ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });

    if (!res.ok) {
      let errorData: { code?: string; message?: string; details?: unknown } | undefined;

      try {
        const contentType = res.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          errorData = await res.clone().json();
        }
      } catch {
        // Ignore parsing errors, use default message
      }

      throw new ApiClientError(
        `API request failed: ${res.status} ${res.statusText}`,
        res.status,
        res,
        errorData
      );
    }

    return res;
  }
}

export async function streamToUint8Array(stream: ReadableStream): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLength += value.length;
  }

  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}
