import { guarded } from './guard';

/**
 * Rovo action / MCP tool handlers. M0 wires them up behind the auth guard;
 * real logic arrives in M1 (ledger), M2 (matcher) and M4 (agent).
 */
const notYet = (milestone: string) => ({
  status: 'not_implemented',
  message: `This Precedent tool is scaffolded and will be enabled in ${milestone}.`,
});

export const findPrecedent = guarded(async () => notYet('M4'));
export const checkConflict = guarded(async () => notYet('M4'));
export const getDecisionContext = guarded(async () => notYet('M4'));
export const recordDecision = guarded(async () => notYet('M4'));
export const proposeRevisit = guarded(async () => notYet('M4'));
