export function AboutMp5Panel() {
  return (
    <div className="space-y-4 text-sm text-gray-300" data-testid="about-mp5-panel">
      <section className="rounded-xl bg-surface-elevated p-4 space-y-2">
        <h2 className="text-lg font-semibold text-white">What is MP5?</h2>
        <p className="text-gray-400 leading-relaxed">
          <strong className="text-gray-200">MP5</strong> is an experimental smart audio container ({" "}
          <code className="text-accent">.mp5</code> files) with several codec modes. This Alpha
          release is a research prototype — not a finished product codec.
        </p>
        <p className="text-xs text-gray-500">
          MP5 does <strong className="text-gray-400">not</strong> claim to beat MP3, AAC, Opus, or
          FLAC.
        </p>
      </section>

      <section className="rounded-xl border border-accent/20 bg-accent/5 p-4 space-y-2">
        <h3 className="font-semibold text-accent">MP5-L v3 — default</h3>
        <p className="text-gray-400 text-xs leading-relaxed">
          <strong className="text-gray-200">Lossless, bit-exact</strong> export. Decoded PCM matches
          the source sample-for-sample. Modest compression vs raw PCM. This is the{" "}
          <strong className="text-gray-200">recommended</strong> mode for listening and demos.
        </p>
      </section>

      <section className="rounded-xl bg-surface-elevated p-4 space-y-2">
        <h3 className="font-semibold text-gray-200">PCM — reference / debug</h3>
        <p className="text-gray-400 text-xs leading-relaxed">
          Uncompressed samples inside the container. Used when WASM codecs are unavailable or for
          baseline testing. Not the normal export path.
        </p>
      </section>

      <section className="rounded-xl bg-surface-elevated p-4 space-y-2">
        <h3 className="font-semibold text-gray-200">MP5-H — hybrid (experimental)</h3>
        <p className="text-gray-400 text-xs leading-relaxed">
          MP5-C base layer plus a lossless <strong className="text-gray-200">CORR</strong> correction.
          Can be <strong className="text-gray-200">clean when CORR is applied</strong>, but files are{" "}
          <strong className="text-gray-200">much larger</strong> than MP5-L. Not the default.
        </p>
      </section>

      <section className="rounded-xl border border-amber-500/20 bg-amber-950/20 p-4 space-y-2">
        <h3 className="font-semibold text-amber-200">MP5-C — lab-only (experimental)</h3>
        <p className="text-gray-400 text-xs leading-relaxed">
          Lossy research codec. May add <strong className="text-amber-200/90">audible hiss</strong> on
          all presets. Not for normal listening or demos unless you are explicitly showing lab
          limitations.
        </p>
      </section>

      <section className="rounded-xl bg-surface-elevated p-4 space-y-2">
        <h3 className="font-semibold text-gray-200">Install &amp; share (Alpha)</h3>
        <p className="text-gray-400 text-xs leading-relaxed">
          The primary target is a <strong className="text-gray-200">web app / PWA</strong> (install
          from the browser on HTTPS or localhost). Desktop (Tauri) and mobile (Capacitor) are
          packaging scaffolds only — not production store apps yet.
        </p>
        <p className="text-gray-400 text-xs leading-relaxed">
          <strong className="text-gray-200">Offline:</strong> the UI and codecs can cache after a
          successful first load, but full offline conversion of all formats is not guaranteed (WASM,
          FFmpeg, fonts).
        </p>
        <p className="text-xs text-gray-500">
          Guide: <code className="text-accent">docs/MP5_INSTALL_GUIDE.md</code>
        </p>
      </section>

      <section className="rounded-xl bg-surface-elevated p-4 space-y-1 text-xs text-gray-500">
        <p>
          Docs: <code className="text-accent">docs/MP5_DEMO_GUIDE.md</code>,{" "}
          <code className="text-accent">docs/MP5_ALPHA_RELEASE_CHECKLIST.md</code>
        </p>
        <p>Verify: <code className="text-accent">pnpm alpha:check</code></p>
      </section>
    </div>
  );
}
