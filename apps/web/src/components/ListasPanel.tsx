import { useState } from "react";
import { fimDoDiaIso } from "../lib/format";
import { api } from "../lib/api";
import type { Lista, Turma } from "../lib/types";
import { Modal, Panel } from "./ui";

export function ListasPanel({
  token,
  listas,
  turmas,
  onReload,
}: {
  token: string;
  listas: Lista[];
  turmas: Turma[];
  onReload: () => Promise<void>;
}) {
  const [listaEditando, setListaEditando] = useState<Lista | null>(null);

  return (
    <>
      <Panel title="Listas e prazos" tag={`${listas.length} no período`}>
        <p className="sheet-import-help">
          Configure a quantidade de questões e o prazo de feedback de cada turma.
        </p>
        <div className="settings-list">
          {[...listas]
            .sort((a, b) => a.ordem - b.ordem)
            .map((lista) => (
              <div key={lista.id} className="settings-card">
                <div className="settings-card-head">
                  <span className="l">{lista.nome}</span>
                  <span className="settings-order">#{lista.ordem}</span>
                </div>
                <div className="settings-card-meta">
                  <span className="mono-cell">{lista.qtdQuestoesTotal} questões</span>
                  <span className="mono-cell">{lista.prazos.length} prazo(s)</span>
                </div>
                <span className="settings-list-actions">
                  <button className="btn sm" onClick={() => setListaEditando(lista)}>
                    Editar
                  </button>
                </span>
              </div>
            ))}
          {!listas.length && <p className="mono-cell">Nenhuma lista cadastrada neste período.</p>}
        </div>
      </Panel>
      {listaEditando && (
        <EditarListaModal
          token={token}
          lista={listaEditando}
          turmas={turmas}
          onClose={() => setListaEditando(null)}
          onSaved={() => void onReload()}
        />
      )}
    </>
  );
}

function EditarListaModal({
  token,
  lista,
  turmas,
  onClose,
  onSaved,
}: {
  token: string;
  lista: Lista;
  turmas: Turma[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nome, setNome] = useState(lista.nome);
  const [qtdQuestoesTotal, setQtdQuestoesTotal] = useState(String(lista.qtdQuestoesTotal));
  const [prazos, setPrazos] = useState(
    new Map(
      turmas.map((turma) => [
        turma.id,
        lista.prazos.find((p) => p.turmaId === turma.id)?.prazoEntregaFeedback.slice(0, 10) ?? "",
      ]),
    ),
  );
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function submit() {
    const qtd = Number(qtdQuestoesTotal);
    if (!nome.trim() || !Number.isInteger(qtd) || qtd <= 0)
      return setErro("Informe um nome e uma quantidade de questões válida");
    setSalvando(true);
    try {
      if ([...prazos.values()].some((valor) => !valor))
        return setErro("Defina o prazo de todas as turmas");
      await api.atualizarLista(token, lista.id, {
        nome: nome.trim(),
        qtdQuestoesTotal: qtd,
        prazos: [...prazos].map(([turmaId, valor]) => ({
          turmaId,
          prazoEntregaFeedback: fimDoDiaIso(valor),
        })),
      });
      onSaved();
      onClose();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível salvar a lista");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <h4>Editar {lista.nome}</h4>
        <p>Defina a quantidade de questões e o prazo de feedback de cada turma.</p>
        <div className="field">
          <label>Nome</label>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Lista 1" />
        </div>
        {turmas.map((turma) => (
          <div className="field" key={turma.id}>
            <label>Prazo — {turma.nome}</label>
            <input
              type="date"
              value={prazos.get(turma.id) ?? ""}
              onChange={(e) => setPrazos((prev) => new Map(prev).set(turma.id, e.target.value))}
            />
          </div>
        ))}
        <div className="field">
          <label>Quantidade de questões</label>
          <input
            type="number"
            min={1}
            value={qtdQuestoesTotal}
            onChange={(e) => setQtdQuestoesTotal(e.target.value)}
          />
        </div>
        {erro && <p style={{ color: "var(--rose)" }}>{erro}</p>}
        <div className="modal-actions">
          <button className="btn ghost" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" type="submit" disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
