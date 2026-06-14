import { getPiiFreeCredential } from "@calcom/lib/piiFreeData";
import logger from "@calcom/lib/logger";
import { safeStringify } from "@calcom/lib/safeStringify";
import type { CredentialPayload, CredentialForCalendarService } from "@calcom/types/Credential";

import { getVideoAdapters } from "../getVideoAdapters";

const log = logger.getSubLogger({ prefix: ["[app-store] deleteMeeting"] });

export const deleteMeeting = async (
  credential: CredentialPayload | CredentialForCalendarService | null,
  uid: string
): Promise<unknown> => {
  if (credential) {
    const videoAdapter = (await getVideoAdapters([credential]))[0];
    log.debug(
      "Calling deleteMeeting for",
      safeStringify({ credential: getPiiFreeCredential(credential), uid })
    );
    // There are certain video apps with no video adapter defined. e.g. riverby,whereby
    if (videoAdapter) {
      return videoAdapter.deleteMeeting(uid);
    }
  }

  return Promise.resolve({});
};
