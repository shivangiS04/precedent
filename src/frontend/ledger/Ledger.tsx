import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  DynamicTable,
  EmptyState,
  Heading,
  Inline,
  ModalTransition,
  SectionMessage,
  Select,
  Stack,
  Tag,
  TagGroup,
  Text,
  Textfield,
  User,
} from '@forge/react';
import { makeInvoke, rovo } from '@forge/bridge';
import type { Defs } from '../../shared/types';
import type { Decision, DecisionStatus } from '../../domain/types';
import { DecisionDetail } from './DecisionDetail';
import { DecisionForm } from './DecisionForm';
import { StatusLozenge, formatDate, isDueForRevisit, STATUS_LABEL } from './ui';

const invoke = makeInvoke<Defs>();

type View = 'all' | 'due';
const STATUS_FILTERS = [
  { label: 'All statuses', value: '' },
  ...(['accepted', 'proposed', 'revisit', 'superseded'] as DecisionStatus[]).map((s) => ({ label: STATUS_LABEL[s], value: s })),
];

export const Ledger = () => {
  const [decisions, setDecisions] = useState<Decision[] | null>(null);
  const [hidden, setHidden] = useState(0);
  const [error, setError] = useState(false);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string>('');
  const [project, setProject] = useState<string>('');
  const [view, setView] = useState<View>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Decision | 'new' | null>(null);
  const [rovoEnabled, setRovoEnabled] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await invoke('listDecisions', {});
      setDecisions(res.decisions);
      setHidden(res.hidden);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    load();
    rovo.isEnabled().then(setRovoEnabled).catch(() => setRovoEnabled(false));
  }, [load]);

  const projects = useMemo(
    () => Array.from(new Set((decisions ?? []).flatMap((d) => d.scope.projects))).sort(),
    [decisions],
  );

  // Filtering happens client-side; the server already removed anything the user can't see.
  const filtered = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return (decisions ?? []).filter((d) => {
      if (view === 'due' && !isDueForRevisit(d)) return false;
      if (status && d.status !== status) return false;
      if (project && !d.scope.projects.includes(project)) return false;
      if (!terms.length) return true;
      const hay = [d.title, d.statement, ...d.scope.keywords, ...d.alternatives.map((a) => a.alternative)].join(' ').toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [decisions, q, status, project, view]);

  const dueCount = (decisions ?? []).filter(isDueForRevisit).length;
  const open = openId ? (decisions ?? []).find((d) => d.id === openId) ?? null : null;

  const head = {
    cells: [
      { key: 'title', content: 'Decision', isSortable: true },
      { key: 'status', content: 'Status', isSortable: true },
      { key: 'owner', content: 'Owner' },
      { key: 'decided', content: 'Decided', isSortable: true },
      { key: 'revisit', content: 'Revisit by', isSortable: true },
      { key: 'scope', content: 'Projects' },
    ],
  };

  const rows = filtered.map((d) => ({
    key: d.id,
    cells: [
      {
        key: d.title,
        content: (
          <Button appearance="subtle" onClick={() => setOpenId(d.id)}>
            {d.title}
          </Button>
        ),
      },
      { key: d.status, content: <StatusLozenge status={d.status} /> },
      { key: d.ownerAccountId ?? '', content: d.ownerAccountId ? <User accountId={d.ownerAccountId} /> : <Text>—</Text> },
      { key: d.decidedAt ?? '', content: <Text>{formatDate(d.decidedAt)}</Text> },
      {
        key: d.revisitBy ?? '9999',
        content: isDueForRevisit(d) ? <Tag text={`Due ${formatDate(d.revisitBy)}`} color="orangeLight" /> : <Text>{formatDate(d.revisitBy)}</Text>,
      },
      {
        key: d.scope.projects.join(','),
        content: (
          <TagGroup>
            {d.scope.projects.map((p) => (
              <Tag key={p} text={p} color="blueLight" />
            ))}
          </TagGroup>
        ),
      },
    ],
  }));

  return (
    <Stack space="space.300">
      <Inline spread="space-between" alignBlock="center">
        <Stack space="space.050">
          <Heading size="large">Decision Ledger</Heading>
          <Text>What your team decided, why, and who to ask.</Text>
        </Stack>
        <Inline space="space.100">
          {rovoEnabled && (
            <Button
              onClick={() =>
                rovo.open({ type: 'forge', agentName: 'Precedent', agentKey: 'precedent-agent', prompt: 'What did we decide about caching and why?' })
              }
            >
              Ask Precedent
            </Button>
          )}
          <Button appearance="primary" onClick={() => setEditing('new')}>
            Record decision
          </Button>
        </Inline>
      </Inline>

      {error && (
        <SectionMessage appearance="error" title="Couldn't load decisions">
          <Text>Precedent couldn't reach its database. Reload the page to try again.</Text>
        </SectionMessage>
      )}
      {hidden > 0 && (
        <SectionMessage appearance="information">
          <Text>{`${hidden} decision${hidden === 1 ? ' is' : 's are'} hidden because you can't view ${hidden === 1 ? 'its' : 'their'} source pages or work items.`}</Text>
        </SectionMessage>
      )}

      <Inline space="space.100" alignBlock="center" shouldWrap>
        <Button appearance={view === 'all' ? 'primary' : 'default'} onClick={() => setView('all')}>
          {`All (${decisions?.length ?? 0})`}
        </Button>
        <Button appearance={view === 'due' ? 'warning' : 'default'} onClick={() => setView('due')}>
          {`Due for revisit (${dueCount})`}
        </Button>
        <Textfield placeholder="Search decisions, keywords, alternatives" value={q} onChange={(e) => setQ(String((e as { target?: { value?: string } }).target?.value ?? ''))} width={320} />
        <Select
          options={STATUS_FILTERS}
          value={STATUS_FILTERS.find((o) => o.value === status)}
          onChange={(o: { value: string }) => setStatus(o?.value ?? '')}
        />
        <Select
          options={[{ label: 'All projects', value: '' }, ...projects.map((p) => ({ label: p, value: p }))]}
          value={project ? { label: project, value: project } : { label: 'All projects', value: '' }}
          onChange={(o: { value: string }) => setProject(o?.value ?? '')}
        />
      </Inline>

      <DynamicTable
        label="Decisions"
        head={head}
        rows={rows}
        rowsPerPage={15}
        isLoading={decisions === null && !error}
        defaultSortKey="decided"
        defaultSortOrder="DESC"
        emptyView={
          (decisions?.length ?? 0) === 0 ? (
            <EmptyState
              header="Your Decision Ledger is empty"
              description="Record your first decision to start building team memory. Admins can load the Northwind demo data from Precedent settings."
              primaryAction={
                <Button appearance="primary" onClick={() => setEditing('new')}>
                  Record decision
                </Button>
              }
            />
          ) : (
            <EmptyState header="No decisions match" description="Try a different search or clear the filters." />
          )
        }
      />

      <ModalTransition>
        {open && !editing && (
          <DecisionDetail
            decision={open}
            all={decisions ?? []}
            onClose={() => setOpenId(null)}
            onEdit={() => setEditing(open)}
            onChanged={async () => {
              await load();
            }}
          />
        )}
        {editing && (
          <DecisionForm
            decision={editing === 'new' ? null : editing}
            onClose={() => setEditing(null)}
            onSaved={async (id) => {
              setEditing(null);
              await load();
              setOpenId(id);
            }}
          />
        )}
      </ModalTransition>
    </Stack>
  );
};
