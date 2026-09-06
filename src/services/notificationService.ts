import { NotificationPayload, NotificationChannel } from '../types';
import { whatsAppService } from './whatsAppService';

export interface NotificationLog {
  id: string;
  channel: NotificationChannel;
  recipient: string;
  title: string;
  body: string;
  status: 'SENT' | 'DELIVERED' | 'FAILED';
  error?: string;
  timestamp: string;
}

export class NotificationService {
  private logs: NotificationLog[] = [];

  async send(payload: NotificationPayload): Promise<{
    success: boolean;
    channelResults: Record<NotificationChannel, boolean>;
    logs: NotificationLog[];
  }> {
    const channelResults: Record<NotificationChannel, boolean> = {
      EMAIL: false,
      WHATSAPP: false,
      WEB_PUSH: false,
      IN_APP: false
    };

    const newLogs: NotificationLog[] = [];
    const timestamp = new Date().toISOString();

    for (const channel of payload.channels) {
      const recipientStr = payload.recipient.phone || payload.recipient.email || payload.recipient.name || 'System';
      
      try {
        if (channel === 'WHATSAPP') {
          if (payload.recipient.phone) {
            const provider = whatsAppService.getProvider();
            const res = await provider.sendMessage(payload.recipient.phone, `*${payload.title}*\n${payload.body}`);
            channelResults.WHATSAPP = res.success;
            const logEntry: NotificationLog = {
              id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
              channel: 'WHATSAPP',
              recipient: payload.recipient.phone,
              title: payload.title,
              body: payload.body,
              status: res.success ? 'SENT' : 'FAILED',
              error: res.error,
              timestamp
            };
            this.logs.unshift(logEntry);
            newLogs.push(logEntry);
          }
        } else if (channel === 'EMAIL') {
          // Abstracted Email dispatch
          const logEntry: NotificationLog = {
            id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            channel: 'EMAIL',
            recipient: payload.recipient.email || 'dispatch@ksu.edu.sa',
            title: payload.title,
            body: payload.body,
            status: 'SENT',
            timestamp
          };
          channelResults.EMAIL = true;
          this.logs.unshift(logEntry);
          newLogs.push(logEntry);
        } else if (channel === 'IN_APP' || channel === 'WEB_PUSH') {
          const logEntry: NotificationLog = {
            id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            channel,
            recipient: recipientStr,
            title: payload.title,
            body: payload.body,
            status: 'DELIVERED',
            timestamp
          };
          channelResults[channel] = true;
          this.logs.unshift(logEntry);
          newLogs.push(logEntry);
        }
      } catch (err: any) {
        channelResults[channel] = false;
        const failedLog: NotificationLog = {
          id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          channel,
          recipient: recipientStr,
          title: payload.title,
          body: payload.body,
          status: 'FAILED',
          error: err.message,
          timestamp
        };
        this.logs.unshift(failedLog);
        newLogs.push(failedLog);
      }
    }

    const anySuccess = Object.values(channelResults).some(v => v === true);
    return {
      success: anySuccess,
      channelResults,
      logs: newLogs
    };
  }

  getNotificationLogs(): NotificationLog[] {
    return [...this.logs];
  }

  clearLogs() {
    this.logs = [];
  }
}

export const notificationService = new NotificationService();
