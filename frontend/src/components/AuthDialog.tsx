import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, X } from "lucide-react";
import { errorMessage } from "../api";
import { useAuth } from "../auth";

type Tab = "login" | "register";

// Log in, create an account or continue as a guest, shown only when an
// action needs an account
export const AuthDialog = ({ reason, onClose }: { reason: string; onClose: () => void }) => {
  const { login, register, continueAsGuest } = useAuth();
  const dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<Tab>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  const run = async (action: () => Promise<void>) => {
    setError("");
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    run(() => (tab === "login" ? login(email, password) : register(name, email, password)));
  };

  return (
    <dialog ref={dialog} className="auth-dialog" onCancel={onClose} aria-labelledby="auth-title">
      <button type="button" className="icon-button close" onClick={onClose} aria-label="Close">
        <X size={18} aria-hidden="true" />
      </button>
      <h2 id="auth-title">{reason}</h2>
      <p className="muted">Booking, paying and cancelling need an account.</p>

      <button type="button" className="button primary wide" disabled={busy} onClick={() => run(continueAsGuest)}>
        Continue as guest <ArrowRight size={16} aria-hidden="true" />
      </button>
      <p className="hint">No email needed · save it as an account later</p>

      <div className="divider">
        <span>or</span>
      </div>

      <div className="tabs" role="tablist">
        {(["login", "register"] as Tab[]).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={tab === value ? "tab active" : "tab"}
            onClick={() => setTab(value)}
          >
            {value === "login" ? "Log in" : "Create account"}
          </button>
        ))}
      </div>

      <form className="stack" onSubmit={submit}>
        {tab === "register" && (
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
            autoComplete={tab === "login" ? "current-password" : "new-password"}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="button secondary wide" disabled={busy}>
          {busy ? "Please wait…" : tab === "login" ? "Log in" : "Create account"}
        </button>
      </form>
    </dialog>
  );
};
