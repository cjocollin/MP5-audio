import { useState } from "react";
import type { Icon } from "@phosphor-icons/react";
import { Books } from "@phosphor-icons/react/Books";
import { FolderOpen } from "@phosphor-icons/react/FolderOpen";
import { Gear } from "@phosphor-icons/react/Gear";
import { Info } from "@phosphor-icons/react/Info";
import { List } from "@phosphor-icons/react/List";
import { MusicNotes } from "@phosphor-icons/react/MusicNotes";
import { SlidersHorizontal } from "@phosphor-icons/react/SlidersHorizontal";
import { TestTube } from "@phosphor-icons/react/TestTube";
import { X } from "@phosphor-icons/react/X";
import { APP_VERSION } from "../generated/appVersion";
import { MP5_GITHUB_URL } from "../lib/publicLinks";

export type AppTab = "player" | "converter" | "library" | "demo" | "about" | "settings";

interface TabItem {
  id: AppTab;
  label: string;
  icon: Icon;
  mobile?: boolean;
}

const TABS: TabItem[] = [
  { id: "player", label: "Player", icon: MusicNotes, mobile: true },
  { id: "converter", label: "Converter", icon: SlidersHorizontal, mobile: true },
  { id: "library", label: "Library", icon: Books, mobile: true },
  { id: "demo", label: "Demo", icon: TestTube, mobile: true },
  { id: "about", label: "About", icon: Info },
  { id: "settings", label: "Settings", icon: Gear, mobile: true },
];

interface Props {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
}

export function AppShell({ activeTab, onTabChange }: Props) {
  const [noticeVisible, setNoticeVisible] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const openFilePicker = () => {
    onTabChange("player");
    window.setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>('[data-testid="player-file-input"]');
      input?.click();
    }, 0);
  };

  const changeTab = (tab: AppTab) => {
    onTabChange(tab);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
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
          <span className="mp5-shell-wordmark">MP5 Audio</span>
          <span className="mp5-shell-version">Public Beta · v{APP_VERSION}</span>
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
          >
            <FolderOpen size={18} weight="bold" />
            <span className="hidden sm:inline">Open MP5 / Add files</span>
            <span className="sm:hidden">Open</span>
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
          <TestTube size={18} aria-hidden />
          <p>
            MP5 is experimental smart audio. <strong>Public Beta.</strong> Use at your own risk.
          </p>
          <button type="button" onClick={() => changeTab("about")}>
            Learn more
          </button>
          <button
            type="button"
            className="mp5-beta-dismiss mp5-focus-ring"
            onClick={() => setNoticeVisible(false)}
            aria-label="Dismiss Public Beta notice"
          >
            <X size={17} />
          </button>
        </div>
      )}
    </>
  );
}
