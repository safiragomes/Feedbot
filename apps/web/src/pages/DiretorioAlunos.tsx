import { useMemo, useState } from "react";
import type { Aluno, Feedback, GrupoRevisao, Lista } from "../lib/types";
import { IconSearch, IconTrash } from "../components/icons";
import { Avatar, Chip, EmptyState, type ConfirmRequest } from "../components/ui";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { FilterSelect } from "../components/FilterSelect";
import { solicitarRemocaoAluno } from "../lib/acoes";
import { turmasUnicas } from "../lib/format";

type TipoOcorrencia = "ia" | "plagio" | "proibicao";

export function DiretorioAlunos({
  token,
  alunos,
  grupos,
  listas,
  feedbacks,
  onOpenAluno,
  onReload,
  onRequestConfirm,
}: {
  token: string;
  alunos: Aluno[];
  grupos: GrupoRevisao[];
  listas: Lista[];
  feedbacks: Feedback[];
  onOpenAluno: (id: string) => void;
  onReload: () => Promise<void>;
  onRequestConfirm: (request: ConfirmRequest) => void;
}) {
  const [turma, setTurma] = useState("");
  const [grupoId, setGrupoId] = useState("");
  const [listaId, setListaId] = useState("");
  const [ocorrencias, setOcorrencias] = useState<TipoOcorrencia[]>([]);
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState("");

  const turmas = useMemo(() => turmasUnicas(alunos), [alunos]);

  const q = busca.trim().toLowerCase();
  const feedbacksCompativeis = feedbacks.filter(
    (feedback) => !listaId || feedback.listaId === listaId,
  );
  const feedbacksPorAluno = new Map<string, Feedback[]>();
  feedbacksCompativeis.forEach((feedback) => {
    const registros = feedbacksPorAluno.get(feedback.alunoId) ?? [];
    registros.push(feedback);
    feedbacksPorAluno.set(feedback.alunoId, registros);
  });

  function alunoAtendeOcorrencias(alunoId: string) {
    const registros = feedbacksPorAluno.get(alunoId) ?? [];
    return ocorrencias.every((tipo) =>
      registros.some((feedback) =>
        tipo === "ia"
          ? feedback.usouIa
          : tipo === "plagio"
            ? feedback.plagiou
            : feedback.usouProibicao,
      ),
    );
  }

  function alternarOcorrencia(tipo: TipoOcorrencia) {
    setOcorrencias((atuais) =>
      atuais.includes(tipo) ? atuais.filter((item) => item !== tipo) : [...atuais, tipo],
    );
  }

  const filtrados = alunos
    .filter(
      (a) =>
        (!turma || a.turma.nome === turma) &&
        (!grupoId || a.dupla?.grupoRevisaoId === grupoId) &&
        (!ocorrencias.length || alunoAtendeOcorrencias(a.id)) &&
        (!q || a.nome.toLowerCase().includes(q) || a.matricula.includes(q)),
    )
    .sort((a, b) => a.nome.localeCompare(b.nome));
  const alunosComOcorrencias = filtrados.filter((aluno) =>
    feedbacksCompativeis.some(
      (feedback) =>
        feedback.alunoId === aluno.id &&
        (feedback.usouIa || feedback.plagiou || feedback.usouProibicao),
    ),
  ).length;
  const alunosSemDupla = filtrados.filter((aluno) => !aluno.duplaId).length;
  const filtrosAtivos = [turma, grupoId, listaId, busca.trim(), ocorrencias.join(",")].filter(
    Boolean,
  ).length;

  function limparFiltros() {
    setTurma("");
    setGrupoId("");
    setListaId("");
    setOcorrencias([]);
    setBusca("");
  }

  function confirmarExclusao(aluno: Aluno, event: React.MouseEvent) {
    event.stopPropagation();
    solicitarRemocaoAluno({ aluno, token, onRequestConfirm, onReload, onErro: setErro });
  }

  const alunoColunas: DataTableColumn<Aluno>[] = [
    {
      key: "nome",
      header: "Aluno",
      sortValue: (a) => a.nome,
      render: (a) => (
        <div className="person-cell">
          <Avatar nome={a.nome} />
          <span className="person-name">
            {a.nome}
            {a.isPcd && (
              <span className="nd-icon" title="PCD ou neurodivergente">
                ∞
              </span>
            )}
          </span>
        </div>
      ),
    },
    {
      key: "matricula",
      header: "Matrícula",
      sortValue: (a) => a.matricula,
      render: (a) => <span className="mono-cell">{a.matricula}</span>,
    },
    {
      key: "turma",
      header: "Turma",
      sortValue: (a) => a.turma.nome,
      render: (a) => a.turma.nome,
    },
    {
      key: "grupo",
      header: "Grupo de revisão",
      sortValue: (a) => grupos.find((g) => g.id === a.dupla?.grupoRevisaoId)?.nome ?? "",
      render: (a) => grupos.find((g) => g.id === a.dupla?.grupoRevisaoId)?.nome ?? "—",
    },
    {
      key: "dupla",
      header: "Dupla",
      sortValue: (a) => a.dupla?.label ?? "",
      render: (a) => <span className="mono-cell">{a.dupla?.label ?? "sem dupla"}</span>,
    },
    {
      key: "ocorrencias",
      header: "Ocorrências",
      render: (a) => (
        <span className="flags-cell">
          {feedbacksCompativeis.some((f) => f.alunoId === a.id && f.usouIa) && (
            <Chip tone="info">IA</Chip>
          )}
          {feedbacksCompativeis.some((f) => f.alunoId === a.id && f.plagiou) && (
            <Chip tone="danger">plágio</Chip>
          )}
          {feedbacksCompativeis.some((f) => f.alunoId === a.id && f.usouProibicao) && (
            <Chip tone="warn">proibição</Chip>
          )}
          {!feedbacksCompativeis.some(
            (f) => f.alunoId === a.id && (f.usouIa || f.plagiou || f.usouProibicao),
          ) && <span className="mono-cell">—</span>}
        </span>
      ),
    },
    {
      key: "acoes",
      header: "",
      align: "right",
      render: (a) => (
        <button
          className="x-btn"
          title="Remover aluno"
          onClick={(event) => confirmarExclusao(a, event)}
        >
          <IconTrash />
        </button>
      ),
    },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Alunos</h1>
          <div className="subtitle">
            Diretório completo — encontre um aluno por turma, grupo ou busca direta.
          </div>
        </div>
        <div className="head-actions">
          <button className="btn sm ghost" onClick={limparFiltros} disabled={!filtrosAtivos}>
            Limpar filtros
          </button>
        </div>
      </div>

      <div className="context-band">
        <div className="context-card">
          <span>Visíveis agora</span>
          <strong>{filtrados.length}</strong>
          <p>Alunos na seleção atual.</p>
        </div>
        <div className="context-card">
          <span>Com ocorrências</span>
          <strong>{alunosComOcorrencias}</strong>
          <p>IA, plágio ou proibição nas listas filtradas.</p>
        </div>
        <div className="context-card">
          <span>Sem dupla</span>
          <strong>{alunosSemDupla}</strong>
          <p>Cadastro ativo ainda sem alocação.</p>
        </div>
        <div className="context-card compact">
          <span>Filtros ativos</span>
          <strong>{filtrosAtivos}</strong>
          <p>{filtrosAtivos ? "Há restrições em vigor." : "Visão aberta do diretório."}</p>
        </div>
      </div>

      <div className="filterbar">
        <span className="flag">Turma</span>
        <FilterSelect
          label="turma"
          placeholder="todas as turmas"
          value={turma}
          onChange={setTurma}
          options={turmas.map((t) => ({ value: t, label: t }))}
        />
        <span className="flag">Lista</span>
        <FilterSelect
          label="lista"
          placeholder="todas as listas"
          value={listaId}
          onChange={setListaId}
          options={listas.map((lista) => ({ value: lista.id, label: lista.nome }))}
        />
        <span className="flag">Ocorrências</span>
        <div className="occurrence-options">
          {(
            [
              ["ia", "IA"],
              ["plagio", "Plágio"],
              ["proibicao", "Proibição"],
            ] as const
          ).map(([tipo, label]) => (
            <label key={tipo}>
              <input
                type="checkbox"
                checked={ocorrencias.includes(tipo)}
                onChange={() => alternarOcorrencia(tipo)}
              />
              {label}
            </label>
          ))}
        </div>
        <span className="flag">Grupo</span>
        <FilterSelect
          label="grupo"
          placeholder="todos os grupos"
          value={grupoId}
          onChange={setGrupoId}
          options={grupos.map((g) => ({ value: g.id, label: g.nome }))}
        />
        <div className="search-wrap">
          <div className="search-box">
            <IconSearch />
            <input
              placeholder="Buscar por nome ou matrícula"
              autoComplete="off"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </div>
      </div>

      {erro && <div className="error-banner">{erro}</div>}

      <DataTable
        columns={alunoColunas}
        rows={filtrados}
        rowKey={(a) => a.id}
        onRowClick={(a) => onOpenAluno(a.id)}
        emptyState={
          <EmptyState title="Nenhum aluno encontrado" hint="Ajuste os filtros ou a busca acima." />
        }
      />
    </>
  );
}
