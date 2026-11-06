import type { Request, Response, NextFunction, RequestHandler } from "express";
import { verifyToken } from "../lib/auth.js";
import { prisma } from "../db/prisma.js";

export type AuthedRequest = Request & {
  user?: {
    id: string;
    email: string;
    displayName: string;
    isArtist: boolean;
  };
};

export const requireAuth: RequestHandler = (req, res, next) => {
  void (async () => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    try {
      const payload = verifyToken(header.slice(7));
      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) {
        res.status(401).json({ error: "Invalid session" });
        return;
      }
      (req as AuthedRequest).user = {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        isArtist: user.isArtist,
      };
      next();
    } catch {
      res.status(401).json({ error: "Invalid or expired token" });
    }
  })().catch(next);
};

export const optionalAuth: RequestHandler = (req, res, next) => {
  void (async () => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      next();
      return;
    }
    try {
      const payload = verifyToken(header.slice(7));
      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (user) {
        (req as AuthedRequest).user = {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          isArtist: user.isArtist,
        };
      }
    } catch {
      // ignore
    }
    next();
  })().catch(next);
};
