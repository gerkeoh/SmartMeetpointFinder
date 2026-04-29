import React, { useState } from "react";
import { Link } from "react-router-dom";
import logo from "../assets/SMARTMEETPOINTFINDER_LOGO_NOBACK.png";

function Header({ isLoggedIn, onLogout }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="header">
      <div className="header-logo">
        <Link to="/" onClick={closeMenu}>
          <img src={logo} alt="Logo" className="logo" />
        </Link>

        <h1 className="site-title">SMART MEETPOINT FINDER</h1>

        <button
          className="hamburger"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle navigation menu"
        >
          ☰
        </button>
      </div>

      <nav className={`header-nav ${menuOpen ? "open" : ""}`}>
        <Link className="nav-link" to="/" onClick={closeMenu}>Home</Link>
        {isLoggedIn ? (
          <>
            <Link className="nav-link" to="/friends" onClick={closeMenu}>Friends</Link>
            <Link className="nav-link" to="/map" onClick={closeMenu}>Map</Link>
            <Link className="nav-link" to="/profile" onClick={closeMenu}>Profile</Link>
            <button className="nav-link" onClick={onLogout}>Logout</button>
          </>
        ) : (
          <>
            <Link className="nav-link" to="/login" onClick={closeMenu}>Login</Link>
            <Link className="nav-link" to="/register" onClick={closeMenu}>Register</Link>
          </>
        )}
      </nav>
    </header>
  );
}

export default Header;