import { access, chmod, mkdir, rm } from "node:fs/promises";
import {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeWASocket,
  useMultiFileAuthState,
  type WAMessage,
  type WASocket,
} from "@whiskeysockets/baileys";
import type { PrismaClient } from "../generated/prisma/client.js";
import { BotSessaoStatus } from "../generated/prisma/enums.js";
import { calcularSemana } from "../domain/semana.js";
import {
  comandoEncerraFluxo,
  comandoIniciaFluxo,
  comOpcaoDeSaida,
} from "../domain/comandos-bot.js";
import { semanasCobertasPorMonitor } from "../domain/monitorSemana.js";
import { variantesWhatsapp } from "../domain/telefone.js";
import { criarFeedback } from "./feedback.js";
import { GoogleSheetsSync } from "./google-sheets.js";
import { buscarPendenciasAtrasadas } from "./atrasos.js";

type Etapa =
  | "lista"
  | "aluno"
  | "pontuacao"
  | "ia"
  | "questoesIa"
  | "plagio"
  | "questoesPlagio"
  | "cursoEnvolvido"
  | "envolvido"
  | "proibicao"
  | "questoesProibicao"
  | "confirmar";
type Conversa = {
  monitorId: string;
  periodoId: string;
  etapa: Etapa;
  listaId?: string;
  alunoId?: string;
  pontuacao?: number;
  ia: number[];
  plagio: number[];
  turmaEnvolvidoId?: string;
  envolvidoId?: string;
  proibicao: number[];
};

const SESSION_ID = "feedbot";

