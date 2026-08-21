import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { createHash, timingSafeEqual } from "node:crypto";

const SESSION_MAX_AGE = 8 * 60 * 60;
const MAX_LOGIN_FAILURES = 5;
const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

type LoginAttemptRecord = {
  failures: number;
  windowStartedAt: number;
  blockedUntil: number;
};

const loginAttempts = new Map<string, LoginAttemptRecord>();

function removeExpiredLoginAttempts(now: number) {
  for (const [key, record] of loginAttempts) {
    if (
      record.blockedUntil <= now &&
      now - record.windowStartedAt >= LOGIN_ATTEMPT_WINDOW_MS
    ) {
      loginAttempts.delete(key);
    }
  }
}

function getLoginRateLimitKey(headers: Record<string, unknown>) {
  const forwardedFor = headers["x-forwarded-for"];
  const realIp = headers["x-real-ip"];

  if (typeof forwardedFor === "string") {
    return forwardedFor.split(",")[0].trim();
  }

  if (typeof realIp === "string") {
    return realIp.trim();
  }

  return "unknown";
}

function isLoginBlocked(key: string) {
  const now = Date.now();
  removeExpiredLoginAttempts(now);

  return (loginAttempts.get(key)?.blockedUntil ?? 0) > now;
}

function recordLoginFailure(key: string) {
  const now = Date.now();
  const current = loginAttempts.get(key);

  if (!current || now - current.windowStartedAt >= LOGIN_ATTEMPT_WINDOW_MS) {
    loginAttempts.set(key, {
      failures: 1,
      windowStartedAt: now,
      blockedUntil: 0,
    });
    return;
  }

  const failures = current.failures + 1;

  loginAttempts.set(key, {
    ...current,
    failures,
    blockedUntil:
      failures >= MAX_LOGIN_FAILURES ? now + LOGIN_ATTEMPT_WINDOW_MS : 0,
  });
}

function clearLoginFailures(key: string) {
  loginAttempts.delete(key);
}

function getRequiredEnvironmentVariable(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not configured.`);
  }

  return value;
}

export function normalizeAdminPasswordHash(hash: string) {
  return hash.replaceAll("\\$", "$");
}

function stringsMatch(left: string, right: string) {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();

  return timingSafeEqual(leftDigest, rightDigest);
}

export const authOptions: NextAuthOptions = {
  pages: {
    signIn: "/login",
  },

  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE,
  },

  jwt: {
    maxAge: SESSION_MAX_AGE,
  },

  secret: process.env.AUTH_SECRET,

  providers: [
    CredentialsProvider({
      name: "Credentials",

      credentials: {
        username: {
          label: "Username",
          type: "text",
        },
        password: {
          label: "Password",
          type: "password",
        },
      },

      async authorize(credentials, request) {
        if (!credentials?.username || !credentials?.password) {
          return null;
        }

        const rateLimitKey = getLoginRateLimitKey(request.headers ?? {});

        if (isLoginBlocked(rateLimitKey)) {
          return null;
        }

        const adminUsername = getRequiredEnvironmentVariable("ADMIN_USERNAME");
        const passwordHash = normalizeAdminPasswordHash(
          getRequiredEnvironmentVariable("ADMIN_PASSWORD_HASH"),
        );

        const [validPassword, validUsername] = await Promise.all([
          bcrypt.compare(credentials.password, passwordHash),
          Promise.resolve(stringsMatch(credentials.username, adminUsername)),
        ]);

        if (!validUsername || !validPassword) {
          recordLoginFailure(rateLimitKey);
          return null;
        }

        clearLoginFailures(rateLimitKey);

        return {
          id: "1",
          name: adminUsername,
        };
      },
    }),
  ],
};
