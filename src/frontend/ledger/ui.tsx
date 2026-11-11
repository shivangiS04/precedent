import React from 'react';
import { Lozenge } from '@forge/react';
import type { Decision, DecisionStatus } from '../../domain/types';

export const STATUS_LABEL: Record<DecisionStatus, string> = {
  proposed: 'Proposed',
  accepted: 'Accepted',
  revisit: 'Revisit',
  superseded: 'Superseded',
};

const STATUS_APPEARANCE = {
  proposed: 'new',
  accepted: 'success',
  revisit: 'moved',
  superseded: 'removed',
} as const;

export const StatusLozenge = ({ status }: { status: DecisionStatus }) => (
  <Lozenge appearance={STATUS_APPEARANCE[status]}>{STATUS_LABEL[status]}</Lozenge>
);

export const today = () => new Date().toISOString().slice(0, 10);

/** A decision is due for revisit when its revisit date has passed and it's still live. */
export const isDueForRevisit = (d: Decision) =>
  !!d.revisitBy && d.revisitBy <= today() && d.status !== 'superseded';

export const formatDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
};
