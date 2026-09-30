import { useMemo, useState } from "react";
import { api } from "../../lib/api";
import type { Aluno, GrupoPrazo, Turma } from "../../lib/types";
import { Modal } from "../ui";

export function VincularAlunoGrupoPrazoModal({
  token,
  grupo,
  alunos,
  turmas,
  gruposPrazo,
  onClose,
  onUpdated,
}: {
  token: string;
  grupo: GrupoPrazo;
  alunos: Aluno[];
  turmas: Turma[];
  gruposPrazo: GrupoPrazo[];
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [turmaFiltro, setTurmaFiltro] = useState("");
  const [selecionados, setSelecionados] = useState(new Set<string>());
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const alunosFiltrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return alunos.filter(
      (aluno) =>
        (!turmaFiltro || aluno.turmaId === turmaFiltro) &&
        (!termo ||
          aluno.nome.toLocaleLowerCase("pt-BR").includes(termo) ||
          aluno.matricula.includes(termo)),
    );
  }, [alunos, busca, turmaFiltro]);

  function alternarAluno(id: string) {
    setSelecionados((atuais) => {
      const proximos = new Set(atuais);
      if (proximos.has(id)) proximos.delete(id);
      else proximos.add(id);
      return proximos;
    });
  }

  async function executar(grupoPrazoId: string | null) {
    if (selecionados.size === 0) return setErro("Selecione ao menos um aluno");
    setSalvando(true);
    setErro("");
    try {
      await api.atribuirAlunosGrupoPrazo(token, [...selecionados], grupoPrazoId);
      onUpdated();
      onClose();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível atualizar os alunos");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal onClose={onClose} wide>
      <h4>Alunos do grupo — {grupo.nome}</h4>
      <p>
        Selecione alunos para atribuir a este grupo de prazo ou para desvincular do grupo de
        prazo que tiverem atualmente.
      </p>
      <div className="student-link-filters">
        <div className="field">
          <label htmlFor="busca-aluno-grupo-prazo">Nome ou matrícula</label>
          <input
            id="busca-aluno-grupo-prazo"
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Pesquisar aluno"
          />
        </div>
        <div className="field">
          <label htmlFor="filtro-turma-aluno-grupo-prazo">Turma</label>
          <select
            id="filtro-turma-aluno-grupo-prazo"
            value={turmaFiltro}
            onChange={(event) => setTurmaFiltro(event.target.value)}
          >
            <option value="">Todas as turmas</option>
            {turmas.map((turma) => (
              <option key={turma.id} value={turma.id}>
                {turma.nome}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="student-link-selection-bar">
        <span>{selecionados.size} selecionado(s)</span>
        <span>
          <button
            className="btn sm ghost"
            type="button"
            onClick={() =>
              setSelecionados(
                (atuais) => new Set([...atuais, ...alunosFiltrados.map((aluno) => aluno.id)]),
              )
            }
          >
            Selecionar visíveis
          </button>
          <button className="btn sm ghost" type="button" onClick={() => setSelecionados(new Set())}>
            Limpar
          </button>
        </span>
      </div>
      <div className="student-link-list">
        {alunosFiltrados.map((aluno) => (
          <label className="student-link-row" key={aluno.id}>
            <input
              type="checkbox"
              checked={selecionados.has(aluno.id)}
              onChange={() => alternarAluno(aluno.id)}
            />
            <span className="student-link-identity">
              <strong>{aluno.nome}</strong>
              <small>{aluno.matricula}</small>
            </span>
            <span className="student-link-meta">
              <small>{aluno.turma.nome}</small>
              <small>
                {aluno.grupoPrazoId
                  ? (gruposPrazo.find((g) => g.id === aluno.grupoPrazoId)?.nome ??
                    "grupo de prazo")
                  : "sem grupo de prazo"}
              </small>
            </span>
          </label>
        ))}
        {!alunosFiltrados.length && <p>Nenhum aluno encontrado com esses filtros.</p>}
      </div>
      {erro && <p style={{ color: "var(--rose)" }}>{erro}</p>}
      <div className="modal-actions">
        <button className="btn ghost" type="button" onClick={onClose}>
          Cancelar
        </button>
        <button
          className="btn ghost"
          type="button"
          disabled={salvando}
          onClick={() => void executar(null)}
        >
          Desvincular {selecionados.size || ""}
        </button>
        <button
          className="btn primary"
          type="button"
          disabled={salvando}
          onClick={() => void executar(grupo.id)}
        >
          Atribuir {selecionados.size || ""}
        </button>
      </div>
    </Modal>
  );
}
