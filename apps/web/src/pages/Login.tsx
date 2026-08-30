import { useState } from "react";
import { api } from "../lib/api";
import type { Chefe } from "../lib/types";
import { LogoMark } from "../components/Logo";

function consumirTokenConviteDaUrl() {
  const hash = new URLSearchParams(window.location.hash.slice(1)).get("convite");
  const query = new URLSearchParams(window.location.search).get("convite");
  const token = hash ?? query ?? "";
  if (token) window.history.replaceState({}, "", window.location.pathname);
  return token;
}

export function Login({ onLogin }: { onLogin: (chefe: Chefe) => void }) {
  const [tokenConvite, setTokenConvite] = useState(consumirTokenConviteDaUrl);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmacaoSenha, setConfirmacaoSenha] = useState("");
  const [conviteConcluido, setConviteConcluido] = useState(false);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      const { chefe } = await api.login(email, senha);
      onLogin(chefe);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível entrar");
    } finally {
      setEnviando(false);
    }
  }

  async function concluirConvite(event: React.FormEvent) {
    event.preventDefault();
    setErro("");
    if (senha.length < 12) return setErro("A senha deve ter pelo menos 12 caracteres");
    if (senha !== confirmacaoSenha) return setErro("As senhas não coincidem");
    setEnviando(true);
    try {
      await api.concluirConvite(tokenConvite, senha);
      window.history.replaceState({}, "", window.location.pathname);
      setSenha("");
      setConfirmacaoSenha("");
      setTokenConvite("");
      setConviteConcluido(true);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível concluir o convite");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="login">
      <div className="login-card">
        <div className="mark">
          <LogoMark size={22} />
        </div>
        <h1>{tokenConvite ? "Criar acesso" : "Feedbot"}</h1>
        <div className="subtitle">
          {tokenConvite
            ? "Defina sua senha para concluir o convite"
            : "Monitoria de Introdução à Programação"}
        </div>
        {conviteConcluido && (
          <div className="success-banner">
            Conta criada. Entre com o e-mail que recebeu o convite.
          </div>
        )}
        {tokenConvite ? (
          <form onSubmit={concluirConvite}>
            <label>
              Nova senha
              <input
                value={senha}
                onChange={(event) => setSenha(event.target.value)}
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
              />
            </label>
            <label>
              Confirmar senha
              <input
                value={confirmacaoSenha}
                onChange={(event) => setConfirmacaoSenha(event.target.value)}
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
              />
            </label>
            {erro && <div className="error-banner">{erro}</div>}
            <button className="btn primary" disabled={enviando}>
              {enviando ? "Criando acesso…" : "Criar minha conta"}
            </button>
          </form>
        ) : (
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
        )}
      </div>
    </main>
  );
}
