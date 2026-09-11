import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Bot, DiscordCanal, DiscordCargo, DiscordServidor, Periodo } from "../lib/types";
import { IconCheck, IconDiscord, IconRefresh, IconX } from "../components/icons";
import { Chip, Panel } from "../components/ui";
import { FilterSelect } from "../components/FilterSelect";
import { toast } from "../lib/toast";

export function BotPage({
  token,
  bot,
  periodo,
  onReload,
}: {
  token: string;
  bot: Bot | null;
  periodo: Periodo;
  onReload: () => Promise<void>;
}) {
  const status = bot?.sessao?.status ?? "DESCONECTADO";

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Bot do Discord</h1>
          <div className="subtitle">
            Acompanhe a conexão do bot e vincule o servidor, o cargo de monitores e o canal de
            registro de cada período — cada período usa um servidor do Discord próprio.
          </div>
        </div>
      </div>

      <div className="panel-grid panel-grid-bot">
        <Panel title="Conexão">
          <div className="connect-status">
            <span
              className={`status-dot${status === "CONECTADO" ? " on" : status === "CONECTANDO" ? " mid" : ""}`}
            />
            <span className="mono-cell">
              {status === "CONECTADO"
                ? "conectado"
                : status === "CONECTANDO"
                  ? "conectando…"
                  : "desconectado"}
            </span>
          </div>

          {status === "CONECTADO" ? (
            <div className="connected-card">
              <div className="num">{bot?.sessao?.discordBotTag ?? "—"}</div>
              <div className="mono-cell">{bot?.sessao?.guildNome ?? "—"}</div>
            </div>
          ) : (
            <p style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 600 }}>
              {status === "CONECTANDO"
                ? "O bot está iniciando a conexão com o Discord."
                : "O bot está desligado ou sem o token configurado (DISCORD_BOT_TOKEN)."}
            </p>
          )}
        </Panel>
        <Panel title="Servidor, cargo e canal do período">
          <ConfiguracaoDiscordPeriodo
            token={token}
            periodo={periodo}
            conectado={status === "CONECTADO"}
            onReload={onReload}
          />
        </Panel>
      </div>
    </>
  );
}

function ConfiguracaoDiscordPeriodo({
  token,
  periodo,
  conectado,
  onReload,
}: {
  token: string;
  periodo: Periodo;
  conectado: boolean;
  onReload: () => Promise<void>;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="info-row">
        <span className="l">Período</span>
        <span>{periodo.nome}</span>
      </div>
      <ServidorDiscord token={token} periodo={periodo} conectado={conectado} onReload={onReload} />
      {periodo.discordGuildId && (
        <CargoDiscord token={token} periodo={periodo} conectado={conectado} onReload={onReload} />
      )}
      {periodo.discordGuildId && (
        <CanalDiscord token={token} periodo={periodo} conectado={conectado} onReload={onReload} />
      )}
    </div>
  );
}

