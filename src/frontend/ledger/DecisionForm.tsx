import React, { useState } from 'react';
import {
  Button,
  DatePicker,
  ErrorMessage,
  HelperMessage,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  RequiredAsterisk,
  SectionMessage,
  Select,
  Stack,
  Text,
  TextArea,
  Textfield,
  UserPicker,
} from '@forge/react';
import { makeInvoke } from '@forge/bridge';
import type { Defs } from '../../shared/types';
import type { Decision, DecisionStatus, FieldErrors } from '../../domain/types';
import { STATUS_LABEL } from './ui';

const invoke = makeInvoke<Defs>();

/** Text versions of list fields, so editing is plain typing (one item per line). */
interface Draft {
  title: string;
  statement: string;
  rationale: string;
  status: DecisionStatus;
  ownerAccountId: string | null;
  decidedAt: string;
  revisitBy: string;
  alternatives: string;
  keywords: string;
  projects: string;
  components: string;
  sourceUrl: string;
}

const toDraft = (d?: Decision | null, defaults?: Partial<Draft>): Draft => ({
  title: d?.title ?? '',
  statement: d?.statement ?? '',
  rationale: d?.rationale ?? '',
  status: d?.status ?? 'proposed',
  ownerAccountId: d?.ownerAccountId ?? null,
  decidedAt: d?.decidedAt ?? '',
  revisitBy: d?.revisitBy ?? '',
  alternatives: (d?.alternatives ?? []).map((a) => (a.reason ? `${a.alternative} :: ${a.reason}` : a.alternative)).join('\n'),
  keywords: (d?.scope.keywords ?? []).join('\n'),
  projects: (d?.scope.projects ?? []).join('\n'),
  components: (d?.scope.components ?? []).join('\n'),
  sourceUrl: d?.sources.find((s) => s.url)?.url ?? '',
  ...defaults,
});

const statusOptions = (current: DecisionStatus | null) =>
  (current === null ? (['proposed', 'accepted'] as DecisionStatus[]) : (['proposed', 'accepted', 'revisit'] as DecisionStatus[])).map(
    (s) => ({ label: STATUS_LABEL[s], value: s }),
  );

