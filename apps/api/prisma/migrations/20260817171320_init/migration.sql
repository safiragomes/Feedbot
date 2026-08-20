-- CreateEnum
CREATE TYPE "MonitorStatus" AS ENUM ('ATIVO', 'INATIVO');

-- CreateEnum
CREATE TYPE "Semana" AS ENUM ('A', 'B');

-- CreateEnum
CREATE TYPE "BotSessaoStatus" AS ENUM ('DESCONECTADO', 'CONECTANDO', 'CONECTADO');

-- CreateTable
CREATE TABLE "Periodo" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3) NOT NULL,
    "dataReferenciaRodizio" TIMESTAMP(3) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Periodo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Turma" (
    "id" TEXT NOT NULL,
    "periodoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "nomeAbaPlanilha" TEXT NOT NULL,

    CONSTRAINT "Turma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrupoRevisao" (
    "id" TEXT NOT NULL,
    "periodoId" TEXT NOT NULL,
    "chefeId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "whatsappGrupoId" TEXT,
    "whatsappGrupoNome" TEXT,

    CONSTRAINT "GrupoRevisao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dupla" (
    "id" TEXT NOT NULL,
    "grupoRevisaoId" TEXT NOT NULL,
    "monitorSemanaAId" TEXT,
    "monitorSemanaBId" TEXT,
    "label" TEXT NOT NULL,

    CONSTRAINT "Dupla_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Monitor" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "whatsappNumero" TEXT NOT NULL,
    "isChefe" BOOLEAN NOT NULL DEFAULT false,
    "duplaId" TEXT,
    "periodoId" TEXT NOT NULL,
    "status" "MonitorStatus" NOT NULL DEFAULT 'ATIVO',

    CONSTRAINT "Monitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Aluno" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "matricula" TEXT NOT NULL,
    "turmaId" TEXT NOT NULL,
    "duplaId" TEXT NOT NULL,
    "isPcd" BOOLEAN NOT NULL DEFAULT false,
    "qtdQuestoesMeta" INTEGER,

    CONSTRAINT "Aluno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lista" (
    "id" TEXT NOT NULL,
    "periodoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "qtdQuestoesTotal" INTEGER NOT NULL,
    "prazoEntregaFeedback" TIMESTAMP(3) NOT NULL,
    "semanaOverride" "Semana",

    CONSTRAINT "Lista_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "monitorId" TEXT NOT NULL,
    "listaId" TEXT NOT NULL,
    "duplaId" TEXT NOT NULL,
    "semana" "Semana" NOT NULL,
    "qtdQuestoesPontuadas" INTEGER NOT NULL,
    "usouIa" BOOLEAN NOT NULL DEFAULT false,
    "plagiou" BOOLEAN NOT NULL DEFAULT false,
    "usouProibicao" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sincronizadoPlanilha" BOOLEAN NOT NULL DEFAULT false,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackQuestaoIA" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "numeroQuestao" INTEGER NOT NULL,

    CONSTRAINT "FeedbackQuestaoIA_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackQuestaoPlagio" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "numeroQuestao" INTEGER NOT NULL,
    "alunoEnvolvidoId" TEXT NOT NULL,

    CONSTRAINT "FeedbackQuestaoPlagio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackQuestaoProibicao" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "numeroQuestao" INTEGER NOT NULL,

    CONSTRAINT "FeedbackQuestaoProibicao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MapeamentoPlanilhaLista" (
    "id" TEXT NOT NULL,
    "listaId" TEXT NOT NULL,
    "turmaId" TEXT NOT NULL,
    "colunaQuestoesCorretas" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MapeamentoPlanilhaLista_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotSessao" (
    "id" TEXT NOT NULL,
    "status" "BotSessaoStatus" NOT NULL DEFAULT 'DESCONECTADO',
    "numeroConectado" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotSessao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Periodo_nome_key" ON "Periodo"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "Turma_periodoId_nome_key" ON "Turma"("periodoId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "GrupoRevisao_whatsappGrupoId_key" ON "GrupoRevisao"("whatsappGrupoId");

-- CreateIndex
CREATE UNIQUE INDEX "Dupla_monitorSemanaAId_key" ON "Dupla"("monitorSemanaAId");

-- CreateIndex
CREATE UNIQUE INDEX "Dupla_monitorSemanaBId_key" ON "Dupla"("monitorSemanaBId");

-- CreateIndex
CREATE UNIQUE INDEX "Dupla_grupoRevisaoId_label_key" ON "Dupla"("grupoRevisaoId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "Monitor_whatsappNumero_key" ON "Monitor"("whatsappNumero");

-- CreateIndex
CREATE UNIQUE INDEX "Aluno_matricula_key" ON "Aluno"("matricula");

-- CreateIndex
CREATE UNIQUE INDEX "Lista_periodoId_nome_key" ON "Lista"("periodoId", "nome");

-- CreateIndex
CREATE INDEX "Feedback_alunoId_idx" ON "Feedback"("alunoId");

-- CreateIndex
CREATE INDEX "Feedback_monitorId_idx" ON "Feedback"("monitorId");

-- CreateIndex
CREATE INDEX "Feedback_listaId_idx" ON "Feedback"("listaId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackQuestaoIA_feedbackId_numeroQuestao_key" ON "FeedbackQuestaoIA"("feedbackId", "numeroQuestao");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackQuestaoPlagio_feedbackId_numeroQuestao_alunoEnvolvi_key" ON "FeedbackQuestaoPlagio"("feedbackId", "numeroQuestao", "alunoEnvolvidoId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackQuestaoProibicao_feedbackId_numeroQuestao_key" ON "FeedbackQuestaoProibicao"("feedbackId", "numeroQuestao");

-- CreateIndex
CREATE UNIQUE INDEX "MapeamentoPlanilhaLista_listaId_turmaId_key" ON "MapeamentoPlanilhaLista"("listaId", "turmaId");

-- AddForeignKey
ALTER TABLE "Turma" ADD CONSTRAINT "Turma_periodoId_fkey" FOREIGN KEY ("periodoId") REFERENCES "Periodo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrupoRevisao" ADD CONSTRAINT "GrupoRevisao_periodoId_fkey" FOREIGN KEY ("periodoId") REFERENCES "Periodo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrupoRevisao" ADD CONSTRAINT "GrupoRevisao_chefeId_fkey" FOREIGN KEY ("chefeId") REFERENCES "Monitor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dupla" ADD CONSTRAINT "Dupla_grupoRevisaoId_fkey" FOREIGN KEY ("grupoRevisaoId") REFERENCES "GrupoRevisao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dupla" ADD CONSTRAINT "Dupla_monitorSemanaAId_fkey" FOREIGN KEY ("monitorSemanaAId") REFERENCES "Monitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dupla" ADD CONSTRAINT "Dupla_monitorSemanaBId_fkey" FOREIGN KEY ("monitorSemanaBId") REFERENCES "Monitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Monitor" ADD CONSTRAINT "Monitor_periodoId_fkey" FOREIGN KEY ("periodoId") REFERENCES "Periodo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Monitor" ADD CONSTRAINT "Monitor_duplaId_fkey" FOREIGN KEY ("duplaId") REFERENCES "Dupla"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Aluno" ADD CONSTRAINT "Aluno_turmaId_fkey" FOREIGN KEY ("turmaId") REFERENCES "Turma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Aluno" ADD CONSTRAINT "Aluno_duplaId_fkey" FOREIGN KEY ("duplaId") REFERENCES "Dupla"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lista" ADD CONSTRAINT "Lista_periodoId_fkey" FOREIGN KEY ("periodoId") REFERENCES "Periodo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "Monitor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_listaId_fkey" FOREIGN KEY ("listaId") REFERENCES "Lista"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_duplaId_fkey" FOREIGN KEY ("duplaId") REFERENCES "Dupla"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackQuestaoIA" ADD CONSTRAINT "FeedbackQuestaoIA_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "Feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackQuestaoPlagio" ADD CONSTRAINT "FeedbackQuestaoPlagio_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "Feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackQuestaoPlagio" ADD CONSTRAINT "FeedbackQuestaoPlagio_alunoEnvolvidoId_fkey" FOREIGN KEY ("alunoEnvolvidoId") REFERENCES "Aluno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackQuestaoProibicao" ADD CONSTRAINT "FeedbackQuestaoProibicao_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "Feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapeamentoPlanilhaLista" ADD CONSTRAINT "MapeamentoPlanilhaLista_listaId_fkey" FOREIGN KEY ("listaId") REFERENCES "Lista"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapeamentoPlanilhaLista" ADD CONSTRAINT "MapeamentoPlanilhaLista_turmaId_fkey" FOREIGN KEY ("turmaId") REFERENCES "Turma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
