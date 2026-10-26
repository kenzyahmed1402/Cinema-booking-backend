import { useState, type FormEvent } from "react";
import { errorMessage } from "../api";
import { useAuth } from "../auth";
import { go } from "../route";

// Log in, or create a customer account
export const AuthPage = ({ mode }: { mode: "login" | "register" }) => {
  const { login, register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isLogin = mode === "login";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (isLogin) await login(email, password);
      else await register(name, email, password);
      go("chat");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth">
      <form className="card auth-form" onSubmit={submit}>
        <h1>{isLogin ? "Log in" : "Create an account"}</h1>
        {!isLogin && (
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} autoComplete="name" />
          </label>
        )}
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete={isLogin ? "current-password" : "new-password"}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="primary" disabled={busy}>
          {busy ? "Please wait…" : isLogin ? "Log in" : "Create account"}
        </button>
        <p className="muted">
          {isLogin ? (
            <>
              New here? <a href="#/register">Create an account</a>
            </>
          ) : (
            <>
              Already have an account? <a href="#/login">Log in</a>
            </>
          )}
        </p>
      </form>
    </main>
  );
};
