import { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import { NavigationRail } from "./NavigationRail";
import { TopBar } from "./TopBar";
import { EvidencePanel } from "../evidence/EvidencePanel";
import { SearchDialog } from "../ui/SearchDialog";
import { useGoShortcut, useSearchShortcut, useEscShortcut } from "../../lib/keyboard";
import type { EvidenceDetail } from "../../lib/api";

export function TerminalShell() {
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceDetail | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  // Keyboard shortcuts
  useGoShortcut();
  useSearchShortcut();
  useEscShortcut(() => {
    if (searchOpen) setSearchOpen(false);
    else if (evidenceOpen) {
      setEvidenceOpen(false);
      setSelectedEvidence(null);
    }
  });

  // Listen for custom events from keyboard shortcuts and other components
  useEffect(() => {
    const onOpenEvidence = (e: Event) => {
      const ce = e as CustomEvent;
      setSelectedEvidence(ce.detail ?? null);
      setEvidenceOpen(true);
    };
    const onOpenSearch = () => setSearchOpen(true);

    window.addEventListener("open-evidence", onOpenEvidence);
    window.addEventListener("open-search", onOpenSearch);
    return () => {
      window.removeEventListener("open-evidence", onOpenEvidence);
      window.removeEventListener("open-search", onOpenSearch);
    };
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-graphite-950">
      <NavigationRail />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar onSearchOpen={() => setSearchOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {/* Evidence Panel Overlay */}
      <EvidencePanel
        evidence={selectedEvidence}
        isOpen={evidenceOpen}
        onClose={() => {
          setEvidenceOpen(false);
          setSelectedEvidence(null);
        }}
      />

      {/* Global Search Dialog */}
      <SearchDialog isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
