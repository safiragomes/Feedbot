import { useMemo, useState } from "react";
import { api } from "../../lib/api";
import { normalizarBusca, validarWhatsapp } from "../../lib/format";
import type { Monitor } from "../../lib/types";
import { Modal } from "../ui";

export function AtribuirMonitorModal({
  token,
  periodoId,
  duplaId,
  monitoresDisponiveis,
  onClose,
  onAssigned,
}: {
  token: string;
  periodoId: string;
  duplaId: string;
  monitoresDisponiveis: Monitor[];
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [modo, setModo] = useState<"existente" | "novo">("existente");
  const [busca, setBusca] = useState("");
  const [monitorId, setMonitorId] = useState("");
  const [nome, setNome] = useState("");
  const [whatsappNumero, setWhatsappNumero] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const monitoresFiltrados = useMemo(() => {
    const termo = normalizarBusca(busca.trim());
    if (!termo) return monitoresDisponiveis;
    const digitos = termo.replace(/\D/g, "");
    return monitoresDisponiveis.filter(
      (monitor) =>
        normalizarBusca(monitor.nome).includes(termo) ||
        (digitos && monitor.whatsappNumero.replace(/\D/g, "").includes(digitos)),
    );
  }, [busca, monitoresDisponiveis]);
  const monitorSelecionadoVisivel = monitoresFiltrados.some((monitor) => monitor.id === monitorId);

  async function vincularExistente() {
    if (!monitorSelecionadoVisivel) return setErro("Selecione um monitor da lista");
    setSalvando(true);
    setErro("");
    try {
      await api.atualizarMonitor(token, monitorId, { duplaId });
      onAssigned();
      onClose();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível vincular o monitor");
    } finally {
      setSalvando(false);
    }
  }

  async function cadastrarEVincular() {
    if (!nome.trim() || !whatsappNumero.trim()) return setErro("Preencha nome e WhatsApp");
    const erroWhats = validarWhatsapp(whatsappNumero);
    if (erroWhats) return setErro(erroWhats);
    setSalvando(true);
    setErro("");
    try {
      await api.criarMonitor(token, {
        nome: nome.trim(),
        whatsappNumero: whatsappNumero.trim(),
        periodoId,
        duplaId,
      });
      onAssigned();
      onClose();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível cadastrar o monitor");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal onClose={onClose} wide>
      <h4>Vincular monitor à dupla</h4>
      <div className="student-link-tabs" role="tablist" aria-label="Forma de vínculo">
        <button
          type="button"
          className={`btn sm${modo === "existente" ? " primary" : ""}`}
          onClick={() => {
            setModo("existente");
            setErro("");
          }}
        >
          Selecionar existente
        </button>
        <button
          type="button"
          className={`btn sm${modo === "novo" ? " primary" : ""}`}
          onClick={() => {
            setModo("novo");
            setErro("");
          }}
        >
          Cadastrar novo
        </button>
      </div>

      {modo === "existente" ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void vincularExistente();
          }}
        >
          <p>Pesquise e selecione um monitor ativo que ainda não pertence a uma dupla.</p>
          <div className="field">
            <label htmlFor="busca-monitor">Nome ou WhatsApp</label>
            <input
              id="busca-monitor"
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              placeholder="Pesquisar monitor"
            />
          </div>
          <div className="student-link-list monitor-link-list">
            {monitoresFiltrados.map((monitor) => (
              <label className="student-link-row" key={monitor.id}>
                <input
                  type="radio"
                  name="monitor"
                  checked={monitorId === monitor.id}
                  onChange={() => setMonitorId(monitor.id)}
                />
                <span className="student-link-identity">
                  <strong>{monitor.nome}</strong>
                  <small>{monitor.whatsappNumero}</small>
                </span>
                <span className="student-link-meta">
                  <small>{monitor.isChefe ? "Monitor-chefe" : "Monitor"}</small>
                  <small>Sem dupla</small>
                </span>
              </label>
            ))}
            {!monitoresFiltrados.length && (
              <p className="empty-selection-message">
                {monitoresDisponiveis.length
                  ? "Nenhum monitor encontrado com essa pesquisa."
                  : "Nenhum monitor ativo e sem dupla está disponível."}
              </p>
            )}
          </div>
          {erro && <p style={{ color: "var(--rose)" }}>{erro}</p>}
          <div className="modal-actions">
            <button className="btn ghost" type="button" onClick={onClose}>
              Cancelar
            </button>
            <button
              className="btn primary"
              type="submit"
              disabled={salvando || !monitorSelecionadoVisivel}
            >
              {salvando ? "Vinculando…" : "Vincular monitor"}
            </button>
          </div>
        </form>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void cadastrarEVincular();
          }}
        >
          <p>Cadastre o monitor e vincule-o imediatamente a esta dupla.</p>
          <div className="field">
            <label htmlFor="novo-monitor-nome">Nome</label>
            <input
              id="novo-monitor-nome"
              value={nome}
              onChange={(event) => setNome(event.target.value)}
              placeholder="Nome completo"
            />
          </div>
          <div className="field">
            <label htmlFor="novo-monitor-whatsapp">WhatsApp</label>
            <input
              id="novo-monitor-whatsapp"
              value={whatsappNumero}
              onChange={(event) => setWhatsappNumero(event.target.value)}
              placeholder="+55 81 9XXXX-XXXX"
            />
            <p style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 4 }}>
              Inclua DDI, DDD e o 9 do celular.
            </p>
          </div>
          {erro && <p style={{ color: "var(--rose)" }}>{erro}</p>}
          <div className="modal-actions">
            <button className="btn ghost" type="button" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn primary" type="submit" disabled={salvando}>
              {salvando ? "Cadastrando…" : "Cadastrar e vincular"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
