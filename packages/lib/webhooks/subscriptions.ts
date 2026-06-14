import logger from "@calcom/lib/logger";
import { safeStringify } from "@calcom/lib/safeStringify";
import { prisma } from "@calcom/prisma";
import type { ApiKey, Prisma } from "@calcom/prisma/client";

const log = logger.getSubLogger({ prefix: ["[webhooks/subscriptions]"] });

/**
 * Static Prisma select shared by the OOO webhook listing (consumed by the zapier
 * integration endpoint and a trpc handler) and by `listOOOEntries` below. Lives in
 * @calcom/lib so neither features nor app-store has to reach across the layering
 * boundary for it.
 */
export const selectOOOEntries = {
  id: true,
  start: true,
  end: true,
  createdAt: true,
  updatedAt: true,
  notes: true,
  showNotePublicly: true,
  reason: {
    select: {
      reason: true,
      emoji: true,
    },
  },
  reasonId: true,
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      timeZone: true,
    },
  },
  toUser: {
    select: {
      id: true,
      name: true,
      email: true,
      timeZone: true,
    },
  },
  uuid: true,
};

export async function deleteSubscription({
  appApiKey,
  webhookId,
  appId,
  account,
}: {
  appApiKey?: ApiKey;
  webhookId: string;
  appId: string;
  account?: {
    id: number;
    name: string | null;
    isTeam: boolean;
  } | null;
}) {
  const userId = appApiKey ? appApiKey.userId : account && !account.isTeam ? account.id : null;
  const teamId = appApiKey ? appApiKey.teamId : account && account.isTeam ? account.id : null;
  try {
    let where: Prisma.WebhookWhereInput = {};
    if (teamId) {
      where = { teamId };
    } else {
      where = { userId };
    }

    const deleteWebhook = await prisma.webhook.delete({
      where: {
        ...where,
        appId: appId,
        id: webhookId,
      },
    });

    if (!deleteWebhook) {
      throw new Error(`Unable to delete webhook ${webhookId}`);
    }
    return deleteWebhook;
  } catch (err) {
    const userId = appApiKey ? appApiKey.userId : account && !account.isTeam ? account.id : null;
    const teamId = appApiKey ? appApiKey.teamId : account && account.isTeam ? account.id : null;

    log.error(
      `Error deleting subscription for user ${
        teamId ? `team ${teamId}` : `userId ${userId}`
      }, webhookId ${webhookId}`,
      safeStringify(err)
    );
  }
}

export async function listOOOEntries(
  appApiKey?: ApiKey,
  account?: {
    id: number;
    name: string | null;
    isTeam: boolean;
  } | null
) {
  const userId = appApiKey ? appApiKey.userId : account && !account.isTeam ? account.id : null;
  const teamId = appApiKey ? appApiKey.teamId : account && account.isTeam ? account.id : null;

  try {
    const where: Prisma.OutOfOfficeEntryWhereInput = {};
    if (teamId) {
      where.user = {
        teams: {
          some: {
            teamId,
          },
        },
      };
    } else if (userId) {
      where.userId = userId;
    }

    // early return
    if (!where.userId && !where.user) {
      return [];
    }

    const oooEntries = await prisma.outOfOfficeEntry.findMany({
      where: {
        ...where,
      },
      take: 3,
      orderBy: {
        id: "desc",
      },
      select: selectOOOEntries,
    });

    if (oooEntries.length === 0) {
      return [];
    }
    return oooEntries;
  } catch (err) {
    log.error(
      `Error retrieving list of ooo entries for user ${userId}. or teamId ${teamId}`,
      safeStringify(err)
    );
  }
}
