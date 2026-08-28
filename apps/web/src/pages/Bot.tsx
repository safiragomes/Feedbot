import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { api } from "../lib/api";
import type { Bot, Periodo } from "../lib/types";
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
            Pareie o número dedicado por QR code (Baileys, biblioteca multi-device não-oficial — ADR-0003) e
            vincule o espaço de Avisos da comunidade correspondente a cada período.
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
            <span>ativação no grupo e preenchimento privado monitor ↔ bot</span>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 600, marginTop: 14 }}>
            Como o pareamento não é oficial, a sessão pode cair e exigir um novo QR code sem aviso — use um número
            dedicado (não o pessoal de nenhum chefe).
          </p>
        </Panel>
      </div>

      <div className="section-divider">Comunidade do período</div>
      <ComunidadeWhatsapp token={token} periodo={periodo} conectado={status === "CONECTADO"} onReload={onReload} />

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

function ComunidadeWhatsapp({ token, periodo, conectado, onReload }: {
  token: string; periodo: Periodo; conectado: boolean; onReload: () => Promise<void>;
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
      setValor((anterior) => atuais.some((item) => item.id === anterior) ? anterior : "");
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível listar as comunidades");
    }
  }

  useEffect(() => {
    if (!conectado) return;
    api.comunidadesWhatsappDisponiveis(token).then(setDisponiveis).catch((error) =>
      setErro(error instanceof Error ? error.message : "Não foi possível listar as comunidades"));
  }, [token, conectado]);

  async function vincular() {
    if (!valor) return setErro("Selecione uma comunidade");
    setPendente(true); setErro(""); setSucesso("");
    try { await api.vincularComunidadeWhatsapp(token, periodo.id, valor); await onReload(); }
    catch (error) { setErro(error instanceof Error ? error.message : "Não foi possível vincular a comunidade"); }
    finally { setPendente(false); }
  }

  async function desvincular() {
    setPendente(true); setErro(""); setSucesso("");
    try { await api.desvincularComunidadeWhatsapp(token, periodo.id); await onReload(); }
    catch (error) { setErro(error instanceof Error ? error.message : "Não foi possível desvincular a comunidade"); }
    finally { setPendente(false); }
  }

  async function reenviarLink() {
    setPendente(true); setErro(""); setSucesso("");
    try {
      await api.enviarLinkComunidadeWhatsapp(token, periodo.id);
      setSucesso("Link de acesso enviado em Avisos.");
    }
    catch (error) { setErro(error instanceof Error ? error.message : "Não foi possível enviar o link"); }
    finally { setPendente(false); }
  }

  return <div className="table-wrap">
    <p style={{ color: "var(--text-3)", padding: "0 20px 14px", fontSize: 12.5 }}>
      Ao vincular, o Feedbot publica um acesso direto à conversa privada para os monitores iniciarem o registro com um toque.
    </p>
    <table><thead><tr><th style={{ paddingLeft: 20 }}>Período</th><th>Comunidade · Avisos</th><th>Ação</th></tr></thead>
      <tbody><tr>
        <td style={{ paddingLeft: 20 }}>{periodo.nome}</td>
        <td>{periodo.whatsappAvisosId ? <Chip tone="ok">{periodo.whatsappComunidadeNome ?? "Comunidade vinculada"}</Chip> :
          <select disabled={!conectado} value={valor} onFocus={() => void carregarComunidades()} onChange={(e) => setValor(e.target.value)}>
            <option value="">Selecione uma comunidade…</option>
            {disponiveis.map((d) => <option key={d.id} value={d.id}>{d.nome} · Avisos</option>)}
          </select>}</td>
        <td>{periodo.whatsappAvisosId ? <span style={{ display: "flex", gap: 8 }}>
          <button className="btn sm" disabled={!conectado || pendente} onClick={reenviarLink}><IconCheck />Reenviar link</button>
          <button className="btn sm" disabled={pendente} onClick={desvincular}><IconX />Remover</button>
        </span> : <span style={{ display: "flex", gap: 8 }}>
          <button className="btn sm" disabled={!conectado || pendente} onClick={vincular}><IconCheck />Vincular</button>
          <button className="btn sm" disabled={!conectado || pendente} onClick={() => void carregarComunidades()}><IconRefresh />Atualizar</button>
        </span>}</td>
      </tr></tbody>
    </table>
    {erro && <p className="error-banner" style={{ margin: 14 }}>{erro}</p>}
    {sucesso && <p style={{ color: "var(--sage)", margin: 14 }}>{sucesso}</p>}
  </div>;
}
