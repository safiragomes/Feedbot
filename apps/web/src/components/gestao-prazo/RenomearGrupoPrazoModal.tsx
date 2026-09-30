import { useState } from "react";
import { api } from "../../lib/api";
import type { GrupoPrazo } from "../../lib/types";
import { Modal } from "../ui";

export function RenomearGrupoPrazoModal({
  token,
  grupo,
  onClose,
  onRenamed,
}: {
  token: string;
  grupo: GrupoPrazo;
  onClose: () => void;
  onRenamed: () => void;
}) {
  const [nome, setNome] = useState(grupo.nome);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function submit() {
    if (!nome.trim()) return setErro("Informe o nome do grupo de prazo");
    setSalvando(true);
    setErro("");
    try {
      await api.renomearGrupoPrazo(token, grupo.id, nome.trim());
      onRenamed();
      onClose();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível renomear o grupo de prazo");
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
        <h4>Renomear grupo de prazo</h4>
        <div className="field">
          <label>Nome do grupo</label>
          <input value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        {erro && <p style={{ color: "var(--rose)" }}>{erro}</p>}
        <div className="modal-actions">
          <button className="btn ghost" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" type="submit" disabled={salvando}>
            Salvar
          </button>
        </div>
      </form>
    </Modal>
  );
}
