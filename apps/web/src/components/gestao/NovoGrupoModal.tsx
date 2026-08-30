import { useState } from "react";
import { api } from "../../lib/api";
import type { GrupoRevisao, Monitor } from "../../lib/types";
import { Modal } from "../ui";

export function NovoGrupoModal({
  token,
  periodoId,
  monitores,
  grupos,
  onClose,
  onCreated,
}: {
  token: string;
  periodoId: string;
  monitores: Monitor[];
  grupos: GrupoRevisao[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const chefes = monitores.filter(
    (monitor) => monitor.isChefe && !grupos.some((grupo) => grupo.chefeId === monitor.id),
  );
  const [nome, setNome] = useState("");
  const [chefeId, setChefeId] = useState(chefes[0]?.id ?? "");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function submit() {
    if (!nome.trim() || !chefeId)
      return setErro("Informe o nome e selecione um chefe vigente disponível");
    setSalvando(true);
    setErro("");
    try {
      await api.criarGrupo(token, { periodoId, chefeId, nome: nome.trim() });
      onCreated();
      onClose();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível criar o grupo");
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
        <h4>Novo grupo de revisão</h4>
        <p>Crie um grupo e defina o chefe responsável.</p>
        <div className="field">
          <label>Nome do grupo</label>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Grupo Helena"
          />
        </div>
        <div className="field">
          <label>Chefe responsável</label>
          <select value={chefeId} onChange={(e) => setChefeId(e.target.value)}>
            {!chefes.length && <option value="">Nenhum chefe disponível</option>}
            {chefes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        {!chefes.length && (
          <p>Cadastre ou promova um monitor na tela Monitores antes de criar este grupo.</p>
        )}
        {erro && <p style={{ color: "var(--rose)" }}>{erro}</p>}
        <div className="modal-actions">
          <button className="btn ghost" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" type="submit" disabled={salvando || !chefes.length}>
            Criar grupo
          </button>
        </div>
      </form>
    </Modal>
  );
}
