import prisma from "@calcom/prisma";

import type { TrpcSessionUser } from "../../../types";
import type { TEditInputSchema } from "./edit.schema";

type EditOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
  };
  input: TEditInputSchema;
};

export const editHandler = async ({ ctx, input }: EditOptions) => {
  const { id, ...data } = input;

  const {
    apiKeys: [updatedApiKey],
  } = await prisma.user.update({
    where: {
      id: ctx.user.id,
    },
    data: {
      apiKeys: {
        update: {
          where: {
            id,
          },
          data,
        },
      },
    },
    select: {
      apiKeys: {
        where: {
          id,
        },
        select: {
          id: true,
          userId: true,
          teamId: true,
          note: true,
          createdAt: true,
          expiresAt: true,
          lastUsedAt: true,
          appId: true,
        },
      },
    },
  });

  return updatedApiKey;
};
