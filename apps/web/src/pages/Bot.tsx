import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { api, ApiError } from "../lib/api";
import type { Bot, GrupoRevisao } from "../lib/types";
import { IconCheck, IconRefresh, IconWhatsapp, IconX } from "../components/icons";
import { Chip, Panel } from "../components/ui";

const EXEMPLO_CONVERSA: { from: "bot" | "user"; text: string }[] = [
  { from: "bot", text: "Olá, Rafael. Qual lista você vai registrar?\n1. Lista 1\n2. Lista 2\n3. Lista 3" },
  { from: "user", text: "3" },
  { from: "bot", text: "Qual aluno?\n1. Ana Beatriz\n2. Cauã Ribeiro\n3. Isadora Leão" },
  { from: "user", text: "2" },
  { from: "bot", text: "Quantas questões corretas? Envie apenas o número." },
  { from: "user", text: "7" },
  { from: "bot", text: "Usou IA? Responda sim ou não." },
  { from: "user", text: "sim" },
  { from: "bot", text: "Em quais questões? Ex.: 1, 3" },
  { from: "user", text: "3" },
  { from: "bot", text: "Houve plágio? Responda sim ou não." },
  { from: "user", text: "não" },
  { from: "bot", text: "Usou alguma proibição da lista? Responda sim ou não." },
  { from: "user", text: "não" },
  { from: "bot", text: "Envie CONFIRMAR para gravar ou CANCELAR para reiniciar." },
  { from: "user", text: "confirmar" },
  {
    from: "bot",
    text: "Registrado ✅ A sincronização com a planilha será processada automaticamente.",
  },
];

