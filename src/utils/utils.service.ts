import { Injectable } from '@nestjs/common';

@Injectable()
export class UtilsService {
  // Função para parsear horários string (ex: "07:00") para Date (considerando apenas a hora)
  private parseTimeStringToDate(timeString: string, baseDate: Date = new Date()): Date {
    const [hours, minutes, seconds] = timeString.split(':').map(Number);
    const date = new Date(baseDate); // Clone baseDate
    date.setHours(hours || 0, minutes || 0, seconds || 0, 0);
    return date;
  }
}
