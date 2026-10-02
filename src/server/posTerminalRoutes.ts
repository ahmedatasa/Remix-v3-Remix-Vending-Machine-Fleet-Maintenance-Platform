import express from 'express';
import crypto from 'crypto';

import {
  createRequireEnterpriseRole
} from './authSecurity';

import type {
  RuntimeStoreData
} from './runtimeStoreTypes';

interface PosTerminalRouteDeps {
  getStore: () => RuntimeStoreData;
  saveStore: (store?: RuntimeStoreData) => void;
}

const WRITE_ROLES = [
  'SUPER_ADMIN',
  'ADMIN'
];

function nextId(prefix: string) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

function normalizeTerminalReference(value: any) {
  return String(value || '')
    .trim()
    .toUpperCase();
}

function ensureCollections(store: RuntimeStoreData) {
  const mutable = store as RuntimeStoreData & {
    posTerminals?: any[];
    posTerminalMappings?: any[];
  };

  if (!Array.isArray(mutable.posTerminals)) {
    mutable.posTerminals = [];
  }

  if (!Array.isArray(mutable.posTerminalMappings)) {
    mutable.posTerminalMappings = [];
  }

  if (!Array.isArray(mutable.auditLogs)) {
    mutable.auditLogs = [];
  }

  return mutable;
}

function actorFromRequest(req: express.Request) {
  const user = (req as any).user || {};

  return {
    actorId:
      String(user.id || '').trim() ||
      undefined,

    actorName:
      String(
        user.fullName ||
        user.name ||
        user.email ||
        user.id ||
        'SYSTEM'
      ).trim()
  };
}

function appendAudit(
  store: any,
  action: string,
  entityName: string,
  entityId: string,
  actor: any,
  values: any
) {
  store.auditLogs.unshift({
    id: nextId('aud'),
    action,
    entityName,
    entityId,
    newValues: values,
    userId: actor.actorId,
    userName: actor.actorName,
    createdAt: new Date().toISOString()
  });
}

function findTerminal(
  store: any,
  terminalId: string
) {
  return (store.posTerminals || [])
    .find(
      (item: any) =>
        item.id === terminalId
    );
}

function findMachine(
  store: RuntimeStoreData,
  machineId: string
) {
  return (store.machines || [])
    .find(
      (item: any) =>
        item.id === machineId &&
        item.isDeleted !== true
    );
}

function parseTimestamp(
  value: any,
  defaultNow = false
) {
  const raw =
    String(value || '').trim();

  if (!raw) {
    if (defaultNow) {
      return new Date().toISOString();
    }

    return null;
  }

  const parsed = new Date(raw);
  const ms = parsed.getTime();

  if (!Number.isFinite(ms)) {
    return null;
  }

  return parsed.toISOString();
}

function timestampMs(value: any) {
  const ms =
    new Date(String(value || '')).getTime();

  return Number.isFinite(ms)
    ? ms
    : Number.NaN;
}

function terminalMappings(
  store: any,
  terminalId: string
) {
  return (store.posTerminalMappings || [])
    .filter(
      (item: any) =>
        item.terminalId === terminalId
    );
}

function mappingsAt(
  store: any,
  terminalId: string,
  atMs: number
) {
  return terminalMappings(store, terminalId)
    .filter((mapping: any) => {
      const fromMs =
        timestampMs(mapping.effectiveFrom);

      const toMs =
        mapping.effectiveTo
          ? timestampMs(mapping.effectiveTo)
          : Number.POSITIVE_INFINITY;

      return (
        Number.isFinite(fromMs) &&
        fromMs <= atMs &&
        atMs < toMs
      );
    })
    .sort(
      (a: any, b: any) =>
        String(b.effectiveFrom || '')
          .localeCompare(
            String(a.effectiveFrom || '')
          )
    );
}

function currentMapping(
  store: any,
  terminalId: string
) {
  const rows = mappingsAt(
    store,
    terminalId,
    Date.now()
  );

  return rows.length === 1
    ? rows[0]
    : null;
}

function enrichMapping(
  store: any,
  row: any
) {
  return {
    ...row,

    terminal:
      findTerminal(
        store,
        row.terminalId
      ),

    machine:
      findMachine(
        store,
        row.machineId
      )
  };
}

