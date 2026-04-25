import { Link } from 'react-router-dom';
import logo from "../assets/SMARTMEETPOINTFINDER_LOGO_NOBACK.png";

function Header({ isLoggedIn, onLogout }) {
  return (
    <header className="header">
      <div className="header-logo">
                <div className="logo-container">
                    <Link to="/">
                        <img src={logo} alt="Logo" className="logo" />
                    </Link>
                </div>
                <h1 className="site-title">SMART MEETPOINT FINDER</h1>
            </div>

      <nav className="header-nav">
        {!isLoggedIn && (
          <>
            <Link to="/" className="nav-link">HOME</Link>
            <Link to="/register" className="nav-link">REGISTER</Link>
          </>
        )}

        {isLoggedIn && (
          <>
            <Link to="/map" className="nav-link">MAP</Link>
            <Link to="/friends" className="nav-link">FRIENDS</Link>
            <Link to="/profile" className="nav-link">PROFILE</Link>
            <span
              id="logout-link"
              className="nav-link"
              onClick={onLogout}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  onLogout();
                }
              }}
            >
              LOGOUT
            </span>
          </>
        )}
      </nav>
    </header>
  );
}

export default Header;