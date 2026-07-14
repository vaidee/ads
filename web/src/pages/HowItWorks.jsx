// Pitch-deck-ready "how it works" slide - tells the ad's journey in story
// terms (submitted -> reviewed -> verdict -> per-platform outcome) rather
// than exposing the underlying state machine. See Workflow.jsx for the
// engineering version of the same pipeline.
//
// Deliberate single-theme commitment: a certificate/stamp world (warm
// near-black ground, brass-gold seal accent) reads as itself regardless of
// viewer theme preference - like a printed certificate doesn't re-theme for
// dark mode. Verdict colors (approved/review/rejected) are the one place
// color carries real meaning, kept separate from the brass "brand" accent
// so the two never compete. All selectors are scoped under
// .how-it-works-page since this <style> tag isn't scoped by React - it
// would otherwise leak into the rest of the app.
export default function HowItWorks() {
  return (
    <div className="how-it-works-page">
      <style>{`
        @font-face {
          font-family: "bcg-pitch-serif";
          src: local("Iowan Old Style"), local("Palatino Linotype"), local("Georgia");
        }

        .how-it-works-page {
          --bg: #16130f;
          --bg-deep: #100d0a;
          --panel: #1f1a14;
          --panel-raised: #251f18;
          --ink: #f2ead9;
          --ink-muted: #b3a692;
          --border: #3a3226;
          --gold: #cda454;
          --gold-bright: #e8c579;

          --approved: #3fc178;
          --approved-soft: rgba(63, 193, 120, 0.13);
          --review: #eeab3d;
          --review-soft: rgba(238, 171, 61, 0.13);
          --rejected: #ef5b56;
          --rejected-soft: rgba(239, 91, 86, 0.13);

          padding: 3.2rem 1.5rem 4rem;
          background: radial-gradient(1100px 520px at 50% -8%, #221c14 0%, var(--bg) 55%, var(--bg-deep) 100%);
          color: var(--ink);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          line-height: 1.5;
        }

        .how-it-works-page main { max-width: 1180px; margin: 0 auto; }
        .how-it-works-page header { text-align: center; margin-bottom: 3rem; }

        .how-it-works-page .eyebrow {
          font-size: 0.72rem;
          font-weight: 600;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: var(--gold);
          margin: 0 0 1rem;
        }

        .how-it-works-page h1 {
          font-family: "bcg-pitch-serif", ui-serif, Georgia, serif;
          font-weight: 500;
          font-size: clamp(1.9rem, 3.4vw, 2.85rem);
          letter-spacing: -0.01em;
          margin: 0 0 0.9rem;
          text-wrap: balance;
        }

        .how-it-works-page h1 em {
          font-style: normal;
          color: var(--gold-bright);
        }

        .how-it-works-page .sub {
          color: var(--ink-muted);
          font-size: 1.05rem;
          max-width: 56ch;
          margin: 0 auto;
        }

        .how-it-works-page .rail {
          display: flex;
          align-items: stretch;
          gap: 0;
          margin-bottom: 2.6rem;
        }

        .how-it-works-page .stage {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.9rem;
          opacity: 0;
          animation: howItWorksRise 0.6s ease-out forwards;
        }
        .how-it-works-page .stage:nth-child(1) { animation-delay: 0.05s; }
        .how-it-works-page .stage:nth-child(3) { animation-delay: 0.25s; }
        .how-it-works-page .stage:nth-child(5) { animation-delay: 0.45s; }

        .how-it-works-page .connector {
          flex: 0 0 auto;
          width: 2.75rem;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--gold);
          opacity: 0;
          animation: howItWorksFade 0.6s ease-out forwards;
          animation-delay: 0.35s;
        }
        .how-it-works-page .connector svg { width: 100%; height: 1.4rem; }

        @keyframes howItWorksRise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes howItWorksFade { from { opacity: 0; } to { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          .how-it-works-page .stage, .how-it-works-page .connector { animation: none; opacity: 1; }
        }

        .how-it-works-page .stage-num {
          font-family: "bcg-pitch-serif", ui-serif, Georgia, serif;
          font-size: 0.95rem;
          color: var(--gold);
          letter-spacing: 0.02em;
        }

        .how-it-works-page .stage-title {
          font-size: 1.02rem;
          font-weight: 700;
          letter-spacing: -0.005em;
        }

        .how-it-works-page .stage-card {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 1.1rem 1.15rem;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
          transition: transform 0.25s ease, border-color 0.25s ease;
        }
        .how-it-works-page .stage-card:hover { transform: translateY(-3px); border-color: var(--gold); }

        .how-it-works-page .lens {
          display: flex;
          gap: 0.55rem;
          align-items: flex-start;
          font-size: 0.83rem;
          color: var(--ink-muted);
        }
        .how-it-works-page .lens strong {
          color: var(--ink);
          font-weight: 650;
          display: block;
          font-size: 0.86rem;
        }
        .how-it-works-page .lens .mark { color: var(--gold); flex: none; }

        .how-it-works-page .verdicts {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.85rem;
        }

        .how-it-works-page .verdict {
          border-radius: 10px;
          padding: 0.85rem 0.95rem;
          border: 1px solid var(--border);
        }
        .how-it-works-page .verdict.approved { background: var(--approved-soft); border-color: color-mix(in srgb, var(--approved) 45%, var(--border)); }
        .how-it-works-page .verdict.review   { background: var(--review-soft);   border-color: color-mix(in srgb, var(--review) 45%, var(--border)); }
        .how-it-works-page .verdict.rejected { background: var(--rejected-soft); border-color: color-mix(in srgb, var(--rejected) 45%, var(--border)); }

        .how-it-works-page .verdict-label {
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          margin-bottom: 0.3rem;
        }
        .how-it-works-page .verdict.approved .verdict-label { color: var(--approved); }
        .how-it-works-page .verdict.review .verdict-label   { color: var(--review); }
        .how-it-works-page .verdict.rejected .verdict-label { color: var(--rejected); }

        .how-it-works-page .verdict-example {
          font-size: 0.82rem;
          color: var(--ink);
          opacity: 0.92;
        }

        .how-it-works-page .platform-note {
          font-size: 0.78rem;
          color: var(--ink-muted);
          margin-bottom: 0.55rem;
        }

        .how-it-works-page .platforms {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0.55rem;
        }

        .how-it-works-page .platform {
          background: var(--panel-raised);
          border: 1px solid var(--border);
          border-radius: 9px;
          padding: 0.55rem 0.6rem;
          text-align: center;
        }
        .how-it-works-page .platform .name { font-size: 0.78rem; font-weight: 700; margin-bottom: 0.3rem; }
        .how-it-works-page .platform .verdict-pill {
          display: inline-block;
          font-size: 0.68rem;
          font-weight: 650;
          letter-spacing: 0.02em;
          padding: 0.15rem 0.5rem;
          border-radius: 999px;
        }
        .how-it-works-page .platform.ok .verdict-pill { background: var(--approved-soft); color: var(--approved); }
        .how-it-works-page .platform.review .verdict-pill { background: var(--review-soft); color: var(--review); }

        .how-it-works-page .closer {
          margin-top: 2.8rem;
          text-align: center;
          padding-top: 2.2rem;
          border-top: 1px solid var(--border);
        }

        .how-it-works-page .closer .stat-row {
          display: flex;
          justify-content: center;
          gap: clamp(1.6rem, 4vw, 3.2rem);
          margin-bottom: 1.4rem;
          flex-wrap: wrap;
        }

        .how-it-works-page .stat { text-align: center; }
        .how-it-works-page .stat .num {
          font-family: "bcg-pitch-serif", ui-serif, Georgia, serif;
          font-variant-numeric: tabular-nums;
          font-size: clamp(1.7rem, 3vw, 2.3rem);
          color: var(--gold-bright);
          line-height: 1;
        }
        .how-it-works-page .stat .cap {
          font-size: 0.72rem;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--ink-muted);
          margin-top: 0.4rem;
        }

        .how-it-works-page .closer p {
          font-family: "bcg-pitch-serif", ui-serif, Georgia, serif;
          font-size: clamp(1.15rem, 2vw, 1.4rem);
          color: var(--ink);
          max-width: 46ch;
          margin: 0 auto;
          text-wrap: balance;
        }

        @media (max-width: 900px) {
          .how-it-works-page .rail { flex-direction: column; }
          .how-it-works-page .connector { width: auto; height: 1.6rem; transform: rotate(90deg); }
          .how-it-works-page .verdicts { grid-template-columns: 1fr; }
          .how-it-works-page .platforms { grid-template-columns: 1fr 1fr; }
        }
      `}</style>

      <main>
        <header>
          <p className="eyebrow">How it works</p>
          <h1>One review catches what <em>four platforms</em> and <em>every contract</em> require — automatically.</h1>
          <p className="sub">
            Today, one ad means one slow manual pass, then separate checks per
            platform if anyone remembers to run them. Here, it's one upload
            and one pipeline.
          </p>
        </header>

        <div className="rail">
          <div className="stage">
            <span className="stage-num">I.</span>
            <span className="stage-title">Ad submitted</span>
            <div className="stage-card">
              <div className="lens">
                <span className="mark">—</span>
                <div><strong>From anywhere</strong>A manual upload, or an automated drop from your DAM.</div>
              </div>
              <div className="lens">
                <span className="mark">—</span>
                <div><strong>Any format</strong>Landscape or vertical, any resolution.</div>
              </div>
            </div>
          </div>

          <div className="connector" aria-hidden="true">
            <svg viewBox="0 0 44 24"><path d="M0 12 H36 M28 5 L36 12 L28 19" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
          </div>

          <div className="stage">
            <span className="stage-num">II.</span>
            <span className="stage-title">Reviewed, two ways at once</span>
            <div className="stage-card">
              <div className="lens">
                <span className="mark">—</span>
                <div><strong>Content safety</strong>Nudity, hate speech, alcohol, violence, copyright.</div>
              </div>
              <div className="lens">
                <span className="mark">—</span>
                <div><strong>Talent &amp; contracts</strong>Is every face in this ad still cleared to appear?</div>
              </div>
            </div>
          </div>

          <div className="connector" aria-hidden="true">
            <svg viewBox="0 0 44 24"><path d="M0 12 H36 M28 5 L36 12 L28 19" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
          </div>

          <div className="stage" style={{ flex: 1.7 }}>
            <span className="stage-num">III.</span>
            <span className="stage-title">One verdict</span>
            <div className="verdicts">
              <div className="verdict approved">
                <div className="verdict-label">Approved</div>
                <div className="verdict-example">Skincare demo — nothing flagged.</div>
              </div>
              <div className="verdict review">
                <div className="verdict-label">Needs review</div>
                <div className="verdict-example">"Wipes wrinkles in 3 days" — unverified claim.</div>
              </div>
              <div className="verdict rejected">
                <div className="verdict-label">Rejected</div>
                <div className="verdict-example">Talent's contract lapsed 2 weeks ago.</div>
              </div>
            </div>
          </div>
        </div>

        <div className="platform-note">Approved ads are checked against every platform's own policy, automatically, before anyone hits publish:</div>
        <div className="platforms">
          <div className="platform ok"><div className="name">Meta</div><span className="verdict-pill">Published</span></div>
          <div className="platform review"><div className="name">TikTok</div><span className="verdict-pill">Needs review</span></div>
          <div className="platform ok"><div className="name">YouTube</div><span className="verdict-pill">Published</span></div>
          <div className="platform ok"><div className="name">Google Ads</div><span className="verdict-pill">Published</span></div>
        </div>

        <div className="closer">
          <div className="stat-row">
            <div className="stat"><div className="num">2</div><div className="cap">reviews, at once</div></div>
            <div className="stat"><div className="num">4</div><div className="cap">platforms checked</div></div>
            <div className="stat"><div className="num">1</div><div className="cap">pipeline run</div></div>
          </div>
          <p>What used to take days of manual, platform-by-platform review now happens before a human even opens the file.</p>
        </div>
      </main>
    </div>
  );
}
