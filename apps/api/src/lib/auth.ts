import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "./env.js";

export type AuthTokenPayload = {
  sub: string;
  email: string;
};

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: "7d" });
}

export function verifyToken(token: string): AuthTokenPayload {
  return jwt.verify(token, env.jwtSecret) as AuthTokenPayload;
}

/** Short-lived token so `<img src>` can load draft media without a Bearer header. */
export function signMediaToken(imageId: string): string {
  return jwt.sign(
    { mid: imageId, purpose: "media" },
    env.jwtSecret,
    { expiresIn: "2h" },
  );
}

export function verifyMediaToken(token: string, imageId: string): boolean {
  try {
    const payload = jwt.verify(token, env.jwtSecret) as {
      mid?: string;
      purpose?: string;
    };
    return payload.purpose === "media" && payload.mid === imageId;
  } catch {
    return false;
  }
}
