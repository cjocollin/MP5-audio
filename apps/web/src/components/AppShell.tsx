import { useState } from "react";
import type { Icon } from "@phosphor-icons/react";
import { ArrowsClockwise } from "@phosphor-icons/react/ArrowsClockwise";
import { ClockCounterClockwise } from "@phosphor-icons/react/ClockCounterClockwise";
import { Flask } from "@phosphor-icons/react/Flask";
import { FolderOpen } from "@phosphor-icons/react/FolderOpen";
import { Gear } from "@phosphor-icons/react/Gear";
import { Info } from "@phosphor-icons/react/Info";
import { List } from "@phosphor-icons/react/List";
import { X } from "@phosphor-icons/react/X";
import { APP_VERSION } from "../generated/appVersion";
import { dismissBetaNotice, shouldShowBetaNotice } from "../lib/firstRun";
import {
  CONVERTER_SOURCE_ACCEPT,
  MP5_FILE_ACCEPT,
  pickMp5Files,
  shouldFallbackToInputPicker,
} from "../lib/pickMp5Files";
import { MP5_GITHUB_URL } from "../lib/publicLinks";
import { usePlayerStore } from "../store/playerStore";
import { SignalMarkSprite } from "./SignalMarkSprite";

export type AppTab = "player" | "converter" | "library" | "demo" | "about" | "settings";

interface TabItem {
  id: AppTab;
  label: string;
  icon: Icon;
  mobile?: boolean;
}

const TABS: TabItem[] = [
  { id: "player", label: "Player", icon: Flask, mobile: true },
  { id: "converter", label: "Converter", icon: ArrowsClockwise, mobile: true },
  { id: "library", label: "Library", icon: FolderOpen, mobile: true },
  { id: "demo", label: "Demo", icon: ClockCounterClockwise, mobile: true },
  { id: "about", label: "About", icon: Info },
  { id: "settings", label: "Settings", icon: Gear, mobile: true },
];

const SHELL_FILE_ACTIONS = {
  player: { label: "Open MP5", shortLabel: "Open", accept: MP5_FILE_ACCEPT, destination: "player", inputTestId: "player-file-input" },
  converter: { label: "Add source audio", shortLabel: "Add", accept: CONVERTER_SOURCE_ACCEPT, destination: "converter", inputTestId: "converter-file-input" },
  library: { label: "Add to Library", shortLabel: "Add", accept: MP5_FILE_ACCEPT, destination: "library", inputTestId: "local-library-file-input" },
  demo: { label: "Open MP5", shortLabel: "Open", accept: MP5_FILE_ACCEPT, destination: "player", inputTestId: "player-file-input" },
  about: { label: "Open MP5", shortLabel: "Open", accept: MP5_FILE_ACCEPT, destination: "player", inputTestId: "player-file-input" },
  settings: { label: "Open MP5", shortLabel: "Open", accept: MP5_FILE_ACCEPT, destination: "player", inputTestId: "player-file-input" },
} as const satisfies Record<AppTab, {
  label: string;
  shortLabel: string;
  accept: string;
  destination: "player" | "converter" | "library";
  inputTestId: string;
}>;

interface Props {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
}

