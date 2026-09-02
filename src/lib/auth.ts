import { timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { getMember, type Member } from "@/lib/db";
import { getSession } from "@/lib/session";

/** Resolves the session cookie to a live member row, or null. */
export async function currentMember(): Promise<Member | null> {
  const session = await getSession();
  if (!session) return null;
  return getMember(session.memberId);
}

export async function verifyAdminPassword(password: string): Promise<boolean> {
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (hash) return bcrypt.compare(password, hash);

  const plain = process.env.ADMIN_PASSWORD;
  if (!plain) throw new Error("Neither ADMIN_PASSWORD_HASH nor ADMIN_PASSWORD is set");

  const a = Buffer.from(password);
  const b = Buffer.from(plain);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function normalizeInviteCode(code: string): string {
  return code.trim().toUpperCase().replace(/[\s-]/g, "");
}

export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export const NAME_MAX = 24;
export const MESSAGE_MAX = 2000;

/**
 * Fixed-window limiter, in memory. Good enough for a single small Fly machine;
 * it resets on deploy and is not shared between instances.
 */
const attempts = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= limit) return false;
  entry.count += 1;
  return true;
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("fly-client-ip") ?? request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}
