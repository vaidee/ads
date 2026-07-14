import { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

// Technical illustration of the actual Step Functions pipeline
// (statemachine/pipeline.asl.json) - see HowItWorks.jsx for the simplified,
// story-driven version of the same workflow aimed at a non-technical
// audience. Colors mirror StatusBadge's own palette (styles.css) so this
// reads consistently with the product itself.
//
// The diagram panel is a fixed light "blueprint" surface, deliberately not
// re-themed with the rest of the page - a schematic reads as itself
// regardless of viewer theme, the way a printed diagram would.
const DIAGRAM = `
flowchart TD
    S(["Upload / reprocess request"]) --> TI["TriggerIngest"]
    TI --> DUP{"duplicate filename?"}
    DUP -->|yes| LDS["LogDuplicateSkip"] --> SKIPPED(["skipped: duplicate"])
    DUP -->|no| IV["IndexVideo"]

    IV --> AIC{"already indexed<br/>from a prior run?"}
    AIC -->|yes: ready| RCA["RunComplianceAnalysis"]
    AIC -->|no| WAIT["Wait 15s"]
    WAIT --> CIS["CheckIndexingStatus"]
    CIS --> ISC{"indexing status?"}
    ISC -->|ready| RCA
    ISC -->|failed| IF["IndexingFailed"]
    ISC -->|pollCount >= 40| ITO["IndexingTimedOut"]
    ISC -->|still processing| WAIT

    RCA --> PAP["ParseAndPersist"]
    PAP --> DT["DetectTalent"]
    DT --> ASL["ApplySuggestionLogic"]
    ASL --> PF["PersistFinal"]
    PF --> PCC{"status = APPROVED?"}
    PCC -->|yes| RPC["RunPlatformCompliance"]
    PCC -->|no: NEEDS_REVIEW / REJECTED| SUCC(["pipeline succeeded"])
    RPC --> SUCC

    TI -. error .-> HPE
    IV -. error .-> HPE
    CIS -. error .-> HPE
    IF -. error .-> HPE
    ITO -. error .-> HPE
    RCA -. error .-> HPE
    PAP -. error .-> HPE
    ASL -. error .-> HPE
    PF -. error .-> HPE
    DT -. "error: contract-status<br/>risk, still continues" .-> ASL
    RPC -. "error: this platform's<br/>advisory, still continues" .-> SUCC

    HPE["HandlePipelineError"] --> FAIL(["pipeline failed"])

    classDef start fill:#2f5d8a,stroke:#2f5d8a,color:#ffffff
    classDef task fill:#eef2f6,stroke:#2f5d8a,stroke-width:1.4px,color:#1b1f24
    classDef choice fill:#fff6e3,stroke:#d98c00,stroke-width:1.4px,color:#6b4a00
    classDef advisory fill:#f1ecfb,stroke:#6a4fd6,stroke-width:1.4px,color:#3d2c85
    classDef failPass fill:#fbeceb,stroke:#7a1f1f,stroke-width:1.4px,color:#5c1717
    classDef terminalOk fill:#1f9d55,stroke:#1f9d55,stroke-width:1.4px,color:#ffffff
    classDef terminalFail fill:#7a1f1f,stroke:#7a1f1f,stroke-width:1.4px,color:#ffffff

    class S start
    class TI,IV,WAIT,CIS,RCA,PAP,ASL,PF task
    class DUP,AIC,ISC,PCC choice
    class DT,RPC advisory
    class IF,ITO,HPE failPass
    class SKIPPED,SUCC terminalOk
    class FAIL terminalFail
`;

let mermaidInitialized = false;

export default function Workflow() {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!mermaidInitialized) {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'base',
        themeVariables: {
          background: '#fbfbf9',
          primaryColor: '#eef2f6',
          primaryTextColor: '#1b1f24',
          primaryBorderColor: '#2f5d8a',
          lineColor: '#6b7480',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          fontSize: '13px',
        },
      });
      mermaidInitialized = true;
    }

    let cancelled = false;
    mermaid.render('ad-pipeline-diagram', DIAGRAM.trim()).then(({ svg }) => {
      if (!cancelled && containerRef.current) containerRef.current.innerHTML = svg;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="workflow-page">
      <style>{`
        .workflow-page {
          --bg: #f7f8fa;
          --panel: #ffffff;
          --ink: #1b1f24;
          --ink-muted: #5b6470;
          --border: #dde1e6;
          --accent: #2f5d8a;
          --accent-soft: #eef2f6;

          padding: 2.5rem 1.25rem 4rem;
          background: var(--bg);
          color: var(--ink);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          line-height: 1.55;
        }

        .workflow-page .content { max-width: 900px; margin: 0 auto; }

        .workflow-page .eyebrow {
          font-size: 0.72rem;
          font-weight: 600;
          letter-spacing: 0.09em;
          text-transform: uppercase;
          color: var(--accent);
          margin: 0 0 0.5rem;
        }

        .workflow-page h1 {
          font-size: 1.7rem;
          font-weight: 700;
          letter-spacing: -0.01em;
          margin: 0 0 0.6rem;
          text-wrap: balance;
        }

        .workflow-page .lede {
          color: var(--ink-muted);
          font-size: 0.98rem;
          max-width: 62ch;
          margin: 0 0 1.75rem;
        }

        .workflow-page .lede code {
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 0.88em;
          background: var(--accent-soft);
          padding: 0.1em 0.4em;
          border-radius: 4px;
        }

        .workflow-page .legend {
          display: flex;
          flex-wrap: wrap;
          gap: 0.9rem 1.6rem;
          padding: 0.9rem 1.1rem;
          margin-bottom: 1.75rem;
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 10px;
          font-size: 0.82rem;
        }

        .workflow-page .legend-group { display: flex; flex-wrap: wrap; gap: 0.7rem 1.4rem; }

        .workflow-page .legend-item {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          color: var(--ink-muted);
          white-space: nowrap;
        }

        .workflow-page .dot { width: 0.62rem; height: 0.62rem; border-radius: 50%; flex: none; }

        .workflow-page .line-sample { width: 1.4rem; height: 0; border-top: 2px solid var(--ink-muted); flex: none; }
        .workflow-page .line-sample.dashed { border-top-style: dashed; }
        .workflow-page .line-sample.dotted { border-top-style: dotted; border-top-width: 2.4px; }

        .workflow-page .diagram-panel {
          background: #fbfbf9;
          border: 1px solid #d8dce1;
          border-radius: 12px;
          padding: 1.25rem 0.5rem;
          margin-bottom: 2rem;
          overflow-x: auto;
        }
        .workflow-page .diagram-panel .mermaid-target {
          display: flex;
          justify-content: center;
          min-width: 640px;
        }

        .workflow-page h2 { font-size: 1.05rem; font-weight: 700; margin: 0 0 0.85rem; }

        .workflow-page .behaviors { display: grid; gap: 0.65rem; padding: 0; margin: 0 0 2rem; list-style: none; }

        .workflow-page .behaviors li {
          background: var(--panel);
          border: 1px solid var(--border);
          border-left: 3px solid var(--accent);
          border-radius: 8px;
          padding: 0.75rem 1rem;
          font-size: 0.9rem;
          color: var(--ink);
        }

        .workflow-page .behaviors li strong { display: block; font-size: 0.85rem; margin-bottom: 0.15rem; }

        .workflow-page .code-inline {
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 0.88em;
          background: var(--accent-soft);
          padding: 0.1em 0.4em;
          border-radius: 4px;
        }

        .workflow-page footer {
          font-size: 0.78rem;
          color: var(--ink-muted);
          border-top: 1px solid var(--border);
          padding-top: 1rem;
        }
      `}</style>

      <div className="content">
        <p className="eyebrow">Step Functions state machine</p>
        <h1>Ad compliance ingestion pipeline</h1>
        <p className="lede">
          Every upload or reprocess request runs through this workflow, defined in{' '}
          <code>statemachine/pipeline.asl.json</code>. One combined content-safety analysis,
          contracted-talent screening, and — once an ad is cleared — automatic per-platform
          compliance checks, all in a single run.
        </p>

        <div className="legend">
          <div className="legend-group">
            <span className="legend-item"><span className="dot" style={{ background: '#2f5d8a' }}></span>pipeline step</span>
            <span className="legend-item"><span className="dot" style={{ background: '#d98c00' }}></span>decision point</span>
            <span className="legend-item"><span className="dot" style={{ background: '#6a4fd6' }}></span>advisory (never blocks)</span>
            <span className="legend-item"><span className="dot" style={{ background: '#7a1f1f' }}></span>failure detection</span>
            <span className="legend-item"><span className="dot" style={{ background: '#1f9d55' }}></span>succeeded</span>
            <span className="legend-item"><span className="dot" style={{ background: '#d33c3c' }}></span>failed</span>
          </div>
          <div className="legend-group">
            <span className="legend-item"><span className="line-sample"></span>normal flow</span>
            <span className="legend-item"><span className="line-sample dashed"></span>on error</span>
            <span className="legend-item"><span className="line-sample dotted"></span>on error, still continues</span>
          </div>
        </div>

        <div className="diagram-panel">
          <div className="mermaid-target" ref={containerRef} />
        </div>

        <h2>Notable behaviors</h2>
        <ul className="behaviors">
          <li>
            <strong>Advisory steps can never fail the pipeline.</strong>
            <span className="code-inline">DetectTalent</span> and <span className="code-inline">RunPlatformCompliance</span> route
            back into the normal flow on error instead of to <span className="code-inline">HandlePipelineError</span> — a beta-API
            hiccup on either can only ever fail to detect something, never block the ad.
          </li>
          <li>
            <strong>Reprocessing skips re-indexing when it can.</strong>
            If a prior run already indexed the video successfully, <span className="code-inline">AlreadyIndexedChoice</span> jumps
            straight to analysis instead of re-submitting to TwelveLabs and burning indexing minutes on unchanged content.
          </li>
          <li>
            <strong>Platform compliance is gated on the content verdict.</strong>
            The four platform-specific checks only run once <span className="code-inline">PersistFinal</span> writes{' '}
            <span className="code-inline">APPROVED</span> — never for an ad already headed to{' '}
            <span className="code-inline">NEEDS_REVIEW</span> or <span className="code-inline">REJECTED</span>.
          </li>
          <li>
            <strong>Talent detection happens before the status is computed.</strong>
            <span className="code-inline">DetectTalent</span> runs ahead of <span className="code-inline">ApplySuggestionLogic</span> so
            a flagged, lapsed-contract detection can floor the ad's status at <span className="code-inline">NEEDS_REVIEW</span>, not
            just sit alongside it.
          </li>
          <li>
            <strong>Transient failures get one retry before escalating.</strong>
            Every TwelveLabs/DB-calling step retries twice with exponential backoff; only a repeated failure reaches{' '}
            <span className="code-inline">HandlePipelineError</span>, which marks the ad <span className="code-inline">ERROR</span> for
            manual reprocessing.
          </li>
        </ul>

        <footer>Beauty Content Guardian — generated from statemachine/pipeline.asl.json</footer>
      </div>
    </div>
  );
}
