type AudioFocusNavigator = {
  audioSession?: { type: string };
};

/** Request exclusive music playback where the browser exposes Audio Session. */
export function requestPlaybackAudioFocus(nav: AudioFocusNavigator | undefined =
  typeof navigator === "undefined" ? undefined : navigator as AudioFocusNavigator): boolean {
  if (!nav?.audioSession) return false;
  try {
    nav.audioSession.type = "playback";
    return nav.audioSession.type === "playback";
  } catch {
    return false;
  }
}
