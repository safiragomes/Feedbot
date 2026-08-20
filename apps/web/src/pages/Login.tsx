import { useState } from "react";
import { api, ApiError } from "../lib/api";
import type { Chefe } from "../lib/types";

export function Login({ onLogin }: { onLogin: (token: string, chefe: Chefe) => void }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      const { token, chefe } = await api.login(email, senha);
      onLogin(token, chefe);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível entrar");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="login">
      <div className="login-card">
        <div className="mark">F</div>
        <h1>Feedbot</h1>
        <div className="subtitle">Monitoria de Introdução à Programação</div>
        <form onSubmit={submit}>
          <label>
            E-mail institucional
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              autoComplete="username"
              required
            />
          </label>
          <label>
            Senha
            <input
              value={senha}
              onChange={(event) => setSenha(event.target.value)}
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          {erro && <div className="error-banner">{erro}</div>}
          <button className="btn primary" disabled={enviando}>
            {enviando ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}
