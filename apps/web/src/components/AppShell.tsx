import { useState } from "react";
import type { Icon } from "@phosphor-icons/react";
import { ArrowsClockwise } from "@phosphor-icons/react/ArrowsClockwise";
import { CaretDown } from "@phosphor-icons/react/CaretDown";
import { ClockCounterClockwise } from "@phosphor-icons/react/ClockCounterClockwise";
import { Flask } from "@phosphor-icons/react/Flask";
import { FolderOpen } from "@phosphor-icons/react/FolderOpen";
import { Gear } from "@phosphor-icons/react/Gear";
import { Info } from "@phosphor-icons/react/Info";
import { List } from "@phosphor-icons/react/List";
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
  { id: "player", label: "Player", icon: Flask, mobile: true },
  { id: "converter", label: "Converter", icon: ArrowsClockwise, mobile: true },
  { id: "library", label: "Library", icon: FolderOpen, mobile: true },
  { id: "demo", label: "Demo", icon: ClockCounterClockwise, mobile: true },
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
    const root = document.documentElement;
    const previousScrollBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    window.scrollTo({ top: 0, left: 0 });
    root.style.scrollBehavior = previousScrollBehavior;
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
          <span className="mp5-shell-wordmark"><span className="mp5-shell-wordmark-accent">MP5</span> Audio</span>
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
            <span className="mp5-shell-open-divider" aria-hidden />
            <CaretDown className="mp5-shell-open-caret" size={15} weight="bold" aria-hidden />
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