function numeroDoJid(jid: string) {
  return jid.split("@")[0]?.replace(/\D/g, "") ?? "";
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
  private devePermanecerConectado = false;
  private reconnectTimer?: NodeJS.Timeout;
  private tentativasReconexao = 0;
  private ultimaTentativaEm?: Date;
  private quedaEm?: Date;
  private lembretesEmExecucao = false;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly authDir = process.env["BAILEYS_AUTH_DIR"] ?? ".baileys-auth",
    private readonly sheets = new GoogleSheetsSync(),
  ) {}

  async status() {
    const sessao = await this.prisma.botSessao.findUnique({ where: { id: SESSION_ID } });
    if (!this.socket?.user || sessao?.status === BotSessaoStatus.CONECTADO) return sessao;

    // O socket é a fonte de verdade enquanto o processo está vivo. Um evento de
    // fechamento atrasado de uma conexão anterior não pode deixar o painel preso
    // em DESCONECTADO quando a conexão substituta já está aberta.
    const numeroConectado = this.socket.user.id.split(":")[0];
    await this.atualizarStatus(BotSessaoStatus.CONECTADO, numeroConectado);
    return this.prisma.botSessao.findUnique({ where: { id: SESSION_ID } });
  }
  qrAtual() {
    return this.qr;
  }
  conectado() {
    return Boolean(this.socket?.user);
  }

  async restaurarSessao() {
    try {
      await access(`${this.authDir}/creds.json`);
    } catch {
      return false;
    }
    await this.conectar();
    return true;
  }

  async garantirConexao() {
    if (!this.devePermanecerConectado || this.socket?.user) return;

    const tentativaExpirou =
      this.ultimaTentativaEm && Date.now() - this.ultimaTentativaEm.getTime() >= 2 * 60_000;
    if (this.socket && !tentativaExpirou) return;

    if (this.socket) {
      const socketTravado = this.socket;
      this.socket = undefined;
      socketTravado.end(new Error("Tempo limite ao conectar o WhatsApp"));
    }
    this.quedaEm ??= new Date();
    await this.conectar();
  }

  async enviarLembretesDeAtraso(agora = new Date()) {
    if (!this.socket?.user || this.lembretesEmExecucao) return 0;
    this.lembretesEmExecucao = true;
    try {
      const pendencias = await buscarPendenciasAtrasadas(this.prisma, agora);
      if (!pendencias.length) return 0;
      const enviados = await this.prisma.lembreteAtraso.findMany({
        where: { OR: pendencias.map((p) => ({ alunoId: p.alunoId, listaId: p.listaId })) },
      });
      const jaEnviados = new Set(enviados.map((l) => `${l.alunoId}:${l.listaId}`));
      const porMonitor = new Map<string, typeof pendencias>();
      for (const p of pendencias) {
        if (jaEnviados.has(`${p.alunoId}:${p.listaId}`)) continue;
        const grupo = porMonitor.get(p.monitorId) ?? [];
        grupo.push(p);
        porMonitor.set(p.monitorId, grupo);
      }
      let total = 0;
      for (const grupo of porMonitor.values()) {
        const primeiro = grupo[0]!;
        const numero = primeiro.whatsappNumero.replace(/\D/g, "");
        if (!numero) continue;
        const itens = grupo.map((p) => `• ${p.listaNome}: ${p.alunoNome}`).join("\n");
        await this.enviar(
          this.socket,
          `${numero}@s.whatsapp.net`,
          `Olá, ${primeiro.monitorNome}. O prazo do feedback passou e ainda faltam:\n${itens}\n\nSe houve prorrogação, peça ao chefe para registrá-la no perfil do aluno.`,
        );
        await this.prisma.lembreteAtraso.createMany({
          data: grupo.map((p) => ({ alunoId: p.alunoId, listaId: p.listaId })),
          skipDuplicates: true,
        });
        total += grupo.length;
      }
      return total;
    } finally {
      this.lembretesEmExecucao = false;
    }
  }

  async conectar() {
    this.devePermanecerConectado = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    if (this.socket) return;
    this.ultimaTentativaEm = new Date();
    await mkdir(this.authDir, { recursive: true, mode: 0o700 });
    await chmod(this.authDir, 0o700);
    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
    const { version } = await fetchLatestBaileysVersion();
    await this.atualizarStatus(BotSessaoStatus.CONECTANDO);
    const socket = makeWASocket({
      auth: state,
      version,
      markOnlineOnConnect: false,
      syncFullHistory: false,
    });
    this.socket = socket;
    socket.ev.on("creds.update", saveCreds);
    socket.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
      if (qr) this.qr = qr;
      if (connection === "open") {
        this.qr = undefined;
        this.tentativasReconexao = 0;
        this.ultimaTentativaEm = undefined;
        await this.atualizarStatus(BotSessaoStatus.CONECTADO, socket.user?.id?.split(":")[0]);
        if (this.quedaEm) {
          const minutos = Math.max(1, Math.round((Date.now() - this.quedaEm.getTime()) / 60_000));
          this.quedaEm = undefined;
          void this.avisarChefes(
            `✅ O Feedbot recuperou a conexão com o WhatsApp após aproximadamente ${minutos} minuto${minutos === 1 ? "" : "s"} offline.`,
          );
        }
        void this.enviarLembretesDeAtraso().catch((error) =>
          console.error("[bot] lembretes:", error),
        );
      }
      if (connection === "close") {
        // Eventos podem chegar depois de uma reconexão. Se este já não é o socket
        // atual, ignorá-lo evita sobrescrever o estado da conexão mais nova.
        if (this.socket !== socket) return;
        this.socket = undefined;
        this.qr = undefined;
        await this.atualizarStatus(BotSessaoStatus.DESCONECTADO);
        const code = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)
          ?.output?.statusCode;
        if (code === DisconnectReason.loggedOut) {
          // O celular desvinculou o dispositivo (ou nós mesmos deslogamos) — as
          // credenciais salvas em disco ficam inválidas, mas continuam presentes. Se não
          // forem apagadas, a próxima tentativa de conectar tenta retomar essa sessão
          // morta em vez de iniciar um pareamento novo, e nunca chega a gerar QR code.
          this.devePermanecerConectado = false;
          await this.limparAuth();
        } else if (this.devePermanecerConectado) {
          this.quedaEm ??= new Date();
          this.agendarReconexao();
        }
      }
    });
    socket.ev.on("messages.upsert", ({ messages, type }) => {
      if (type !== "notify") return;
      for (const message of messages) void this.receber(socket, message);
    });
  }

  private async limparAuth() {
    await rm(this.authDir, { recursive: true, force: true });
  }

  private agendarReconexao() {
    if (!this.devePermanecerConectado || this.reconnectTimer) return;
    const atraso = Math.min(60_000, 2_000 * 2 ** Math.min(this.tentativasReconexao, 5));
    this.tentativasReconexao += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.conectar().catch((error) => {
        console.error("[bot] reconexão:", error);
        this.socket = undefined;
        this.agendarReconexao();
      });
    }, atraso);
    this.reconnectTimer.unref();
  }

  private async avisarChefes(texto: string) {
    if (!this.socket?.user) return;
    const chefes = await this.prisma.monitor.findMany({
      where: { isChefe: true, status: "ATIVO", whatsappNumero: { not: "" } },
      select: { whatsappNumero: true },
    });
    await Promise.allSettled(
      chefes.map((chefe) => {
        const numero = chefe.whatsappNumero.replace(/\D/g, "");
        return numero
          ? this.enviar(this.socket!, `${numero}@s.whatsapp.net`, texto)
          : Promise.resolve();
      }),
    );
  }

  async desconectar() {
    await this.avisarChefes(
      "⚠️ O Feedbot será desconectado manualmente agora. Será necessário conectá-lo novamente pelo painel.",
    );
    this.devePermanecerConectado = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    const socket = this.socket;
    this.socket = undefined;
    this.qr = undefined;
    this.ultimaTentativaEm = undefined;
    try {
      // Remove este aparelho também no WhatsApp. Apenas encerrar o websocket deixaria
      // o número vinculado no celular e não prepararia corretamente a troca de conta.
      await socket?.logout();
    } finally {
      await this.limparAuth();
      await this.atualizarStatus(BotSessaoStatus.DESCONECTADO);
    }
  }

  async encerrarParaReinicio() {
    await this.avisarChefes(
      "⚠️ O Feedbot ficará indisponível por alguns instantes para uma reinicialização. A conexão será restaurada automaticamente.",
    );
    this.devePermanecerConectado = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.socket?.end(undefined);
    this.socket = undefined;
    this.ultimaTentativaEm = undefined;
  }

  async comunidadesDisponiveis() {
    if (!this.socket?.user) throw new Error("Bot não está conectado");
    const snapshot = await this.socket.groupFetchAllParticipating();
    // Reconsulta cada destino para eliminar grupos apagados/abandonados que ainda
    // estejam no snapshot local da sessão do WhatsApp Web.
    const atuais = await Promise.allSettled(
      Object.keys(snapshot).map((id) => this.socket!.groupMetadata(id)),
    );
    const avisos = atuais
      .filter(
        (item): item is PromiseFulfilledResult<Awaited<ReturnType<WASocket["groupMetadata"]>>> =>
          item.status === "fulfilled",
      )
      .map((item) => item.value)
      .filter((grupo) => grupo.isCommunityAnnounce);
    return Promise.all(
      avisos.map(async (grupo) => {
        const comunidade = grupo.linkedParent
          ? await this.socket!.groupMetadata(grupo.linkedParent).catch(() => null)
          : null;
        return { id: grupo.id, nome: comunidade?.subject ?? grupo.subject };
      }),
    );
  }

  async enviarLinkDeAcesso(whatsappGrupoId: string) {
    if (!this.socket?.user) throw new Error("Bot não está conectado");
    const numero = this.socket.user.id.split(":")[0]?.replace(/\D/g, "") ?? "";
    if (!numero) throw new Error("Não foi possível identificar o número do bot");
    const link = `https://wa.me/${numero}?text=${encodeURIComponent("Registrar feedback")}`;
    await this.enviar(
      this.socket,
      whatsappGrupoId,
      `📝 *Registrar feedback*\n\nO Feedbot orienta o preenchimento passo a passo. Em cada lista, o monitor vê somente os alunos pelos quais é responsável naquela rodada de feedback.\n\nDurante o registro, o bot solicita a pontuação e verifica ocorrências de uso de IA, plágio e proibições da lista. Ao confirmar, o feedback é salvo e enviado para a planilha.\n\nToque para começar:\n${link}`,
    );
    return { link };
  }

  private async atualizarStatus(status: BotSessaoStatus, numeroConectado?: string) {
    await this.prisma.botSessao.upsert({
      where: { id: SESSION_ID },
      create: { id: SESSION_ID, status, numeroConectado },
      update: { status, numeroConectado },
    });
  }

  private async enviar(socket: WASocket, jid: string, text: string) {
    return socket.sendMessage(jid, { text });
  }

  /**
   * Um monitor pertence a no máximo uma dupla (Monitor.duplaId), que tem no máximo 2
   * monitores. O papel de cada aluno da dupla (semana A ou B) é definido por ALUNO:
   * Aluno.monitorSemanaAId escolhe qual dos 2 monitores é o da semana A; o outro é
   * implicitamente o da semana B (não armazenado). Por isso o fluxo não pode filtrar
   * "as listas do monitor" de forma fixa: primeiro descobre em quais listas ele tem
   * pelo menos um aluno elegível (para a etapa de escolher a lista); depois, já com a
   * lista escolhida, filtra os alunos elegíveis especificamente para aquela lista.
   *
   * A decisão de quais semanas um monitor cobre por aluno (incluindo o caso de dupla
   * com só 1 monitor) mora em domain/monitorSemana.ts — a mesma regra usada por
   * services/feedback.ts, pra não ter duas implementações que podem divergir.
   */
  private async alunosDoMonitor(monitorId: string) {
    const monitor = await this.prisma.monitor.findUnique({ where: { id: monitorId } });
    if (!monitor?.duplaId) return { alunos: [], outroMonitorId: null };
    const [alunos, parceiro] = await Promise.all([
      this.prisma.aluno.findMany({ where: { duplaId: monitor.duplaId }, orderBy: { nome: "asc" } }),
      this.prisma.monitor.findFirst({
        where: { duplaId: monitor.duplaId, id: { not: monitorId } },
      }),
    ]);
    return { alunos, outroMonitorId: parceiro?.id ?? null };
  }

  private async listasComSemana(periodoId: string) {
    const listas = await this.prisma.lista.findMany({
      where: { periodoId },
      orderBy: { ordem: "asc" },
    });
    return listas.map((lista, index) => ({
      lista,
      semana: calcularSemana({ posicaoLista: index + 1, semanaOverride: lista.semanaOverride }),
    }));
  }

  private async listasPermitidas(monitorId: string, periodoId: string) {
    const [{ alunos, outroMonitorId }, listasComSemana] = await Promise.all([
      this.alunosDoMonitor(monitorId),
      this.listasComSemana(periodoId),
    ]);
    const papeisPossiveis = new Set<"A" | "B">();
    for (const aluno of alunos)
      for (const semana of semanasCobertasPorMonitor({ ...aluno, outroMonitorId }, monitorId))
        papeisPossiveis.add(semana);
    return listasComSemana
      .filter(({ semana }) => papeisPossiveis.has(semana))
      .map(({ lista }) => lista);
  }

  private async alunosElegiveis(monitorId: string, listaId: string, periodoId: string) {
    const [{ alunos, outroMonitorId }, listasComSemana] = await Promise.all([
      this.alunosDoMonitor(monitorId),
      this.listasComSemana(periodoId),
    ]);
    const semanaLista = listasComSemana.find(({ lista }) => lista.id === listaId)?.semana;
    if (!semanaLista) return [];
    return alunos.filter((aluno) =>
      semanasCobertasPorMonitor({ ...aluno, outroMonitorId }, monitorId).has(semanaLista),
    );
  }

  private async iniciarConversa(
    socket: WASocket,
    jidPrivado: string,
    chave: string,
    monitor: { id: string; nome: string; periodoId: string },
  ) {
    const conversa: Conversa = {
      monitorId: monitor.id,
      periodoId: monitor.periodoId,
      etapa: "lista",
      ia: [],
      plagio: [],
      proibicao: [],
    };
    this.conversas.set(chave, conversa);
    const listas = await this.listasPermitidas(monitor.id, monitor.periodoId);
    if (!listas.length)
      return this.enviar(
        socket,
        jidPrivado,
        `Olá, ${monitor.nome}. No momento nenhuma lista está sob sua responsabilidade.`,
      );
    return this.enviar(
      socket,
      jidPrivado,
      comOpcaoDeSaida(
        `Olá, ${monitor.nome}. Vamos continuar em privado. Qual lista você vai registrar?\n${listas.map((item, index) => `${index + 1}. ${item.nome}`).join("\n")}`,
      ),
    );
  }

  private async receber(socket: WASocket, message: WAMessage) {
    const jid = message.key.remoteJid;
    if (!jid || jid.endsWith("@g.us") || message.key.fromMe) return;
    const textoOriginal = textoDaMensagem(message.message);
    const texto = textoOriginal.toLowerCase();
    if (!texto) return;
    // WhatsApp pode endereçar a conversa por "LID" (identificador de privacidade) em vez
    // do número de telefone; nesse caso o número real vem em remoteJidAlt. As respostas
    // continuam indo para `jid` (o remoteJid original) — só a identificação do monitor
    // usa o número de telefone resolvido.
    const jidTelefone = jid.endsWith("@lid") ? (message.key.remoteJidAlt ?? jid) : jid;
    const chave = numeroDoJid(jidTelefone);
    const conversa = this.conversas.get(chave);
    if (comandoEncerraFluxo(textoOriginal)) {
      this.conversas.delete(chave);
      return this.enviar(
        socket,
        jid,
        "Fluxo encerrado. Nenhuma informação foi gravada. Envie Registrar feedback quando quiser começar novamente.",
      );
    }
    if (!conversa || comandoIniciaFluxo(textoOriginal)) {
      const monitores = await this.prisma.monitor.findMany({
        where: { whatsappNumero: { not: "" }, status: "ATIVO" },
      });
      const monitor = monitores.find((item) =>
        variantesWhatsapp(item.whatsappNumero).includes(chave),
      );
      if (!monitor) {
        console.log(
          `[bot] remetente não reconhecido — jid=${jid} chave=${chave} (nenhum de ${monitores.length} monitor(es) ativo(s) bateu)`,
        );
        return this.enviar(
          socket,
          jid,
          "Seu número não está cadastrado em uma dupla ativa. Procure um chefe de monitoria.",
        );
      }
      return this.iniciarConversa(socket, jid, chave, monitor);
    }
    const responder = (text: string) => this.enviar(socket, jid, comOpcaoDeSaida(text));
    if (conversa.etapa === "lista") {
      const listas = await this.listasPermitidas(conversa.monitorId, conversa.periodoId);
      const lista = listas[Number(texto) - 1];
      if (!lista) return responder("Escolha o número de uma lista válida.");
      conversa.listaId = lista.id;
      conversa.etapa = "aluno";
      const alunos = await this.alunosElegiveis(conversa.monitorId, lista.id, conversa.periodoId);
      return responder(
        `Qual aluno?\n${alunos.map((item, index) => `${index + 1}. ${item.nome}`).join("\n")}`,
      );
    }
    if (conversa.etapa === "aluno") {
      const alunos = await this.alunosElegiveis(
        conversa.monitorId,
        conversa.listaId!,
        conversa.periodoId,
      );
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
      conversa.etapa = "cursoEnvolvido";
      const turmas = await this.prisma.turma.findMany({
        where: { periodoId: conversa.periodoId },
        orderBy: { nome: "asc" },
      });
      return responder(
        `Qual o curso da pessoa envolvida?\n${turmas.map((item, index) => `${index + 1}. ${item.nome}`).join("\n")}`,
      );
    }
    if (conversa.etapa === "cursoEnvolvido") {
      const turmas = await this.prisma.turma.findMany({
        where: { periodoId: conversa.periodoId },
        orderBy: { nome: "asc" },
      });
      const turma = turmas[Number(texto) - 1];
      if (!turma) return responder("Escolha o número de um curso válido.");
      const alunos = await this.prisma.aluno.findMany({
        where: { turmaId: turma.id, id: { not: conversa.alunoId } },
        orderBy: { nome: "asc" },
        take: 30,
      });
      if (!alunos.length)
        return responder(
          `Nenhum outro aluno encontrado no curso ${turma.nome}. Escolha outro curso:\n${turmas.map((item, index) => `${index + 1}. ${item.nome}`).join("\n")}`,
        );
      conversa.turmaEnvolvidoId = turma.id;
      conversa.etapa = "envolvido";
      return responder(
        `Com quem?\n${alunos.map((item, index) => `${index + 1}. ${item.nome} (${item.matricula})`).join("\n")}`,
      );
    }
    if (conversa.etapa === "envolvido") {
      const alunos = await this.prisma.aluno.findMany({
        where: { turmaId: conversa.turmaEnvolvidoId, id: { not: conversa.alunoId } },
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
        texto === "sim" ? "Em quais questões? Ex.: 1, 5" : "Envie CONFIRMAR para gravar.",
      );
    }
    if (conversa.etapa === "questoesProibicao") {
      conversa.proibicao = questoes(texto);
      conversa.etapa = "confirmar";
      return responder("Envie CONFIRMAR para gravar.");
    }
    if (conversa.etapa === "confirmar") {
      if (texto !== "confirmar") return responder("Envie CONFIRMAR para gravar.");
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
        return this.enviar(
          socket,
          jid,
          "Registrado ✅ A sincronização com a planilha será processada automaticamente. Envie Registrar feedback para iniciar outro registro.",
        );
      } catch (error) {
        return responder(
          `Não foi possível registrar: ${error instanceof Error ? error.message : "dados inválidos"}. Envie Registrar feedback para tentar novamente.`,
        );
      }
    }
  }
}
