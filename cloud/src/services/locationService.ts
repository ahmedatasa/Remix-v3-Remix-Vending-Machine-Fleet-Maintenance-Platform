import crypto from 'crypto';
import { getCloudRepository } from '../repositories';
import { cloudConfig } from '../config/cloudConfig';
import type {
  MachineLocationProposal,
  FieldExceptionApproval,
  SanitizedCloudMachine,
  LocationSource
} from '../db/cloudDb';

export class LocationService {
  /**
   * Technician submits a proposal for a machine's GPS coordinates
   */
  public static async submitProposal(params: {
    machineTokenOrId: string;
    latitude: number;
    longitude: number;
    accuracyMeters: number;
    technicianId: string;
    technicianName: string;
    ticketId?: string;
    clientIp?: string;
  }): Promise<MachineLocationProposal> {
    const repo = getCloudRepository();
    const {
      machineTokenOrId,
      latitude,
      longitude,
      accuracyMeters,
      technicianId,
      technicianName,
      ticketId,
      clientIp
    } = params;

    if (!machineTokenOrId) {
      throw new Error('MACHINE_REQUIRED: معرف أو رمز الماكينة مطلوب لتقديم مقترح الموقع.');
    }

    const cleanToken = machineTokenOrId.trim().toUpperCase();
    const machine =
      (await repo.machines.findByQrToken(cleanToken)) ||
      (await repo.machines.findByIntegrationId(machineTokenOrId));

    if (!machine) {
      throw new Error(`MACHINE_NOT_FOUND: الماكينة (${machineTokenOrId}) غير موجودة في الأسطول.`);
    }

    if (typeof latitude !== 'number' || isNaN(latitude) || latitude < -90 || latitude > 90) {
      throw new Error(`INVALID_LATITUDE: خط العرض غير صالح (${latitude}).`);
    }

    if (typeof longitude !== 'number' || isNaN(longitude) || longitude < -180 || longitude > 180) {
      throw new Error(`INVALID_LONGITUDE: خط الطول غير صالح (${longitude}).`);
    }

    if (typeof accuracyMeters !== 'number' || isNaN(accuracyMeters) || accuracyMeters <= 0) {
      throw new Error(`INVALID_ACCURACY: دقة الموقع غير صالحة (${accuracyMeters}).`);
    }

    const maxAllowedAccuracy = cloudConfig.technicianMaxGpsAccuracyMeters * 2; // e.g., 60m
    if (accuracyMeters > maxAllowedAccuracy) {
      throw new Error(
        `ACCURACY_TOO_LOW: دقة إشارة الـ GPS (${accuracyMeters}م) منخفضة جداً لتقديم مقترح موقع موثوق (الحد الأقصى: ${maxAllowedAccuracy}م). يرجى الانتظار حتى تستقر الإشارة.`
      );
    }

    const now = new Date().toISOString();
    const proposal: MachineLocationProposal = {
      id: `prop-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      integrationMachineId: machine.integrationMachineId,
      publicQrToken: machine.publicQrToken,
      ticketId: ticketId || null,
      technicianId,
      technicianName,
      latitude,
      longitude,
      accuracyMeters,
      capturedAt: now,
      status: 'PENDING',
      submittedIp: clientIp || null,
      createdAt: now,
      updatedAt: now
    };

    const saved = await repo.locationProposals.submitProposal(proposal);

    await repo.syncEvents.pushEvent('MACHINE_LOCATION_PROPOSED', machine.integrationMachineId, {
      proposalId: saved.id,
      machineId: machine.integrationMachineId,
      technicianId,
      technicianName,
      latitude,
      longitude,
      accuracyMeters
    });

    await repo.audit.log({
      actorType: 'TECHNICIAN',
      actorId: technicianId,
      actorName: technicianName,
      action: 'SUBMIT_LOCATION_PROPOSAL',
      entity: 'MACHINE',
      result: 'SUCCESS',
      details: {
        proposalId: saved.id,
        machineId: machine.integrationMachineId,
        latitude,
        longitude,
        accuracyMeters
      },
      ip: clientIp
    });

    return saved;
  }

  /**
   * Manager approves a location proposal, updating the machine's official coordinates
   */
  public static async approveProposal(params: {
    proposalId: string;
    approverId: string;
    approverName: string;
    clientIp?: string;
  }): Promise<{ proposal: MachineLocationProposal; machine: SanitizedCloudMachine }> {
    const repo = getCloudRepository();
    const { proposalId, approverId, approverName, clientIp } = params;

    const result = await repo.locationProposals.approveProposal(proposalId, {
      id: approverId,
      name: approverName
    });

    await repo.syncEvents.pushEvent('MACHINE_LOCATION_APPROVED', result.machine.integrationMachineId, {
      proposalId,
      machineId: result.machine.integrationMachineId,
      approverId,
      approverName,
      latitude: result.machine.latitude,
      longitude: result.machine.longitude,
      locationSource: result.machine.locationSource
    });

    await repo.audit.log({
      actorType: 'SYSTEM',
      actorId: approverId,
      actorName: approverName,
      action: 'APPROVE_LOCATION_PROPOSAL',
      entity: 'MACHINE',
      result: 'SUCCESS',
      details: {
        proposalId,
        machineId: result.machine.integrationMachineId,
        latitude: result.machine.latitude,
        longitude: result.machine.longitude
      },
      ip: clientIp
    });

    return result;
  }

  /**
   * Manager rejects a location proposal
   */
  public static async rejectProposal(params: {
    proposalId: string;
    actorId: string;
    actorName: string;
    reason?: string;
    clientIp?: string;
  }): Promise<MachineLocationProposal> {
    const repo = getCloudRepository();
    const { proposalId, actorId, actorName, reason, clientIp } = params;

    const rejected = await repo.locationProposals.rejectProposal(
      proposalId,
      { id: actorId, name: actorName },
      reason
    );

    await repo.syncEvents.pushEvent('MACHINE_LOCATION_REJECTED', rejected.integrationMachineId, {
      proposalId,
      machineId: rejected.integrationMachineId,
      actorId,
      actorName,
      reason
    });

    await repo.audit.log({
      actorType: 'SYSTEM',
      actorId: actorId,
      actorName: actorName,
      action: 'REJECT_LOCATION_PROPOSAL',
      entity: 'MACHINE',
      result: 'SUCCESS',
      details: {
        proposalId,
        machineId: rejected.integrationMachineId,
        reason
      },
      ip: clientIp
    });

    return rejected;
  }

  /**
   * Manager sets or updates location manually (e.g., via map picker or manual lat/lng)
   */
  public static async updateLocationManually(params: {
    machineIdOrToken: string;
    latitude: number | null;
    longitude: number | null;
    locationSource: LocationSource;
    locationNote?: string;
    actorId: string;
    actorName: string;
    clientIp?: string;
  }): Promise<SanitizedCloudMachine> {
    const repo = getCloudRepository();
    const {
      machineIdOrToken,
      latitude,
      longitude,
      locationSource,
      locationNote,
      actorId,
      actorName,
      clientIp
    } = params;

    const updatedMachine = await repo.machines.updateLocation(machineIdOrToken, {
      latitude,
      longitude,
      locationSource,
      locationNote,
      actorId,
      actorName
    });

    await repo.syncEvents.pushEvent('MACHINE_LOCATION_MANUALLY_UPDATED', updatedMachine.integrationMachineId, {
      machineId: updatedMachine.integrationMachineId,
      latitude,
      longitude,
      locationSource,
      locationNote,
      actorId,
      actorName
    });

    await repo.audit.log({
      actorType: 'SYSTEM',
      actorId,
      actorName,
      action: 'UPDATE_MACHINE_LOCATION_MANUALLY',
      entity: 'MACHINE',
      result: 'SUCCESS',
      details: {
        machineId: updatedMachine.integrationMachineId,
        latitude,
        longitude,
        locationSource
      },
      ip: clientIp
    });

    return updatedMachine;
  }

  /**
   * Manager clears configured location
   */
  public static async clearLocation(params: {
    machineIdOrToken: string;
    actorId: string;
    actorName: string;
    clientIp?: string;
  }): Promise<SanitizedCloudMachine> {
    const repo = getCloudRepository();
    const { machineIdOrToken, actorId, actorName, clientIp } = params;

    const clearedMachine = await repo.machines.clearLocation(machineIdOrToken, {
      id: actorId,
      name: actorName
    });

    await repo.syncEvents.pushEvent('MACHINE_LOCATION_CLEARED', clearedMachine.integrationMachineId, {
      machineId: clearedMachine.integrationMachineId,
      actorId,
      actorName
    });

    await repo.audit.log({
      actorType: 'SYSTEM',
      actorId,
      actorName,
      action: 'CLEAR_MACHINE_LOCATION',
      entity: 'MACHINE',
      result: 'SUCCESS',
      details: {
        machineId: clearedMachine.integrationMachineId
      },
      ip: clientIp
    });

    return clearedMachine;
  }

  /**
   * Issue a secure field exception approval
   */
  public static async createFieldExceptionApproval(params: {
    ticketId: string;
    machineIdOrToken: string;
    technicianId?: string;
    reason: string;
    approvedByActorId: string;
    approvedByActorName: string;
    validHours?: number;
    clientIp?: string;
  }): Promise<FieldExceptionApproval> {
    const repo = getCloudRepository();
    const {
      ticketId,
      machineIdOrToken,
      technicianId,
      reason,
      approvedByActorId,
      approvedByActorName,
      validHours = 4,
      clientIp
    } = params;

    if (!ticketId) {
      throw new Error('TICKET_REQUIRED: معرف البلاغ مطلوب لإصدار استثناء الحضور.');
    }

    if (!reason || reason.trim().length < 10) {
      throw new Error('REASON_REQUIRED: يلزم تقديم سبب تفصيلي للاستثناء الميداني (10 أحرف على الأقل).');
    }

    const ticket = await repo.tickets.findById(ticketId);
    if (!ticket) {
      throw new Error(`TICKET_NOT_FOUND: البلاغ (${ticketId}) غير موجود.`);
    }

    const cleanToken = machineIdOrToken.trim().toUpperCase();
    const machine =
      (await repo.machines.findByQrToken(cleanToken)) ||
      (await repo.machines.findByIntegrationId(machineIdOrToken)) ||
      (await repo.machines.findByIntegrationId(ticket.integrationMachineId));

    if (!machine) {
      throw new Error(`MACHINE_NOT_FOUND: الماكينة (${machineIdOrToken}) غير موجودة.`);
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + validHours * 3600 * 1000).toISOString();

    const approval: FieldExceptionApproval = {
      id: `fld-exp-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      ticketId,
      integrationMachineId: machine.integrationMachineId,
      technicianId: technicianId || null,
      reason: reason.trim(),
      status: 'APPROVED',
      approvedByActorId,
      approvedByActorName,
      approvedAt: now.toISOString(),
      expiresAt,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };

    const saved = await repo.fieldExceptions.createApproval(approval);

    await repo.syncEvents.pushEvent('FIELD_EXCEPTION_APPROVED', ticketId, {
      exceptionId: saved.id,
      ticketId,
      machineId: machine.integrationMachineId,
      approvedBy: approvedByActorName,
      reason: approval.reason,
      expiresAt
    });

    await repo.audit.log({
      actorType: 'SYSTEM',
      actorId: approvedByActorId,
      actorName: approvedByActorName,
      action: 'CREATE_FIELD_EXCEPTION',
      entity: 'TICKET',
      result: 'SUCCESS',
      details: {
        exceptionId: saved.id,
        ticketId,
        machineId: machine.integrationMachineId,
        reason: approval.reason
      },
      ip: clientIp
    });

    return saved;
  }

  /**
   * List pending proposals for managerial review
   */
  public static async listPendingProposals(limit = 50): Promise<MachineLocationProposal[]> {
    const repo = getCloudRepository();
    return repo.locationProposals.listPending(limit);
  }

  /**
   * Get machine details and any pending proposals
   */
  public static async getMachineLocationDetails(idOrToken: string): Promise<{
    machine: SanitizedCloudMachine;
    pendingProposals: MachineLocationProposal[];
  }> {
    const repo = getCloudRepository();
    const cleanToken = idOrToken.trim().toUpperCase();
    const machine =
      (await repo.machines.findByQrToken(cleanToken)) ||
      (await repo.machines.findByIntegrationId(idOrToken));

    if (!machine) {
      throw new Error(`MACHINE_NOT_FOUND: الماكينة (${idOrToken}) غير موجودة.`);
    }

    const pendingProposals = await repo.locationProposals.findPendingByMachineId(
      machine.integrationMachineId
    );

    return { machine, pendingProposals };
  }
}
