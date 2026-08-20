import {
  DisconnectReason,
  makeWASocket,
  useMultiFileAuthState,
  type WAMessage,
  type WASocket,
} from "@whiskeysockets/baileys";
import type { PrismaClient } from "../generated/prisma/client.js";
import { BotSessaoStatus } from "../generated/prisma/enums.js";
import { criarFeedback } from "./feedback.js";
import { GoogleSheetsSync } from "./google-sheets.js";

type Etapa =
  | "lista"
  | "aluno"
  | "pontuacao"
  | "ia"
  | "questoesIa"
  | "plagio"
  | "questoesPlagio"
  | "envolvido"
  | "proibicao"
  | "questoesProibicao"
  | "confirmar";
type Conversa = {
  monitorId: string;
  duplaId: string;
  etapa: Etapa;
  listaId?: string;
  alunoId?: string;
  pontuacao?: number;
  ia: number[];
  plagio: number[];
  envolvidoId?: string;
  proibicao: number[];
};

const SESSION_ID = "feedbot";

function numeroDoJid(jid: string) {
  return jid.split("@")[0]?.replace(/\D/g, "") ?? "";
}
function normalizarNumero(numero: string) {
  return numero.replace(/\D/g, "");
}
function textoDaMensagem(
  message:
    | { conversation?: string | null; extendedTextMessage?: { text?: string | null } | null }
    | null
    | undefined,
) {
  return (message?.conversation ?? message?.extendedTextMessage?.text ?? "").trim();
}
function questoes(texto: string) {
  return [
    ...new Set(
      texto
        .split(/[,\s]+/)
        .map((item) => Number(item.replace(/^q/i, "")))
        .filter(Number.isInteger),
    ),
  ];
}

