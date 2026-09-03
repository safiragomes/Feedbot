import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  ModalBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Interaction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";

type InteracaoEditavel = ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction;
import type { PrismaClient } from "../generated/prisma/client.js";
import { BotSessaoStatus } from "../generated/prisma/enums.js";
import { identificacaoPublicaAluno } from "../domain/identificacao-aluno.js";
import { validarQuestoesInformadas } from "../domain/comandos-bot.js";
import {
  alunosElegiveis,
  listasPermitidas,
} from "../application/feedback-flow/consultas.js";
import {
  listarMembrosComPapel,
  monitorPorDiscordUserId,
  type MembroDiscord,
} from "../application/discord/membros.js";
import { criarFeedback } from "./feedback.js";
import { GoogleSheetsSync } from "./google-sheets.js";
import { SmtpEmailSender, type EmailSender } from "./email.js";

const SESSION_ID = "feedbot";
const PAGE_SIZE = 25;
// Fluxos abandonados (ephemeral fechada sem SAIR/CANCELAR) nunca recebem um evento
// explícito de encerramento — sem isso a Map de conversas cresceria sem limite.
const CONVERSA_TTL_MS = 15 * 60_000;
const AVISO_QUEDA_ATRASO_MS = 5 * 60_000;
// guild.members.fetch() dispara o opcode 8 (Request Guild Members) do Gateway, que o
// Discord limita à parte — abrir o seletor de monitores repetidas vezes em pouco tempo
// (ex.: clicando em várias linhas do diretório) já estourou esse limite na prática
// ("Request with opcode 8 was rate limited"). Um cache curto evita refazer a busca a
// cada abertura, sem deixar a lista perceptivelmente desatualizada pra esse uso.
const MEMBROS_CACHE_MS = 60_000;

type Etapa =
  | "lista"
  | "aluno"
  | "pontuacao"
  | "ia"
  | "questoesIa"
  | "plagio"
  | "questoesPlagio"
  | "plagioMesmaPessoa"
  | "cursoEnvolvido"
  | "envolvido"
  | "proibicao"
  | "questoesProibicao"
  | "confirmar";

type Conversa = {
  monitorId: string;
  monitorNome: string;
  periodoId: string;
  etapa: Etapa;
  listaId?: string;
  totalQuestoes?: number;
  alunoId?: string;
  pontuacao?: number;
  // Aluno não entregou/respondeu a lista — distinto de ter respondido e acertado 0.
  // Quando true, pula IA/plágio/proibição direto pra confirmação (não fazem sentido
  // pra uma lista não entregue) e a planilha grava "F" em vez de um número.
  faltou: boolean;
  ia: number[];
  plagio: number[];
  // Um envolvido é coletado por questão de plágio, não um único envolvido pra
  // conversa inteira (correção do comportamento antigo do bot de WhatsApp, que
  // atribuía todas as questões marcadas ao mesmo aluno). Mas quando há mais de uma
  // questão, primeiro perguntamos se foi a mesma pessoa em todas — evitando repetir
  // curso+aluno várias vezes no caso comum de um único envolvido em várias questões.
  mesmaPessoaPlagio: boolean;
  // Índice em `plagio` sendo perguntado agora (só avança de fato quando
  // mesmaPessoaPlagio é false).
  indicePlagioAtual: number;
  envolvidos: Record<number, string>;
  turmaEnvolvidoId?: string;
  proibicao: number[];
  paginaAluno: number;
  paginaEnvolvido: number;
  atualizadoEm: number;
};

export interface BotLogger {
  info(contexto: Record<string, unknown>, mensagem: string): void;
  warn(contexto: Record<string, unknown>, mensagem: string): void;
  error(contexto: Record<string, unknown>, mensagem: string): void;
}

const consoleLogger: BotLogger = {
  info: (contexto, mensagem) => console.info(mensagem, contexto),
  warn: (contexto, mensagem) => console.warn(mensagem, contexto),
  error: (contexto, mensagem) => console.error(mensagem, contexto),
};

