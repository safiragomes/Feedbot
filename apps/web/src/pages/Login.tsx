import { useState } from "react";
import { api } from "../lib/api";
import type { Chefe } from "../lib/types";
import { LogoMark } from "../components/Logo";
import { IconMoon, IconSun } from "../components/icons";

function consumirTokensDaUrl() {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const query = new URLSearchParams(window.location.search);
  const convite = hash.get("convite") ?? query.get("convite") ?? "";
  const recuperacao = hash.get("recuperacao") ?? query.get("recuperacao") ?? "";
  if (convite || recuperacao) window.history.replaceState({}, "", window.location.pathname);
  return { convite, recuperacao };
}

export function Login({
  onLogin,
  theme,
  onToggleTheme,
}: {
  onLogin: (chefe: Chefe) => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
}) {
  const [tokens] = useState(consumirTokensDaUrl);
  const [tokenConvite, setTokenConvite] = useState(tokens.convite);
  const [tokenRecuperacao, setTokenRecuperacao] = useState(tokens.recuperacao);
  const [esqueciSenha, setEsqueciSenha] = useState(false);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmacaoSenha, setConfirmacaoSenha] = useState("");
  const [conviteConcluido, setConviteConcluido] = useState(false);
  const [recuperacaoEnviada, setRecuperacaoEnviada] = useState(false);
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
    if (senha.length < 8) return setErro("A senha deve ter pelo menos 8 caracteres");
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

  async function solicitarRecuperacao(event: React.FormEvent) {
    event.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      await api.solicitarRecuperacaoSenha(email);
      setRecuperacaoEnviada(true);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível solicitar a recuperação");
    } finally {
      setEnviando(false);
    }
  }

  async function concluirRecuperacao(event: React.FormEvent) {
    event.preventDefault();
    setErro("");
    if (senha.length < 8) return setErro("A senha deve ter pelo menos 8 caracteres");
    if (senha !== confirmacaoSenha) return setErro("As senhas não coincidem");
    setEnviando(true);
    try {
      await api.redefinirSenha(tokenRecuperacao, senha);
      setSenha("");
      setConfirmacaoSenha("");
      setTokenRecuperacao("");
      setConviteConcluido(true);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível redefinir a senha");
    } finally {
      setEnviando(false);
    }
  }

  const definindoSenha = Boolean(tokenConvite || tokenRecuperacao);

  return (
    <main className="login">
      <button
        type="button"
        className="theme-toggle login-theme-toggle"
        onClick={onToggleTheme}
        aria-label={theme === "dark" ? "Ativar modo diurno" : "Ativar modo noturno"}
      >
        {theme === "dark" ? <IconSun /> : <IconMoon />}
        {theme === "dark" ? "Modo diurno" : "Modo noturno"}
      </button>
      <div className="login-card">
        <div className="mark">
          <LogoMark size={72} />
        </div>
        <span className="login-kicker">Feedbot</span>
        <h2>
          {tokenConvite
            ? "Criar acesso"
            : tokenRecuperacao
              ? "Redefinir senha"
              : esqueciSenha
                ? "Recuperar acesso"
                : "Entrar no painel"}
        </h2>
        <div className="subtitle">
          {tokenConvite
            ? "Defina sua senha para concluir o convite"
            : tokenRecuperacao
              ? "Escolha uma nova senha para sua conta"
              : esqueciSenha
                ? "Enviaremos um link seguro para o e-mail cadastrado"
                : "Use seu e-mail institucional para acessar a operação."}
        </div>
        {conviteConcluido && (
          <div className="success-banner">Senha definida. Entre com seu e-mail e a nova senha.</div>
        )}
        {definindoSenha ? (
          <form onSubmit={tokenConvite ? concluirConvite : concluirRecuperacao}>
            <label>
              Nova senha
              <input
                value={senha}
                onChange={(event) => setSenha(event.target.value)}
                type="password"
                autoComplete="new-password"
                minLength={8}
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
                minLength={8}
                required
              />
            </label>
            {erro && <div className="error-banner">{erro}</div>}
            <button className="btn primary" disabled={enviando}>
              {enviando ? "Salvando…" : tokenConvite ? "Criar minha conta" : "Redefinir senha"}
            </button>
          </form>
        ) : esqueciSenha ? (
          recuperacaoEnviada ? (
            <div className="login-feedback">
              <div className="success-banner">
                Se o e-mail pertencer a uma conta ativa, enviaremos um link válido por 1 hora.
                Verifique também a caixa de spam. Contas de teste com endereços locais não recebem
                mensagens.
              </div>
              <button
                className="btn ghost"
                onClick={() => {
                  setEsqueciSenha(false);
                  setRecuperacaoEnviada(false);
                }}
              >
                Voltar ao login
              </button>
            </div>
          ) : (
            <form onSubmit={solicitarRecuperacao}>
              <label>
                E-mail cadastrado
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  autoComplete="email"
                  required
                />
              </label>
              {erro && <div className="error-banner">{erro}</div>}
              <button className="btn primary" disabled={enviando}>
                {enviando ? "Enviando…" : "Enviar link de recuperação"}
              </button>
              <button type="button" className="login-link" onClick={() => setEsqueciSenha(false)}>
                Voltar ao login
              </button>
            </form>
          )
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
            <button
              type="button"
              className="login-link"
              onClick={() => {
                setErro("");
                setEsqueciSenha(true);
              }}
            >
              Esqueci minha senha
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
