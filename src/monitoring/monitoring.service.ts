// src/monitoring/monitoring.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ScheduledTask, TaskExecutionLog } from '../database/prisma/client';
import { MailService } from '../mail/mail.service';
import { TasksService } from '../tasks/tasks.service';
import { UtilsService } from '../utils/utils.service';

@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);
  // Para evitar spam, armazenar último alerta por tarefa
  private lastAlertTimes: Map<number, Date> = new Map();
  private readonly ALERT_COOLDOWN_MINUTES = 60; // Não alertar novamente por 1 hora

  constructor(
    private tasks: TasksService,
    private executionService: TaskExecutionLog,
    private mailService: MailService,
    private utilsService: UtilsService,
  ) {}

  private isTaskActive(task: ScheduledTask): boolean {
    return task.isActive === 2;
  }

  private getActiveDays(task: ScheduledTask): number[] {
    const days: number[] = [];
    if (task.monday === 2) days.push(1);
    if (task.tuesday === 2) days.push(2);
    if (task.wednesday === 2) days.push(3);
    if (task.thursday === 2) days.push(4);
    if (task.friday === 2) days.push(5);
    if (task.saturday === 2) days.push(6);
    if (task.sunday === 2) days.push(7);
    return days;
  }

  // Função para parsear horários string (ex: "07:00") para Date (considerando apenas a hora)
  private parseTimeStringToDate(timeString: string, baseDate: Date = new Date()): Date {
    const [hours, minutes, seconds] = timeString.split(':').map(Number);
    const date = new Date(baseDate); // Clone baseDate
    date.setHours(hours || 0, minutes || 0, seconds || 0, 0);
    return date;
  }

  @Cron(CronExpression.EVERY_5_MINUTES) // Executa a cada 5 minutos
  async handleCron() {
    this.logger.log('Running monitoring check...');
    const now = new Date();
    const activeTasks = await this.tasks.scheduledTask.findMany({
      where: { isActive: 2 },
    });

    for (const task of activeTasks) {
      await this.checkTaskStatus(task, now);
    }
  }

  private async checkTaskStatus(task: ScheduledTask, now: Date) {
    const logs = await this.tasks.taskExecutionLog.findMany({
      where: { taskCode: task.taskCode },
      orderBy: { hour: 'desc' }, // Mais recente primeiro
    });

    const latestLog = logs.length > 0 ? logs[0] : null;

    let alertReason: string | null = null;

    if (!latestLog) {
      // Se a tarefa deveria ter rodado (baseado em startTime, daysOfWeek) e não há logs
      // Esta lógica pode ser complexa; por ora, focamos nos logs existentes.
      // Poderia-se alertar se a tarefa é antiga e sem logs.
      // this.logger.warn(`Task ${task.name} has no execution logs.`);
      // Para fins deste exemplo, assumimos que o executor cria o primeiro log 'Waiting'.
      // Se o primeiro log 'Waiting' está muito atrasado, a próxima condição pegará.
      return; // Ou lógica mais específica para "nunca rodou"
    }

    // 1. Erro na última execução
    // A "última" execução relevante é a mais recente com status 3 ou 7.
    // O log `status=1` é para a *próxima* execução.
    const lastActualExecution = logs.find((log) => log.status === 3 || log.status === 7);

    if (lastActualExecution?.status === 7) {
      alertReason =
        `Task ${task.description} last execution resulted in an ERROR at ` +
        `${lastActualExecution.endDate.toISOString()}. Message: ${lastActualExecution.userMessage || 'N/A'}`;
    } else if (lastActualExecution?.status === 3) {
      // 2. Atraso após sucesso
      const timeSinceLastSuccess = (now.getTime() - new Date(lastActualExecution.endDate).getTime()) / (1000 * 60); // em minutos
      if (timeSinceLastSuccess > task.frequency) {
        alertReason =
          `Task ${task.description} is LATE. Last successful execution was at ` +
          `${lastActualExecution.endDate.toISOString()}, which is more than the ${task.frequency} min interval.`;
      }
    }

    // 3. Tarefa em Espera Presa/Atrasada (se não houve erro ou atraso de sucesso)
    if (!alertReason) {
      const waitingLog = logs.find((log) => log.status === 1); // Deve ser o mais recente se tudo estiver ok
      if (waitingLog && new Date(waitingLog.endDate) < now) {
        // Tolerância pode ser adicionada: e.g., now > waitingLog.endDate + 5 minutos
        const timeOverdue = (now.getTime() - new Date(waitingLog.endDate).getTime()) / (1000 * 60);
        if (timeOverdue > 5) {
          // Se estiver mais de 5 min atrasado para iniciar
          alertReason =
            `Task ${task.description} is STUCK in WAITING state. ` +
            `Scheduled for ${waitingLog.endDate.toISOString()} but not processed.`;
        }
      }
    }

    // Se não há logs 3 ou 7 e o log 1 está atrasado, a condição 3 pega.
    // Se não há log 1, mas o último log 3 ou 7 indica problema, as condições 1 ou 2 pegam.

    if (alertReason) {
      this.sendAlert(task, alertReason, now);
    }
  }

  private async sendAlert(task: ScheduledTask, reason: string, now: Date) {
    const lastAlert = this.lastAlertTimes.get(Number(task.ROWID));
    if (lastAlert && now.getTime() - lastAlert.getTime() < this.ALERT_COOLDOWN_MINUTES * 60 * 1000) {
      this.logger.log(`Alert for task ${task.description} is on cooldown. Reason: ${reason}`);
      return;
    }

    this.logger.warn(`ALERT for ${task.description}: ${reason}`);
    try {
      // await this.mailService.sendMail(task.emailRecipients, `Alert: Task ${task.description} requires attention`, reason);
      this.lastAlertTimes.set(Number(task.ROWID), now);
    } catch (error) {
      this.logger.error(`Failed to send alert email for ${task.description}`, error);
    }
  }
}