function ServidorDiscord({
  token,
  periodo,
  conectado,
  onReload,
}: {
  token: string;
  periodo: Periodo;
  conectado: boolean;
  onReload: () => Promise<void>;
}) {
  const [valor, setValor] = useState("");
  const [disponiveis, setDisponiveis] = useState<DiscordServidor[]>([]);
  const [pendente, setPendente] = useState(false);
  const [erro, setErro] = useState("");

  function carregar() {
    if (!conectado) return;
    api
      .servidoresDiscordDisponiveis(token)
      .then((atuais) => setDisponiveis(atuais))
      .catch((error) =>
        setErro(error instanceof Error ? error.message : "Não foi possível listar os servidores"),
      );
  }

  useEffect(() => {
    if (!conectado) return;
    api
      .servidoresDiscordDisponiveis(token)
      .then((atuais) => setDisponiveis(atuais))
      .catch((error) =>
        setErro(error instanceof Error ? error.message : "Não foi possível listar os servidores"),
      );
  }, [token, conectado]);

  async function vincular() {
    if (!valor) return setErro("Selecione um servidor");
    setPendente(true);
    setErro("");
    try {
      await api.vincularServidorDiscord(token, periodo.id, valor);
      await onReload();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível vincular o servidor");
    } finally {
      setPendente(false);
    }
  }

  async function trocar() {
    setPendente(true);
    setErro("");
    try {
      await api.desvincularServidorDiscord(token, periodo.id);
      await onReload();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível desvincular o servidor");
    } finally {
      setPendente(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <strong style={{ fontSize: 13 }}>1. Servidor</strong>
      <p style={{ color: "var(--text-3)", fontSize: 12.5, margin: 0 }}>
        Cada período tem um servidor do Discord próprio — convide o bot para ele primeiro (ver
        README), depois escolha-o aqui.
      </p>
      {periodo.discordGuildId ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Chip tone="ok">
            {disponiveis.find((s) => s.id === periodo.discordGuildId)?.nome ?? "Servidor vinculado"}
          </Chip>
          <button className="btn sm" disabled={pendente} onClick={() => void trocar()}>
            <IconX />
            Trocar servidor
          </button>
        </div>
      ) : (
        <>
          <FilterSelect
            label="servidor"
            placeholder="Selecione um servidor…"
            value={valor}
            onChange={setValor}
            options={disponiveis.map((s) => ({ value: s.id, label: s.nome }))}
          />
          {erro && <p style={{ color: "var(--rose)" }}>{erro}</p>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn sm" disabled={!conectado || pendente} onClick={() => void vincular()}>
              <IconCheck />
              Vincular
            </button>
            <button className="btn sm" disabled={!conectado || pendente} onClick={carregar}>
              <IconRefresh />
              Atualizar
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function CargoDiscord({
  token,
  periodo,
  conectado,
  onReload,
}: {
  token: string;
  periodo: Periodo;
  conectado: boolean;
  onReload: () => Promise<void>;
}) {
  const [valor, setValor] = useState("");
  const [disponiveis, setDisponiveis] = useState<DiscordCargo[]>([]);
  const [pendente, setPendente] = useState(false);
  const [erro, setErro] = useState("");

  function carregar() {
    if (!conectado) return;
    api
      .cargosDiscordDisponiveis(token, periodo.id)
      .then((atuais) => setDisponiveis(atuais))
      .catch((error) =>
        setErro(error instanceof Error ? error.message : "Não foi possível listar os cargos"),
      );
  }

  useEffect(() => {
    if (!conectado) return;
    api
      .cargosDiscordDisponiveis(token, periodo.id)
      .then((atuais) => setDisponiveis(atuais))
      .catch((error) =>
        setErro(error instanceof Error ? error.message : "Não foi possível listar os cargos"),
      );
  }, [token, periodo.id, conectado]);

  async function vincular() {
    if (!valor) return setErro("Selecione um cargo");
    setPendente(true);
    setErro("");
    try {
      await api.vincularCargoDiscord(token, periodo.id, valor);
      await onReload();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível vincular o cargo");
    } finally {
      setPendente(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <strong style={{ fontSize: 13 }}>2. Cargo de monitores</strong>
      <p style={{ color: "var(--text-3)", fontSize: 12.5, margin: 0 }}>
        Usado pra listar quem pode ser vinculado a um monitor (tela Monitores).
      </p>
      {periodo.discordMonitoresRoleId ? (
        <Chip tone="ok">
          {disponiveis.find((c) => c.id === periodo.discordMonitoresRoleId)?.nome ?? "Cargo vinculado"}
        </Chip>
      ) : (
        <>
          <FilterSelect
            label="cargo"
            placeholder="Selecione um cargo…"
            value={valor}
            onChange={setValor}
            options={disponiveis.map((c) => ({ value: c.id, label: c.nome }))}
          />
          {erro && <p style={{ color: "var(--rose)" }}>{erro}</p>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn sm" disabled={!conectado || pendente} onClick={() => void vincular()}>
              <IconCheck />
              Vincular
            </button>
            <button className="btn sm" disabled={!conectado || pendente} onClick={carregar}>
              <IconRefresh />
              Atualizar
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function CanalDiscord({
  token,
  periodo,
  conectado,
  onReload,
}: {
  token: string;
  periodo: Periodo;
  conectado: boolean;
  onReload: () => Promise<void>;
}) {
  const [valor, setValor] = useState("");
  const [disponiveis, setDisponiveis] = useState<DiscordCanal[]>([]);
  const [pendente, setPendente] = useState(false);
  const [erro, setErro] = useState("");

  function carregarCanais() {
    if (!conectado) return;
    api
      .canaisDiscordDisponiveis(token, periodo.id)
      .then((atuais) => {
        setDisponiveis(atuais);
        setValor((anterior) => (atuais.some((item) => item.id === anterior) ? anterior : ""));
      })
      .catch((error) =>
        setErro(error instanceof Error ? error.message : "Não foi possível listar os canais"),
      );
  }

  useEffect(() => {
    if (!conectado) return;
    api
      .canaisDiscordDisponiveis(token, periodo.id)
      .then((atuais) => {
        setDisponiveis(atuais);
        setValor((anterior) => (atuais.some((item) => item.id === anterior) ? anterior : ""));
      })
      .catch((error) =>
        setErro(error instanceof Error ? error.message : "Não foi possível listar os canais"),
      );
  }, [token, periodo.id, conectado]);

  async function vincular() {
    if (!valor) return setErro("Selecione um canal");
    setPendente(true);
    setErro("");
    try {
      await api.vincularCanalDiscord(token, periodo.id, valor);
      await onReload();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível vincular o canal");
    } finally {
      setPendente(false);
    }
  }

  async function desvincular() {
    setPendente(true);
    setErro("");
    try {
      await api.desvincularCanalDiscord(token, periodo.id);
      await onReload();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível desvincular o canal");
    } finally {
      setPendente(false);
    }
  }

  async function reenviarPainel() {
    setPendente(true);
    setErro("");
    try {
      await api.enviarPainelDiscord(token, periodo.id);
      toast.success("Painel de registro publicado no canal.");
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível publicar o painel");
    } finally {
      setPendente(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <strong style={{ fontSize: 13 }}>3. Canal de registro</strong>
      <p style={{ color: "var(--text-3)", fontSize: 12.5, margin: 0 }}>
        Único canal onde o comando /feedback funciona. Ao vincular, o Feedbot publica uma mensagem
        fixa nele com um botão pros monitores iniciarem o registro com um toque.
      </p>
      {periodo.discordAvisosCanalId ? (
        <Chip tone="ok">{periodo.discordAvisosCanalNome ?? "Canal vinculado"}</Chip>
      ) : (
        <FilterSelect
          label="canal"
          placeholder="Selecione um canal…"
          value={valor}
          onChange={setValor}
          options={disponiveis.map((c) => ({ value: c.id, label: `#${c.nome}` }))}
        />
      )}
      {erro && <p style={{ color: "var(--rose)" }}>{erro}</p>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {periodo.discordAvisosCanalId ? (
          <>
            <button className="btn sm" disabled={!conectado || pendente} onClick={() => void reenviarPainel()}>
              <IconDiscord />
              Reenviar painel
            </button>
            <button className="btn sm" disabled={pendente} onClick={() => void desvincular()}>
              <IconX />
              Remover
            </button>
          </>
        ) : (
          <>
            <button className="btn sm" disabled={!conectado || pendente} onClick={() => void vincular()}>
              <IconCheck />
              Vincular
            </button>
            <button className="btn sm" disabled={!conectado || pendente} onClick={carregarCanais}>
              <IconRefresh />
              Atualizar
            </button>
          </>
        )}
      </div>
    </div>
  );
}
