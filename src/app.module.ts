import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { MailService } from './mail/mail.service';
import { TasksService } from './tasks/tasks.service';
import { MonitoringService } from './monitoring/monitoring.service';
import { UtilsService } from './utils/utils.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [MailService, TasksService, MonitoringService, UtilsService],
})
export class AppModule {}
