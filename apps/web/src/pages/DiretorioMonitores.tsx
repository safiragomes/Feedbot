import { useState } from "react";
import type { Aluno, Atraso, DiscordMembro, Dupla, GrupoRevisao, Lista, Monitor } from "../lib/types";
import { IconPlus, IconSearch, IconTrash } from "../components/icons";
import { Avatar, Chip, EmptyState, Modal, type ConfirmRequest } from "../components/ui";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { DiscordMemberPicker } from "../components/DiscordMemberPicker";
import { FilterSelect } from "../components/FilterSelect";
import { solicitarRemocaoMonitor, solicitarRemocaoVariosMonitores } from "../lib/acoes";
import { monitorSemanaB } from "../lib/dupla";
import { normalizarBusca } from "../lib/format";
import { ConvidarChefeModal, NovoMonitorModal } from "../components/MonitorAccessModals";
import { api } from "../lib/api";

function VincularDiscordModal({
  monitor,
  token,
  onClose,
  onReload,
  onErro,
}: {
  monitor: Monitor;
  token: string;
  onClose: () => void;
  onReload: () => Promise<void>;
  onErro: (mensagem: string) => void;
}) {
  const [membro, setMembro] = useState<DiscordMembro | null>(null);
  const [sincronizarNome, setSincronizarNome] = useState(true);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!membro) return;
    setSalvando(true);
    try {
      await api.atualizarMonitor(token, monitor.id, {
        discordUserId: membro.discordUserId,
        discordUsername: membro.username,
        discordDisplayName: membro.displayName,
        discordAvatarUrl: membro.avatarUrl ?? undefined,
        ...(sincronizarNome && membro.displayName !== monitor.nome
          ? { nome: membro.displayName }
          : {}),
      });
      await onReload();
      onClose();
    } catch (error) {
      onErro(error instanceof Error ? error.message : "Não foi possível vincular o Discord");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <h4>Vincular Discord de {monitor.nome}</h4>
      <DiscordMemberPicker
        token={token}
        periodoId={monitor.periodoId}
        value={membro?.discordUserId ?? monitor.discordUserId}
        onChange={setMembro}
        currentName={monitor.nome}
      />
      {membro && membro.displayName !== monitor.nome && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 12.5 }}>
          <input
            type="checkbox"
            checked={sincronizarNome}
            onChange={(event) => setSincronizarNome(event.target.checked)}
          />
          Também renomear o monitor para "{membro.displayName}" (nome de exibição no Discord)
        </label>
      )}
      <div className="modal-actions">
        <button className="btn ghost" type="button" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn primary" type="button" disabled={!membro || salvando} onClick={() => void salvar()}>
          {salvando ? "Vinculando…" : "Vincular"}
        </button>
      </div>
    </Modal>
  );
}

function NomeCell({
  monitor,
  token,
  onReload,
  onErro,
}: {
  monitor: Monitor;
  token: string;
  onReload: () => Promise<void>;
  onErro: (mensagem: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(monitor.nome);
  const [salvando, setSalvando] = useState(false);

  if (!editando) {
    return (
      <div
        className="person-cell"
        role="button"
        tabIndex={0}
        title="Editar nome"
        onClick={(event) => {
          event.stopPropagation();
          setValor(monitor.nome);
          setEditando(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.stopPropagation();
            setValor(monitor.nome);
            setEditando(true);
          }
        }}
      >
        <Avatar nome={monitor.nome} />
        <span className="person-name">{monitor.nome}</span>
      </div>
    );
  }

  async function salvar() {
    const nome = valor.trim();
    if (!nome || nome === monitor.nome) {
      setEditando(false);
      return;
    }
    setSalvando(true);
    try {
      await api.atualizarMonitor(token, monitor.id, { nome });
      await onReload();
      setEditando(false);
    } catch (error) {
      onErro(error instanceof Error ? error.message : "Não foi possível atualizar o nome");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="person-cell">
      <Avatar nome={monitor.nome} />
      <input
        autoFocus
        className="discord-cell-display"
        style={{ width: "100%" }}
        value={valor}
        disabled={salvando}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => setValor(event.target.value)}
        onBlur={() => void salvar()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            setValor(monitor.nome);
            setEditando(false);
          }
        }}
      />
    </div>
  );
}

function DiscordCell({
  monitor,
  token,
  onReload,
  onErro,
}: {
  monitor: Monitor;
  token: string;
  onReload: () => Promise<void>;
  onErro: (mensagem: string) => void;
}) {
  const [abrindo, setAbrindo] = useState(false);
  return (
    <>
      <button
        type="button"
        className="discord-cell-display"
        title="Vincular conta do Discord"
        onClick={(event) => {
          event.stopPropagation();
          setAbrindo(true);
        }}
      >
        {monitor.discordUsername ? `@${monitor.discordUsername}` : "vincular"}
      </button>
      {abrindo && (
        <VincularDiscordModal
          monitor={monitor}
          token={token}
          onClose={() => setAbrindo(false)}
          onReload={onReload}
          onErro={onErro}
        />
      )}
    </>
  );
}