export function BotPage({
  token,
  bot,
  grupos,
  onReload,
}: {
  token: string;
  bot: Bot | null;
  grupos: GrupoRevisao[];
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
      setErro(error instanceof ApiError ? error.message : "Não foi possível conectar o bot");
    } finally {
      setCarregando(false);
    }
  }
  async function desconectar() {
    setErro("");
    setCarregando(true);
    try {
      await api.desconectarBot(token);
      await onReload();
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível desconectar o bot");
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
            Pareie o número dedicado por QR code (Baileys, biblioteca multi-device não-oficial — ADR-0003) e
            gerencie os grupos do WhatsApp por grupo de revisão.
          </div>
        </div>
      </div>

      {erro && <div className="error-banner">{erro}</div>}

      <div className="panel-grid" style={{ gridTemplateColumns: "0.9fr 1.1fr" }}>
        <Panel title="Conexão">
          <div className="connect-status">
            <span className={`status-dot${status === "CONECTADO" ? " on" : status === "CONECTANDO" ? " mid" : ""}`} />
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
              <p style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 600, marginBottom: 14 }}>
                No WhatsApp do número dedicado: Aparelhos conectados → Conectar um aparelho, e escaneie o código
                acima.
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
              Desconectar
            </button>
          )}
        </Panel>

        <Panel title="Status da sessão" tag="Baileys · multi-device não-oficial">
          <div className="info-row">
            <span className="l">Biblioteca</span>
            <span>@whiskeysockets/baileys</span>
          </div>
          <div className="info-row">
            <span className="l">Sessão</span>
            <span>persistida em disco, reconexão automática</span>
          </div>
          <div className="info-row">
            <span className="l">Verificação oficial</span>
            <Chip tone="off">não há selo verde (uso interno)</Chip>
          </div>
          <div className="info-row">
            <span className="l">Escopo do fluxo</span>
            <span>conversas 1:1 monitor ↔ bot</span>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 600, marginTop: 14 }}>
            Como o pareamento não é oficial, a sessão pode cair e exigir um novo QR code sem aviso — use um número
            dedicado (não o pessoal de nenhum chefe).
          </p>
        </Panel>
      </div>

      <div className="section-divider">Grupos do WhatsApp por grupo de revisão</div>
      <GruposWhatsapp token={token} grupos={grupos} conectado={status === "CONECTADO"} onReload={onReload} />

      <div className="section-divider">Exemplo do fluxo de conversa</div>
      <div className="phone">
        <div className="phone-head">
          <div className="av">F</div>
          <div>
            <div className="nm">Feedbot · Introdução à Programação</div>
            <div className="st">exemplo do script real do bot</div>
          </div>
        </div>
        <div className="msgs">
          {EXEMPLO_CONVERSA.map((msg, index) => (
            <div key={index} className={`msg ${msg.from}`} style={{ whiteSpace: "pre-line" }}>
              {msg.text}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function GruposWhatsapp({
  token,
  grupos,
  conectado,
  onReload,
}: {
  token: string;
  grupos: GrupoRevisao[];
  conectado: boolean;
  onReload: () => Promise<void>;
}) {
  const [valores, setValores] = useState<Record<string, string>>({});
  const [erro, setErro] = useState("");
  const [pendente, setPendente] = useState<string | null>(null);

  async function vincular(grupoId: string) {
    const whatsappGrupoId = (valores[grupoId] ?? "").trim();
    if (!whatsappGrupoId.endsWith("@g.us")) return setErro("O ID do grupo deve terminar em @g.us");
    setErro("");
    setPendente(grupoId);
    try {
      await api.vincularGrupoWhatsapp(token, grupoId, whatsappGrupoId);
      await onReload();
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível vincular o grupo");
    } finally {
      setPendente(null);
    }
  }
  async function desvincular(grupoId: string) {
    setErro("");
    setPendente(grupoId);
    try {
      await api.desvincularGrupoWhatsapp(token, grupoId);
      await onReload();
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível desvincular o grupo");
    } finally {
      setPendente(null);
    }
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th style={{ paddingLeft: 20 }}>Grupo de revisão</th>
            <th>Grupo do WhatsApp</th>
            <th style={{ paddingRight: 20 }}>Ação</th>
          </tr>
        </thead>
        <tbody>
          {grupos.map((g) => (
            <tr key={g.id}>
              <td style={{ paddingLeft: 20 }}>{g.nome}</td>
              <td>
                {g.whatsappGrupoId ? (
                  <Chip tone="ok">{g.whatsappGrupoNome ?? g.whatsappGrupoId}</Chip>
                ) : (
                  <input
                    style={{
                      background: "var(--surface-2)",
                      border: "1px solid var(--border-strong)",
                      color: "var(--text)",
                      borderRadius: "var(--r-sm)",
                      padding: "6px 10px",
                      fontSize: 12.5,
                      width: 220,
                    }}
                    placeholder="12036...@g.us"
                    disabled={!conectado}
                    value={valores[g.id] ?? ""}
                    onChange={(e) => setValores((prev) => ({ ...prev, [g.id]: e.target.value }))}
                  />
                )}
              </td>
              <td style={{ paddingRight: 20 }}>
                {g.whatsappGrupoId ? (
                  <button className="btn sm" disabled={pendente === g.id} onClick={() => desvincular(g.id)}>
                    <IconX />
                    Remover
                  </button>
                ) : (
                  <button
                    className="btn sm"
                    disabled={!conectado || pendente === g.id}
                    onClick={() => vincular(g.id)}
                    title={conectado ? "" : "Conecte o bot para vincular um grupo"}
                  >
                    <IconCheck />
                    Vincular
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!grupos.length && (
        <div className="empty">
          <b>Nenhum grupo de revisão cadastrado</b>Crie grupos na tela de Gestão primeiro.
        </div>
      )}
      {erro && <p className="error-banner" style={{ margin: 14 }}>{erro}</p>}
      {!conectado && (
        <p className="mono-cell" style={{ padding: "0 20px 16px" }}>
          <IconRefresh style={{ verticalAlign: "middle", marginRight: 4 }} />O bot precisa estar conectado para
          vincular novos grupos.
        </p>
      )}
    </div>
  );
}
