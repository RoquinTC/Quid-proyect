"use client";

import { useState } from "react";

/**
 * Deprecated compatibility hook.
 *
 * The visible update flow now lives in the service worker/PWA provider so
 * users see a single update card with human release notes instead of raw
 * Docker build IDs.
 */
export function useUpdateChecker() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  void setUpdateAvailable;
  return { updateAvailable };
}
