import type { Chefe } from "../lib/types";
import { initials } from "../lib/format";
import { IconAluno, IconBot, IconGrid, IconLogout, IconSearch } from "./icons";
import { LogoMark } from "./Logo";

export type PageId =
  "dashboard" | "diretorio-alunos" | "diretorio-monitores" | "gestao" | "planilha" | "bot";

const NAV: { group: string; items: { id: PageId; label: string; icon: React.ReactNode }[] }[] = [
  {
    group: "",
    items: [{ id: "dashboard", label: "Dashboard", icon: <IconAluno /> }],
  },
  {
    group: "Diretório",
    items: [{ id: "diretorio-alunos", label: "Alunos", icon: <IconSearch /> }],
  },
  {
    group: "Gestão",
    items: [
      { id: "diretorio-monitores", label: "Monitores", icon: <IconSearch /> },
      { id: "gestao", label: "Grupos & duplas", icon: <IconGrid /> },
      { id: "planilha", label: "Planilha", icon: <IconGrid /> },
    ],
  },
  {
    group: "Bot",
    items: [{ id: "bot", label: "Bot do WhatsApp", icon: <IconBot /> }],
  },
];

export function Sidebar({
  page,
  onNavigate,
  chefe,
  onLogout,
}: {
  page: PageId;
  onNavigate: (page: PageId) => void;
  chefe: Chefe | null;
  onLogout: () => void;
}) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="mark">
          <LogoMark size={16} />
        </div>
        <div className="brand-txt">
          <strong>Feedbot</strong>
          <span>Introdução à programação</span>
        </div>
      </div>
      {NAV.map((section, index) => (
        <div key={section.group || index}>
          {section.group && <div className="nav-group-label">{section.group}</div>}
          {section.items.map((item) => (
            <button
              key={item.id}
              className={`nav-item${page === item.id ? " active" : ""}`}
              onClick={() => onNavigate(item.id)}
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
        </div>
        <button className="exit" onClick={onLogout} title="Sair">
          <IconLogout />
        </button>
      </div>
    </aside>
  );
}
