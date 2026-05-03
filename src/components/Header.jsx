import { Link } from 'react-router-dom';
import logo from "../assets/SMARTMEETPOINTFINDER_LOGO_NOBACK.png";

const navIcons = {
  home: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10.5V20h13v-9.5" />
      <path d="M9.5 20v-6h5v6" />
    </svg>
  ),
  register: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
      <path d="M17 4h3v3" />
      <path d="M20 4 14 10" />
    </svg>
  ),
  map: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 18 3 20V6l6-2 6 2 6-2v14l-6 2-6-2Z" />
      <path d="M9 4v14" />
      <path d="M15 6v14" />
    </svg>
  ),
  friends: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M15.5 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
      <path d="M3.5 19a5 5 0 0 1 10 0" />
      <path d="M13.5 18.5a4 4 0 0 1 7 0" />
    </svg>
  ),
  profile: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
      <path d="M4 20a8 8 0 0 1 16 0" />
    </svg>
  ),
  logout: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 5H5v14h5" />
      <path d="M14 8l4 4-4 4" />
      <path d="M8 12h10" />
    </svg>
  ),
};

function NavIcon({ name }) {
  return <span className="nav-icon">{navIcons[name]}</span>;
}

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
            <Link to="/" className="nav-link"><NavIcon name="home" />HOME</Link>
            <Link to="/register" className="nav-link"><NavIcon name="register" />REGISTER</Link>
          </>
        )}

        {isLoggedIn && (
          <>
            <Link to="/" className="nav-link"><NavIcon name="home" />HOME</Link>
            <Link to="/map" className="nav-link"><NavIcon name="map" />MEETUP</Link>
            <Link to="/friends" className="nav-link"><NavIcon name="friends" />FRIENDS</Link>
            <Link to="/profile" className="nav-link"><NavIcon name="profile" />PROFILE</Link>
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
              <NavIcon name="logout" />
              LOGOUT
            </span>
          </>
        )}
      </nav>
    </header>
  );
}

export default Header;
