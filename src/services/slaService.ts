import {
  Ticket,
  SLAConfiguration,
  SLAPolicy,
  TicketSLAResult,
  SLAStatus,
  TicketPriority
} from '../types';

export const DEFAULT_SLA_CONFIG: SLAConfiguration = {
  CRITICAL: {
    responseMinutes: 30,    // 30 mins
    resolutionMinutes: 120  // 2 hours
  },
  HIGH: {
    responseMinutes: 60,    // 1 hour
    resolutionMinutes: 240  // 4 hours
  },
  MEDIUM: {
    responseMinutes: 240,   // 4 hours
    resolutionMinutes: 720  // 12 hours
  },
  LOW: {
    responseMinutes: 1440,  // 24 hours
    resolutionMinutes: 2880 // 48 hours
  }
};

export class SLAService {
  private config: SLAConfiguration = JSON.parse(JSON.stringify(DEFAULT_SLA_CONFIG));

  getConfiguration(): SLAConfiguration {
    return { ...this.config };
  }

  setConfiguration(newConfig: Partial<SLAConfiguration>) {
    this.config = {
      ...this.config,
      ...newConfig
    };
  }

  getPolicyForPriority(priority: TicketPriority): SLAPolicy {
    const p = (priority || 'MEDIUM').toUpperCase() as TicketPriority;
    return this.config[p] || this.config.MEDIUM;
  }

  /**
   * Calculates SLA deadlines, elapsed time, breach indicators, and overall SLA status
   */
  evaluateTicketSLA(ticket: Ticket, customNow?: Date): TicketSLAResult {
    const policy = this.getPolicyForPriority(ticket.priority);
    const createdAt = new Date(ticket.createdAt || Date.now());
    const now = customNow || new Date();

    const responseDueAt = new Date(createdAt.getTime() + policy.responseMinutes * 60000).toISOString();
    const resolutionDueAt = new Date(createdAt.getTime() + policy.resolutionMinutes * 60000).toISOString();

    // Response evaluation: time until assigned or acknowledged or triaged or started
    const responseCompletedAt = ticket.startedAt || ticket.acknowledgedAt || ticket.triagedAt || (ticket.assignedTechnicianId ? ticket.updatedAt : undefined);
    let responseElapsedMinutes = 0;
    if (responseCompletedAt) {
      responseElapsedMinutes = Math.max(0, Math.round((new Date(responseCompletedAt).getTime() - createdAt.getTime()) / 60000));
    } else {
      responseElapsedMinutes = Math.max(0, Math.round((now.getTime() - createdAt.getTime()) / 60000));
    }

    // Resolution evaluation: time until resolved or closed
    const isResolved = ['RESOLVED', 'VERIFIED', 'CLOSED'].includes(ticket.status);
    const resolutionCompletedAt = ticket.resolvedAt || ticket.closedAt;
    let resolutionElapsedMinutes = 0;
    if (resolutionCompletedAt) {
      resolutionElapsedMinutes = Math.max(0, Math.round((new Date(resolutionCompletedAt).getTime() - createdAt.getTime()) / 60000));
    } else {
      resolutionElapsedMinutes = Math.max(0, Math.round((now.getTime() - createdAt.getTime()) / 60000));
    }

    const isResponseBreached = !responseCompletedAt && responseElapsedMinutes > policy.responseMinutes;
    const isResolutionBreached = (!isResolved && resolutionElapsedMinutes > policy.resolutionMinutes) ||
      (isResolved && resolutionElapsedMinutes > policy.resolutionMinutes);

    let slaStatus: SLAStatus = 'WITHIN_SLA';
    if (isResolved) {
      slaStatus = resolutionElapsedMinutes <= policy.resolutionMinutes ? 'MET' : 'BREACHED';
    } else if (isResolutionBreached || isResponseBreached) {
      slaStatus = 'BREACHED';
    } else {
      // Check if at risk (e.g. > 75% of window elapsed)
      const remainingMinutes = policy.resolutionMinutes - resolutionElapsedMinutes;
      if (resolutionElapsedMinutes > policy.resolutionMinutes * 0.75) {
        slaStatus = 'AT_RISK';
      } else {
        slaStatus = 'WITHIN_SLA';
      }
    }

    const remainingMinutes = Math.max(0, policy.resolutionMinutes - resolutionElapsedMinutes);

    return {
      responseDueAt,
      resolutionDueAt,
      responseElapsedMinutes,
      resolutionElapsedMinutes,
      isResponseBreached,
      isResolutionBreached,
      slaStatus,
      remainingMinutes
    };
  }
}

export const slaService = new SLAService();
