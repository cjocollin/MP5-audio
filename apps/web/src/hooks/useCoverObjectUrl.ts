import { useEffect, useRef, useState } from "react";
import type { CoverArt } from "@mp5/container";
import { replaceCoverPreviewUrl, revokeCoverPreviewUrl } from "../lib/coverPreviewUrl";

/** Stable object URL for cover preview; revokes on change/unmount. */
export function useCoverObjectUrl(cover: CoverArt | undefined): string | undefined {
  const [url, setUrl] = useState<string | undefined>();
  const urlRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const next = replaceCoverPreviewUrl(urlRef.current, cover);
    urlRef.current = next;
    setUrl(next);
    return () => {
      revokeCoverPreviewUrl(urlRef.current);
      urlRef.current = undefined;
    };
  }, [cover?.mime, cover?.data]);

  return url;
}
