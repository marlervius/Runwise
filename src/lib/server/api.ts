import { NextResponse } from "next/server";

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, message: string, code: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function badRequest(message: string, details?: unknown): ApiError {
  return new ApiError(400, message, "bad_request", details);
}

export function unauthorized(message: string = "Unauthorized"): ApiError {
  return new ApiError(401, message, "unauthorized");
}

export function notFound(message: string): ApiError {
  return new ApiError(404, message, "not_found");
}

export function upstreamError(message: string, details?: unknown): ApiError {
  return new ApiError(502, message, "upstream_error", details);
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw badRequest("Request body must be valid JSON.");
  }
}

export function handleRouteError(error: unknown, context: string) {
  if (error instanceof ApiError) {
    if (error.status >= 500) {
      console.error(context, error);
    } else {
      console.warn(context, error.message);
    }

    const body: Record<string, unknown> = {
      error: error.message,
      code: error.code,
    };

    if (error.details !== undefined && error.status < 500) {
      body.details = error.details;
    }

    return NextResponse.json(body, { status: error.status });
  }

  console.error(context, error);
  return NextResponse.json(
    { error: "Internal server error", code: "internal_error" },
    { status: 500 }
  );
}
