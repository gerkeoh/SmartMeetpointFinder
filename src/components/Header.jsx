import { Link, useNavigate } from "react-router-dom";

const Header = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  return (
    <header className="header">
      <h1 className="logo">Smart Meet Point Finder</h1>

      <nav className="nav-links">
        <Link to="/">Home</Link>
        <Link to="/friends">Friends</Link>
        <Link to="/profile">Profile</Link>

        {!token ? (
          <Link to="/login">Login / Register</Link>
        ) : (
          <button id="logout-link" type="button" onClick={logout}>
            Logout
          </button>
        )}
      </nav>
    </header>
  );
};

export default Header;
