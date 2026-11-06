import type { Request, Response, NextFunction, RequestHandler } from "express";

/** Forward rejected promises from async route handlers to Express error middleware. */
export function asyncHandler<Req extends Request = Request>(
  fn: (req: Req, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(fn(req as Req, res, next)).catch(next);
  };
}
