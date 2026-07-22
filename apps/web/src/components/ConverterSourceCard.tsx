import { useMemo, useState } from "react";
import type { CoverArt } from "@mp5/container";
import { ArrowsClockwise } from "@phosphor-icons/react/ArrowsClockwise";

import { formatBytes } from "../converter/exportSummary";
import { useCoverObjectUrl } from "../hooks/useCoverObjectUrl";
import { SignalMarkSprite } from "./SignalMarkSprite";
import { WaveformView } from "../player/WaveformView";
import { formatPlaybackTime } from "../player/playlistUtils";

interface SourcePcm {
  samples: Int16Array;
  sampleRate: number;
  channels: number;
}

interface Props {
  file: File;
  pcm: SourcePcm;
  cover?: CoverArt;
  busy?: boolean;
  onReplace: () => void;
  onFiles: (files: FileList) => void;
}

function formatSampleRate(sampleRate: number): string {
  const khz = sampleRate / 1000;
  return `${Number.isInteger(khz) ? khz.toFixed(0) : khz.toFixed(1)} kHz`;
}

function channelLabel(channels: number): string {
  if (channels === 1) return "Mono";
  if (channels === 2) return "Stereo";
  return `${channels} channels`;
}

function sourceFormat(file: File): string {
  const extension = file.name.split(".").pop()?.trim();
  if (extension) return extension.toUpperCase();
  return file.type.replace(/^audio\//, "").toUpperCase() || "Audio";
}

/** A bounded visual summary; export analysis remains authoritative. */
function sampleWaveform(samples: Int16Array, channels: number, points = 180): number[] {
  const frameCount = Math.floor(samples.length / Math.max(1, channels));
  if (!frameCount) return [];
  return Array.from({ length: points }, (_, point) => {
    const startFrame = Math.floor((point / points) * frameCount);
    const endFrame = Math.max(startFrame + 1, Math.floor(((point + 1) / points) * frameCount));
    const stride = Math.max(1, Math.floor((endFrame - startFrame) / 64));
    let peak = 0;
    for (let frame = startFrame; frame < endFrame; frame += stride) {
      for (let channel = 0; channel < channels; channel += 1) {
        peak = Math.max(peak, Math.abs(samples[frame * channels + channel]! / 32768));
      }
    }
    return peak;
  });
}

export function ConverterSourceCard({ file, pcm, cover, busy = false, onReplace, onFiles }: Props) {
  const coverUrl = useCoverObjectUrl(cover);
  const [isDragOver, setIsDragOver] = useState(false);
  const durationSec = pcm.samples.length / Math.max(1, pcm.channels) / pcm.sampleRate;
  const waveform = useMemo(
    () => sampleWaveform(pcm.samples, Math.max(1, pcm.channels)),
    [pcm.samples, pcm.channels],
  );

  return (
    <section
      className={`mp5-converter-source-card${isDragOver ? " is-drag-over" : ""}`}
      data-testid="converter-source-card"
      onDragEnter={(event) => {
        event.preventDefault();
        if (!busy) setIsDragOver(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (!busy) event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsDragOver(false);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragOver(false);
        if (!busy && event.dataTransfer.files.length) onFiles(event.dataTransfer.files);
      }}
    >
      <h3>Source audio</h3>
      <div className="mp5-converter-source-grid">
        <div className="mp5-converter-source-cover">
          {coverUrl ? (
            <img src={coverUrl} alt="Source cover" />
          ) : (
            <SignalMarkSprite size="md" className="mp5-converter-source-mark" />
          )}
        </div>

        <div className="mp5-converter-source-info">
          <p className="mp5-converter-source-name">{file.name}</p>
          <p>{sourceFormat(file)} · {formatSampleRate(pcm.sampleRate)} · {channelLabel(pcm.channels)}</p>
          <p>{formatPlaybackTime(durationSec)} · {formatBytes(file.size)}</p>
        </div>

        <div className="mp5-converter-source-actions">
          <span className="sr-only">Source actions</span>
          <button type="button" onClick={onReplace} disabled={busy} data-testid="converter-source-replace">
            <ArrowsClockwise size={17} /> Replace
          </button>
        </div>

        <div className="mp5-converter-source-waveform" aria-label="Source waveform summary">
          <WaveformView peaks={waveform} progress={0} durationSec={durationSec} />
        </div>
      </div>
      {isDragOver && <p className="mp5-converter-source-drop-hint">Drop to replace source audio</p>}
    </section>
  );
}
