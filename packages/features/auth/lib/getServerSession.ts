import type { GetServerSidePropsContext, NextApiRequest } from "next";
import type { AuthOptions } from "next-auth";

import { getServerSession as getServerSessionBase } from "@calcom/lib/auth/getServerSession";
import prisma from "@calcom/prisma";

import { UserRepository } from "@calcom/features/users/repositories/UserRepository";

/**
 * Wraps the lib-safe `getServerSession` and injects the `UserRepository`-backed
 * profile enrichment. Callers in features/trpc/web get the fully enriched session
 * (with `user.profile`); the core lives in @calcom/lib so app-store can consume it
 * without importing features.
 */
export function getServerSession(options: {
  req: NextApiRequest | GetServerSidePropsContext["req"];
  authOptions?: AuthOptions;
}) {
  return getServerSessionBase({
    ...options,
    enrichUserWithProfile: ({ user, upId }) =>
      new UserRepository(prisma).enrichUserWithTheProfile({ user, upId }),
  });
}
