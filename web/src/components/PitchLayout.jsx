import { Link } from 'react-router-dom';

// Shared shell for the showcase section (How it works / Workflow /
// Presentation) - deliberately public (outside RequireAuth, see App.jsx):
// these are static, no-API pages meant to be shown to an external audience
// (prospective clients, leadership) who won't have a reviewer login.
export default function PitchLayout({ children }) {
  return (
    <div className="pitch-shell">
      <nav className="pitch-nav">
        <span className="pitch-brand">Beauty Content Guardian</span>
        <Link to="/how-it-works">How it works</Link>
        <Link to="/workflow">Workflow</Link>
        <Link to="/presentation">Presentation</Link>
        <span className="spacer" />
        <Link to="/login">Open app &rarr;</Link>
      </nav>
      <main className="pitch-main">{children}</main>
    </div>
  );
}
