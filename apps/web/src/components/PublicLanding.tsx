import { useEffect, useState, type ReactNode } from "react";
import { usePlayerStore } from "../store/playerStore";
import { AppVersionBadge } from "./AppVersionBadge";
import { DemoFixtureActions } from "./DemoFixtureActions";
import { fetchDemoMp5lFixture } from "../lib/demoFixture";
import { dismissOnboarding } from "../lib/firstRun";
import { importMp5ToPlayer } from "../player/playerImport";
import {
  loadLandingAboutExpanded,
  saveLandingAboutExpanded,
} from "../lib/landingAboutPrefs";
import {
  HONESTY_NO_BEAT_CLAIM,
  LANDING_BADGES,
  LANDING_HEADLINE,
  LANDING_SUBHEADLINE,
  LANDING_SCREENSHOTS,
  FORMAT_MP5_EXPLAINER,
  FORMAT_MP5P_EXPLAINER,
} from "../lib/publicLandingCopy";
import { MP5_DEMO_URL, MP5_GITHUB_URL } from "../lib/publicLinks";

function SectionTitle({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2 id={id} className="text-base sm:text-lg font-semibold text-white">
      {children}
    </h2>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
      {children}
    </span>
  );
}

function CodecCard({
  title,
  accent,
  items,
  testId,
}: {
  title: string;
  accent?: "default" | "lab" | "hybrid";
  items: string[];
  testId: string;
}) {
  const border =
    accent === "lab"
      ? "border-amber-500/25"
      : accent === "hybrid"
        ? "border-violet-500/25"
        : "border-accent/25";
  return (
    <article className={`mp5-card p-3 space-y-1.5 ${border}`} data-testid={testId}>
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <ul className="text-[11px] text-gray-400 space-y-0.5 list-disc list-inside">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </article>
  );
}