export class DiscordBot {
  private readonly client: Client;
  private conversas = new Map<string, Conversa>();
  private limpezaTimer?: NodeJS.Timeout;
  private watchdogTimer?: NodeJS.Timeout;
  private quedaDesde?: Date;
  private avisoQuedaEnviado = false;
  private cacheMembros = new Map<string, { expiraEm: number; dados: MembroDiscord[] }>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly token = process.env["DISCORD_BOT_TOKEN"],
    private readonly sheets = new GoogleSheetsSync(),
    private readonly emailSender: EmailSender = new SmtpEmailSender(),
    private readonly logger: BotLogger = consoleLogger,
  ) {
    this.client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    });
  }

  async iniciar() {
    await this.prisma.botSessao.updateMany({
      where: { status: { in: [BotSessaoStatus.CONECTADO, BotSessaoStatus.CONECTANDO] } },
      data: { status: BotSessaoStatus.DESCONECTADO },
    });
    if (!this.token) {
      this.logger.warn({}, "DISCORD_BOT_TOKEN ausente — bot do Discord não iniciado");
      return false;
    }
    // Cada período usa um servidor do Discord próprio (criado do zero a cada semestre),
    // então o bot precisa registrar o /feedback em todo servidor em que está presente —
    // tanto os já conhecidos ao ficar pronto quanto qualquer um novo em que for
    // convidado depois (ex.: no início de um período novo).
    this.client.once(Events.ClientReady, () => {
      void this.registrarComandosEmTodosOsServidores();
    });
    this.client.on(Events.GuildCreate, (guild) => {
      void this.registrarComandos(guild.id).catch((error) =>
        this.logger.error({ err: error, guildId: guild.id }, "falha ao registrar comandos do bot"),
      );
    });
    this.client.on(Events.Error, (error) =>
      this.logger.error({ err: error }, "erro no client do Discord"),
    );
    this.client.on(Events.InteractionCreate, (interaction) => {
      void this.tratarInteracao(interaction);
    });
    this.limpezaTimer = setInterval(() => this.limparConversasExpiradas(), 60_000);
    this.limpezaTimer.unref();
    // Watchdog de conexão: checagem periódica (não depende de qual evento exato o
    // discord.js dispara em cada tipo de queda/retomada, o que já causou um bug real
    // aqui — Events.ClientReady só dispara uma vez na vida do processo, então usá-lo
    // pra detectar reconexão deixava de avisar depois da primeira queda). Garante no
    // máximo um e-mail de queda e um de recuperação por episódio de instabilidade,
    // independente de quantas vezes a conexão oscilar por baixo dos panos.
    this.watchdogTimer = setInterval(() => void this.verificarConexao(), 60_000);
    this.watchdogTimer.unref();
    await this.atualizarStatus(BotSessaoStatus.CONECTANDO);
    await this.client.login(this.token);
    return true;
  }

  private async verificarConexao() {
    if (this.client.isReady()) {
      await this.atualizarStatus(BotSessaoStatus.CONECTADO);
      if (!this.avisoQuedaEnviado) {
        this.quedaDesde = undefined;
        return;
      }
      const minutos = this.quedaDesde
        ? Math.max(1, Math.round((Date.now() - this.quedaDesde.getTime()) / 60_000))
        : undefined;
      this.avisoQuedaEnviado = false;
      this.quedaDesde = undefined;
      await this.avisarChefesPorEmail(
        "✅ Feedbot reconectado ao Discord",
        minutos
          ? `O Feedbot recuperou a conexão com o Discord após aproximadamente ${minutos} minuto${minutos === 1 ? "" : "s"} offline.`
          : "O Feedbot recuperou a conexão com o Discord.",
      ).catch((error) =>
        this.logger.error({ err: error }, "falha ao enviar aviso de reconexão do bot"),
      );
      return;
    }
    await this.atualizarStatus(BotSessaoStatus.DESCONECTADO);
    this.quedaDesde ??= new Date();
    const msParado = Date.now() - this.quedaDesde.getTime();
    if (!this.avisoQuedaEnviado && msParado >= AVISO_QUEDA_ATRASO_MS) {
      this.avisoQuedaEnviado = true;
      await this.avisarChefesPorEmail(
        "⚠️ Feedbot desconectado do Discord",
        "O Feedbot perdeu a conexão com o Discord e não conseguiu se reconectar sozinho até agora.",
      ).catch((error) =>
        this.logger.error({ err: error }, "falha ao enviar aviso de queda do bot"),
      );
    }
  }

  async status() {
    return this.prisma.botSessao.findUnique({ where: { id: SESSION_ID } });
  }

  async encerrarParaReinicio() {
    if (this.limpezaTimer) clearInterval(this.limpezaTimer);
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    await this.client.destroy();
  }

  private limparConversasExpiradas() {
    const agora = Date.now();
    for (const [chave, conversa] of this.conversas) {
      if (agora - conversa.atualizadoEm > CONVERSA_TTL_MS) this.conversas.delete(chave);
    }
  }

  private async avisarChefesPorEmail(assunto: string, mensagem: string) {
    const chefes = await this.prisma.monitor.findMany({
      where: { isChefe: true, status: "ATIVO", contaChefe: { isNot: null } },
      select: { nome: true, contaChefe: { select: { email: true } } },
    });
    await Promise.allSettled(
      chefes.map((chefe) =>
        this.emailSender.enviarAvisoBot({
          destinatario: chefe.contaChefe!.email,
          nome: chefe.nome,
          assunto,
          mensagem,
        }),
      ),
    );
  }

  private async atualizarStatus(status: BotSessaoStatus) {
    const discordBotTag = this.client.user?.tag;
    const total = this.client.guilds.cache.size;
    const guildNome = total ? `${total} servidor${total === 1 ? "" : "es"} conectado${total === 1 ? "" : "s"}` : undefined;
    await this.prisma.botSessao.upsert({
      where: { id: SESSION_ID },
      create: { id: SESSION_ID, status, discordBotTag, guildNome },
      update: { status, discordBotTag, guildNome },
    });
  }

  private async registrarComandosEmTodosOsServidores() {
    await Promise.all(
      [...this.client.guilds.cache.keys()].map((guildId) =>
        this.registrarComandos(guildId).catch((error) =>
          this.logger.error({ err: error, guildId }, "falha ao registrar comandos do bot"),
        ),
      ),
    );
  }

  private async registrarComandos(guildId: string) {
    if (!this.client.user || !this.token) return;
    const comando = new SlashCommandBuilder()
      .setName("feedback")
      .setDescription("Registrar o feedback de um aluno");
    const rest = new REST().setToken(this.token);
    await rest.put(Routes.applicationGuildCommands(this.client.user.id, guildId), {
      body: [comando.toJSON()],
    });
  }

  /** Lista, ao vivo, os servidores em que o bot está presente atualmente. */
  guildsDisponiveis() {
    return [...this.client.guilds.cache.values()]
      .map((guild) => ({ id: guild.id, nome: guild.name }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }

  /** Lista, ao vivo, os cargos de um servidor (pra escolher qual é o de "Monitores"). */
  async rolesDisponiveis(guildId: string) {
    const guild = await this.client.guilds.fetch(guildId);
    const cargos = await guild.roles.fetch();
    return [...cargos.values()]
      // O cargo "@everyone" tem o mesmo id do servidor e nunca é o que a chefe quer
      // escolher aqui; cargos "managed" pertencem a integrações/bots, não a pessoas.
      .filter((cargo) => cargo.id !== guildId && !cargo.managed)
      .map((cargo) => ({ id: cargo.id, nome: cargo.name }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }

  /**
   * Lista os membros de um servidor com o cargo de monitores informado. Cacheada por
   * um curto período — ver MEMBROS_CACHE_MS — porque a busca ao vivo (guild.members.fetch)
   * usa o Gateway e o Discord já rate-limitou essa chamada quando o seletor de
   * monitores era aberto repetidas vezes em pouco tempo.
   */
  async membrosComPapelMonitores(guildId: string, roleId: string) {
    const chave = `${guildId}:${roleId}`;
    const cache = this.cacheMembros.get(chave);
    if (cache && cache.expiraEm > Date.now()) return cache.dados;
    const guild = await this.client.guilds.fetch(guildId);
    const dados = await listarMembrosComPapel(guild, roleId);
    this.cacheMembros.set(chave, { expiraEm: Date.now() + MEMBROS_CACHE_MS, dados });
    return dados;
  }

  /** Lista, ao vivo, os canais de texto de um servidor onde o bot pode publicar o painel. */
  async canaisDisponiveis(guildId: string) {
    const guild = await this.client.guilds.fetch(guildId);
    const canais = await guild.channels.fetch();
    return canais
      .filter((canal): canal is NonNullable<typeof canal> & { name: string } =>
        Boolean(canal?.isTextBased() && !canal.isThread()),
      )
      .map((canal) => ({ id: canal.id, nome: canal.name }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }

  /** Publica o painel de entrada do fluxo de feedback num canal do servidor. */
  async enviarPainelRegistro(canalId: string) {
    const canal = await this.client.channels.fetch(canalId);
    if (!canal?.isTextBased() || !("send" in canal)) throw new Error("Canal inválido");
    const embed = new EmbedBuilder()
      .setTitle("📝 Registrar feedback")
      .setDescription(
        "O Feedbot orienta o preenchimento passo a passo. Em cada lista, você vê somente os alunos pelos quais é responsável naquela rodada.\n\nDurante o registro, o bot pergunta a pontuação e verifica ocorrências de uso de IA, plágio e proibições da lista. Ao confirmar, o feedback é salvo e enviado para a planilha.",
      )
      .setColor(0x20b8c4);
    const botao = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("feedback:start")
        .setLabel("Registrar feedback")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("📝"),
    );
    await canal.send({ embeds: [embed], components: [botao] });
  }

  private async tratarInteracao(interaction: Interaction) {
    try {
      if (interaction.isChatInputCommand() && interaction.commandName === "feedback") {
        return await this.iniciarFluxo(interaction);
      }
      if (interaction.isButton() && interaction.customId === "feedback:start") {
        return await this.iniciarFluxo(interaction);
      }
      if (interaction.isButton()) return await this.tratarBotao(interaction);
      if (interaction.isStringSelectMenu()) return await this.tratarSelect(interaction);
      if (interaction.isModalSubmit()) return await this.tratarModal(interaction);
    } catch (error) {
      this.logger.error({ err: error }, "falha ao tratar interação do bot");
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction
          .reply({ content: "Ocorreu um erro inesperado. Tente novamente.", ephemeral: true })
          .catch(() => {});
      }
    }
  }

  private async iniciarFluxo(interaction: ChatInputCommandInteraction | ButtonInteraction) {
    await interaction.deferReply({ ephemeral: true });
    const monitor = await monitorPorDiscordUserId(this.prisma, interaction.user.id);
    if (!monitor || monitor.status !== "ATIVO") {
      await interaction.editReply(
        "Sua conta do Discord não está vinculada a um monitor ativo. Procure um chefe de monitoria.",
      );
      return;
    }
    // O /feedback só funciona no canal que a chefe vinculou como canal de registro do
    // período (tela Bot do painel) — evita que o comando seja usado em qualquer canal
    // do servidor, já que o slash command em si é registrado no guild inteiro.
    const periodo = await this.prisma.periodo.findUnique({ where: { id: monitor.periodoId } });
    if (!periodo?.discordAvisosCanalId) {
      await interaction.editReply(
        "O canal de registro de feedback ainda não foi configurado. Peça a um chefe para vincular um canal na tela Bot do painel.",
      );
      return;
    }
    if (interaction.channelId !== periodo.discordAvisosCanalId) {
      await interaction.editReply(
        `Use o comando /feedback no canal <#${periodo.discordAvisosCanalId}>.`,
      );
      return;
    }
    const listas = await listasPermitidas(this.prisma, monitor.id, monitor.periodoId);
    if (!listas.length) {
      await interaction.editReply(
        `Olá, ${monitor.nome}. No momento nenhuma lista está sob sua responsabilidade.`,
      );
      return;
    }
    const conversa: Conversa = {
      monitorId: monitor.id,
      monitorNome: monitor.nome,
      periodoId: monitor.periodoId,
      etapa: "lista",
      faltou: false,
      ia: [],
      plagio: [],
      mesmaPessoaPlagio: false,
      indicePlagioAtual: 0,
      envolvidos: {},
      proibicao: [],
      paginaAluno: 0,
      paginaEnvolvido: 0,
      atualizadoEm: Date.now(),
    };
    this.conversas.set(interaction.user.id, conversa);
    const select = new StringSelectMenuBuilder()
      .setCustomId("fb:select")
      .setPlaceholder("Escolha a lista")
      .addOptions(listas.slice(0, PAGE_SIZE).map((lista) => ({ label: lista.nome, value: lista.id })));
    await interaction.editReply({
      content: `Olá, ${monitor.nome}. Vamos continuar por aqui. Qual lista você vai registrar?`,
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
    });
  }

  private conversaAtiva(userId: string) {
    const conversa = this.conversas.get(userId);
    if (conversa) conversa.atualizadoEm = Date.now();
    return conversa;
  }

  /**
   * Confirma o recebimento da interação só quando necessário (antes de uma consulta
   * ao banco). Passos que não dependem de dados (sim/não, seleção de questões, etc.)
   * respondem direto via `responder()`, num único round-trip ao Discord em vez de
   * dois (deferUpdate + editReply) — é a diferença perceptível de velocidade entre
   * um clique "instantâneo" e um com um respiro de carregamento.
   */
  private async garantirDefer(interaction: InteracaoEditavel) {
    if (interaction.deferred || interaction.replied) return;
    if ("deferUpdate" in interaction) await interaction.deferUpdate();
  }

  private async responder(
    interaction: InteracaoEditavel,
    payload: Parameters<ButtonInteraction["editReply"]>[0],
  ) {
    if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
    return (interaction as ButtonInteraction | StringSelectMenuInteraction).update(payload);
  }

  /**
   * Encerra a conversa com uma mensagem genérica quando um valor de select não bate
   * com nenhuma opção realmente elegível pro contexto atual (ver comentários nos
   * pontos de chamada). Assume que a interação já foi confirmada (garantirDefer).
   */
  private async rejeitarSelecaoInvalida(interaction: InteracaoEditavel) {
    this.conversas.delete(interaction.user.id);
    await interaction.editReply({
      content: "Opção inválida. Use /feedback para começar novamente.",
      embeds: [],
      components: [],
    });
  }

  private botaoSimNao(prefixo: "sim" | "nao", label: string, style: ButtonStyle) {
    return new ButtonBuilder().setCustomId(`fb:${prefixo}`).setLabel(label).setStyle(style);
  }

  private linhaSimNao() {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      this.botaoSimNao("sim", "Sim", ButtonStyle.Success),
      this.botaoSimNao("nao", "Não", ButtonStyle.Secondary),
    );
  }

  private linhaPaginacao(pagina: number, totalPaginas: number) {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("fb:pag:prev")
        .setLabel("◀ Anterior")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(pagina <= 0),
      new ButtonBuilder()
        .setCustomId("fb:pag:next")
        .setLabel("Próximo ▶")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(pagina >= totalPaginas - 1),
    );
  }

  private paginar<T>(itens: T[], pagina: number) {
    const totalPaginas = Math.max(1, Math.ceil(itens.length / PAGE_SIZE));
    const paginaValida = Math.min(Math.max(pagina, 0), totalPaginas - 1);
    return { itens: itens.slice(paginaValida * PAGE_SIZE, paginaValida * PAGE_SIZE + PAGE_SIZE), pagina: paginaValida, totalPaginas };
  }

  private async listaAlunoStep(
    interaction: InteracaoEditavel,
    conversa: Conversa,
  ) {
    await this.garantirDefer(interaction);
    const alunos = await alunosElegiveis(this.prisma, conversa.monitorId, conversa.listaId!, conversa.periodoId);
    const { itens, pagina, totalPaginas } = this.paginar(alunos, conversa.paginaAluno);
    conversa.paginaAluno = pagina;
    const select = new StringSelectMenuBuilder()
      .setCustomId("fb:select")
      .setPlaceholder("Escolha o aluno")
      .addOptions(itens.map((item) => ({ label: identificacaoPublicaAluno(item), value: item.id })));
    const componentes: (ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>)[] = [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
    ];
    if (totalPaginas > 1) componentes.push(this.linhaPaginacao(pagina, totalPaginas));
    await interaction.editReply({
      content: `Qual aluno? (página ${pagina + 1}/${totalPaginas})`,
      components: componentes,
    });
  }

  private descricaoQuestoesPlagio(conversa: Conversa) {
    return conversa.mesmaPessoaPlagio
      ? `nas questões ${conversa.plagio.join(", ")}`
      : `na questão ${conversa.plagio[conversa.indicePlagioAtual]}`;
  }

  private async listaEnvolvidoStep(interaction: InteracaoEditavel, conversa: Conversa) {
    await this.garantirDefer(interaction);
    const alunos = await this.prisma.aluno.findMany({
      where: { turmaId: conversa.turmaEnvolvidoId, id: { not: conversa.alunoId } },
      orderBy: { nome: "asc" },
    });
    const { itens, pagina, totalPaginas } = this.paginar(alunos, conversa.paginaEnvolvido);
    conversa.paginaEnvolvido = pagina;
    const select = new StringSelectMenuBuilder()
      .setCustomId("fb:select")
      .setPlaceholder("Escolha o aluno envolvido")
      .addOptions(itens.map((item) => ({ label: item.nome, value: item.id })));
    const componentes: (ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>)[] = [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
    ];
    if (totalPaginas > 1) componentes.push(this.linhaPaginacao(pagina, totalPaginas));
    await interaction.editReply({
      content: `Plágio ${this.descricaoQuestoesPlagio(conversa)}: com quem? (página ${pagina + 1}/${totalPaginas})`,
      components: componentes,
    });
  }

  private async pedirCursoEnvolvido(interaction: InteracaoEditavel, conversa: Conversa) {
    await this.garantirDefer(interaction);
    const turmas = await this.prisma.turma.findMany({
      where: { periodoId: conversa.periodoId },
      orderBy: { nome: "asc" },
    });
    const select = new StringSelectMenuBuilder()
      .setCustomId("fb:select")
      .setPlaceholder("Escolha o curso")
      .addOptions(turmas.map((turma) => ({ label: turma.nome, value: turma.id })));
    conversa.etapa = "cursoEnvolvido";
    await interaction.editReply({
      content: `Plágio ${this.descricaoQuestoesPlagio(conversa)}: qual o curso da pessoa envolvida?`,
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
    });
  }

  private async pedirMesmaPessoaPlagio(interaction: InteracaoEditavel, conversa: Conversa) {
    conversa.etapa = "plagioMesmaPessoa";
    await this.responder(interaction, {
      content: `Plágio nas questões ${conversa.plagio.join(", ")}: foi a mesma pessoa envolvida em todas?`,
      components: [this.linhaSimNao()],
    });
  }

  private async pedirQuestoes(
    interaction: InteracaoEditavel,
    conversa: Conversa,
    etapa: "questoesIa" | "questoesPlagio" | "questoesProibicao",
    pergunta: string,
  ) {
    conversa.etapa = etapa;
    const total = conversa.totalQuestoes ?? 0;
    if (total > 0 && total <= PAGE_SIZE) {
      const select = new StringSelectMenuBuilder()
        .setCustomId("fb:select")
        .setPlaceholder("Escolha as questões")
        .setMinValues(1)
        .setMaxValues(total)
        .addOptions(
          Array.from({ length: total }, (_, index) => ({
            label: `Questão ${index + 1}`,
            value: String(index + 1),
          })),
        );
      await this.responder(interaction, {
        content: pergunta,
        components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
      });
      return;
    }
    const botao = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("fb:modal").setLabel("Informar questões").setStyle(ButtonStyle.Primary),
    );
    await this.responder(interaction, {
      content: `${pergunta} A lista tem mais de ${PAGE_SIZE} questões — toque no botão para digitar os números.`,
      components: [botao],
    });
  }

  private async pedirPontuacao(interaction: InteracaoEditavel, conversa: Conversa) {
    conversa.etapa = "pontuacao";
    const total = conversa.totalQuestoes ?? 0;
    // Reserva uma opção pra "F" (aluno não entregou/respondeu) além das 0..total.
    if (total >= 0 && total <= PAGE_SIZE - 2) {
      const select = new StringSelectMenuBuilder()
        .setCustomId("fb:select")
        .setPlaceholder("Quantas questões corretas?")
        .addOptions([
          { label: "F — aluno não entregou/respondeu", value: "F" },
          ...Array.from({ length: total + 1 }, (_, valor) => ({
            label: String(valor),
            value: String(valor),
          })),
        ]);
      await this.responder(interaction, {
        content: "Quantas questões corretas? Se o aluno não entregou/respondeu a lista, escolha F.",
        components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
      });
      return;
    }
    const botao = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("fb:modal").setLabel("Informar pontuação").setStyle(ButtonStyle.Primary),
    );
    await this.responder(interaction, {
      content:
        "Quantas questões corretas? Toque no botão para digitar o número (ou F se o aluno não entregou/respondeu).",
      components: [botao],
    });
  }

  private async pedirIa(interaction: InteracaoEditavel, conversa: Conversa) {
    conversa.etapa = "ia";
    await this.responder(interaction, { content: "Usou IA?", components: [this.linhaSimNao()] });
  }

  private async pedirPlagio(interaction: InteracaoEditavel, conversa: Conversa) {
    conversa.etapa = "plagio";
    await this.responder(interaction, { content: "Houve plágio?", components: [this.linhaSimNao()] });
  }

  private async pedirProibicao(interaction: InteracaoEditavel, conversa: Conversa) {
    conversa.etapa = "proibicao";
    await this.responder(interaction, {
      content: "Usou alguma proibição da lista?",
      components: [this.linhaSimNao()],
    });
  }

  private async mostrarResumo(interaction: InteracaoEditavel, conversa: Conversa) {
    await this.garantirDefer(interaction);
    conversa.etapa = "confirmar";
    const [lista, aluno] = await Promise.all([
      this.prisma.lista.findUnique({ where: { id: conversa.listaId! } }),
      this.prisma.aluno.findUnique({ where: { id: conversa.alunoId! }, include: { turma: true } }),
    ]);
    const envolvidosIds = [...new Set(Object.values(conversa.envolvidos))];
    const envolvidos = envolvidosIds.length
      ? await this.prisma.aluno.findMany({ where: { id: { in: envolvidosIds } } })
      : [];
    const nomeEnvolvido = (alunoId: string | undefined) =>
      envolvidos.find((item) => item.id === alunoId)?.nome ?? alunoId ?? "—";
    const embed = new EmbedBuilder()
      .setTitle("Confirmar feedback")
      .setColor(0x20b8c4)
      .addFields(
        { name: "Lista", value: lista?.nome ?? "—", inline: true },
        { name: "Aluno", value: aluno ? identificacaoPublicaAluno(aluno) : "—", inline: true },
        {
          name: "Questões corretas",
          value: conversa.faltou ? "F — não entregou/respondeu" : String(conversa.pontuacao ?? 0),
          inline: true,
        },
        ...(conversa.faltou
          ? []
          : [
              {
                name: "Usou IA",
                value: conversa.ia.length ? `Sim (questões ${conversa.ia.join(", ")})` : "Não",
              },
              {
                name: "Plágio",
                value: !conversa.plagio.length
                  ? "Não"
                  : conversa.mesmaPessoaPlagio
                    ? `Sim — questões ${conversa.plagio.join(", ")}, envolvido: ${nomeEnvolvido(conversa.envolvidos[conversa.plagio[0]!])}`
                    : conversa.plagio
                        .map(
                          (numeroQuestao) =>
                            `Questão ${numeroQuestao}: ${nomeEnvolvido(conversa.envolvidos[numeroQuestao])}`,
                        )
                        .join("\n"),
              },
              {
                name: "Proibições",
                value: conversa.proibicao.length ? `Sim (questões ${conversa.proibicao.join(", ")})` : "Não",
              },
            ]),
      );
    const botoes = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("fb:confirmar").setLabel("Confirmar").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("fb:cancelar").setLabel("Cancelar").setStyle(ButtonStyle.Danger),
    );
    await interaction.editReply({ content: "", embeds: [embed], components: [botoes] });
  }

  private async gravarFeedback(interaction: ButtonInteraction, conversa: Conversa, userId: string) {
    await this.garantirDefer(interaction);
    try {
      const feedback = await criarFeedback(this.prisma, {
        alunoId: conversa.alunoId!,
        monitorId: conversa.monitorId,
        listaId: conversa.listaId!,
        qtdQuestoesPontuadas: conversa.pontuacao!,
        faltou: conversa.faltou,
        questoesIa: conversa.ia,
        questoesPlagio: conversa.plagio.map((numeroQuestao) => ({
          numeroQuestao,
          alunoEnvolvidoId: conversa.envolvidos[numeroQuestao]!,
        })),
        questoesProibicao: conversa.proibicao,
      });
      let mensagemPlanilha: string;
      try {
        await this.sheets.sincronizarFeedback(this.prisma, feedback.id);
        mensagemPlanilha = "Questões corretas enviadas para a planilha ✅";
      } catch (error) {
        mensagemPlanilha = `Feedback salvo, mas a planilha não foi atualizada: ${
          error instanceof Error ? error.message : "falha desconhecida"
        }.`;
      }
      this.conversas.delete(userId);
      await interaction.editReply({
        content: `Feedback salvo ✅ ${mensagemPlanilha} Use /feedback para iniciar outro registro ou corrigir um envio.`,
        embeds: [],
        components: [],
      });
    } catch (error) {
      await interaction.editReply({
        content: `Não foi possível registrar: ${
          error instanceof Error ? error.message : "dados inválidos"
        }. Use /feedback para tentar novamente.`,
        embeds: [],
        components: [],
      });
    }
  }

  private async tratarBotao(interaction: ButtonInteraction) {
    const conversa = this.conversaAtiva(interaction.user.id);
    if (!conversa) {
      await interaction.reply({
        content: "Sessão expirada. Use /feedback para começar novamente.",
        ephemeral: true,
      });
      return;
    }
    if (interaction.customId === "fb:modal") return this.abrirModal(interaction, conversa);

    if (interaction.customId === "fb:pag:prev" || interaction.customId === "fb:pag:next") {
      const delta = interaction.customId === "fb:pag:next" ? 1 : -1;
      if (conversa.etapa === "aluno") conversa.paginaAluno += delta;
      if (conversa.etapa === "envolvido") conversa.paginaEnvolvido += delta;
      if (conversa.etapa === "aluno") return this.listaAlunoStep(interaction, conversa);
      if (conversa.etapa === "envolvido") return this.listaEnvolvidoStep(interaction, conversa);
      // Etapa não bate com o esperado (mensagem obsoleta de um fluxo reiniciado) —
      // confirma o recebimento pra não deixar a interação sem resposta nenhuma.
      return this.garantirDefer(interaction);
    }
    if (interaction.customId === "fb:confirmar" && conversa.etapa === "confirmar") {
      return this.gravarFeedback(interaction, conversa, interaction.user.id);
    }
    if (interaction.customId === "fb:cancelar" && conversa.etapa === "confirmar") {
      this.conversas.delete(interaction.user.id);
      await this.responder(interaction, {
        content: "Fluxo encerrado. Nenhuma informação foi gravada. Use /feedback para começar novamente.",
        embeds: [],
        components: [],
      });
      return;
    }
    if (interaction.customId === "fb:sim" || interaction.customId === "fb:nao") {
      const sim = interaction.customId === "fb:sim";
      if (conversa.etapa === "ia") {
        return sim
          ? this.pedirQuestoes(interaction, conversa, "questoesIa", "Em quais questões usou IA?")
          : this.pedirPlagio(interaction, conversa);
      }
      if (conversa.etapa === "plagio") {
        return sim
          ? this.pedirQuestoes(interaction, conversa, "questoesPlagio", "Em quais questões houve plágio?")
          : this.pedirProibicao(interaction, conversa);
      }
      if (conversa.etapa === "plagioMesmaPessoa") {
        conversa.mesmaPessoaPlagio = sim;
        return this.pedirCursoEnvolvido(interaction, conversa);
      }
      if (conversa.etapa === "proibicao") {
        return sim
          ? this.pedirQuestoes(interaction, conversa, "questoesProibicao", "Em quais questões usou proibição?")
          : this.mostrarResumo(interaction, conversa);
      }
    }
    // Nenhum customId/etapa bateu (mensagem obsoleta) — confirma o recebimento pra
    // não deixar a interação sem resposta nenhuma.
    await this.garantirDefer(interaction);
  }

  private async abrirModal(interaction: ButtonInteraction, conversa: Conversa) {
    const etapa = conversa.etapa;
    const modal = new ModalBuilder().setCustomId(`fb:modal:${etapa}`).setTitle("Feedbot");
    const input = new TextInputBuilder()
      .setCustomId("valor")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
    if (etapa === "pontuacao") {
      input.setLabel(`Quantas corretas (0 a ${conversa.totalQuestoes ?? 0}) ou F`);
    } else {
      input.setLabel("Números das questões, ex.: 1, 3").setPlaceholder("1, 3, 5");
    }
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await interaction.showModal(modal);
  }

  private async tratarModal(interaction: ModalSubmitInteraction) {
    const conversa = this.conversaAtiva(interaction.user.id);
    if (!conversa) {
      await interaction.reply({
        content: "Sessão expirada. Use /feedback para começar novamente.",
        ephemeral: true,
      });
      return;
    }
    const [, , etapa] = interaction.customId.split(":");
    const valor = interaction.fields.getTextInputValue("valor");
    await interaction.deferUpdate();
    if (etapa === "pontuacao") {
      const textoValor = valor.trim();
      if (textoValor.toUpperCase() === "F") {
        conversa.faltou = true;
        conversa.pontuacao = 0;
        return this.mostrarResumo(interaction, conversa);
      }
      const qtd = Number(textoValor);
      const total = conversa.totalQuestoes ?? 0;
      if (!Number.isInteger(qtd) || qtd < 0 || qtd > total) {
        await interaction.followUp({
          content: `Informe um número entre 0 e ${total}, ou F se o aluno não entregou/respondeu.`,
          ephemeral: true,
        });
        return;
      }
      conversa.faltou = false;
      conversa.pontuacao = qtd;
      return this.pedirIa(interaction, conversa);
    }
    if (etapa === "questoesIa" || etapa === "questoesPlagio" || etapa === "questoesProibicao") {
      const resultado = validarQuestoesInformadas(valor, conversa.totalQuestoes ?? 0);
      if (!resultado.valido) {
        await interaction.followUp({
          content: `Informe somente números de questões entre 1 e ${conversa.totalQuestoes ?? 0}. Ex.: 1, 3`,
          ephemeral: true,
        });
        return;
      }
      return this.aplicarQuestoesEscolhidas(interaction, conversa, etapa, resultado.questoes);
    }
  }

  private async aplicarQuestoesEscolhidas(
    interaction: InteracaoEditavel,
    conversa: Conversa,
    etapa: "questoesIa" | "questoesPlagio" | "questoesProibicao",
    questoes: number[],
  ) {
    if (etapa === "questoesIa") {
      conversa.ia = questoes;
      return this.pedirPlagio(interaction, conversa);
    }
    if (etapa === "questoesPlagio") {
      conversa.plagio = questoes;
      conversa.mesmaPessoaPlagio = false;
      conversa.indicePlagioAtual = 0;
      conversa.envolvidos = {};
      if (questoes.length > 1) return this.pedirMesmaPessoaPlagio(interaction, conversa);
      return this.pedirCursoEnvolvido(interaction, conversa);
    }
    conversa.proibicao = questoes;
    return this.mostrarResumo(interaction, conversa);
  }

  private async tratarSelect(interaction: StringSelectMenuInteraction) {
    const conversa = this.conversaAtiva(interaction.user.id);
    if (!conversa) {
      await interaction.reply({
        content: "Sessão expirada. Use /feedback para começar novamente.",
        ephemeral: true,
      });
      return;
    }
    const valores = interaction.values;
    if (conversa.etapa === "lista") {
      await this.garantirDefer(interaction);
      const listaId = valores[0]!;
      const alunos = await alunosElegiveis(this.prisma, conversa.monitorId, listaId, conversa.periodoId);
      if (!alunos.length) {
        this.conversas.delete(interaction.user.id);
        await interaction.editReply({
          content:
            "Não há alunos sob sua responsabilidade nesta lista no momento. Use /feedback para tentar novamente.",
          components: [],
        });
        return;
      }
      const lista = await this.prisma.lista.findUnique({ where: { id: listaId } });
      conversa.listaId = listaId;
      conversa.totalQuestoes = lista?.qtdQuestoesTotal ?? 0;
      conversa.etapa = "aluno";
      conversa.paginaAluno = 0;
      return this.listaAlunoStep(interaction, conversa);
    }
    if (conversa.etapa === "aluno") {
      // Revalida o id escolhido contra a lista de elegíveis computada no servidor —
      // sem isso, uma interação forjada (o Discord não garante que o valor
      // devolvido é uma das opções que o bot ofereceu) deixaria um monitor registrar
      // feedback para um aluno fora da sua responsabilidade. `criarFeedback` só
      // bloqueia esse caso quando o aluno tem dupla (checa semana A/B); alunos sem
      // dupla ainda ficariam desprotegidos sem esta revalidação.
      await this.garantirDefer(interaction);
      const alunos = await alunosElegiveis(
        this.prisma,
        conversa.monitorId,
        conversa.listaId!,
        conversa.periodoId,
      );
      const alunoEscolhido = alunos.find((item) => item.id === valores[0]);
      if (!alunoEscolhido) return this.rejeitarSelecaoInvalida(interaction);
      conversa.alunoId = alunoEscolhido.id;
      return this.pedirPontuacao(interaction, conversa);
    }
    if (conversa.etapa === "pontuacao") {
      const valor = valores[0]!;
      if (valor === "F") {
        conversa.faltou = true;
        conversa.pontuacao = 0;
        return this.mostrarResumo(interaction, conversa);
      }
      conversa.faltou = false;
      conversa.pontuacao = Number(valor);
      return this.pedirIa(interaction, conversa);
    }
    if (conversa.etapa === "questoesIa") {
      return this.aplicarQuestoesEscolhidas(
        interaction,
        conversa,
        "questoesIa",
        valores.map(Number),
      );
    }
    if (conversa.etapa === "questoesPlagio") {
      return this.aplicarQuestoesEscolhidas(
        interaction,
        conversa,
        "questoesPlagio",
        valores.map(Number),
      );
    }
    if (conversa.etapa === "cursoEnvolvido") {
      // Revalida contra as turmas do período do monitor — sem isso, uma turmaId
      // forjada de outro período vazaria nomes de alunos de outro período na etapa
      // seguinte (listaEnvolvidoStep busca só por turmaId, sem filtrar período).
      await this.garantirDefer(interaction);
      const turmas = await this.prisma.turma.findMany({ where: { periodoId: conversa.periodoId } });
      const turmaEscolhida = turmas.find((turma) => turma.id === valores[0]);
      if (!turmaEscolhida) return this.rejeitarSelecaoInvalida(interaction);
      conversa.turmaEnvolvidoId = turmaEscolhida.id;
      conversa.paginaEnvolvido = 0;
      conversa.etapa = "envolvido";
      return this.listaEnvolvidoStep(interaction, conversa);
    }
    if (conversa.etapa === "envolvido") {
      // Revalida contra os alunos da turma escolhida — mesma razão da etapa "aluno".
      await this.garantirDefer(interaction);
      const candidatos = await this.prisma.aluno.findMany({
        where: { turmaId: conversa.turmaEnvolvidoId, id: { not: conversa.alunoId } },
      });
      const alunoId = valores[0]!;
      if (!candidatos.some((item) => item.id === alunoId)) {
        return this.rejeitarSelecaoInvalida(interaction);
      }
      if (conversa.mesmaPessoaPlagio) {
        for (const numeroQuestao of conversa.plagio) conversa.envolvidos[numeroQuestao] = alunoId;
        return this.pedirProibicao(interaction, conversa);
      }
      const numeroQuestao = conversa.plagio[conversa.indicePlagioAtual]!;
      conversa.envolvidos[numeroQuestao] = alunoId;
      conversa.indicePlagioAtual += 1;
      if (conversa.indicePlagioAtual < conversa.plagio.length) {
        return this.pedirCursoEnvolvido(interaction, conversa);
      }
      return this.pedirProibicao(interaction, conversa);
    }
    if (conversa.etapa === "questoesProibicao") {
      return this.aplicarQuestoesEscolhidas(
        interaction,
        conversa,
        "questoesProibicao",
        valores.map(Number),
      );
    }
    // Nenhuma etapa bateu (ex.: select de uma mensagem obsoleta, de um /feedback
    // reiniciado) — confirma o recebimento pra não deixar a interação sem resposta.
    await this.garantirDefer(interaction);
  }
}
