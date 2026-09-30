import { useEffect, useState } from "react";
import { fimDoDiaIso, paraInputDate } from "../../lib/format";
import { api } from "../../lib/api";
import type { GrupoPrazo, PrazoListaItem } from "../../lib/types";
import { Modal } from "../ui";

export function EditarPrazosGrupoModal({
  token,
  grupo,
  onClose,
  onSaved,
}: {
  token: string;
  grupo: GrupoPrazo;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [itens, setItens] = useState<PrazoListaItem[] | null>(null);
  const [prazos, setPrazos] = useState(new Map<string, string>());
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    api
      .prazosGrupo(token, grupo.id)
      .then((resposta) => {
        if (cancelado) return;
        setItens(resposta);
        setPrazos(
          new Map(
            resposta.map((item) => [
              item.listaId,
              item.prazoEntregaFeedback ? paraInputDate(item.prazoEntregaFeedback) : "",
            ]),
          ),
        );
      })
      .catch((error) =>
        !cancelado &&
        setErro(error instanceof Error ? error.message : "Não foi possível carregar os prazos"),
      )
      .finally(() => !cancelado && setCarregando(false));
    return () => {
      cancelado = true;
    };
  }, [token, grupo.id]);

  async function submit() {
    setSalvando(true);
    setErro("");
    try {
      const preenchidos = [...prazos].filter(([, valor]) => valor);
      await api.salvarPrazosGrupo(
        token,
        grupo.id,
        preenchidos.map(([listaId, valor]) => ({
          listaId,
          prazoEntregaFeedback: fimDoDiaIso(valor),
        })),
      );
      onSaved();
      onClose();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível salvar os prazos");
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
        <h4>Prazos do grupo — {grupo.nome}</h4>
        <p>
          Defina o prazo de entrega de feedback deste grupo por lista. Deixe em branco para usar
          o prazo da turma. Limpar um campo que já tinha data configurada não remove o prazo
          existente — para isso, defina outra data ou exclua o grupo.
        </p>
        {carregando && <p className="mono-cell">Carregando…</p>}
        {itens?.map((item) => (
          <div className="field" key={item.listaId}>
            <label>{item.listaNome}</label>
            <input
              type="date"
              value={prazos.get(item.listaId) ?? ""}
              onChange={(e) =>
                setPrazos((prev) => new Map(prev).set(item.listaId, e.target.value))
              }
            />
          </div>
        ))}
        {erro && <p style={{ color: "var(--rose)" }}>{erro}</p>}
        <div className="modal-actions">
          <button className="btn ghost" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" type="submit" disabled={salvando || carregando}>
            {salvando ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