export const DecisionForm = ({
  decision,
  defaults,
  onClose,
  onSaved,
}: {
  decision?: Decision | null;
  defaults?: Partial<Draft>;
  onClose: () => void;
  onSaved: (id: string) => void;
}) => {
  const [draft, setDraft] = useState<Draft>(() => toDraft(decision, defaults));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const value = (e: unknown) => String((e as { target?: { value?: string } })?.target?.value ?? '');

  const submit = async () => {
    setSaving(true);
    setErrors({});
    try {
      const res = await invoke('saveDecision', {
        id: decision?.id,
        input: {
          title: draft.title,
          statement: draft.statement,
          rationale: draft.rationale,
          status: draft.status,
          ownerAccountId: draft.ownerAccountId,
          decidedAt: draft.decidedAt || null,
          revisitBy: draft.revisitBy || null,
          // Sent as newline text; the server parses and validates.
          alternatives: draft.alternatives as never,
          scope: { keywords: draft.keywords as never, projects: draft.projects as never, components: draft.components as never },
          sources: draft.sourceUrl ? [{ url: draft.sourceUrl } as never] : [],
        },
      });
      if (res.ok) onSaved(res.id);
      else setErrors(res.errors);
    } catch {
      setErrors({ form: 'Precedent could not save this decision. Try again.' });
    } finally {
      setSaving(false);
    }
  };

  const field = (id: keyof Draft, label: string, input: React.ReactNode, help?: string, required = false) => (
    <Stack space="space.050">
      <Label labelFor={id}>
        {label}
        {required ? <RequiredAsterisk /> : ''}
      </Label>
      {input}
      {errors[id as keyof FieldErrors] ? (
        <ErrorMessage>{String(errors[id as keyof FieldErrors])}</ErrorMessage>
      ) : help ? (
        <HelperMessage>{help}</HelperMessage>
      ) : null}
    </Stack>
  );

  return (
    <Modal onClose={onClose} width="large">
      <ModalHeader>
        <ModalTitle>{decision ? 'Edit decision' : 'Record a decision'}</ModalTitle>
      </ModalHeader>
      <ModalBody>
        <Stack space="space.200">
          {errors.form && (
            <SectionMessage appearance="error">
              <Text>{errors.form}</Text>
            </SectionMessage>
          )}
          {field('title', 'Title', <Textfield id="title" value={draft.title} onChange={(e) => set('title', value(e))} placeholder="Session cache on Postgres, not Redis" />, undefined, true)}
          {field(
            'statement',
            'Decision',
            <TextArea id="statement" value={draft.statement} onChange={(e) => set('statement', value(e))} placeholder="We will X, not Y, for Z." minimumRows={2} />,
            'One sentence. Name what you chose and what you rejected.',
            true,
          )}
          {field('rationale', 'Why', <TextArea id="rationale" value={draft.rationale} onChange={(e) => set('rationale', value(e))} minimumRows={3} />, undefined, true)}
          {field(
            'alternatives',
            'Rejected alternatives',
            <TextArea id="alternatives" value={draft.alternatives} onChange={(e) => set('alternatives', value(e))} placeholder={'Redis :: second stateful system to run\nMemcached :: no persistence'} minimumRows={3} />,
            'One per line: alternative :: reason. Conflict checks match against these.',
          )}
          {field(
            'keywords',
            'Keywords and aliases',
            <TextArea id="keywords" value={draft.keywords} onChange={(e) => set('keywords', value(e))} placeholder={'redis\nelasticache\ncache'} minimumRows={2} />,
            'One per line. Words that should trigger this decision in new work.',
          )}
          {field('projects', 'Jira projects', <Textfield id="projects" value={draft.projects} onChange={(e) => set('projects', value(e))} placeholder="PLAT, PAY" />, 'Project keys, comma separated.')}
          {field('components', 'Components', <Textfield id="components" value={draft.components} onChange={(e) => set('components', value(e))} placeholder="sessions, auth" />)}
          <UserPicker
            label="Owner"
            name="owner"
            defaultValue={draft.ownerAccountId ?? undefined}
            placeholder="Who to talk to about this decision"
            onChange={(u) => {
              const v = u as unknown as { id?: string; accountId?: string } | string | null;
              set('ownerAccountId', typeof v === 'string' ? v : v?.id ?? v?.accountId ?? null);
            }}
          />
          {field(
            'status',
            'Status',
            <Select
              id="status"
              options={statusOptions(decision?.status ?? null)}
              value={{ label: STATUS_LABEL[draft.status], value: draft.status }}
              onChange={(o: { value: DecisionStatus }) => set('status', o.value)}
            />,
          )}
          {field('decidedAt', 'Decided on', <DatePicker id="decidedAt" value={draft.decidedAt || undefined} onChange={(v) => set('decidedAt', v)} />)}
          {field('revisitBy', 'Revisit by', <DatePicker id="revisitBy" value={draft.revisitBy || undefined} onChange={(v) => set('revisitBy', v)} />, 'Optional. Precedent flags the decision when this date passes.')}
          {field(
            'sourceUrl',
            'Source link',
            <Textfield id="sourceUrl" value={draft.sourceUrl} onChange={(e) => set('sourceUrl', value(e))} placeholder="https://your-site.atlassian.net/wiki/spaces/ENG/pages/123" />,
            'Confluence page or Jira work item where the decision was made.',
          )}
          {errors.sources && <ErrorMessage>{String(errors.sources)}</ErrorMessage>}
        </Stack>
      </ModalBody>
      <ModalFooter>
        <Button appearance="subtle" onClick={onClose}>
          Cancel
        </Button>
        <Button appearance="primary" onClick={submit} isDisabled={saving}>
          {saving ? 'Saving…' : decision ? 'Save changes' : 'Record decision'}
        </Button>
      </ModalFooter>
    </Modal>
  );
};
