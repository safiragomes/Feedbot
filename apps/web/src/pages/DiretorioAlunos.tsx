import { useMemo, useState } from "react";
import type { Aluno, Atraso, Feedback, GrupoRevisao, Lista } from "../lib/types";
import { IconSearch, IconTrash } from "../components/icons";
import { Avatar, Chip, EmptyState, type ConfirmRequest } from "../components/ui";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { FilterBar, FilterBarToggle } from "../components/FilterBar";
import { FilterSelect } from "../components/FilterSelect";
import { solicitarRemocaoAluno, solicitarRemocaoVariosAlunos } from "../lib/acoes";
import { normalizarBusca, turmasUnicas } from "../lib/format";

type TipoOcorrencia = "ia" | "plagio" | "proibicao";

export function DiretorioAlunos({
  token,
  alunos,
  grupos,
  listas,
  feedbacks,
  atrasos,
  onOpenAluno,
  onReload,
  onRequestConfirm,
}: {
  token: string;
  alunos: Aluno[];
  grupos: GrupoRevisao[];
  listas: Lista[];
  feedbacks: Feedback[];
  atrasos: Atraso[];
  onOpenAluno: (id: string) => void;
  onReload: () => Promise<void>;
  onRequestConfirm: (request: ConfirmRequest) => void;
}) {
  const [turma, setTurma] = useState("");
  const [grupoId, setGrupoId] = useState("");
  const [listaId, setListaId] = useState("");
  const [somenteAtrasados, setSomenteAtrasados] = useState(false);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [ocorrencias, setOcorrencias] = useState<TipoOcorrencia[]>([]);
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState("");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  const turmas = useMemo(() => turmasUnicas(alunos), [alunos]);

  const q = normalizarBusca(busca.trim());
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

  const atrasosVisiveis = atrasos.filter((a) => !listaId || a.listaId === listaId);
  const alunosAtrasados = new Set(atrasosVisiveis.map((a) => a.alunoId));

  const filtrados = alunos
    .filter(
      (a) =>
        (!turma || a.turma.nome === turma) &&
        (!grupoId || a.dupla?.grupoRevisaoId === grupoId) &&
        (!ocorrencias.length || alunoAtendeOcorrencias(a.id)) &&
        (!somenteAtrasados || alunosAtrasados.has(a.id)) &&
        (!q || normalizarBusca(a.nome).includes(q) || a.matricula.toLowerCase().includes(q)),
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
  // A exclusão em massa só considera quem está selecionado E ainda visível sob os
  // filtros atuais — sem isso, o contador do botão ficava desatualizado quando o
  // filtro mudava depois da seleção (ex.: mostrava "3 selecionados" mas a exclusão
  // de fato afetava 0, porque nenhum dos 3 seguia visível).
  const selecionadosVisiveis = filtrados.filter((a) => selecionados.has(a.id));
  const filtrosAtivos = [
    turma,
    grupoId,
    listaId,
    busca.trim(),
    ocorrencias.join(","),
    somenteAtrasados ? "atrasado" : "",
  ].filter(Boolean).length;

  function limparFiltros() {
    setTurma("");
    setGrupoId("");
    setListaId("");
    setOcorrencias([]);
    setSomenteAtrasados(false);
    setBusca("");
  }

  function confirmarExclusao(aluno: Aluno, event: React.MouseEvent) {
    event.stopPropagation();
    solicitarRemocaoAluno({ aluno, token, onRequestConfirm, onReload, onErro: setErro });
  }

  function alternarSelecao(id: string) {
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  function confirmarExclusaoSelecionados() {
    solicitarRemocaoVariosAlunos({
      alunos: selecionadosVisiveis,
      token,
      onRequestConfirm,
      onReload,
      onErro: setErro,
      onConcluido: () => setSelecionados(new Set()),
    });
  }

  const alunoColunas: DataTableColumn<Aluno>[] = [
    {
      key: "nome",
      header: "Aluno",
      // Sem legenda "ALUNO" repetida em cada cartão no mobile — o nome já é
      // óbvio por si só, é a primeira coisa da lista.
      mobileLabel: "",
      sortValue: (a) => a.nome,
      render: (a) => {
        const totalAtrasos = atrasosVisiveis.filter((atraso) => atraso.alunoId === a.id).length;
        return (
          <div className="person-cell">
            <Avatar nome={a.nome} />
            <div className="person-cell-text">
              <span className="person-name">
                {a.nome}
                {a.isPcd && (
                  <span className="nd-icon" title="PCD ou neurodivergente">
                    ∞
                  </span>
                )}
              </span>
              {/* Só aparece no cartão mobile (ver index.css) — no desktop essas
                  informações já têm colunas próprias, mostrar aqui também duplicaria. */}
              <span className="person-meta-mobile">
                {a.turma.nome}
                {totalAtrasos > 0 && ` · ${totalAtrasos} atraso(s)`}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      key: "matricula",
      header: "Matrícula",
      sortValue: (a) => a.matricula,
      render: (a) => <span className="mono-cell">{a.matricula}</span>,
      hideOnMobile: true,
    },
    {
      key: "turma",
      header: "Turma",
      sortValue: (a) => a.turma.nome,
      render: (a) => a.turma.nome,
      hideOnMobile: true,
    },
    {
      key: "grupo",
      header: "Grupo de revisão",
      sortValue: (a) => grupos.find((g) => g.id === a.dupla?.grupoRevisaoId)?.nome ?? "",
      render: (a) => grupos.find((g) => g.id === a.dupla?.grupoRevisaoId)?.nome ?? "—",
      hideOnMobile: true,
    },
    {
      key: "dupla",
      header: "Dupla",
      sortValue: (a) => a.dupla?.label ?? "",
      render: (a) => <span className="mono-cell">{a.dupla?.label ?? "sem dupla"}</span>,
      hideOnMobile: true,
    },
    {
      key: "ocorrencias",
      header: "Ocorrências",
      hideOnMobile: true,
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
      key: "atrasos",
      header: "Atrasos abertos",
      sortValue: (a) => atrasosVisiveis.filter((atraso) => atraso.alunoId === a.id).length,
      hideOnMobile: true,
      render: (a) => {
        const total = atrasosVisiveis.filter((atraso) => atraso.alunoId === a.id).length;
        return total ? <Chip tone="danger">{total}</Chip> : <span className="mono-cell">—</span>;
      },
    },
    {
      key: "acoes",
      header: "",
      align: "right",
      mobilePin: true,
      render: (a) => (
        <button
          className="x-btn"
          title="Remover aluno"
          aria-label="Remover aluno"
          onClick={(event) => confirmarExclusao(a, event)}
        >
          <IconTrash aria-hidden="true" />
        </button>
      ),
    },
  ];

  return (
    <div className="page-flow">
      <div className="page-head">
        <div>
          <h1>Alunos</h1>
          <div className="subtitle">
            Diretório completo — encontre um aluno por turma, grupo ou busca direta.
          </div>
        </div>
        <div className="head-actions">
          {selecionadosVisiveis.length > 0 && (
            <button className="btn sm danger-solid" onClick={confirmarExclusaoSelecionados}>
              <IconTrash />
              Remover {selecionadosVisiveis.length} selecionado
              {selecionadosVisiveis.length === 1 ? "" : "s"}
            </button>
          )}
          <div className="search-wrap search-wrap-mobile">
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
          <FilterBarToggle filtrosAtivos={filtrosAtivos} onClick={() => setFiltrosAbertos(true)} />
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
        <div className="context-card">
          <span>Atrasos abertos</span>
          <strong>{alunosAtrasados.size}</strong>
          <p>Alunos com feedback não entregue após o prazo.</p>
        </div>
      </div>

      <FilterBar open={filtrosAbertos} onClose={() => setFiltrosAbertos(false)}>
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
        <label style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <input
            type="checkbox"
            checked={somenteAtrasados}
            onChange={(e) => setSomenteAtrasados(e.target.checked)}
          />
          <span className="flag">somente com atrasos</span>
        </label>
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
      </FilterBar>

      {erro && <div className="error-banner">{erro}</div>}

      <DataTable
        columns={alunoColunas}
        rows={filtrados}
        rowKey={(a) => a.id}
        onRowClick={(a) => onOpenAluno(a.id)}
        emptyState={
          <EmptyState title="Nenhum aluno encontrado" hint="Ajuste os filtros ou a busca acima." />
        }
        selection={{
          selectedKeys: selecionados,
          onToggleRow: alternarSelecao,
          onToggleAll: (keys) => setSelecionados(new Set(keys)),
        }}
      />
    </div>
  );
}