function enrichTerminal(
  store: any,
  row: any
) {
  const mapping =
    currentMapping(store, row.id);

  return {
    ...row,

    currentMapping:
      mapping
        ? enrichMapping(store, mapping)
        : null
  };
}

function hasOpenMapping(
  store: any,
  terminalId: string
) {
  return terminalMappings(store, terminalId)
    .filter(
      (item: any) =>
        !item.effectiveTo
    );
}

function overlapsExistingMapping(
  store: any,
  terminalId: string,
  proposedFromMs: number,
  proposedToMs:
    number | null,
  excludeMappingId?: string
) {
  const proposedEnd =
    proposedToMs === null
      ? Number.POSITIVE_INFINITY
      : proposedToMs;

  return terminalMappings(store, terminalId)
    .some((mapping: any) => {
      if (
        excludeMappingId &&
        mapping.id === excludeMappingId
      ) {
        return false;
      }

      const existingStart =
        timestampMs(mapping.effectiveFrom);

      const existingEnd =
        mapping.effectiveTo
          ? timestampMs(mapping.effectiveTo)
          : Number.POSITIVE_INFINITY;

      if (!Number.isFinite(existingStart)) {
        return true;
      }

      return (
        proposedFromMs < existingEnd &&
        existingStart < proposedEnd
      );
    });
}

