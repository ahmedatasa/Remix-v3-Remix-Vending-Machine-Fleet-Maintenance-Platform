import type { ICloudRepositoryManager } from '../repositories/interfaces';

export class TicketAssignmentError extends Error {
  constructor(public statusCode: number, public code: string) { super(code); }
}

export async function assignCloudTicket(repo: ICloudRepositoryManager, ticketId: string, input: any, actor: any) {
  if (!actor || !['SUPER_ADMIN', 'ADMIN', 'MAINTENANCE_MANAGER'].includes(actor.role)) {
    throw new TicketAssignmentError(403, 'ASSIGNMENT_ROLE_FORBIDDEN');
  }
  const technicianId = typeof input?.technicianId === 'string' ? input.technicianId.trim() : '';
  const mainTicketNumber = typeof input?.mainTicketNumber === 'string' ? input.mainTicketNumber.trim() : '';
  const revision = input?.revision;
  if (!ticketId || !technicianId || technicianId.length > 128 || !mainTicketNumber || mainTicketNumber.length > 128 ||
      !Number.isSafeInteger(revision) || revision < 1) {
    throw new TicketAssignmentError(400, 'INVALID_ASSIGNMENT');
  }
  const ticket = await repo.tickets.findById(ticketId);
  if (!ticket) throw new TicketAssignmentError(404, 'TICKET_NOT_FOUND');
  if (!['OPEN', 'IN_PROGRESS'].includes(ticket.status)) throw new TicketAssignmentError(409, 'TICKET_NOT_ACTIVE');
  const tech = await repo.technicians.findById(technicianId);
  if (!tech || tech.status !== 'ACTIVE') throw new TicketAssignmentError(409, 'CLOUD_TECHNICIAN_NOT_ACTIVE');
  if (!await repo.tickets.assignTechnician(ticketId, technicianId, revision, mainTicketNumber)) {
    throw new TicketAssignmentError(409, 'ASSIGNMENT_CONFLICT');
  }
  await repo.audit.log({ actorType: 'SYSTEM', actorId: actor.id, actorName: actor.name,
    action: 'MAIN_TICKET_ASSIGNMENT_SYNC', entity: 'TICKET', result: 'SUCCESS',
    details: { ticketId, technicianId, revision, mainTicketNumber } });
  return { success: true, ticketId, technicianId, revision };
}

export async function listTechnicianTickets(repo: ICloudRepositoryManager, technicianId: string) {
  const tech = await repo.technicians.findById(technicianId);
  if (!tech || tech.status !== 'ACTIVE') throw new TicketAssignmentError(403, 'TECHNICIAN_NOT_ACTIVE');
  const tickets = await repo.tickets.findAssignedActive(tech.id);
  return Promise.all(tickets.filter(t => t.assignedTechnicianId === tech.id &&
    ['OPEN', 'IN_PROGRESS'].includes(t.status)).map(async ticket => {
    const machine = await repo.machines.findByIntegrationId(ticket.integrationMachineId);
    // Explicit DTO: do not expose customer contacts, tracking tokens, or account/session secrets.
    return {
      id: ticket.id, cloudTicketId: ticket.id,
      ticketNumber: ticket.mainTicketNumber || ticket.id,
      machineId: ticket.integrationMachineId,
      assignedTechnicianId: tech.id,
      status: ticket.status === 'OPEN' ? 'ASSIGNED' : ticket.status,
      category: ticket.category, title: ticket.category, description: ticket.description,
      createdAt: ticket.createdAt, updatedAt: ticket.updatedAt,
      machine: {
        id: ticket.integrationMachineId,
        publicQrToken: ticket.publicQrToken,
        machineNumber: machine?.machineNumber || '',
        publicDisplayName: machine?.publicDisplayName || '',
        machineType: machine?.machineType || '',
        currentLocation: { fullDescription: machine?.locationPublicName || machine?.buildingPublicName || '' }
      }
    };
  }));
}