export function AppShell({ activeTab, onTabChange }: Props) {
  const [noticeVisible, setNoticeVisible] = useState(shouldShowBetaNotice);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const setPendingPlayerFiles = usePlayerStore((s) => s.setPendingPlayerFiles);
  const setPendingConverterFiles = usePlayerStore((s) => s.setPendingConverterFiles);
  const setPendingLibraryFiles = usePlayerStore((s) => s.setPendingLibraryFiles);
  const fileAction = SHELL_FILE_ACTIONS[activeTab];

  const openFilePicker = () => {
    void (async () => {
      const picked = await pickMp5Files({
        accept: fileAction.accept,
      });
      if (picked === null) {
        // Only fall back when the native picker does not exist; after a
        // failed native attempt a second picker is a bug, not a recovery.
        if (shouldFallbackToInputPicker()) {
          if (fileAction.destination === "player" && activeTab !== "player") {
            onTabChange("player");
          }
          window.setTimeout(() => {
            document.querySelector<HTMLInputElement>(`[data-testid="${fileAction.inputTestId}"]`)?.click();
          }, 0);
        }
        return;
      }
      if (!picked.length) return;
      switch (fileAction.destination) {
        case "converter":
          setPendingConverterFiles(picked);
          break;
        case "library":
          setPendingLibraryFiles(picked);
          break;
        case "player":
          onTabChange("player");
          setPendingPlayerFiles(picked);
          break;
      }
    })();
  };

  const changeTab = (tab: AppTab) => {
    onTabChange(tab);
    setMobileMenuOpen(false);
  };

  return (
    <>
      <header className="mp5-shell-header" data-testid="app-shell-header">
        <button
          type="button"
          className="mp5-shell-brand mp5-focus-ring"
          onClick={() => changeTab("player")}
          aria-label="Open MP5 Player"
        >
          <SignalMarkSprite
            playing={isPlaying}
            size="xs"
            className="mp5-shell-brand-mark"
          />
          <span className="mp5-shell-brand-text">
            <span className="mp5-shell-wordmark">
              <span className="mp5-shell-wordmark-accent">MP5</span> Audio
            </span>
            <span className="mp5-shell-version">Public Beta · v{APP_VERSION}</span>
          </span>
        </button>

        <nav className="mp5-shell-nav" aria-label="Main" data-testid="app-main-nav">
          {TABS.map(({ id, label, icon: Icon, mobile }) => (
            <button
              key={id}
              type="button"
              onClick={() => changeTab(id)}
              aria-current={activeTab === id ? "page" : undefined}
              data-testid={`app-tab-${id}`}
              data-mobile-tab={mobile ? "true" : "false"}
              className={`mp5-tab ${activeTab === id ? "mp5-tab-active" : "mp5-tab-inactive"}`}
            >
              <Icon size={20} weight={activeTab === id ? "fill" : "regular"} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="mp5-shell-actions">
          <button
            type="button"
            onClick={openFilePicker}
            className="mp5-btn-primary mp5-shell-open"
            data-testid="shell-open-mp5"
            aria-label={fileAction.label}
          >
            <FolderOpen size={18} weight="bold" />
            <span className="hidden sm:inline">{fileAction.label}</span>
            <span className="sm:hidden">{fileAction.shortLabel}</span>
          </button>
          <button
            type="button"
            className="mp5-shell-menu-button mp5-focus-ring sm:hidden"
            data-testid="shell-mobile-menu-toggle"
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((value) => !value)}
          >
            {mobileMenuOpen ? <X size={22} /> : <List size={22} />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="mp5-shell-mobile-menu" data-testid="shell-mobile-menu">
            <button type="button" onClick={() => changeTab("about")}>
              <Info size={18} /> About MP5
            </button>
            <a href={MP5_GITHUB_URL} target="_blank" rel="noopener noreferrer">
              <List size={18} /> View GitHub
            </a>
          </div>
        )}
      </header>

      {noticeVisible && (
        <div className="mp5-beta-notice" data-testid="public-beta-notice">
          <Flask size={18} aria-hidden />
          <p>
            MP5 is experimental smart audio. <strong>Public Beta.</strong> Use at your own risk.
          </p>
          <button type="button" onClick={() => changeTab("about")}>
            Learn more
          </button>
          <button
            type="button"
            className="mp5-beta-dismiss mp5-focus-ring"
            onClick={() => {
              dismissBetaNotice();
              setNoticeVisible(false);
            }}
            aria-label="Dismiss Public Beta notice"
          >
            <X size={17} />
          </button>
        </div>
      )}
    </>
  );
}