export function DiretorioMonitores({
  token,
  periodoId,
  monitores,
  grupos,
  duplas,
  alunos,
  listas,
  atrasos,
  onOpenMonitor,
  onReload,
  onRequestConfirm,
}: {
  token: string;
  periodoId: string;
  monitores: Monitor[];
  grupos: GrupoRevisao[];
  duplas: Dupla[];
  alunos: Aluno[];
  listas: Lista[];
  atrasos: Atraso[];
  onOpenMonitor: (id: string) => void;
  onReload: () => Promise<void>;
  onRequestConfirm: (request: ConfirmRequest) => void;
}) {
  const [grupoId, setGrupoId] = useState("");
  const [listaId, setListaId] = useState("");
  const [somenteAtrasados, setSomenteAtrasados] = useState(false);
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState("");
  const [modal, setModal] = useState<"novo" | Monitor | null>(null);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  const q = normalizarBusca(busca.trim());
  const grupoDaDupla = new Map(duplas.map((d) => [d.id, d.grupoRevisaoId]));
  const duplaPorId = new Map(duplas.map((d) => [d.id, d]));
  const atrasosVisiveis = atrasos.filter((atraso) => !listaId || atraso.listaId === listaId);
  const monitoresAtrasados = new Set(atrasosVisiveis.map((atraso) => atraso.monitorId));
  const filtrados = monitores
    .filter((m) => {
      const pertenceAoGrupo = !grupoId || (!!m.duplaId && grupoDaDupla.get(m.duplaId) === grupoId);
      return (
        pertenceAoGrupo &&
        (!q ||
          normalizarBusca(m.nome).includes(q) ||
          normalizarBusca(m.discordUsername ?? "").includes(q) ||
          normalizarBusca(m.discordDisplayName ?? "").includes(q)) &&
        ((!listaId && !somenteAtrasados) || monitoresAtrasados.has(m.id))
      );
    })
    .sort((a, b) => a.nome.localeCompare(b.nome));
  const monitoresChefes = filtrados.filter((monitor) => monitor.isChefe).length;
  const convitesPendentes = filtrados.filter(
    (monitor) =>
      monitor.conviteContaChefe &&
      !monitor.conviteContaChefe.usadoEm &&
      new Date(monitor.conviteContaChefe.expiraEm) > new Date(),
  ).length;
  const filtrosAtivos = [grupoId, listaId, somenteAtrasados ? "atrasado" : "", busca.trim()].filter(
    Boolean,
  ).length;
  // A exclusão em massa só considera quem está selecionado E ainda visível sob os
  // filtros atuais — sem isso, o contador do botão ficava desatualizado quando o
  // filtro mudava depois da seleção.
  const selecionadosVisiveis = filtrados.filter((m) => selecionados.has(m.id));

  function limparFiltros() {
    setGrupoId("");
    setListaId("");
    setSomenteAtrasados(false);
    setBusca("");
  }

  function confirmarExclusao(monitor: Monitor, event: React.MouseEvent) {
    event.stopPropagation();
    solicitarRemocaoMonitor({ monitor, token, onRequestConfirm, onReload, onErro: setErro });
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
    solicitarRemocaoVariosMonitores({
      monitores: selecionadosVisiveis,
      token,
      onRequestConfirm,
      onReload,
      onErro: setErro,
      onConcluido: () => setSelecionados(new Set()),
    });
  }

  async function promoverChefe(monitor: Monitor, event: React.MouseEvent) {
    event.stopPropagation();
    setErro("");
    try {
      await api.atualizarMonitor(token, monitor.id, { isChefe: true });
      await onReload();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível promover o monitor");
    }
  }

  function alunosSemana(m: Monitor) {
    const alunosDaDupla = m.duplaId ? alunos.filter((a) => a.duplaId === m.duplaId) : [];
    const monitoresDupla = (m.duplaId && duplaPorId.get(m.duplaId)?.monitores) || [];
    const alunosA = alunosDaDupla.filter((a) => a.monitorSemanaAId === m.id).length;
    const alunosB = alunosDaDupla.filter(
      (a) => monitorSemanaB(monitoresDupla, a.monitorSemanaAId)?.id === m.id,
    ).length;
    return { alunosA, alunosB };
  }

  const monitorColunas: DataTableColumn<Monitor>[] = [
    {
      key: "nome",
      header: "Monitor",
      sortValue: (m) => m.nome,
      render: (m) => <NomeCell monitor={m} token={token} onReload={onReload} onErro={setErro} />,
    },
    {
      key: "discord",
      header: "Discord",
      sortValue: (m) => m.discordUsername ?? "",
      render: (m) => (
        <DiscordCell monitor={m} token={token} onReload={onReload} onErro={setErro} />
      ),
    },
    {
      key: "alunosA",
      header: "Alunos · semana A",
      sortValue: (m) => alunosSemana(m).alunosA,
      render: (m) => <span className="mono-cell">{alunosSemana(m).alunosA}</span>,
    },
    {
      key: "alunosB",
      header: "Alunos · semana B",
      sortValue: (m) => alunosSemana(m).alunosB,
      render: (m) => <span className="mono-cell">{alunosSemana(m).alunosB}</span>,
    },
    {
      key: "papel",
      header: "Papel",
      sortValue: (m) => (m.isChefe ? 1 : 0),
      render: (m) => (
        <Chip tone={m.isChefe ? "warn" : "off"}>{m.isChefe ? "chefe" : "monitor"}</Chip>
      ),
    },
    {
      key: "acesso",
      header: "Acesso",
      render: (m) =>
        !m.isChefe ? (
          <button className="btn sm" onClick={(event) => void promoverChefe(m, event)}>
            Tornar chefe
          </button>
        ) : m.contaChefe ? (
          <Chip tone="ok">{m.contaChefe.email}</Chip>
        ) : (
          <button
            className="btn sm"
            onClick={(event) => {
              event.stopPropagation();
              setModal(m);
            }}
          >
            {m.conviteContaChefe &&
            !m.conviteContaChefe.usadoEm &&
            new Date(m.conviteContaChefe.expiraEm) > new Date()
              ? "Reenviar convite"
              : "Enviar convite"}
          </button>
        ),
    },
    {
      key: "atrasos",
      header: "Atrasos abertos",
      sortValue: (m) => atrasosVisiveis.filter((atraso) => atraso.monitorId === m.id).length,
      render: (m) => {
        const total = atrasosVisiveis.filter((atraso) => atraso.monitorId === m.id).length;
        return total ? <Chip tone="danger">{total}</Chip> : <span className="mono-cell">—</span>;
      },
    },
    {
      key: "acoes",
      header: "",
      align: "right",
      render: (m) => (
        <button
          className="x-btn"
          title="Excluir monitor"
          onClick={(event) => confirmarExclusao(m, event)}
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
          <h1>Monitores</h1>
          <div className="subtitle">
            Cadastre monitores, defina chefes e gerencie convites de acesso em um só lugar.
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
          <button className="btn sm ghost" onClick={limparFiltros} disabled={!filtrosAtivos}>
            Limpar filtros
          </button>
          <button className="btn primary" onClick={() => setModal("novo")}>
            <IconPlus />
            Novo monitor
          </button>
        </div>
      </div>

      <div className="context-band">
        <div className="context-card">
          <span>Visíveis agora</span>
          <strong>{filtrados.length}</strong>
          <p>Monitores que atendem os filtros atuais.</p>
        </div>
        <div className="context-card">
          <span>Chefes ativos</span>
          <strong>{monitoresChefes}</strong>
          <p>Monitores com papel de liderança.</p>
        </div>
        <div className="context-card">
          <span>Atrasos abertos</span>
          <strong>{monitoresAtrasados.size}</strong>
          <p>Monitores com feedback não entregue após o prazo.</p>
        </div>
        <div className="context-card compact">
          <span>Convites abertos</span>
          <strong>{convitesPendentes}</strong>
          <p>Convites de acesso ainda válidos.</p>
        </div>
      </div>

      <div className="filterbar">
        <span className="flag">Grupo</span>
        <FilterSelect
          label="grupo"
          placeholder="todos os grupos"
          value={grupoId}
          onChange={setGrupoId}
          options={grupos.map((g) => ({ value: g.id, label: g.nome }))}
        />
        <span className="flag">Lista em atraso</span>
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
        <div className="search-wrap">
          <div className="search-box">
            <IconSearch />
            <input
              placeholder="Buscar por nome ou Discord"
              autoComplete="off"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </div>
      </div>

      {erro && <div className="error-banner">{erro}</div>}

      <DataTable
        columns={monitorColunas}
        rows={filtrados}
        rowKey={(m) => m.id}
        onRowClick={(m) => onOpenMonitor(m.id)}
        emptyState={
          <EmptyState
            title="Nenhum monitor encontrado"
            hint="Ajuste os filtros ou a busca acima."
          />
        }
        selection={{
          selectedKeys: selecionados,
          onToggleRow: alternarSelecao,
          onToggleAll: (keys) => setSelecionados(new Set(keys)),
        }}
      />
      {modal === "novo" && (
        <NovoMonitorModal
          token={token}
          periodoId={periodoId}
          onClose={() => setModal(null)}
          onCreated={() => void onReload()}
        />
      )}
      {modal && modal !== "novo" && (
        <ConvidarChefeModal
          token={token}
          monitor={modal}
          onClose={() => setModal(null)}
          onSent={() => void onReload()}
        />
      )}
    </>
  );
}
