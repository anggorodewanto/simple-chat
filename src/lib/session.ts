import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

const COOKIE = "sc_session";
const MAX_AGE = 60 * 60 * 24 * 90; // 90 days — this lives on a phone home screen.

export type Session = { memberId: string; isAdmin: boolean };

function secret(): Uint8Array {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters");
  }
  return new TextEncoder().encode(value);
}

export async function createSession(session: Session): Promise<void> {
  const token = await new SignJWT({ admin: session.isAdmin })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.memberId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub) return null;
    return { memberId: payload.sub, isAdmin: payload.admin === true };
  } catch {
    return null;
  }
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