export class WhatsAppBot {
  private socket?: WASocket;
  private qr?: string;
  private conversas = new Map<string, Conversa>();
  private reconnecting = false;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly authDir = process.env["BAILEYS_AUTH_DIR"] ?? ".baileys-auth",
    private readonly sheets = new GoogleSheetsSync(),
  ) {}

  async status() {
    return this.prisma.botSessao.findUnique({ where: { id: SESSION_ID } });
  }
  qrAtual() {
    return this.qr;
  }
  conectado() {
    return Boolean(this.socket?.user);
  }

  async conectar() {
    if (this.socket) return;
    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
    await this.atualizarStatus(BotSessaoStatus.CONECTANDO);
    const socket = makeWASocket({
      auth: state,
      markOnlineOnConnect: false,
      syncFullHistory: false,
    });
    this.socket = socket;
    socket.ev.on("creds.update", saveCreds);
    socket.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
      if (qr) this.qr = qr;
      if (connection === "open") {
        this.qr = undefined;
        this.reconnecting = false;
        await this.atualizarStatus(BotSessaoStatus.CONECTADO, socket.user?.id?.split(":")[0]);
      }
      if (connection === "close") {
        this.socket = undefined;
        this.qr = undefined;
        await this.atualizarStatus(BotSessaoStatus.DESCONECTADO);
        const code = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)
          ?.output?.statusCode;
        if (code !== DisconnectReason.loggedOut && !this.reconnecting) {
          this.reconnecting = true;
          setTimeout(() => {
            void this.conectar();
          }, 2_000);
        }
      }
    });
    socket.ev.on("messages.upsert", ({ messages, type }) => {
      if (type !== "notify") return;
      for (const message of messages) void this.receber(socket, message);
    });
  }

  async desconectar() {
    this.reconnecting = false;
    this.socket?.end(undefined);
    this.socket = undefined;
    this.qr = undefined;
    await this.atualizarStatus(BotSessaoStatus.DESCONECTADO);
  }

  async nomeDoGrupo(whatsappGrupoId: string) {
    if (!this.socket) throw new Error("Bot não está conectado");
    return (await this.socket.groupMetadata(whatsappGrupoId)).subject;
  }

  private async atualizarStatus(status: BotSessaoStatus, numeroConectado?: string) {
    await this.prisma.botSessao.upsert({
      where: { id: SESSION_ID },
      create: { id: SESSION_ID, status, numeroConectado },
      update: { status, numeroConectado },
    });
  }

  private async enviar(socket: WASocket, jid: string, text: string) {
    await socket.sendMessage(jid, { text });
  }

  private async receber(socket: WASocket, message: WAMessage) {
    const jid = message.key.remoteJid;
    if (!jid || jid.endsWith("@g.us") || message.key.fromMe) return;
    const texto = textoDaMensagem(message.message).toLowerCase();
    if (!texto) return;
    const chave = numeroDoJid(jid);
    let conversa = this.conversas.get(chave);
    if (!conversa || ["oi", "menu", "cancelar"].includes(texto)) {
      const monitores = await this.prisma.monitor.findMany({
        where: { whatsappNumero: { not: "" }, status: "ATIVO" },
      });
      const monitor = monitores.find((item) => normalizarNumero(item.whatsappNumero) === chave);
      if (!monitor?.duplaId)
        return this.enviar(
          socket,
          jid,
          "Seu número não está cadastrado em uma dupla ativa. Procure um chefe de monitoria.",
        );
      conversa = {
        monitorId: monitor.id,
        duplaId: monitor.duplaId,
        etapa: "lista",
        ia: [],
        plagio: [],
        proibicao: [],
      };
      this.conversas.set(chave, conversa);
      const listas = await this.prisma.lista.findMany({
        where: { periodoId: monitor.periodoId },
        orderBy: { prazoEntregaFeedback: "asc" },
      });
      return this.enviar(
        socket,
        jid,
        `Olá, ${monitor.nome}. Qual lista você vai registrar?\n${listas.map((item, index) => `${index + 1}. ${item.nome}`).join("\n")}`,
      );
    }
    const responder = (text: string) => this.enviar(socket, jid, text);
    if (conversa.etapa === "lista") {
      const listas = await this.prisma.lista.findMany({
        where: {
          periodoId: (await this.prisma.monitor.findUnique({ where: { id: conversa.monitorId } }))!
            .periodoId,
        },
        orderBy: { prazoEntregaFeedback: "asc" },
      });
      const lista = listas[Number(texto) - 1];
      if (!lista) return responder("Escolha o número de uma lista válida.");
      conversa.listaId = lista.id;
      conversa.etapa = "aluno";
      const alunos = await this.prisma.aluno.findMany({
        where: { duplaId: conversa.duplaId },
        orderBy: { nome: "asc" },
      });
      return responder(
        `Qual aluno?\n${alunos.map((item, index) => `${index + 1}. ${item.nome}`).join("\n")}`,
      );
    }
    if (conversa.etapa === "aluno") {
      const alunos = await this.prisma.aluno.findMany({
        where: { duplaId: conversa.duplaId },
        orderBy: { nome: "asc" },
      });
      const aluno = alunos[Number(texto) - 1];
      if (!aluno) return responder("Escolha o número de um aluno válido.");
      conversa.alunoId = aluno.id;
      conversa.etapa = "pontuacao";
      return responder("Quantas questões corretas? Envie apenas o número.");
    }
    if (conversa.etapa === "pontuacao") {
      const lista = await this.prisma.lista.findUnique({ where: { id: conversa.listaId! } });
      const qtd = Number(texto);
      if (!lista || !Number.isInteger(qtd) || qtd < 0 || qtd > lista.qtdQuestoesTotal)
        return responder(`Informe um número entre 0 e ${lista?.qtdQuestoesTotal ?? 0}.`);
      conversa.pontuacao = qtd;
      conversa.etapa = "ia";
      return responder("Usou IA? Responda sim ou não.");
    }
    if (conversa.etapa === "ia") {
      if (!["sim", "não", "nao"].includes(texto)) return responder("Responda sim ou não.");
      conversa.etapa = texto === "sim" ? "questoesIa" : "plagio";
      return responder(
        texto === "sim" ? "Em quais questões? Ex.: 1, 3" : "Houve plágio? Responda sim ou não.",
      );
    }
    if (conversa.etapa === "questoesIa") {
      conversa.ia = questoes(texto);
      conversa.etapa = "plagio";
      return responder("Houve plágio? Responda sim ou não.");
    }
    if (conversa.etapa === "plagio") {
      if (!["sim", "não", "nao"].includes(texto)) return responder("Responda sim ou não.");
      conversa.etapa = texto === "sim" ? "questoesPlagio" : "proibicao";
      return responder(
        texto === "sim"
          ? "Em quais questões houve plágio? Ex.: 2, 4"
          : "Usou alguma proibição da lista? Responda sim ou não.",
      );
    }
    if (conversa.etapa === "questoesPlagio") {
      conversa.plagio = questoes(texto);
      conversa.etapa = "envolvido";
      const alunos = await this.prisma.aluno.findMany({
        where: { id: { not: conversa.alunoId } },
        orderBy: { nome: "asc" },
        take: 30,
      });
      return responder(
        `Com quem?\n${alunos.map((item, index) => `${index + 1}. ${item.nome} (${item.matricula})`).join("\n")}`,
      );
    }
    if (conversa.etapa === "envolvido") {
      const alunos = await this.prisma.aluno.findMany({
        where: { id: { not: conversa.alunoId } },
        orderBy: { nome: "asc" },
        take: 30,
      });
      const envolvido = alunos[Number(texto) - 1];
      if (!envolvido) return responder("Escolha o número de um aluno válido.");
      conversa.envolvidoId = envolvido.id;
      conversa.etapa = "proibicao";
      return responder("Usou alguma proibição da lista? Responda sim ou não.");
    }
    if (conversa.etapa === "proibicao") {
      if (!["sim", "não", "nao"].includes(texto)) return responder("Responda sim ou não.");
      conversa.etapa = texto === "sim" ? "questoesProibicao" : "confirmar";
      return responder(
        texto === "sim"
          ? "Em quais questões? Ex.: 1, 5"
          : "Envie CONFIRMAR para gravar ou CANCELAR para reiniciar.",
      );
    }
    if (conversa.etapa === "questoesProibicao") {
      conversa.proibicao = questoes(texto);
      conversa.etapa = "confirmar";
      return responder("Envie CONFIRMAR para gravar ou CANCELAR para reiniciar.");
    }
    if (conversa.etapa === "confirmar") {
      if (texto !== "confirmar")
        return responder("Envie CONFIRMAR para gravar ou CANCELAR para reiniciar.");
      try {
        const feedback = await criarFeedback(this.prisma, {
          alunoId: conversa.alunoId!,
          monitorId: conversa.monitorId,
          listaId: conversa.listaId!,
          qtdQuestoesPontuadas: conversa.pontuacao!,
          questoesIa: conversa.ia,
          questoesPlagio: conversa.plagio.flatMap((numeroQuestao) =>
            conversa.envolvidoId ? [{ numeroQuestao, alunoEnvolvidoId: conversa.envolvidoId }] : [],
          ),
          questoesProibicao: conversa.proibicao,
        });
        if (this.sheets.configurado())
          void this.sheets.sincronizarFeedback(this.prisma, feedback.id);
        this.conversas.delete(chave);
        return responder(
          "Registrado ✅ A sincronização com a planilha será processada automaticamente.",
        );
      } catch (error) {
        return responder(
          `Não foi possível registrar: ${error instanceof Error ? error.message : "dados inválidos"}. Envie CANCELAR e tente novamente.`,
        );
      }
    }
  }
}
