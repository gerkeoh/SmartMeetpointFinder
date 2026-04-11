import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";

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
    <div className="page">
      <section className="section_1">
        <h1>Login</h1>
      </section>

      <section className="section_2">
        <form onSubmit={onSubmit}>
          <input
            type="text"
            placeholder="Email or Username"
            value={emailOrUsername}
            onChange={(e) => setEmailOrUsername(e.target.value)}
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button type="submit">Login</button>
          {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
        </form>

        <p>
          Don&apos;t have an account? <Link to="/register">Register</Link>
        </p>
      </section>
    </div>
  );
};

export default Login;
