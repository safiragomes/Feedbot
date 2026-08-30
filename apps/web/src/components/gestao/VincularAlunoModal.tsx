import { useMemo, useState } from "react";
import { api } from "../../lib/api";
import type { Aluno, Dupla, Turma } from "../../lib/types";
import { Modal } from "../ui";

export function VincularAlunoModal({
  token,
  alunos,
  turmas,
  duplas,
  onClose,
  onCreated,
}: {
  token: string;
  alunos: Aluno[];
  turmas: Turma[];
  duplas: Dupla[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [modo, setModo] = useState<"existentes" | "novo">("existentes");
  const [busca, setBusca] = useState("");
  const [turmaFiltro, setTurmaFiltro] = useState("");
  const [selecionados, setSelecionados] = useState(new Set<string>());
  const [nome, setNome] = useState("");
  const [matricula, setMatricula] = useState("");
  const [turmaId, setTurmaId] = useState(turmas[0]?.id ?? "");
  const [duplaId, setDuplaId] = useState(duplas[0]?.id ?? "");
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

  async function vincularExistentes() {
    if (!duplaId || selecionados.size === 0)
      return setErro("Selecione ao menos um aluno e uma dupla");
    setSalvando(true);
    setErro("");
    try {
      await api.atribuirAlunosDupla(token, [...selecionados], duplaId);
      onCreated();
      onClose();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível vincular os alunos");
    } finally {
      setSalvando(false);
    }
  }

  async function cadastrarNovo() {
    if (!nome.trim() || !matricula.trim() || !turmaId || !duplaId)
      return setErro("Preencha todos os campos");
    setSalvando(true);
    try {
      await api.criarAluno(token, {
        nome: nome.trim(),
        matricula: matricula.trim(),
        turmaId,
        duplaId,
      });
      onCreated();
      onClose();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível vincular o aluno");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal onClose={onClose} wide>
      <h4>Vincular aluno</h4>
      <div className="student-link-tabs" role="tablist" aria-label="Forma de vínculo">
        <button
          type="button"
          className={`btn sm${modo === "existentes" ? " primary" : ""}`}
          onClick={() => setModo("existentes")}
        >
          Selecionar existentes
        </button>
        <button
          type="button"
          className={`btn sm${modo === "novo" ? " primary" : ""}`}
          onClick={() => setModo("novo")}
        >
          Cadastrar novo
        </button>
      </div>

      {modo === "existentes" ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void vincularExistentes();
          }}
        >
          <p>
            Pesquise e selecione alunos já cadastrados. Um novo vínculo substitui a dupla atual.
          </p>
          <div className="student-link-filters">
            <div className="field">
              <label htmlFor="busca-aluno">Nome ou matrícula</label>
              <input
                id="busca-aluno"
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="Pesquisar aluno"
              />
            </div>
            <div className="field">
              <label htmlFor="filtro-turma-aluno">Turma</label>
              <select
                id="filtro-turma-aluno"
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
              <button
                className="btn sm ghost"
                type="button"
                onClick={() => setSelecionados(new Set())}
              >
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
                  <small>{aluno.dupla?.label ?? "Sem dupla"}</small>
                </span>
              </label>
            ))}
            {!alunosFiltrados.length && <p>Nenhum aluno encontrado com esses filtros.</p>}
          </div>
          <div className="field">
            <label>Vincular à dupla</label>
            <select value={duplaId} onChange={(e) => setDuplaId(e.target.value)}>
              {duplas.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          {erro && <p style={{ color: "var(--rose)" }}>{erro}</p>}
          <div className="modal-actions">
            <button className="btn ghost" type="button" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn primary" type="submit" disabled={salvando || !duplas.length}>
              Vincular {selecionados.size || "alunos"}
            </button>
          </div>
        </form>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void cadastrarNovo();
          }}
        >
          <p>Cadastre um aluno e já o adicione a uma dupla deste grupo.</p>
          <div className="field">
            <label>Nome</label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome completo"
            />
          </div>
          <div className="field">
            <label>Matrícula</label>
            <input
              value={matricula}
              onChange={(e) => setMatricula(e.target.value)}
              placeholder="Ex: 20260099999"
            />
          </div>
          <div className="field">
            <label>Turma</label>
            <select value={turmaId} onChange={(e) => setTurmaId(e.target.value)}>
              {turmas.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Dupla</label>
            <select value={duplaId} onChange={(e) => setDuplaId(e.target.value)}>
              {duplas.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          {erro && <p style={{ color: "var(--rose)" }}>{erro}</p>}
          <div className="modal-actions">
            <button className="btn ghost" type="button" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn primary" type="submit" disabled={salvando}>
              Vincular aluno
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
