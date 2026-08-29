import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { api } from "../lib/api";
import type { Bot, Periodo } from "../lib/types";
import { IconCheck, IconRefresh, IconWhatsapp, IconX } from "../components/icons";
import { Chip, Panel } from "../components/ui";

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
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const status = bot?.sessao?.status ?? "DESCONECTADO";

  useEffect(() => {
    if (!bot?.qr) return;
    let ativo = true;
    QRCode.toDataURL(bot.qr, { margin: 1, width: 220 }).then((url) => {
      if (ativo) setQrDataUrl(url);
    });
    return () => {
      ativo = false;
    };
  }, [bot?.qr]);

  useEffect(() => {
    if (status !== "CONECTANDO") return;
    const id = setInterval(() => void onReload(), 2500);
    return () => clearInterval(id);
  }, [status, onReload]);

  async function conectar() {
    setErro("");
    setCarregando(true);
    try {
      await api.conectarBot(token);
      await onReload();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível conectar o bot");
    } finally {
      setCarregando(false);
    }
  }
  async function desconectar() {
    if (
      !window.confirm(
        "Desvincular este número? Será necessário ler um novo QR code para conectar novamente.",
      )
    )
      return;
    setErro("");
    setCarregando(true);
    try {
      await api.desconectarBot(token);
      await onReload();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível desconectar o bot");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Bot do WhatsApp</h1>
          <div className="subtitle">
            Conecte o número dedicado via QR code e vincule a comunidade de Avisos correspondente a
            cada período.
          </div>
        </div>
      </div>

      {erro && <div className="error-banner">{erro}</div>}

      <div className="panel-grid" style={{ gridTemplateColumns: "0.9fr 1.1fr" }}>
        <Panel title="Conexão">
          <div className="connect-status">
            <span
              className={`status-dot${status === "CONECTADO" ? " on" : status === "CONECTANDO" ? " mid" : ""}`}
            />
            <span className="mono-cell">
              {status === "CONECTADO"
                ? "conectado"
                : status === "CONECTANDO"
                  ? "aguardando leitura do QR code"
                  : "desconectado"}
            </span>
          </div>

          {status === "CONECTADO" && (
            <div className="connected-card">
              <div className="num">{bot?.sessao?.numeroConectado ?? "—"}</div>
              <div className="mono-cell">Feedbot · Introdução à Programação</div>
            </div>
          )}

          {status === "CONECTANDO" && (
            <>
              <div className="qr-box">
                {bot?.qr && qrDataUrl ? (
                  <img src={qrDataUrl} alt="QR code de pareamento" width={220} height={220} />
                ) : (
                  <p className="mono-cell">gerando QR code…</p>
                )}
              </div>
              <p
                style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 600, marginBottom: 14 }}
              >
                No WhatsApp do número dedicado: Aparelhos conectados → Conectar um aparelho, e
                escaneie o código acima.
              </p>
            </>
          )}

          <button
            className="btn primary"
            style={{ width: "100%", justifyContent: "center" }}
            disabled={carregando || status !== "DESCONECTADO"}
            onClick={conectar}
          >
            <IconWhatsapp />
            {status === "DESCONECTADO" ? "Conectar bot" : "Conectando…"}
          </button>
          {status !== "DESCONECTADO" && (
            <button
              className="btn ghost"
              style={{ width: "100%", justifyContent: "center", marginTop: 8 }}
              disabled={carregando}
              onClick={desconectar}
            >
              Desvincular número
            </button>
          )}
        </Panel>
        <Panel title="Comunidade do período">
          <ComunidadeWhatsapp
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

function ComunidadeWhatsapp({
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
  const [disponiveis, setDisponiveis] = useState<{ id: string; nome: string }[]>([]);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [pendente, setPendente] = useState(false);

  async function carregarComunidades() {
    if (!conectado) return;
    try {
      const atuais = await api.comunidadesWhatsappDisponiveis(token);
      setDisponiveis(atuais);
      setValor((anterior) => (atuais.some((item) => item.id === anterior) ? anterior : ""));
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível listar as comunidades");
    }
  }

  useEffect(() => {
    if (!conectado) return;
    api
      .comunidadesWhatsappDisponiveis(token)
      .then(setDisponiveis)
      .catch((error) =>
        setErro(error instanceof Error ? error.message : "Não foi possível listar as comunidades"),
      );
  }, [token, conectado]);

  async function vincular() {
    if (!valor) return setErro("Selecione uma comunidade");
    setPendente(true);
    setErro("");
    setSucesso("");
    try {
      await api.vincularComunidadeWhatsapp(token, periodo.id, valor);
      await onReload();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível vincular a comunidade");
    } finally {
      setPendente(false);
    }
  }

  async function desvincular() {
    setPendente(true);
    setErro("");
    setSucesso("");
    try {
      await api.desvincularComunidadeWhatsapp(token, periodo.id);
      await onReload();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível desvincular a comunidade");
    } finally {
      setPendente(false);
    }
  }

  async function reenviarLink() {
    setPendente(true);
    setErro("");
    setSucesso("");
    try {
      await api.enviarLinkComunidadeWhatsapp(token, periodo.id);
      setSucesso("Link de acesso enviado em Avisos.");
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível enviar o link");
    } finally {
      setPendente(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ color: "var(--text-3)", fontSize: 12.5, margin: 0 }}>
        Ao vincular, o Feedbot publica um acesso direto à conversa privada para os monitores
        iniciarem o registro com um toque.
      </p>
      <div className="info-row">
        <span className="l">Período</span>
        <span>{periodo.nome}</span>
      </div>
      <div className="info-row">
        <span className="l">Comunidade · Avisos</span>
        <span>
          {periodo.whatsappAvisosId ? (
            <Chip tone="ok">{periodo.whatsappComunidadeNome ?? "Comunidade vinculada"}</Chip>
          ) : (
            <select
              disabled={!conectado}
              value={valor}
              onFocus={() => void carregarComunidades()}
              onChange={(e) => setValor(e.target.value)}
            >
              <option value="">Selecione uma comunidade…</option>
              {disponiveis.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome} · Avisos
                </option>
              ))}
            </select>
          )}
        </span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {periodo.whatsappAvisosId ? (
          <>
            <button className="btn sm" disabled={!conectado || pendente} onClick={reenviarLink}>
              <IconCheck />
              Reenviar link
            </button>
            <button className="btn sm" disabled={pendente} onClick={desvincular}>
              <IconX />
              Remover
            </button>
          </>
        ) : (
          <>
            <button className="btn sm" disabled={!conectado || pendente} onClick={vincular}>
              <IconCheck />
              Vincular
            </button>
            <button
              className="btn sm"
              disabled={!conectado || pendente}
              onClick={() => void carregarComunidades()}
            >
              <IconRefresh />
              Atualizar
            </button>
          </>
        )}
      </div>
      {erro && (
        <p className="error-banner" style={{ margin: 0 }}>
          {erro}
        </p>
      )}
      {sucesso && <p style={{ color: "var(--sage)", margin: 0 }}>{sucesso}</p>}
    </div>
  );
}