function LandingAboutDetails() {
  const setActiveTab = usePlayerStore((s) => s.setActiveTab);

  return (
    <div className="space-y-6 pt-2" data-testid="landing-about-details">
      <div id="landing-demo-actions">
        <DemoFixtureActions
          compact
          testIdPrefix="landing"
          onLoaded={async (file, playFirst) => {
            setActiveTab("player");
            await importMp5ToPlayer([file], { playFirst });
          }}
        />
      </div>

      <section className="mp5-card p-4 space-y-2" data-testid="landing-what-works">
        <SectionTitle>What works today (Alpha)</SectionTitle>
        <ul className="text-xs text-gray-400 space-y-1 list-disc list-inside leading-relaxed">
          <li>Convert FLAC/WAV/MP3/etc. to .mp5 (MP5-L v3 default)</li>
          <li>Play single .mp5 with metadata, lyrics, VISU, stems, karaoke</li>
          <li>Import manifest or embedded .mp5p album packages</li>
          <li>Batch album export from the Converter</li>
          <li>Local library on this device (browser storage)</li>
        </ul>
        <p className="text-[10px] text-gray-600">
          No DRM, no legal verification, no AI stem separation. Large files and embedded albums can be
          slow or heavy in the browser.
        </p>
      </section>

      <section className="mp5-card p-4 space-y-2" data-testid="landing-what-is">
        <SectionTitle>What is MP5?</SectionTitle>
        <p className="text-sm text-gray-400 leading-relaxed">
          MP5 is a new experimental audio format. It is designed to store not only audio, but also
          the context around the audio — metadata, cover art, lyrics, waveform data, content
          guidance, mood/vibe tags, and future advanced audio features.
        </p>
        <p className="text-xs text-gray-500">
          General-purpose audio for players, libraries, families, accessibility tools, and
          specialized apps. Optional content guidance and Haven/Recovery-style tags are available
          as specialized metadata — never required for playback.
        </p>
      </section>

      <section className="space-y-3" data-testid="landing-alpha-modes">
        <SectionTitle>Current Alpha modes</SectionTitle>
        <div className="grid sm:grid-cols-3 gap-2">
          <CodecCard
            testId="landing-codec-mp5l"
            title="MP5-L"
            accent="default"
            items={["Recommended default", "Lossless", "Bit-exact", "Clean listening mode"]}
          />
          <CodecCard
            testId="landing-codec-mp5c"
            title="MP5-C"
            accent="lab"
            items={[
              "Experimental lab codec",
              "Compressed research mode",
              "May add hiss",
              "Not for normal listening yet",
            ]}
          />
          <CodecCard
            testId="landing-codec-mp5h"
            title="MP5-H"
            accent="hybrid"
            items={[
              "Hybrid mode",
              "MP5-C base + CORR correction",
              "Clean when CORR is present",
              "Large files, not default",
            ]}
          />
        </div>
        <p className="text-xs text-gray-500">
          <strong className="text-gray-400 font-normal">PCM</strong> is reference/debug only.
        </p>
      </section>

      <section className="mp5-card p-4 space-y-3" data-testid="landing-differentiators">
        <SectionTitle>What makes MP5 different?</SectionTitle>
        <div className="grid sm:grid-cols-3 gap-3 text-sm">
          <div>
            <h3 className="text-xs uppercase tracking-wider text-green-400/90 font-medium mb-1">
              Works now
            </h3>
            <ul className="text-gray-400 space-y-0.5 text-[11px] list-disc list-inside">
              <li>Smart metadata (title, artist, album)</li>
              <li>Cover art</li>
              <li>Lyrics</li>
              <li>Waveform / seek data</li>
              <li>Content guidance (optional)</li>
              <li>Mood / vibe tags</li>
              <li>MP5-L v3 convert &amp; play</li>
            </ul>
          </div>
          <div>
            <h3 className="text-xs uppercase tracking-wider text-amber-400/90 font-medium mb-1">
              Experimental
            </h3>
            <ul className="text-gray-400 space-y-0.5 text-[11px] list-disc list-inside">
              <li>MP5-C lab codec (may hiss)</li>
              <li>MP5-H hybrid (large)</li>
              <li>Specialized app metadata profiles</li>
            </ul>
          </div>
          <div>
            <h3 className="text-xs uppercase tracking-wider text-violet-400/90 font-medium mb-1">
              Future roadmap
            </h3>
            <ul className="text-gray-400 space-y-0.5 text-[11px] list-disc list-inside">
              <li>Stems / interactive audio research</li>
              <li>Better compression tuning</li>
              <li>Library persistence</li>
              <li>Offline &amp; packaging polish</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="space-y-2" data-testid="landing-screenshots">
        <SectionTitle>See the Alpha demo</SectionTitle>
        <p className="text-xs text-gray-500">
          Synthetic demo audio only — no copyrighted album art in repo screenshots.
        </p>
        <div
          className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth"
          data-testid="landing-screenshot-scroll"
        >
          {LANDING_SCREENSHOTS.map((shot) => (
            <figure
              key={shot.src}
              className="mp5-card overflow-hidden shrink-0 w-[min(72vw,220px)] snap-start"
              data-testid={`landing-screenshot-${shot.label.toLowerCase()}`}
            >
              <img
                src={shot.src}
                alt={shot.alt}
                loading="lazy"
                className="w-full h-28 sm:h-32 object-cover object-top border-b border-white/[0.06]"
              />
              <figcaption className="px-2 py-1.5 text-[10px] font-medium text-gray-400">
                {shot.label}
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="mp5-card p-4 space-y-2" data-testid="landing-try-flow">
        <SectionTitle>Try it — simple demo flow</SectionTitle>
        <ol className="text-sm text-gray-400 space-y-1.5 list-decimal list-inside leading-relaxed">
          <li>
            <strong className="text-gray-300 font-normal">Load the MP5-L demo</strong> — synthetic
            tone, no copyrighted music
          </li>
          <li>
            <strong className="text-gray-300 font-normal">Convert your own</strong> FLAC / WAV /
            MP3 / M4A / OGG (when supported)
          </li>
          <li>
            <strong className="text-gray-300 font-normal">Edit metadata</strong> — title, cover,
            lyrics, optional guidance
          </li>
          <li>
            <strong className="text-gray-300 font-normal">Export MP5-L v3</strong> — recommended
            lossless mode
          </li>
          <li>
            <strong className="text-gray-300 font-normal">Open in the player</strong> — from export
            summary
          </li>
          <li>
            <strong className="text-gray-300 font-normal">Check the Format panel</strong> — codec,
            bit-exact, decode path
          </li>
        </ol>
      </section>

      <section
        className="rounded-xl border border-white/[0.06] bg-black/20 p-4 space-y-2"
        data-testid="landing-honesty"
      >
        <SectionTitle>Honest Alpha limitations</SectionTitle>
        <ul className="text-sm text-gray-400 space-y-1.5 list-disc list-inside leading-relaxed">
          <li>MP5 is experimental Alpha software — not a finished product codec.</li>
          <li>
            <strong className="text-gray-300 font-normal">MP5-L v3</strong> is the recommended
            working mode for listening.
          </li>
          <li>
            <strong className="text-gray-300 font-normal">MP5-C</strong> is research/lab-only
            because of audible hiss on some material.
          </li>
          <li>
            <strong className="text-gray-300 font-normal">MP5-H</strong> can be clean with CORR
            applied but files stay large.
          </li>
          <li>Large WASM/FFmpeg assets may take time to load on first visit.</li>
          <li>Browser conversion is CPU- and memory-intensive for long files.</li>
        </ul>
        <p className="text-sm text-gray-500" data-testid="landing-honesty-claim">
          {HONESTY_NO_BEAT_CLAIM}
        </p>
      </section>

      <section className="space-y-2" data-testid="landing-roadmap">
        <SectionTitle>Alpha roadmap</SectionTitle>
        <ul className="text-xs text-gray-500 flex flex-wrap gap-1.5">
          {[
            "Metadata polish",
            "Better MP5-L compression",
            "MP5-C redesign",
            "Stems / interactive audio research",
            "Desktop / mobile packaging",
            "Offline improvements",
            "Library persistence",
          ].map((item) => (
            <li
              key={item}
              className="rounded-md border border-white/[0.06] bg-surface-elevated/60 px-2 py-0.5"
            >
              {item}
            </li>
          ))}
        </ul>
      </section>

      <p className="text-xs text-gray-500">
        Live demo:{" "}
        <a
          href={MP5_DEMO_URL}
          className="text-accent hover:underline"
          data-testid="landing-demo-url"
        >
          {MP5_DEMO_URL}
        </a>
      </p>
    </div>
  );
}

export function PublicLanding() {
  const setActiveTab = usePlayerStore((s) => s.setActiveTab);
  const trackCount = usePlayerStore((s) => s.tracks.length);
  const [aboutExpanded, setAboutExpanded] = useState(() => loadLandingAboutExpanded());

  useEffect(() => {
    saveLandingAboutExpanded(aboutExpanded);
  }, [aboutExpanded]);

  useEffect(() => {
    if (trackCount > 0) {
      setAboutExpanded(false);
    }
  }, [trackCount]);

  return (
    <div className="space-y-3 mb-4" data-testid="public-landing">
      <header className="space-y-2.5" data-testid="landing-hero-compact">
        <div className="flex flex-wrap items-center gap-2">
          <h1
            className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent"
            data-testid="landing-headline"
          >
            {LANDING_HEADLINE}
          </h1>
          <AppVersionBadge />
        </div>
        <p className="text-sm sm:text-base text-gray-300 font-medium max-w-2xl" data-testid="landing-subheadline">
          {LANDING_SUBHEADLINE}
        </p>
        <p
          className="text-xs text-gray-500 leading-relaxed max-w-2xl space-y-1"
          data-testid="landing-format-explainer"
        >
          <span className="block">{FORMAT_MP5_EXPLAINER}</span>
          <span className="block">{FORMAT_MP5P_EXPLAINER}</span>
        </p>
        <div className="flex flex-wrap gap-1.5" data-testid="landing-badges">
          {LANDING_BADGES.map((b) => (
            <Badge key={b}>{b}</Badge>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 pt-0.5" data-testid="landing-primary-actions">
          <button
            type="button"
            className="mp5-btn-primary text-sm"
            data-testid="landing-try-demo"
            onClick={async () => {
              setActiveTab("player");
              setAboutExpanded(false);
              const file = await fetchDemoMp5lFixture();
              if (file) {
                dismissOnboarding();
                await importMp5ToPlayer([file], { playFirst: true });
              } else {
                setAboutExpanded(true);
                document.getElementById("landing-demo-actions")?.scrollIntoView({ behavior: "smooth" });
              }
            }}
          >
            Try the MP5-L demo
          </button>
          <button
            type="button"
            className="mp5-btn-secondary text-sm min-h-[40px]"
            data-testid="landing-open-demo-guide"
            onClick={() => setActiveTab("demo")}
          >
            Demo guide
          </button>
          <button
            type="button"
            className="mp5-btn-secondary text-sm min-h-[40px]"
            data-testid="landing-open-converter"
            onClick={() => setActiveTab("converter")}
          >
            Convert audio
          </button>
          <button
            type="button"
            className="mp5-btn-secondary text-sm"
            data-testid="landing-open-player"
            onClick={() => setActiveTab("player")}
          >
            Open player
          </button>
          <a
            href={MP5_GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mp5-btn-secondary text-sm inline-flex items-center"
            data-testid="landing-github-link"
          >
            View GitHub
          </a>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="text-xs text-accent hover:text-accent/80 border border-accent/25 rounded-lg px-2.5 py-1.5 bg-accent/5"
          data-testid="landing-about-toggle"
          aria-expanded={aboutExpanded}
          onClick={() => setAboutExpanded((v) => !v)}
        >
          {aboutExpanded ? "Hide About MP5" : "Learn more about MP5"}
        </button>
        {!aboutExpanded && (
          <span className="text-[10px] text-gray-500" data-testid="landing-about-collapsed-hint">
            Codec modes, screenshots, and Alpha notes are here.
          </span>
        )}
      </div>

      {aboutExpanded && <LandingAboutDetails />}
    </div>
  );
}
