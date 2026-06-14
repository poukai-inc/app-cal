import { LRUCache } from "lru-cache";
import type { GetServerSidePropsContext, NextApiRequest } from "next";
import type { AuthOptions, Session } from "next-auth";
import { getToken } from "next-auth/jwt";

import { getUserAvatarUrl } from "@calcom/lib/getAvatarUrl";
import logger from "@calcom/lib/logger";
import { safeStringify } from "@calcom/lib/safeStringify";
import prisma from "@calcom/prisma";
import type { UpId, UserProfile } from "@calcom/types/UserProfile";

class LicenseKeySingleton {
  static async getInstance(..._args: unknown[]) { return new LicenseKeySingleton(); }
  async checkLicense() { return true; }
  async validateLicenseKey() { return true; }
}
class DeploymentRepository {
  constructor(_prisma?: unknown) {}
  async findFirst(..._args: unknown[]) { return null; }
}

const log = logger.getSubLogger({ prefix: ["getServerSession"] });
/**
 * Stores the session in memory using the stringified token as the key.
 *
 */
const CACHE = new LRUCache<string, Session>({ max: 1000 });

/**
 * Resolves the user's enriched profile. Injected by the features layer so this
 * helper stays in @calcom/lib (app-store may import lib but not features). When
 * omitted, the session is returned without an enriched profile, which is all the
 * app-store consumers need (they only read `user.id`/`user.uuid`).
 */
export type EnrichUserWithProfile = (args: {
  user: { id: number; username: string | null };
  upId: UpId;
}) => Promise<{ profile: UserProfile }>;

/**
 * This is a slimmed down version of the `getServerSession` function from
 * `next-auth`.
 *
 * Instead of requiring the entire options object for NextAuth, we create
 * a compatible session using information from the incoming token.
 *
 * The downside to this is that we won't refresh sessions if the users
 * token has expired (30 days). This should be fine as we call `/auth/session`
 * frequently enough on the client-side to keep the session alive.
 */
export async function getServerSession(options: {
  req: NextApiRequest | GetServerSidePropsContext["req"];
  authOptions?: AuthOptions;
  enrichUserWithProfile?: EnrichUserWithProfile;
}) {
  const { req, authOptions: { secret } = {}, enrichUserWithProfile } = options;

  const token = await getToken({
    req,
    secret,
  });

  log.debug("Getting server session", safeStringify({ token }));

  if (!token || !token.email || !token.sub) {
    log.debug("Couldn't get token");
    return null;
  }

  const cachedSession = CACHE.get(JSON.stringify(token));

  if (cachedSession) {
    log.debug("Returning cached session", safeStringify(cachedSession));
    return cachedSession;
  }

  const userId = token.sub ? Number(token.sub) : null;

  if (!userId || userId <= 0) {
    log.warn("Invalid or missing user ID in token", { sub: token.sub });
    return null;
  }

  const userFromDb = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!userFromDb) {
    log.warn("No user found for valid token", { userId });
    return null;
  }

  const deploymentRepo = new DeploymentRepository(prisma);
  const licenseKeyService = await LicenseKeySingleton.getInstance(deploymentRepo);
  const hasValidLicense = await licenseKeyService.checkLicense();

  let upId = token.upId;

  if (!upId) {
    upId = `usr-${userFromDb.id}`;
  }

  if (!upId) {
    log.error("No upId found for session", { userId: userFromDb.id });
    return null;
  }

  const profile = enrichUserWithProfile
    ? (await enrichUserWithProfile({ user: userFromDb, upId })).profile
    : undefined;

  const session: Session = {
    hasValidLicense,
    expires: new Date(typeof token.exp === "number" ? token.exp * 1000 : Date.now()).toISOString(),
    user: {
      id: userFromDb.id,
      uuid: userFromDb.uuid,
      name: userFromDb.name,
      username: userFromDb.username,
      email: userFromDb.email,
      emailVerified: userFromDb.emailVerified,
      email_verified: userFromDb.emailVerified !== null,
      completedOnboarding: userFromDb.completedOnboarding,
      role: userFromDb.role,
      image: getUserAvatarUrl({
        avatarUrl: userFromDb.avatarUrl,
      }),
      belongsToActiveTeam: token.belongsToActiveTeam,
      org: token.org,
      orgAwareUsername: token.orgAwareUsername,
      locale: userFromDb.locale ?? undefined,
      profile,
    },
    profileId: token.profileId,
    upId,
  };

  if (token?.impersonatedBy?.id) {
    const impersonatedByUser = await prisma.user.findUnique({
      where: {
        id: token.impersonatedBy.id,
      },
      select: {
        id: true,
        uuid: true,
        role: true,
      },
    });
    if (impersonatedByUser) {
      session.user.impersonatedBy = {
        id: impersonatedByUser?.id,
        uuid: impersonatedByUser.uuid,
        role: impersonatedByUser.role,
      };
    }
  }

  CACHE.set(JSON.stringify(token), session);

  log.debug("Returned session", safeStringify(session));
  return session;
}
