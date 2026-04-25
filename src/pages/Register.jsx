import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { apiUrl } from "../api";
import "../styles/Login.css";

import user_icon from "../assets/person.png";
import email_icon from "../assets/email.png";
import password_icon from "../assets/password.png";

const Register = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [msg, setMsg] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setMsg("");

    try {
      const res = await fetch(apiUrl("/api/auth/register"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, username, password, confirmPassword }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMsg(data?.message || "Registration failed.");
        return;
      }

      navigate("/login");
    } catch (err) {
      setMsg("Network error.");
    }
  };

  return (
    <div className="whole-container">
      <div className="text-container">
        <span>Join Smart MeetPoint Finder</span>
      </div>

      <div className="login-container">
        <div className="header">
          <div className="text">Register</div>
          <div className="underline"></div>
        </div>

        <form onSubmit={onSubmit} className="inputs">
          <div className="input">
            <img src={user_icon} alt="User Icon" />
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="input">
            <img src={email_icon} alt="Email Icon" />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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

          <div className="input">
            <img src={password_icon} alt="Confirm Password Icon" />
            <input
              type="password"
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>

          {msg && (
            <p>
              {msg}
            </p>
          )}

          <div className="submit-container">
            <button type="submit" className="submit">
              Create Account
            </button>
          </div>
        </form>

        <div className="submit-container">
          <span>Already have an account?</span>
            <div
              className="submit"
              onClick={() => {
                navigate("/login");
              }}
            >
              Login
            </div>
        </div>
      </div>
    </div>
  );
};

export default Register;
