import { useState } from "react";
import { api } from "../lib/api";
import type { Periodo } from "../lib/types";
import { IconMoon, IconPlus, IconSun, IconTrash } from "./icons";
import { ConfirmModal, Modal } from "./ui";

export function Topbar({
  token,
  periodos,
  periodoId,
  onChangePeriodo,
  onCriado,
  theme,
  onToggleTheme,
}: {
  token: string;
  periodos: Periodo[];
  periodoId: string;
  onChangePeriodo: (id: string) => void;
  onCriado: (id: string) => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
}) {
  const [novoAberto, setNovoAberto] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [erro, setErro] = useState("");
  const atual = periodos.find((item) => item.id === periodoId);
  return (
    <div className="topbar">
      <div className="topbar-heading">
        <span className="topbar-kicker">Ciclo ativo</span>
        <div className="breadcrumb">
          Período <span className="sep">›</span>
          <b>{atual?.nome ?? "—"}</b>
        </div>
      </div>
      <div className="topbar-right">
        {erro && (
          <span style={{ color: "var(--rose)", fontSize: 12, fontWeight: 700 }}>{erro}</span>
        )}
        <button className="theme-toggle" onClick={onToggleTheme} title="Alternar tema">
          {theme === "dark" ? <IconSun /> : <IconMoon />}
          {theme === "dark" ? "Modo diurno" : "Modo noturno"}
        </button>
        <select
          className="periodo"
          value={periodoId}
          onChange={(event) => onChangePeriodo(event.target.value)}
        >
          {periodos.map((item) => (
            <option key={item.id} value={item.id}>
              {item.nome}
            </option>
          ))}
        </select>
        <button className="btn sm" onClick={() => setNovoAberto(true)}>
          <IconPlus />
          Novo período
        </button>
        {atual && (
          <button
            className="btn sm"
            onClick={() => setConfirmarExclusao(true)}
            title="Excluir período"
          >
            <IconTrash />
          </button>
        )}
      </div>
      {novoAberto && (
        <NovoPeriodoModal
          token={token}
          onClose={() => setNovoAberto(false)}
          onCriado={(id) => {
            setNovoAberto(false);
            onCriado(id);
          }}
        />
      )}
      {confirmarExclusao && atual && (
        <ConfirmModal
          onClose={() => setConfirmarExclusao(false)}
          request={{
            title: `Excluir ${atual.nome}?`,
            message:
              "Só é possível excluir um período sem turmas, grupos, monitores ou listas vinculados. Esta ação não pode ser desfeita.",
            confirmLabel: "Excluir período",
            onConfirm: async () => {
              setErro("");
              try {
                await api.excluirPeriodo(token, atual.id);
                onCriado("");
              } catch (error) {
                setErro(
                  error instanceof Error ? error.message : "Não foi possível excluir o período",
                );
              }
            },
          }}
        />
      )}
    </div>
  );
}

function NovoPeriodoModal({
  token,
  onClose,
  onCriado,
}: {
  token: string;
  onClose: () => void;
  onCriado: (id: string) => void;
}) {
  const [nome, setNome] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [dataReferenciaRodizio, setDataReferenciaRodizio] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function submit() {
    if (!nome.trim() || !dataInicio || !dataFim || !dataReferenciaRodizio)
      return setErro("Preencha todos os campos");
    setSalvando(true);
    setErro("");
    try {
      const periodo = await api.criarPeriodo(token, {
        nome: nome.trim(),
        dataInicio: new Date(dataInicio).toISOString(),
        dataFim: new Date(dataFim).toISOString(),
        dataReferenciaRodizio: new Date(dataReferenciaRodizio).toISOString(),
      });
      onCriado(periodo.id);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível criar o período");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <h4>Novo período</h4>
      <p>
        Cria o período com as 6 listas padrão já criadas (edite nome e nº de questões depois, em
        Gestão) — turmas, grupos, monitores e alunos ficam separados por período.
      </p>
      <div className="field">
        <label>Nome</label>
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: 2027.1" />
      </div>
      <div className="field">
        <label>Início</label>
        <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
      </div>
      <div className="field">
        <label>Fim</label>
        <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
      </div>
      <div className="field">
        <label>Referência do rodízio (semana A/B)</label>
        <input
          type="date"
          value={dataReferenciaRodizio}
          onChange={(e) => setDataReferenciaRodizio(e.target.value)}
        />
      </div>
      {erro && <p style={{ color: "var(--rose)" }}>{erro}</p>}
      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn primary" disabled={salvando} onClick={submit}>
          Criar período
        </button>
      </div>
    </Modal>
  );
}
