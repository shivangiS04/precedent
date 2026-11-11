import React, { useState } from 'react';
import ForgeReconciler, { Button, Heading, SectionMessage, Stack, Text } from '@forge/react';
import { makeInvoke } from '@forge/bridge';
import type { Defs, SeedResult } from '../shared/types';
import { Shell } from './Shell';

const invoke = makeInvoke<Defs>();

/** Admin page. M1: demo data loader. Aliases, comment toggle and graph flag arrive in M8. */
const Settings = () => {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SeedResult | null>(null);

  const seed = async () => {
    setBusy(true);
    setResult(null);
    try {
      setResult(await invoke('seedDemoData'));
    } catch {
      setResult({ ok: false, error: 'Precedent could not load demo data. Try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack space="space.300">
      <Heading size="large">Precedent settings</Heading>
      <Stack space="space.100">
        <Heading size="small">Demo data</Heading>
        <Text>
          Loads 15 decisions for the fictional company Northwind Payments, linked to the PAY and PLAT work items and the NWENG ADR pages.
          Safe to run more than once: existing decisions are skipped.
        </Text>
        <Button appearance="primary" onClick={seed} isDisabled={busy}>
          {busy ? 'Loading…' : 'Load Northwind demo data'}
        </Button>
        {result?.ok && (
          <SectionMessage appearance="success" title="Demo data loaded">
            <Text>{`${result.created} decisions created, ${result.skipped} already present.`}</Text>
          </SectionMessage>
        )}
        {result && !result.ok && (
          <SectionMessage appearance="error" title="Couldn't load demo data">
            <Text>{result.error}</Text>
          </SectionMessage>
        )}
      </Stack>
      <Shell header="More settings coming" description="Keyword aliases, conflict comments and Teamwork Graph controls arrive in a later milestone." />
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <Settings />
  </React.StrictMode>,
);
