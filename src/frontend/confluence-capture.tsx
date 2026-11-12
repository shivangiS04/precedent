import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Button, SectionMessage, Spinner, Stack, Text } from '@forge/react';
import { makeInvoke, view } from '@forge/bridge';
import type { Defs, PageDraftResult } from '../shared/types';
import { DecisionForm } from './ledger/DecisionForm';
import { STATUS_LABEL } from './ledger/ui';

const invoke = makeInvoke<Defs>();

/** Confluence byline: "Record as decision", pre-filled from the page. */
const Capture = () => {
  const [res, setRes] = useState<PageDraftResult | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [recordAnyway, setRecordAnyway] = useState(false);

  useEffect(() => {
    invoke('pageDraft')
      .then(setRes)
      .catch(() => setRes({ ok: false, error: 'Precedent could not read this page. Try again.' }));
  }, []);

  if (!res) return <Spinner label="Reading this page" />;
  if (!res.ok)
    return (
      <SectionMessage appearance="warning">
        <Text>{res.error}</Text>
      </SectionMessage>
    );
  if (saved)
    return (
      <SectionMessage appearance="success" title="Decision recorded">
        <Text>{`"${saved}" is in the Decision Ledger. Precedent will flag new Jira work that conflicts with it.`}</Text>
      </SectionMessage>
    );

  if (res.existing.length && !recordAnyway)
    return (
      <Stack space="space.150">
        <SectionMessage appearance="information" title="Already recorded">
          {res.existing.map((d) => (
            <Text key={d.id}>{`${d.title} (${STATUS_LABEL[d.status]})`}</Text>
          ))}
        </SectionMessage>
        <Button onClick={() => setRecordAnyway(true)}>Record another decision from this page</Button>
      </Stack>
    );

  const d = res.draft;
  return (
    <Stack space="space.150">
      {!d.statement && (
        <SectionMessage appearance="information">
          <Text>Precedent couldn't find a decision sentence on this page. Fill it in below.</Text>
        </SectionMessage>
      )}
      <DecisionForm
        inline
        defaults={{
          title: d.title,
          statement: d.statement,
          rationale: d.rationale,
          alternatives: d.alternatives,
          keywords: d.keywords,
          status: d.status,
          sourceUrl: res.pageUrl,
          decidedAt: new Date().toISOString().slice(0, 10),
        }}
        onClose={() => view.close().catch(() => undefined)}
        onSaved={() => setSaved(d.title || 'Decision')}
      />
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <Capture />
  </React.StrictMode>,
);
