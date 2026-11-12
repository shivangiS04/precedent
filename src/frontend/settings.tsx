import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box,
  Button,
  Heading,
  HelperMessage,
  Inline,
  Label,
  SectionMessage,
  Spinner,
  Stack,
  Text,
  TextArea,
  Toggle,
  xcss,
} from '@forge/react';
import { makeInvoke } from '@forge/bridge';
import type { AdminSettings, Defs, SeedResult } from '../shared/types';
import { formatAliases } from '../domain/parse';

const invoke = makeInvoke<Defs>();
const section = xcss({ borderColor: 'color.border', borderWidth: 'border.width', borderStyle: 'solid', borderRadius: 'radius.medium', padding: 'space.200' });

const ToggleRow = ({ id, label, help, checked, onChange, disabled }: { id: string; label: string; help: string; checked: boolean; onChange: (v: boolean) => void; disabled: boolean }) => (
  <Inline space="space.150" alignBlock="start">
    <Toggle id={id} isChecked={checked} isDisabled={disabled} onChange={() => onChange(!checked)} />
    <Stack space="space.025">
      <Label labelFor={id}>{label}</Label>
      <HelperMessage>{help}</HelperMessage>
    </Stack>
  </Inline>
);

const Settings = () => {
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [aliases, setAliases] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [seed, setSeed] = useState<SeedResult | null>(null);

  useEffect(() => {
    invoke('getSettings')
      .then((r) => {
        setSettings(r.settings);
        setIsAdmin(r.isAdmin);
        setAliases(formatAliases(r.settings.aliases));
      })
      .catch(() => setMessage({ ok: false, text: 'Precedent could not load its settings. Reload to try again.' }));
  }, []);

  const save = async (patch: Partial<Omit<AdminSettings, 'aliases'>> & { aliasesText?: string }) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await invoke('saveSettings', { settings: patch });
      if (res.ok && res.settings) {
        setSettings(res.settings);
        setAliases(formatAliases(res.settings.aliases));
        setMessage({ ok: true, text: 'Settings saved.' });
      } else if (!res.ok) setMessage({ ok: false, text: res.error });
    } catch {
      setMessage({ ok: false, text: 'Precedent could not save settings. Try again.' });
    } finally {
      setBusy(false);
    }
  };

  const loadDemo = async () => {
    setBusy(true);
    setSeed(null);
    try {
      setSeed(await invoke('seedDemoData'));
    } catch {
      setSeed({ ok: false, error: 'Precedent could not load demo data. Try again.' });
    } finally {
      setBusy(false);
    }
  };

  if (!settings && !message) return <Spinner label="Loading settings" />;

  return (
    <Stack space="space.300">
      <Stack space="space.050">
        <Heading size="large">Precedent settings</Heading>
        <Text>Control how Precedent flags work that conflicts with recorded decisions.</Text>
      </Stack>
      {!isAdmin && settings && (
        <SectionMessage appearance="information">
          <Text>Only Jira admins can change these settings.</Text>
        </SectionMessage>
      )}
      {message && (
        <SectionMessage appearance={message.ok ? 'success' : 'error'}>
          <Text>{message.text}</Text>
        </SectionMessage>
      )}

      {settings && (
        <Box xcss={section}>
          <Stack space="space.200">
            <Heading size="small">Conflict alerts</Heading>
            <ToggleRow
              id="labelConflicts"
              label="Label work items with high-confidence conflicts"
              help="Adds the precedent-conflict label so conflicts show in boards, filters and JQL."
              checked={settings.labelConflicts}
              disabled={!isAdmin || busy}
              onChange={(v) => save({ labelConflicts: v })}
            />
            <ToggleRow
              id="commentOnConflict"
              label="Post one comment on conflicting work items"
              help="At most one comment per work item, naming only decisions the person who changed it can see. Off by default."
              checked={settings.commentOnConflict}
              disabled={!isAdmin || busy}
              onChange={(v) => save({ commentOnConflict: v })}
            />
            <ToggleRow
              id="graphContext"
              label="Show Teamwork Graph context"
              help="Goals, teams and people related to a decision, in conflict cards and Rovo answers. Results respect each viewer's permissions."
              checked={settings.graphContext}
              disabled={!isAdmin || busy}
              onChange={(v) => save({ graphContext: v })}
            />
          </Stack>
        </Box>
      )}

      {settings && (
        <Box xcss={section}>
          <Stack space="space.150">
            <Heading size="small">Keyword aliases</Heading>
            <Text>Teach Precedent your team's synonyms so conflicts are caught under other names.</Text>
            <Label labelFor="aliases">One keyword per line: keyword = alias, alias</Label>
            <TextArea
              id="aliases"
              value={aliases}
              isDisabled={!isAdmin || busy}
              minimumRows={4}
              placeholder={'redis = valkey, keydb\nfeature flag = toggle, kill switch'}
              onChange={(e) => setAliases(String((e as { target?: { value?: string } }).target?.value ?? ''))}
            />
            <Inline>
              <Button appearance="primary" isDisabled={!isAdmin || busy} onClick={() => save({ aliasesText: aliases })}>
                Save aliases
              </Button>
            </Inline>
          </Stack>
        </Box>
      )}

      <Box xcss={section}>
        <Stack space="space.150">
          <Heading size="small">Demo data</Heading>
          <Text>
            Loads 15 decisions for the fictional company Northwind Payments, linked to the PAY and PLAT work items and the NWENG ADR pages. Safe to
            run more than once: existing decisions are skipped.
          </Text>
          <Inline>
            <Button isDisabled={!isAdmin || busy} onClick={loadDemo}>
              {busy ? 'Working…' : 'Load Northwind demo data'}
            </Button>
          </Inline>
          {seed?.ok && (
            <SectionMessage appearance="success" title="Demo data loaded">
              <Text>{`${seed.created} decisions created, ${seed.skipped} already present.`}</Text>
            </SectionMessage>
          )}
          {seed && !seed.ok && (
            <SectionMessage appearance="error" title="Couldn't load demo data">
              <Text>{seed.error}</Text>
            </SectionMessage>
          )}
        </Stack>
      </Box>
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <Settings />
  </React.StrictMode>,
);
