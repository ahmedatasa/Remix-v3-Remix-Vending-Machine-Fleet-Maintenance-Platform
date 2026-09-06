from fastapi import APIRouter
from backend.app.api.v1.endpoints import (
    auth, users, roles_permissions, buildings, floors, locations,
    machines, technicians, tickets, spare_parts, inventory,
    suppliers, part_requests, dashboard, reports, audit_logs, notifications
)

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(roles_permissions.router)
api_router.include_router(buildings.router)
api_router.include_router(floors.router)
api_router.include_router(locations.router)
api_router.include_router(machines.router)
api_router.include_router(technicians.router)
api_router.include_router(tickets.router)
api_router.include_router(spare_parts.router)
api_router.include_router(inventory.router)
api_router.include_router(suppliers.router)
api_router.include_router(part_requests.router)
api_router.include_router(dashboard.router)
api_router.include_router(reports.router)
api_router.include_router(audit_logs.router)
api_router.include_router(notifications.router)
