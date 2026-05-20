# MP5 Metadata Specification (MVP + manual overrides)



MP5 is a **general-purpose smart audio / music format** — not a recovery-only or wellness-only container. Metadata is optional: **files play without any metadata chunks**. Players and apps must ignore unknown chunks and never block playback because of metadata.



**Do not trust embedded metadata blindly** — especially content guidance, mood tags, or AI-labeled fields. They are informational only.



## Design principles



- **General audience first** — title, artist, album, cover art, and lyrics are the primary tags most apps use.

- **Content guidance is optional** — content notices, sensitive themes, and listener comfort help filtering, accessibility, and family-safe playback. **These tags do not affect playback.**

- **Specialized app metadata is optional** — profile-specific chunks (for example Haven / Recovery via RECV) are for apps that need extra context. **Most music players can ignore specialized metadata.**

- **Haven / Recovery is one profile** — not the identity of MP5.

- **Apps choose what to read** — a standard music player may use title, artist, album art, lyrics, and content notices only.

- **Playback never depends on guidance tags** — missing or ignored chunks must not affect decode.

- **Manual only** — the reference converter does **not** auto-generate warnings or AI tags.



## User-facing category names (UI)



| Internal chunk | User-facing label |

|----------------|-------------------|

| META | Track info |

| COVR | Cover art |

| LYRC | Lyrics |

| (group) | Content guidance |

| EXPL | Content notices |

| SAFE | Sensitive themes |

| SENS | Listener comfort |

| RECV | Haven / Recovery profile (specialized app metadata) |

| MOOD / VIBE | Mood & vibe |



Internal fourCC names are stable; labels are presentation-only.



## Content guidance source



EXPL, SAFE, SENS, and RECV payloads include `warningSource`. The converter sets **`user`** for all manually entered guidance, displayed as **user-provided**.



Future source values may include artist-provided, distributor-provided, AI-suggested, and unknown. The converter does not invent non-user sources.



## Chunk overview



| FourCC | MVP | Role |

|--------|-----|------|

| **META** | Yes | Standard tags (title, artist, album, …) |

| **COVR** | Yes | Cover art |

| **LYRC** | Yes | Lyrics |

| **EXPL** | Optional | Content notices (explicit, clean version, mature themes, …) |

| **SAFE** | Optional | Sensitive / emotional themes |

| **SENS** | Optional | Listener comfort / sensory accessibility |

| **RECV** | Optional | Haven / Recovery profile (one optional specialized profile) |

| **WAVE** | Yes | Waveform preview |

| **SEEK** | Yes | Seek table |

| **INFO** | Yes | Encoder strings |

| **MOOD** / **VIBE** | Display-only | Discovery tags |



## EXPL — Content notices



Examples: explicit content, **clean version**, strong language, sexual content, violence, drug references, alcohol references, mature themes.



## SAFE — Sensitive themes



Examples: grief themes, trauma themes, intense emotional content, distressing themes.



## SENS — Listener comfort



Examples: sudden loud sounds, harsh frequencies, intense bass, sensory overload risk.



## Specialized app metadata (converter UI)



The converter exposes an optional **Specialized app metadata** section (collapsed by default) with a **profile selector**:



| Profile | MVP |

|---------|-----|

| None | No extra chunks |

| Custom app tags | **Postponed** — needs a dedicated chunk (for example APPT); not in MVP converter |

| Family / content filtering, Wellness, Education / study, Podcast / spoken word | Placeholder (no extra fields yet) |

| Haven / Recovery (last in list) | RECV chunk when fields are set |



When profile is **None**, the UI states that most MP5 music files do not need a specialized profile.



## RECV — Haven / Recovery profile



Optional **specialized** tags for recovery-aware apps (for example Haven). Examples: recovery-sensitive, relapse themes, craving triggers, grounding-friendly, panic-friendly.



**Drug and alcohol references** belong in **EXPL (Content notices)**, not RECV.



Standard music players can ignore RECV. Only embed it when the Haven / Recovery profile is selected and at least one field is set.



## Manual overrides (converter)



1. **Detect** — FFmpeg/ffmetadata + optional embedded cover/lyrics  

2. **Edit** — track info, cover, lyrics, optional content guidance, mood/vibe, optional specialized profile  

3. **Preview** — detected vs embedded summary; content guidance source shown as user-provided when embedded  

4. **Export** — **Export MP5**



Haven / Recovery fields appear only when that **specialized profile** is selected. The section is collapsed by default.



## Safety limits



| Asset | Limit |

|-------|-------|

| JSON optional chunks | 64 KiB |

| Cover art | 2 MiB |

| Meta value | 8 KiB |



## Implementation



- Container: `packages/mp5-container`

- Web: `metadataLabels.ts`, `MetadataEditor.tsx`, `MetadataReviewPanel.tsx`, `ContentWarningsPanel.tsx`



See also: [`MP5_DEMO_GUIDE.md`](MP5_DEMO_GUIDE.md), [`CURRENT_MP5_STATUS.md`](CURRENT_MP5_STATUS.md).

