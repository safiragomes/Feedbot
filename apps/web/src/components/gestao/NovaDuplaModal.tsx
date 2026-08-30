import { useState } from "react";
import { api } from "../../lib/api";
import { Modal } from "../ui";

export function NovaDuplaModal({
  token,
  grupoRevisaoId,
  existentes,
  onClose,
  onCreated,
}: {
  token: string;
  grupoRevisaoId: string;
  existentes: number;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [label, setLabel] = useState(`Dupla ${existentes + 1}`);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function submit() {
    if (!label.trim()) return setErro("Informe o rótulo da dupla");
    setSalvando(true);
    try {
      await api.criarDupla(token, { grupoRevisaoId, label: label.trim() });
      onCreated();
      onClose();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível criar a dupla");
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
        <h4>Nova dupla</h4>
        <p>Você pode vincular os monitores das semanas A e B depois de criar a dupla.</p>
        <div className="field">
          <label>Rótulo</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ex: Dupla 3"
          />
        </div>
        {erro && <p style={{ color: "var(--rose)" }}>{erro}</p>}
        <div className="modal-actions">
          <button className="btn ghost" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" type="submit" disabled={salvando}>
            Criar dupla
          </button>
        </div>
      </form>
    </Modal>
  );
}
