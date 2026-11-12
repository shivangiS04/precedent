import { AccessDeniedError, requireAccountId } from '../permissions/access';

/** What an action returns to Rovo / an MCP client. The agent turns it into natural language. */
export type ActionResult = Record<string, unknown> | string;

export type GuardedHandler<P> = (payload: P, accountId: string, context: unknown) => Promise<ActionResult>;

/**
 * Wraps an action handler so it only runs with an authenticated caller.
 * - No accountId in context  -> structured "rejected" result, handler never runs.
 * - Unexpected errors        -> generic error result (no internals leaked to the agent).
 */
export function guarded<P>(handler: GuardedHandler<P>) {
  return async (payload: P, context: unknown): Promise<ActionResult> => {
    let accountId: string;
    try {
      accountId = requireAccountId(context);
    } catch (err) {
      if (err instanceof AccessDeniedError) {
        return { status: 'rejected', reason: 'Request has no authenticated user. Precedent only answers signed-in users.' };
      }
      throw err;
    }
    try {
      return await handler(payload, accountId, context);
    } catch (err) {
      console.error('Precedent action failed', err);
      return { status: 'error', reason: 'Precedent could not complete this request. Try again later.' };
    }
  };
}
