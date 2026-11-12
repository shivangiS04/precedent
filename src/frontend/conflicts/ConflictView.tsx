import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  EmptyState,
  ErrorMessage,
  Heading,
  Inline,
  Label,
  Link,
  Lozenge,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalTransition,
  SectionMessage,
  Spinner,
  Stack,
  Text,
  TextArea,
  User,
  xcss,
} from '@forge/react';
import { makeInvoke, rovo } from '@forge/bridge';
import type { Defs } from '../../shared/types';
import type { ConflictCard, IssueCheck } from '../../core/check';
import type { GraphContext } from '../../core/graph';
import { StatusLozenge } from '../ledger/ui';

const invoke = makeInvoke<Defs>();

const cardStyle = xcss({
  borderColor: 'color.border',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderRadius: 'radius.medium',
  padding: 'space.150',
});
const conflictStyle = xcss({
  borderColor: 'color.border.warning',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderRadius: 'radius.medium',
  padding: 'space.150',
  backgroundColor: 'color.background.warning.subtler',
});

const LEVEL = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' } as const;
const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Teamwork Graph context for one decision, loaded after the card renders. */
const GraphLine = ({ decisionId }: { decisionId: string }) => {
  const [g, setG] = useState<GraphContext | null>(null);
  useEffect(() => {
    invoke('decisionGraph', { decisionId })
      .then(setG)
      .catch(() => setG({ available: false }));
  }, [decisionId]);
  if (!g) return <Text>Loading related goals and teams…</Text>;
  if (!g.available) return null;
  const parts: [string, { name: string; url?: string | null }[]][] = [
    ['Goals', g.goals ?? []],
    ['Owner\'s teams', g.teams ?? []],
    ['Also ask', g.people ?? []],
  ];
  const shown = parts.filter(([, items]) => items.length);
  if (!shown.length) return null;
  return (
    <Stack space="space.050">
      {shown.map(([label, items]) => (
        <Text key={label}>
          <Text weight="semibold">{`${label}: `}</Text>
          {items.slice(0, 3).map((i, n) => (
            <React.Fragment key={i.name}>
              {n > 0 ? ', ' : ''}
              {i.url ? (
                <Link href={i.url} openNewTab>
                  {i.name}
                </Link>
              ) : (
                i.name
              )}
            </React.Fragment>
          ))}
        </Text>
      ))}
    </Stack>
  );
};

const Card = ({
  card,
  compact,
  onDismiss,
  onRevisit,
}: {
  card: ConflictCard;
  compact: boolean;
  onDismiss: () => void;
  onRevisit: () => void;
}) => {
  const d = card.decision;
  const source = d.sources.find((s) => s.url);
  return (
    <Box xcss={card.kind === 'conflict' ? conflictStyle : cardStyle}>
      <Stack space="space.100">
        <Inline space="space.075" alignBlock="center" shouldWrap>
          <Lozenge appearance={card.kind === 'conflict' ? 'removed' : 'moved'} isBold={card.kind === 'conflict'}>
            {card.kind === 'conflict' ? 'Conflict' : 'Related'}
          </Lozenge>
          <StatusLozenge status={d.status} />
          {!compact && <Text>{LEVEL[card.level]}</Text>}
        </Inline>
        <Heading size="xsmall">{d.title}</Heading>
        <Text>{card.explanation}</Text>
        {!compact && (
          <Stack space="space.050">
            <Text>
              <Text weight="semibold">Decision: </Text>
              {d.statement}
            </Text>
            <Text>
              <Text weight="semibold">Why: </Text>
              {truncate(d.rationale, 280)}
            </Text>
          </Stack>
        )}
        <Inline space="space.100" alignBlock="center" shouldWrap>
          {d.ownerAccountId && (
            <Inline space="space.050" alignBlock="center">
              <Text>Talk to</Text>
              <User accountId={d.ownerAccountId} />
            </Inline>
          )}
          {source?.url && (
            <Link href={source.url} openNewTab>
              {source.kind === 'confluence-page' ? 'Read the decision' : `Source ${source.ref}`}
            </Link>
          )}
        </Inline>
        {!compact && card.kind === 'conflict' && <GraphLine decisionId={d.id} />}
        <Inline space="space.100" shouldWrap>
          <Button appearance="subtle" spacing="compact" onClick={onDismiss}>
            Not related
          </Button>
          {d.status !== 'revisit' && (
            <Button appearance="subtle" spacing="compact" onClick={onRevisit}>
              Propose revisit
            </Button>
          )}
        </Inline>
      </Stack>
    </Box>
  );
};

