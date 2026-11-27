import type { ReactNode } from "react";
import { CopyButton } from "./ui";

export function SetupRow({ title, complete, active, open, onToggle, children }: {
  title: string;
  complete: boolean;
  active: boolean;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <li className="setup-row" data-state={complete ? "done" : active ? "current" : "next"}>
      <details open={open}>
        <summary className="setup-summary" onClick={(event) => {
          event.preventDefault();
          onToggle();
        }}>
          <span className="setup-marker" aria-hidden="true">{complete ? "✓" : active ? "•" : ""}</span>
          <span className="setup-title">{title}</span>
          {complete && <span className="sr-only">Complete</span>}
          {active && <span className="step-status">Next step</span>}
          <svg className="setup-chevron" aria-hidden="true" viewBox="0 0 16 16" fill="none">
            <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </summary>
        <div className="setup-detail">{children}</div>
      </details>
    </li>
  );
}

export function SetupValue({ label, value, copyLabel }: { label: string; value: string; copyLabel: string }) {
  return (
    <div className="setup-value">
      <span>{label}</span>
      <code>{value}</code>
      <CopyButton key={value} text={value} label={copyLabel} />
    </div>
  );
}

export function TerminalCheck({ command, connected, children }: {
  command: string;
  connected: boolean;
  children: ReactNode;
}) {
  return (
    <details className="disclosure setup-terminal">
      <summary>Optional terminal check</summary>
      <div>
        <p>Run this in a terminal with Foundry installed.{!connected && " Replace PASTE_YOUR_0x_ADDRESS with the Ethereum address for your QoreX account."}</p>
        <SetupValue label="Command" value={command} copyLabel="Copy command" />
        <p>{children}</p>
      </div>
    </details>
  );
}
