import type { NextFunction, Request, Response } from "express";
import { ZodError, type ZodType } from "zod";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  try {
    return schema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new HttpError(400, error.issues[0]?.message ?? "Invalid request.");
    }
    throw error;
  }
}

export function bearerToken(request: Request): string {
  const authorization = request.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new HttpError(401, "Authentication required.");
  }

  const token = authorization.slice("Bearer ".length).trim();
  if (!token) {
    throw new HttpError(401, "Authentication required.");
  }

  return token;
}

export function notFound(_request: Request, response: Response): void {
  response.status(404).json({ error: "Not found." });
}

export function errorHandler(
  error: unknown,
  _request: Request,
  response: Response,
  next: NextFunction,
): void {
  void next;
  if (error instanceof HttpError) {
    response.status(error.status).json({ error: error.message });
    return;
  }

  console.error(error);
  response.status(500).json({ error: "Internal server error." });
}
