import { useState } from "react";
import type { Chefe } from "../lib/types";
import { api } from "../lib/api";
import { initials } from "../lib/format";
import { IconAluno, IconBot, IconGrid, IconLogout, IconSearch } from "./icons";
import { LogoMark } from "./Logo";
import { Modal } from "./ui";

export type PageId =
  "dashboard" | "diretorio-alunos" | "diretorio-monitores" | "gestao" | "planilha" | "bot";

const NAV: { group: string; items: { id: PageId; label: string; icon: React.ReactNode }[] }[] = [
  {
    group: "",
    items: [{ id: "dashboard", label: "Dashboard", icon: <IconAluno /> }],
  },
  {
    group: "Diretório",
    items: [
      { id: "diretorio-alunos", label: "Alunos", icon: <IconSearch /> },
      { id: "diretorio-monitores", label: "Monitores", icon: <IconSearch /> },
    ],
  },
  {
    group: "Gestão",
    items: [
      { id: "gestao", label: "Grupos & duplas", icon: <IconGrid /> },
      { id: "planilha", label: "Planilha", icon: <IconGrid /> },
    ],
  },
  {
    group: "Bot",
    items: [{ id: "bot", label: "Bot do Discord", icon: <IconBot /> }],
  },
];

export function Sidebar({
  page,
  onNavigate,
  chefe,
  token,
  onLogout,
  mobileOpen = false,
  onCloseMobile,
}: {
  page: PageId;
  onNavigate: (page: PageId) => void;
  chefe: Chefe | null;
  token: string;
  onLogout: () => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}) {
  const [alterandoSenha, setAlterandoSenha] = useState(false);

  function navegar(id: PageId) {
    onNavigate(id);
    onCloseMobile?.();
  }

  return (
    <>
      {mobileOpen && <div className="sidebar-overlay-mobile" onClick={onCloseMobile} />}
      <aside className={`sidebar${mobileOpen ? " open" : ""}`}>
        <div className="brand">
          <div className="mark">
            <LogoMark size={42} jpg />
          </div>
          <div className="brand-txt">
            <strong>Feedbot</strong>
            <span>Introdução à programação</span>
          </div>
        </div>
        <div className="sidebar-overview">
          <span className="sidebar-kicker">Central da monitoria</span>
          <strong>Operação acadêmica em um só painel</strong>
          <p>Distribua alunos, acompanhe listas e mantenha o bot sob controle no mesmo fluxo.</p>
        </div>
        {NAV.map((section, index) => (
          <div key={section.group || index}>
            {section.group && <div className="nav-group-label">{section.group}</div>}
            {section.items.map((item) => (
              <button
                key={item.id}
                className={`nav-item${page === item.id ? " active" : ""}`}
                onClick={() => navegar(item.id)}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        ))}
        <div className="sidebar-foot">
          <div className="av">{chefe ? initials(chefe.nome) : "?"}</div>
          <div className="who">
            <strong>{chefe?.nome ?? "—"}</strong>
            <span>chefe de monitoria</span>
            <button className="sidebar-password" onClick={() => setAlterandoSenha(true)}>
              Alterar senha
            </button>
          </div>
          <button className="exit" onClick={onLogout} title="Sair">
            <IconLogout />
          </button>
        </div>
        {alterandoSenha && (
          <AlterarSenhaModal token={token} onClose={() => setAlterandoSenha(false)} />
        )}
      </aside>
    </>
  );
}

function AlterarSenhaModal({ token, onClose }: { token: string; onClose: () => void }) {
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState(false);
  const [salvando, setSalvando] = useState(false);

  async function salvar(event: React.FormEvent) {
    event.preventDefault();
    setErro("");
    if (novaSenha.length < 8) return setErro("A nova senha deve ter pelo menos 8 caracteres");
    if (novaSenha !== confirmacao) return setErro("As senhas não coincidem");
    setSalvando(true);
    try {
      await api.alterarSenha(token, senhaAtual, novaSenha);
      setSucesso(true);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível alterar a senha");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <h4>Alterar senha</h4>
      {sucesso ? (
        <>
          <div className="success-banner">Senha alterada com segurança.</div>
          <div className="modal-actions">
            <button className="btn primary" onClick={onClose}>
              Concluir
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={salvar}>
          <div className="field">
            <label>Senha atual</label>
            <input
              type="password"
              autoComplete="current-password"
              value={senhaAtual}
              onChange={(e) => setSenhaAtual(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>Nova senha</label>
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>Confirmar nova senha</label>
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
              required
            />
          </div>
          {erro && <div className="error-banner">{erro}</div>}
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn primary" disabled={salvando}>
              {salvando ? "Alterando…" : "Alterar senha"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
