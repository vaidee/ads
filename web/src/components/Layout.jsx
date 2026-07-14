import { Link, useNavigate } from 'react-router-dom';
import { logout } from '../auth';

export default function Layout({ children }) {
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="app-shell">
      <nav className="app-nav">
        <span className="brand">Beauty Content Guardian (BCG)</span>
        <Link to="/">Dashboard</Link>
        <Link to="/upload">Upload</Link>
        <Link to="/eval">Weekly eval</Link>
        <Link to="/how-it-works">How it works</Link>
        <Link to="/workflow">Workflow</Link>
        <Link to="/presentation">Presentation</Link>
        <span className="spacer" />
        <button onClick={handleLogout}>Log out</button>
      </nav>
      <main className="app-main">{children}</main>
    </div>
  );
}
