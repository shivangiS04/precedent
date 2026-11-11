import React, { useState } from 'react';
import {
  Box,
  Button,
  Heading,
  Inline,
  Link,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  SectionMessage,
  Select,
  Stack,
  Tag,
  TagGroup,
  Text,
  User,
} from '@forge/react';
import { makeInvoke } from '@forge/bridge';
import type { Defs } from '../../shared/types';
import type { Decision, DecisionStatus } from '../../domain/types';
import { canTransition } from '../../domain/parse';
import { StatusLozenge, formatDate, isDueForRevisit, STATUS_LABEL } from './ui';

const invoke = makeInvoke<Defs>();

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <Stack space="space.075">
    <Heading size="xsmall">{title}</Heading>
    {children}
  </Stack>
);

export const DecisionDetail = ({
  decision,
  all,
  onClose,
  onEdit,
  onChanged,
}: {
  decision: Decision;
  all: Decision[];
  onClose: () => void;
  onEdit: () => void;
  onChanged: () => void;
}) => {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [superseding, setSuperseding] = useState(false);
  const [replacement, setReplacement] = useState<string | null>(null);
  const byId = new Map(all.map((d) => [d.id, d]));
  const replacedBy = decision.supersededBy ? byId.get(decision.supersededBy) : undefined;
  const replaces = all.filter((d) => d.supersededBy === decision.id);

  const change = async (status: DecisionStatus, supersededBy?: string | null) => {
    setBusy(true);
    setError(null);
    try {
      const res = await invoke('changeStatus', { id: decision.id, status, supersededBy });
      if (res.ok) onChanged();
      else setError(res.error);
    } catch {
      setError('Precedent could not update this decision. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const actions = (['accepted', 'revisit'] as DecisionStatus[]).filter((s) => s !== decision.status && canTransition(decision.status, s));

  return (
    <Modal onClose={onClose} width="large">
      <ModalHeader>
        <ModalTitle>{decision.title}</ModalTitle>
      </ModalHeader>
      <ModalBody>
        <Stack space="space.250">
          <Inline space="space.100" alignBlock="center" shouldWrap>
            <StatusLozenge status={decision.status} />
            {isDueForRevisit(decision) && <Tag text={`Revisit due ${formatDate(decision.revisitBy)}`} color="orangeLight" />}
            <Text>{`Decided ${formatDate(decision.decidedAt)}`}</Text>
          </Inline>

          {error && (
            <SectionMessage appearance="error">
              <Text>{error}</Text>
            </SectionMessage>
          )}
          {replacedBy && (
            <SectionMessage appearance="warning" title="Superseded">
              <Text>{`Replaced by "${replacedBy.title}" (${formatDate(replacedBy.decidedAt)}).`}</Text>
            </SectionMessage>
          )}

          <Box padding="space.200" backgroundColor="color.background.neutral">
            <Text>{decision.statement}</Text>
          </Box>

          <Section title="Why">
            <Text>{decision.rationale}</Text>
          </Section>

          {decision.alternatives.length > 0 && (
            <Section title="Rejected alternatives">
              <Stack space="space.075">
                {decision.alternatives.map((a) => (
                  <Text key={a.alternative}>{a.reason ? `✕ ${a.alternative}: ${a.reason}` : `✕ ${a.alternative}`}</Text>
                ))}
              </Stack>
            </Section>
          )}

          <Inline space="space.400" shouldWrap>
            <Section title="Owner">{decision.ownerAccountId ? <User accountId={decision.ownerAccountId} /> : <Text>Not set</Text>}</Section>
            {decision.deciders.length > 0 && (
              <Section title="Deciders">
                <Inline space="space.100" shouldWrap>
                  {decision.deciders.map((a) => (
                    <User key={a} accountId={a} />
                  ))}
                </Inline>
              </Section>
            )}
            {decision.revisitBy && (
              <Section title="Revisit by">
                <Text>{formatDate(decision.revisitBy)}</Text>
              </Section>
            )}
          </Inline>

          {(decision.scope.projects.length > 0 || decision.scope.keywords.length > 0 || decision.scope.components.length > 0) && (
            <Section title="Scope">
              <TagGroup>
                {decision.scope.projects.map((p) => (
                  <Tag key={`p-${p}`} text={p} color="blueLight" />
                ))}
                {decision.scope.components.map((c) => (
                  <Tag key={`c-${c}`} text={c} color="purpleLight" />
                ))}
                {decision.scope.keywords.map((k) => (
                  <Tag key={`k-${k}`} text={k} />
                ))}
              </TagGroup>
            </Section>
          )}

          {decision.sources.length > 0 && (
            <Section title="Sources">
              <Stack space="space.050">
                {decision.sources.map((s) => (
                  <Text key={`${s.kind}-${s.ref}`}>
                    {s.url ? (
                      <Link href={s.url} openNewTab>
                        {s.kind === 'confluence-page' ? `Confluence page ${s.ref}` : s.ref}
                      </Link>
                    ) : (
                      s.ref
                    )}
                  </Text>
                ))}
              </Stack>
            </Section>
          )}

          {replaces.length > 0 && (
            <Section title="Replaces">
              <Stack space="space.050">
                {replaces.map((d) => (
                  <Text key={d.id}>{`${d.title} (${formatDate(d.decidedAt)})`}</Text>
                ))}
              </Stack>
            </Section>
          )}

          {superseding && (
            <Section title="Replaced by">
              <Select
                placeholder="Choose the decision that replaces this one"
                options={all.filter((d) => d.id !== decision.id && d.status !== 'superseded').map((d) => ({ label: d.title, value: d.id }))}
                onChange={(o: { value: string }) => setReplacement(o.value)}
              />
            </Section>
          )}
        </Stack>
      </ModalBody>
      <ModalFooter>
        {decision.status !== 'superseded' && !superseding && (
          <Button appearance="subtle" onClick={() => setSuperseding(true)} isDisabled={busy}>
            Mark superseded
          </Button>
        )}
        {superseding && (
          <Button appearance="warning" onClick={() => change('superseded', replacement)} isDisabled={busy || !replacement}>
            Confirm superseded
          </Button>
        )}
        {actions.map((s) => (
          <Button key={s} onClick={() => change(s)} isDisabled={busy}>
            {s === 'revisit' ? 'Propose revisit' : `Mark ${STATUS_LABEL[s].toLowerCase()}`}
          </Button>
        ))}
        {decision.status !== 'superseded' && (
          <Button onClick={onEdit} isDisabled={busy}>
            Edit
          </Button>
        )}
        <Button appearance="primary" onClick={onClose}>
          Close
        </Button>
      </ModalFooter>
    </Modal>
  );
};
