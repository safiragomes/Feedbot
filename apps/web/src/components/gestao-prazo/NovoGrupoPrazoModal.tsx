import { useState } from "react";
import { api } from "../../lib/api";
import { Modal } from "../ui";

export function NovoGrupoPrazoModal({
  token,
  periodoId,
  onClose,
  onCreated,
}: {
  token: string;
  periodoId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function submit() {
    if (!nome.trim()) return setErro("Informe o nome do grupo de prazo");
    setSalvando(true);
    setErro("");
    try {
      await api.criarGrupoPrazo(token, { periodoId, nome: nome.trim() });
      onCreated();
      onClose();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível criar o grupo de prazo");
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
        <h4>Novo grupo de prazo</h4>
        <p>Crie um grupo para conceder um prazo alternativo a um conjunto de alunos.</p>
        <div className="field">
          <label>Nome do grupo</label>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Rematrícula"
          />
        </div>
        {erro && <p style={{ color: "var(--rose)" }}>{erro}</p>}
        <div className="modal-actions">
          <button className="btn ghost" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" type="submit" disabled={salvando}>
            Criar grupo
          </button>
        </div>
      </form>
    </Modal>
  );
}