export function createPosTerminalRouter(
  deps: PosTerminalRouteDeps
) {
  const router = express.Router();

  const requireWriteRole =
    createRequireEnterpriseRole(
      WRITE_ROLES
    );

  // POS terminal registry and mapping are administrative configuration.
  // Transaction import will use internal mapping logic later; browser API
  // access remains restricted to system administrators.
  router.use(requireWriteRole);

  router.get('/summary', (_req, res) => {
    const store =
      ensureCollections(deps.getStore());

    const terminals =
      store.posTerminals || [];

    let mappedNow = 0;

    for (const terminal of terminals) {
      if (
        currentMapping(
          store,
          terminal.id
        )
      ) {
        mappedNow++;
      }
    }

    res.json({
      totalTerminals:
        terminals.length,

      activeTerminals:
        terminals.filter(
          (row: any) =>
            row.isActive !== false
        ).length,

      inactiveTerminals:
        terminals.filter(
          (row: any) =>
            row.isActive === false
        ).length,

      mappedNow,

      unmappedNow:
        terminals.length - mappedNow,

      mappingHistoryCount:
        (store.posTerminalMappings || [])
          .length
    });
  });

  router.get('/resolve', (req, res) => {
    const store =
      ensureCollections(deps.getStore());

    const terminalReference =
      String(
        req.query.terminal_reference ||
        ''
      ).trim();

    const normalizedReference =
      normalizeTerminalReference(
        terminalReference
      );

    if (!normalizedReference) {
      return res.status(400).json({
        error:
          'TERMINAL_REFERENCE_REQUIRED'
      });
    }

    const at =
      parseTimestamp(
        req.query.at,
        true
      );

    if (!at) {
      return res.status(400).json({
        error:
          'RESOLUTION_TIMESTAMP_INVALID'
      });
    }

    const terminal =
      (store.posTerminals || [])
        .find(
          (row: any) =>
            row.normalizedReference ===
            normalizedReference
        );

    if (!terminal) {
      return res.json({
        status:
          'UNREGISTERED_TERMINAL',

        terminalReference,
        resolvedAt: at
      });
    }

    const matches =
      mappingsAt(
        store,
        terminal.id,
        timestampMs(at)
      );

    if (matches.length > 1) {
      return res.json({
        status: 'AMBIGUOUS',
        terminalReference,
        resolvedAt: at,
        terminal:
          enrichTerminal(
            store,
            terminal
          )
      });
    }

    if (matches.length === 0) {
      return res.json({
        status: 'UNMAPPED',
        terminalReference,
        resolvedAt: at,
        terminal:
          enrichTerminal(
            store,
            terminal
          )
      });
    }

    const mapping =
      enrichMapping(
        store,
        matches[0]
      );

    return res.json({
      status: 'MAPPED',
      terminalReference,
      resolvedAt: at,
      terminal:
        enrichTerminal(
          store,
          terminal
        ),
      mapping,
      machine: mapping.machine
    });
  });

  router.get('/', (req, res) => {
    const store =
      ensureCollections(deps.getStore());

    const includeInactive =
      String(
        req.query.include_inactive ||
        ''
      ).toLowerCase() === 'true';

    const rows =
      (store.posTerminals || [])
        .filter(
          (row: any) =>
            includeInactive ||
            row.isActive !== false
        )
        .slice()
        .sort(
          (a: any, b: any) =>
            String(
              a.terminalReference ||
              ''
            ).localeCompare(
              String(
                b.terminalReference ||
                ''
              ),
              undefined,
              { numeric: true }
            )
        )
        .map(
          (row: any) =>
            enrichTerminal(
              store,
              row
            )
        );

    res.json(rows);
  });

  router.get('/mappings', (req, res) => {
    const store =
      ensureCollections(deps.getStore());

    const terminalId =
      String(
        req.query.terminal_id ||
        ''
      ).trim();

    const machineId =
      String(
        req.query.machine_id ||
        ''
      ).trim();

    const rows =
      (store.posTerminalMappings || [])
        .filter(
          (row: any) =>
            (
              !terminalId ||
              row.terminalId ===
              terminalId
            ) &&
            (
              !machineId ||
              row.machineId ===
              machineId
            )
        )
        .slice()
        .sort(
          (a: any, b: any) =>
            String(
              b.effectiveFrom ||
              ''
            ).localeCompare(
              String(
                a.effectiveFrom ||
                ''
              )
            )
        )
        .map(
          (row: any) =>
            enrichMapping(
              store,
              row
            )
        );

    res.json(rows);
  });

  router.get('/:id', (req, res) => {
    const store =
      ensureCollections(deps.getStore());

    const terminal =
      findTerminal(
        store,
        req.params.id
      );

    if (!terminal) {
      return res.status(404).json({
        error:
          'POS_TERMINAL_NOT_FOUND'
      });
    }

    const history =
      terminalMappings(
        store,
        terminal.id
      )
        .slice()
        .sort(
          (a: any, b: any) =>
            String(
              b.effectiveFrom ||
              ''
            ).localeCompare(
              String(
                a.effectiveFrom ||
                ''
              )
            )
        )
        .map(
          (row: any) =>
            enrichMapping(
              store,
              row
            )
        );

    return res.json({
      ...enrichTerminal(
        store,
        terminal
      ),
      mappingHistory: history
    });
  });

  router.post(
    '/',
    requireWriteRole,
    (req, res) => {
      const store =
        ensureCollections(
          deps.getStore()
        );

      const actor =
        actorFromRequest(req);

      const terminalReference =
        String(
          req.body?.terminalReference ||
          ''
        ).trim();

      const normalizedReference =
        normalizeTerminalReference(
          terminalReference
        );

      if (!normalizedReference) {
        return res.status(400).json({
          error:
            'TERMINAL_REFERENCE_REQUIRED'
        });
      }

      const duplicate =
        (store.posTerminals || [])
          .find(
            (row: any) =>
              row.normalizedReference ===
              normalizedReference
          );

      if (duplicate) {
        return res.status(409).json({
          error:
            'POS_TERMINAL_REFERENCE_EXISTS',
          terminalId:
            duplicate.id
        });
      }

      const now =
        new Date().toISOString();

      const terminal = {
        id:
          nextId('pos-term'),

        terminalReference,
        normalizedReference,

        displayName:
          String(
            req.body?.displayName ||
            terminalReference
          ).trim(),

        providerName:
          String(
            req.body?.providerName ||
            ''
          ).trim() ||
          undefined,

        notes:
          String(
            req.body?.notes ||
            ''
          ).trim() ||
          undefined,

        isActive: true,

        createdAt: now,
        updatedAt: now,

        createdById:
          actor.actorId,

        createdByName:
          actor.actorName,

        updatedById:
          actor.actorId,

        updatedByName:
          actor.actorName
      };

      store.posTerminals!.push(
        terminal
      );

      appendAudit(
        store,
        'POS_TERMINAL_CREATED',
        'PosTerminal',
        terminal.id,
        actor,
        {
          terminalReference:
            terminal.terminalReference,

          providerName:
            terminal.providerName
        }
      );

      deps.saveStore(store);

      return res.status(201).json(
        enrichTerminal(
          store,
          terminal
        )
      );
    }
  );

  router.patch(
    '/:id',
    requireWriteRole,
    (req, res) => {
      const store =
        ensureCollections(
          deps.getStore()
        );

      const terminal =
        findTerminal(
          store,
          req.params.id
        );

      if (!terminal) {
        return res.status(404).json({
          error:
            'POS_TERMINAL_NOT_FOUND'
        });
      }

      if (
        req.body?.terminalReference !==
        undefined
      ) {
        const requested =
          normalizeTerminalReference(
            req.body.terminalReference
          );

        if (
          requested !==
          terminal.normalizedReference
        ) {
          return res.status(409).json({
            error:
              'POS_TERMINAL_REFERENCE_IMMUTABLE'
          });
        }
      }

      if (
        req.body?.isActive === false &&
        hasOpenMapping(
          store,
          terminal.id
        ).length > 0
      ) {
        return res.status(409).json({
          error:
            'POS_TERMINAL_ACTIVE_MAPPING_EXISTS',
          message:
            'Unassign the terminal before deactivating it.'
        });
      }

      const actor =
        actorFromRequest(req);

      const oldValues = {
        displayName:
          terminal.displayName,

        providerName:
          terminal.providerName,

        notes:
          terminal.notes,

        isActive:
          terminal.isActive
      };

      if (
        req.body?.displayName !==
        undefined
      ) {
        const value =
          String(
            req.body.displayName ||
            ''
          ).trim();

        if (!value) {
          return res.status(400).json({
            error:
              'POS_TERMINAL_DISPLAY_NAME_REQUIRED'
          });
        }

        terminal.displayName =
          value;
      }

      if (
        req.body?.providerName !==
        undefined
      ) {
        terminal.providerName =
          String(
            req.body.providerName ||
            ''
          ).trim() ||
          undefined;
      }

      if (
        req.body?.notes !==
        undefined
      ) {
        terminal.notes =
          String(
            req.body.notes ||
            ''
          ).trim() ||
          undefined;
      }

      if (
        typeof req.body?.isActive ===
        'boolean'
      ) {
        terminal.isActive =
          req.body.isActive;
      }

      terminal.updatedAt =
        new Date().toISOString();

      terminal.updatedById =
        actor.actorId;

      terminal.updatedByName =
        actor.actorName;

      appendAudit(
        store,
        'POS_TERMINAL_UPDATED',
        'PosTerminal',
        terminal.id,
        actor,
        {
          oldValues,

          newValues: {
            displayName:
              terminal.displayName,

            providerName:
              terminal.providerName,

            notes:
              terminal.notes,

            isActive:
              terminal.isActive
          }
        }
      );

      deps.saveStore(store);

      return res.json(
        enrichTerminal(
          store,
          terminal
        )
      );
    }
  );

  router.post(
    '/:id/assign',
    requireWriteRole,
    (req, res) => {
      const store =
        ensureCollections(
          deps.getStore()
        );

      const terminal =
        findTerminal(
          store,
          req.params.id
        );

      if (!terminal) {
        return res.status(404).json({
          error:
            'POS_TERMINAL_NOT_FOUND'
        });
      }

      if (
        terminal.isActive === false
      ) {
        return res.status(409).json({
          error:
            'POS_TERMINAL_INACTIVE'
        });
      }

      const machineId =
        String(
          req.body?.machineId ||
          ''
        ).trim();

      const machine =
        findMachine(
          store,
          machineId
        );

      if (!machine) {
        return res.status(404).json({
          error:
            'MACHINE_NOT_FOUND'
        });
      }

      const effectiveFrom =
        parseTimestamp(
          req.body?.effectiveFrom,
          true
        );

      if (!effectiveFrom) {
        return res.status(400).json({
          error:
            'EFFECTIVE_FROM_INVALID'
        });
      }

      const fromMs =
        timestampMs(
          effectiveFrom
        );

      const openMappings =
        hasOpenMapping(
          store,
          terminal.id
        );

      if (
        openMappings.length > 1
      ) {
        return res.status(409).json({
          error:
            'POS_MAPPING_STATE_INVALID',
          message:
            'Multiple open mappings exist for this terminal.'
        });
      }

      const current =
        openMappings[0] ||
        null;

      if (current) {
        const currentStart =
          timestampMs(
            current.effectiveFrom
          );

        if (
          !Number.isFinite(currentStart) ||
          fromMs <= currentStart
        ) {
          return res.status(409).json({
            error:
              'POS_MAPPING_EFFECTIVE_ORDER_INVALID'
          });
        }

        if (
          current.machineId ===
          machineId
        ) {
          return res.json({
            unchanged: true,
            mapping:
              enrichMapping(
                store,
                current
              )
          });
        }

        if (
          overlapsExistingMapping(
            store,
            terminal.id,
            fromMs,
            null,
            current.id
          )
        ) {
          return res.status(409).json({
            error:
              'POS_MAPPING_OVERLAP'
          });
        }
      } else if (
        overlapsExistingMapping(
          store,
          terminal.id,
          fromMs,
          null
        )
      ) {
        return res.status(409).json({
          error:
            'POS_MAPPING_OVERLAP'
        });
      }

      const actor =
        actorFromRequest(req);

      const now =
        new Date().toISOString();

      if (current) {
        current.effectiveTo =
          effectiveFrom;

        current.updatedAt =
          now;

        current.closedById =
          actor.actorId;

        current.closedByName =
          actor.actorName;
      }

      const mapping = {
        id:
          nextId('pos-map'),

        terminalId:
          terminal.id,

        machineId,

        effectiveFrom,
        effectiveTo: null,

        notes:
          String(
            req.body?.notes ||
            ''
          ).trim() ||
          undefined,

        createdAt: now,
        updatedAt: now,

        createdById:
          actor.actorId,

        createdByName:
          actor.actorName
      };

      store.posTerminalMappings!.push(
        mapping
      );

      appendAudit(
        store,
        current
          ? 'POS_TERMINAL_REASSIGNED'
          : 'POS_TERMINAL_ASSIGNED',

        'PosTerminalMapping',
        mapping.id,
        actor,
        {
          terminalId:
            terminal.id,

          terminalReference:
            terminal.terminalReference,

          previousMachineId:
            current?.machineId,

          machineId,

          effectiveFrom
        }
      );

      deps.saveStore(store);

      return res.status(201).json({
        mapping:
          enrichMapping(
            store,
            mapping
          ),

        previousMapping:
          current
            ? enrichMapping(
                store,
                current
              )
            : null
      });
    }
  );

  router.post(
    '/:id/unassign',
    requireWriteRole,
    (req, res) => {
      const store =
        ensureCollections(
          deps.getStore()
        );

      const terminal =
        findTerminal(
          store,
          req.params.id
        );

      if (!terminal) {
        return res.status(404).json({
          error:
            'POS_TERMINAL_NOT_FOUND'
        });
      }

      const openMappings =
        hasOpenMapping(
          store,
          terminal.id
        );

      if (
        openMappings.length === 0
      ) {
        return res.status(409).json({
          error:
            'POS_TERMINAL_NOT_ASSIGNED'
        });
      }

      if (
        openMappings.length > 1
      ) {
        return res.status(409).json({
          error:
            'POS_MAPPING_STATE_INVALID'
        });
      }

      const mapping =
        openMappings[0];

      const effectiveTo =
        parseTimestamp(
          req.body?.effectiveTo,
          true
        );

      if (!effectiveTo) {
        return res.status(400).json({
          error:
            'EFFECTIVE_TO_INVALID'
        });
      }

      const fromMs =
        timestampMs(
          mapping.effectiveFrom
        );

      const toMs =
        timestampMs(
          effectiveTo
        );

      if (
        !Number.isFinite(fromMs) ||
        !Number.isFinite(toMs) ||
        toMs <= fromMs
      ) {
        return res.status(409).json({
          error:
            'POS_MAPPING_EFFECTIVE_ORDER_INVALID'
        });
      }

      const actor =
        actorFromRequest(req);

      mapping.effectiveTo =
        effectiveTo;

      mapping.updatedAt =
        new Date().toISOString();

      mapping.closedById =
        actor.actorId;

      mapping.closedByName =
        actor.actorName;

      if (
        req.body?.notes !==
        undefined
      ) {
        mapping.notes =
          String(
            req.body.notes ||
            ''
          ).trim() ||
          mapping.notes;
      }

      appendAudit(
        store,
        'POS_TERMINAL_UNASSIGNED',
        'PosTerminalMapping',
        mapping.id,
        actor,
        {
          terminalId:
            terminal.id,

          terminalReference:
            terminal.terminalReference,

          machineId:
            mapping.machineId,

          effectiveTo
        }
      );

      deps.saveStore(store);

      return res.json(
        enrichMapping(
          store,
          mapping
        )
      );
    }
  );

  return router;
}
