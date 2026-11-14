"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * F-33 · Novedades dentro de la app.
 *
 * Lee `public/release-notes.json` (lo mantiene `sync-version.mjs`) y muestra
 * los cambios. Se abre solo **una vez por versión**: la marca de leído vive en
 * el dispositivo, así que no interrumpe cada vez que se abre la app.
 */

const SEEN_KEY = "quid-seen-version";
const EVENT = "quid-release-notes-open";

interface Release {
  version: string;
  date: string;
  title: string;
  changes: string[];
}

interface ReleaseNotesFile {
  currentVersion: string;
  releases: Release[];
}

export function requestReleaseNotes(): void {
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function ReleaseNotesDialog() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ReleaseNotesFile | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/release-notes.json", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((file: ReleaseNotesFile | null) => {
        if (!active || !file) return;
        setData(file);
        const seen = window.localStorage.getItem(SEEN_KEY);
        if (seen !== file.currentVersion) setOpen(true);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const listener = () => setOpen(true);
    window.addEventListener(EVENT, listener);
    return () => window.removeEventListener(EVENT, listener);
  }, []);

  const close = () => {
    setOpen(false);
    if (data?.currentVersion) {
      window.localStorage.setItem(SEEN_KEY, data.currentVersion);
    }
  };

  if (!open || !data) return null;

  const releases = showAll ? data.releases : data.releases.slice(0, 4);

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div className="w-full max-w-sm space-y-3 rounded-2xl bg-card p-5 shadow-xl">
        <div className="flex items-center gap-2">
          <Sparkles className="size-5 text-emerald-600 dark:text-emerald-400" />
          <p className="font-semibold">Novedades de Quid</p>
        </div>

        <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
          {releases.map((release) => (
            <div key={release.version} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold">
                  {release.version}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">{release.title}</span>
                </p>
                <span className="text-[11px] text-muted-foreground">{release.date}</span>
              </div>
              <ul className="space-y-0.5">
                {release.changes.map((change) => (
                  <li key={change} className="text-xs text-muted-foreground">
                    • {change}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {!showAll && data.releases.length > releases.length && (
          <button
            type="button"
            className="w-full text-xs text-emerald-600 dark:text-emerald-400"
            onClick={() => setShowAll(true)}
          >
            Ver versiones anteriores
          </button>
        )}

        <Button className="w-full rounded-xl" onClick={close}>
          Entendido
        </Button>
      </div>
    </div>
  );
}
