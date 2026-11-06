import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { hashPassword, signToken, verifyPassword } from "../lib/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { rateLimit } from "../lib/rateLimit.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

export const authRouter = Router();

const registerLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  name: "registration",
});
const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  name: "login",
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  displayName: z.string().min(1).max(80),
  isArtist: z.boolean().optional().default(false),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});

function publicUser(user: {
  id: string;
  email: string;
  displayName: string;
  bio: string | null;
  isArtist: boolean;
  createdAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    bio: user.bio,
    isArtist: user.isArtist,
    createdAt: user.createdAt,
  };
}

authRouter.post(
  "/register",
  registerLimit,
  asyncHandler(async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { email, password, displayName, isArtist } = parsed.data;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { email, passwordHash, displayName, isArtist },
    });
    const token = signToken({ sub: user.id, email: user.email });
    res.status(201).json({ token, user: publicUser(user) });
  }),
);

authRouter.post(
  "/login",
  loginLimit,
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
    });
    if (
      !user ||
      !(await verifyPassword(parsed.data.password, user.passwordHash))
    ) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }
    const token = signToken({ sub: user.id, email: user.email });
    res.json({ token, user: publicUser(user) });
  }),
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.user!.id },
    });
    res.json({ user: publicUser(user) });
  }),
);

authRouter.patch(
  "/me",
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const schema = z.object({
      displayName: z.string().min(1).max(80).optional(),
      bio: z.string().max(2000).nullable().optional(),
      isArtist: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: parsed.data,
    });
    res.json({ user: publicUser(user) });
  }),
);