/** Full conflict view for the issue panel; `compact` for the narrow issue sidebar. */
export const ConflictView = ({ compact = false }: { compact?: boolean }) => {
  const [check, setCheck] = useState<IssueCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [rovoEnabled, setRovoEnabled] = useState(false);
  const [revisiting, setRevisiting] = useState<ConflictCard | null>(null);
  const [reason, setReason] = useState('');
  const [revisitError, setRevisitError] = useState<string | null>(null);
  const [showDismissed, setShowDismissed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await invoke('checkIssue');
      setCheck(res.check);
      setError(res.error ?? null);
    } catch {
      setError('Precedent could not check this work item. Try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    rovo.isEnabled().then(setRovoEnabled).catch(() => setRovoEnabled(false));
  }, [load]);

  const act = async (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) => {
    const res = await fn().catch(() => ({ ok: false, error: 'Something went wrong. Try again.' }));
    setNotice(res.ok ? done : res.error ?? 'Something went wrong.');
    await load();
  };

  const submitRevisit = async () => {
    if (!revisiting) return;
    const res = await invoke('proposeRevisit', { decisionId: revisiting.decisionId, reason }).catch(() => ({
      ok: false as const,
      error: 'Something went wrong. Try again.',
    }));
    if (!res.ok) {
      setRevisitError(res.error);
      return;
    }
    setNotice(`"${revisiting.decision.title}" is now open for revisit.`);
    setRevisiting(null);
    setReason('');
    setRevisitError(null);
    await load();
  };

  if (loading && !check) return <Spinner label="Checking past decisions" />;
  if (error && !check)
    return (
      <SectionMessage appearance="warning">
        <Text>{error}</Text>
      </SectionMessage>
    );
  if (!check) return null;

  const cards = [...check.conflicts, ...check.related];
  const ask = () =>
    rovo.open({
      type: 'forge',
      agentName: 'Precedent',
      agentKey: 'precedent-agent',
      prompt: `Does ${check.issueKey} conflict with any past decision? Who should I talk to?`,
    });

  return (
    <Stack space="space.200">
      {notice && (
        <SectionMessage appearance="information">
          <Text>{notice}</Text>
        </SectionMessage>
      )}

      {cards.length === 0 ? (
        <EmptyState
          header="No conflicts with recorded decisions"
          description={compact ? 'Nothing in the Decision Ledger matches this work.' : 'Nothing in your Decision Ledger matches this work item. Precedent re-checks when the summary or description changes.'}
        />
      ) : (
        <Text>
          {[
            check.conflicts.length ? `${check.conflicts.length} conflict${check.conflicts.length === 1 ? '' : 's'}` : '',
            check.related.length ? `${check.related.length} related decision${check.related.length === 1 ? '' : 's'}` : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      )}

      {cards.map((c) => (
        <Card
          key={c.decisionId}
          card={c}
          compact={compact}
          onDismiss={() => act(() => invoke('dismissConflict', { decisionId: c.decisionId }), `Marked "${c.decision.title}" as not related to ${check.issueKey}.`)}
          onRevisit={() => setRevisiting(c)}
        />
      ))}

      {check.dismissed.length > 0 && (
        <Stack space="space.075">
          <Button appearance="subtle" spacing="compact" onClick={() => setShowDismissed(!showDismissed)}>
            {`${showDismissed ? 'Hide' : 'Show'} ${check.dismissed.length} marked not related`}
          </Button>
          {showDismissed &&
            check.dismissed.map((c) => (
              <Inline key={c.decisionId} space="space.100" alignBlock="center" shouldWrap>
                <Text>{c.decision.title}</Text>
                <Button appearance="subtle" spacing="compact" onClick={() => act(() => invoke('restoreConflict', { decisionId: c.decisionId }), `Restored "${c.decision.title}".`)}>
                  Restore
                </Button>
              </Inline>
            ))}
        </Stack>
      )}

      <Inline space="space.100">
        {rovoEnabled && <Button onClick={ask}>Ask Precedent</Button>}
        <Button appearance="subtle" onClick={load} isDisabled={loading}>
          {loading ? 'Checking…' : 'Check again'}
        </Button>
      </Inline>

      <ModalTransition>
        {revisiting && (
          <Modal onClose={() => setRevisiting(null)}>
            <ModalHeader>
              <ModalTitle>Propose revisit</ModalTitle>
            </ModalHeader>
            <ModalBody>
              <Stack space="space.150">
                <Text>{`"${revisiting.decision.title}" will be marked Revisit so the team can discuss it again.`}</Text>
                <Label labelFor="reason">What changed since the decision was made?</Label>
                <TextArea id="reason" value={reason} onChange={(e) => setReason(String((e as { target?: { value?: string } }).target?.value ?? ''))} minimumRows={3} />
                {revisitError && <ErrorMessage>{revisitError}</ErrorMessage>}
              </Stack>
            </ModalBody>
            <ModalFooter>
              <Button appearance="subtle" onClick={() => setRevisiting(null)}>
                Cancel
              </Button>
              <Button appearance="primary" onClick={submitRevisit} isDisabled={!reason.trim()}>
                Propose revisit
              </Button>
            </ModalFooter>
          </Modal>
        )}
      </ModalTransition>
    </Stack>
  );
};
