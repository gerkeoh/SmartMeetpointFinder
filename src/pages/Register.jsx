import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";

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
    <div className="page">
      <section className="section_1">
        <h1>Register</h1>
      </section>

      <section className="section_2">
        <form onSubmit={onSubmit}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />

          <input
            type="password"
            placeholder="Password (min 8 chars)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <input
            type="password"
            placeholder="Confirm Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />

          <button type="submit">Create Account</button>
          {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
        </form>

        <p>
          Already have an account? <Link to="/login">Login</Link>
        </p>
      </section>
    </div>
  );
};

export default Register;
