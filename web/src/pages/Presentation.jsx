// Embeds the Gamma pitch deck. The provided embed snippet had a duplicate
// `allow` and duplicate `allowfullscreen` attribute (harmless in raw HTML,
// but JSX rejects duplicate props outright) - merged into one of each below;
// everything else is unchanged from the provided embed code.
export default function Presentation() {
  return (
    <div className="presentation-page">
      <style>{`
        .presentation-page {
          min-height: 100%;
          padding: 3rem 1.5rem 4rem;
          background: #100d0a;
          color: #f2ead9;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .presentation-page .wrap {
          max-width: 760px;
          margin: 0 auto;
          text-align: center;
        }
        .presentation-page h1 {
          font-size: 1.5rem;
          font-weight: 700;
          margin: 0 0 0.5rem;
        }
        .presentation-page p {
          color: #b3a692;
          margin: 0 0 2rem;
        }
      `}</style>

      <div className="wrap">
        <h1>Presentation</h1>
        <p>The full pitch deck.</p>

        <div
          id="1764319568167"
          style={{
            width: '100%',
            maxWidth: '700px',
            height: '525px',
            margin: 'auto',
            display: 'block',
            position: 'relative',
            border: '2px solid #dee1e5',
            borderRadius: '3px',
          }}
        >
          <iframe
            title="Beauty Content Guardian pitch deck"
            allow="clipboard-write; autoplay"
            allowFullScreen="true"
            style={{ width: '100%', height: '100%', border: 'none' }}
            src="https://gamma.com.ai/aippt/?shareId=1784036941512334994"
            scrolling="no"
          />
        </div>
      </div>
    </div>
  );
}
