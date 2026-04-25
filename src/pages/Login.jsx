import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { apiUrl } from "../api";
import "../styles/Login.css";

import user_icon from "../assets/person.png";
import email_icon from "../assets/email.png";
import password_icon from "../assets/password.png";

const Login = () => {
  const navigate = useNavigate();
  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setMsg("");

    try {
      const res = await fetch(apiUrl("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailOrUsername, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMsg(data?.message || "Login failed.");
        return;
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      navigate("/");
    } catch (err) {
      setMsg("Network error.");
    }
  };

  return (
    <div className="whole-container">
      <div className="text-container">
        <span>Plan your meetup in seconds</span>
      </div>

      <div className="login-container">
        <div className="header">
          <div className="text">Login</div>
          <div className="underline"></div>
        </div>

        <form onSubmit={onSubmit} className="inputs">
          <div className="input">
            <img src={user_icon} alt="User Icon" />
            <input
              type="text"
              placeholder="Email or Username"
              value={emailOrUsername}
              onChange={(e) => setEmailOrUsername(e.target.value)}
            />
          </div>

          <div className="input">
            <img src={password_icon} alt="Password Icon" />
              <input
                type="password"
                placeholder="Password (min 8 chars)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              </div>

          {msg && (
            <p>
              {msg}
            </p>
          )}

          <div className="submit-container">
            <button type="submit" className="submit">
              Login
            </button>
          </div>
        </form>

        <div className="submit-container">
          <span>Don't have an account?</span>
            <div
              className="submit"
              onClick={() => {
                navigate("/register");
              }}
            >
              Register
            </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
