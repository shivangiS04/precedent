/**
 * Demo data for the fictional company "Northwind Payments".
 * `page` and `issue` refer to slugs created on the site by scripts/seed-site.mjs
 * (recorded in siteRefs.json). `supersedes` builds superseded chains.
 */
import type { DecisionStatus } from '../domain/types';

export interface SeedDecision {
  slug: string;
  title: string;
  statement: string;
  rationale: string;
  status: DecisionStatus;
  decidedAt: string;
  revisitBy?: string;
  projects: string[];
  components?: string[];
  keywords: string[];
  alternatives: [string, string][];
  page?: string;
  issue?: string;
  supersedes?: string;
}

export const NORTHWIND: SeedDecision[] = [
  {
    slug: 'session-cache',
    title: 'Session cache on Postgres, not Redis',
    statement: 'We will store user sessions in Postgres unlogged tables, not Redis or ElastiCache.',
    rationale:
      'Session reads are ~2k rps peak, well within Postgres capacity. A second stateful system means another on-call rotation, backups, failover drills and a security review, and no team owns it. Unlogged tables give us the speed we need with one database to operate.',
    status: 'accepted',
    decidedAt: '2026-03-12',
    revisitBy: '2027-03-01',
    projects: ['PLAT'],
    components: ['sessions', 'auth'],
    keywords: ['redis', 'elasticache', 'memcached', 'cache', 'caching', 'session', 'sessions', 'session store'],
    alternatives: [
      ['Redis', 'Second stateful system to run; on-call burden with no owning team'],
      ['ElastiCache', 'Same operational load as Redis plus vendor cost'],
      ['Memcached', 'No persistence; sessions lost on restart'],
    ],
    page: 'adr-session-cache',
    issue: 'plat-session-spike',
  },
  {
    slug: 'public-api-rest',
    title: 'Public partner API is REST, not GraphQL',
    statement: 'We will expose the public partner API as versioned REST with OpenAPI, not GraphQL.',
    rationale:
      'Partners integrate with generated SDKs, API gateways and webhook tooling that all expect REST/OpenAPI. GraphQL would force every partner to adopt a new client stack and makes per-endpoint rate limiting and caching harder.',
    status: 'accepted',
    decidedAt: '2026-01-20',
    projects: ['PAY', 'PLAT'],
    components: ['public-api'],
    keywords: ['graphql', 'public api', 'partner api', 'openapi', 'grpc', 'api'],
    alternatives: [
      ['GraphQL', 'Partner tooling expects REST/OpenAPI; harder rate limiting and caching'],
      ['gRPC', 'Poor browser and partner support'],
    ],
    page: 'adr-public-api',
  },
  {
    slug: 'feature-flags',
    title: 'Feature flags via LaunchDarkly only',
    statement: 'We will use LaunchDarkly for all feature flags; no homegrown flag systems.',
    rationale:
      'Three homegrown flag implementations drifted apart and caused an incident when a flag defaulted to on in production. LaunchDarkly gives audit logs, targeting and kill switches that compliance asked for.',
    status: 'accepted',
    decidedAt: '2025-11-04',
    projects: ['PAY', 'PLAT'],
    keywords: ['feature flag', 'feature flags', 'flag', 'toggle', 'launchdarkly', 'kill switch'],
    alternatives: [
      ['Homegrown flags', 'Implementations drifted; caused a production incident; no audit trail'],
      ['Environment variables', 'Every change needs a deploy'],
      ['Unleash (self-hosted)', 'Another service to operate'],
    ],
    page: 'adr-feature-flags',
  },
  {
    slug: 'microservices-adr',
    title: 'No new microservices without an ADR',
    statement: 'We will not create a new deployable service without an approved ADR.',
    rationale:
      'We grew from 9 to 41 services in 18 months; most have one owner and no on-call. New services must justify their operational cost in an ADR reviewed by Platform.',
    status: 'accepted',
    decidedAt: '2026-02-02',
    projects: ['PLAT', 'PAY'],
    keywords: ['microservice', 'new service', 'service', 'deployable'],
    alternatives: [['Team discretion', 'Led to service sprawl and unowned services']],
    page: 'adr-microservices',
  },
  {
    slug: 'idempotency',
    title: 'Payment writes require an Idempotency-Key',
    statement: 'We will require an Idempotency-Key header on every payment-creating endpoint.',
    rationale: 'Client retries after timeouts caused duplicate charges in Q3. Idempotency keys make retries safe.',
    status: 'accepted',
    decidedAt: '2025-10-15',
    projects: ['PAY'],
    components: ['payments-api'],
    keywords: ['idempotency', 'idempotency-key', 'retry', 'retries', 'duplicate charge'],
    alternatives: [['Client-side dedupe only', 'Does not protect against network-level retries']],
  },
  {
    slug: 'postgres-system-of-record',
    title: 'Postgres is the system of record',
    statement: 'We will keep transactional data in Postgres; no MongoDB or DynamoDB for ledger data.',
    rationale: 'The ledger needs multi-row transactions and strong consistency. One relational store keeps reporting and audits simple.',
    status: 'accepted',
    decidedAt: '2025-06-30',
    projects: ['PAY', 'PLAT'],
    keywords: ['mongodb', 'mongo', 'dynamodb', 'nosql', 'database', 'document store'],
    alternatives: [
      ['MongoDB', 'No reliable multi-document transactions for ledger writes'],
      ['DynamoDB', 'Vendor lock-in and awkward reporting'],
    ],
  },
  {
    slug: 'card-data',
    title: 'Card data never touches our servers',
    statement: 'We will tokenize cards with Stripe Elements; raw card numbers are never stored or logged.',
    rationale: 'Storing PANs, even encrypted, puts every service in PCI DSS scope. Tokenization keeps us at SAQ A.',
    status: 'accepted',
    decidedAt: '2025-09-01',
    projects: ['PAY'],
    keywords: ['card number', 'pan', 'pci', 'credit card', 'tokenization', 'cvv'],
    alternatives: [['Store encrypted PANs', 'Expands PCI scope to every service that touches the DB']],
    page: 'adr-card-data',
  },
  {
    slug: 'money-minor-units',
    title: 'Money is stored as integer minor units',
    statement: 'We will store and compute money as integer minor units (cents), never floating point.',
    rationale: 'Floating point caused rounding drift in FX reconciliation. Integers make totals exact.',
    status: 'accepted',
    decidedAt: '2025-08-12',
    projects: ['PAY'],
    keywords: ['float', 'double', 'floating point', 'money', 'currency', 'amount', 'fx'],
    alternatives: [
      ['Float/double', 'Rounding errors in reconciliation'],
      ['Decimal strings', 'Error-prone parsing in every service'],
    ],
  },
  {
    slug: 'queue-sqs',
    title: 'Async jobs on SQS',
    statement: 'We will use SQS for all asynchronous work.',
    rationale: 'Managed, cheap and enough for job queues in 2025.',
    status: 'accepted',
    decidedAt: '2025-03-10',
    projects: ['PLAT'],
    keywords: ['sqs', 'queue', 'async', 'jobs'],
    alternatives: [['RabbitMQ', 'Self-hosted operational load']],
  },
  {
    slug: 'events-kafka',
    title: 'Kafka for event streaming; SQS only for job queues',
    statement: 'We will use Kafka (MSK) for domain events and keep SQS only for background jobs.',
    rationale: 'Analytics and fraud need replayable, ordered event streams that SQS cannot provide.',
    status: 'accepted',
    decidedAt: '2026-04-22',
    projects: ['PLAT', 'PAY'],
    keywords: ['kafka', 'msk', 'event', 'events', 'event streaming', 'sqs', 'queue'],
    alternatives: [['SQS + SNS fan-out', 'No replay or ordering guarantees']],
    supersedes: 'queue-sqs',
  },
  {
    slug: 'logs-elk',
    title: 'Ship logs to self-hosted ELK',
    statement: 'We will run Elasticsearch, Logstash and Kibana for logs.',
    rationale: 'Cheapest option at our 2024 volume.',
    status: 'accepted',
    decidedAt: '2024-11-05',
    projects: ['PLAT'],
    keywords: ['elk', 'elasticsearch', 'kibana', 'logstash', 'logging', 'logs'],
    alternatives: [['Datadog', 'Too expensive at 2024 volume']],
  },
  {
    slug: 'observability-datadog',
    title: 'Datadog for logs, metrics and APM',
    statement: 'We will use Datadog for logs, metrics and tracing; the ELK cluster is retired.',
    rationale: 'ELK took 0.5 FTE to run and lost logs during incidents. Datadog correlates logs with traces.',
    status: 'accepted',
    decidedAt: '2026-05-18',
    projects: ['PLAT', 'PAY'],
    keywords: ['datadog', 'logging', 'logs', 'apm', 'metrics', 'elk', 'observability'],
    alternatives: [['Keep ELK', '0.5 FTE to operate; lost logs during incidents']],
    supersedes: 'logs-elk',
  },
  {
    slug: 'mobile-react-native',
    title: 'React Native for the merchant mobile app',
    statement: 'We will build the merchant app in React Native rather than separate native apps.',
    rationale: 'One small team must ship iOS and Android. Revisit once the team grows or performance limits bite.',
    status: 'revisit',
    decidedAt: '2025-04-01',
    revisitBy: '2026-10-01',
    projects: ['PAY'],
    keywords: ['react native', 'swift', 'kotlin', 'flutter', 'mobile', 'ios', 'android'],
    alternatives: [
      ['Native iOS + Android', 'Two codebases for a team of three'],
      ['Flutter', 'No in-house Dart experience'],
    ],
  },
  {
    slug: 'frontend-monorepo',
    title: 'Frontend lives in a single monorepo',
    statement: 'We will keep all web frontends in one monorepo with shared design-system packages.',
    rationale: 'Shared components drifted across four repos. Revisit if CI times exceed 15 minutes.',
    status: 'revisit',
    decidedAt: '2025-12-01',
    revisitBy: '2026-11-30',
    projects: ['PLAT'],
    keywords: ['monorepo', 'polyrepo', 'frontend', 'design system', 'nx', 'turborepo'],
    alternatives: [['Polyrepo', 'Design-system drift between repos']],
  },
  {
    slug: 'otel-tracing',
    title: 'Adopt OpenTelemetry for tracing',
    statement: 'We will instrument services with OpenTelemetry SDKs and export to Datadog.',
    rationale: 'Vendor-neutral instrumentation keeps us portable if we change observability vendors.',
    status: 'proposed',
    decidedAt: '2026-10-28',
    projects: ['PLAT'],
    keywords: ['opentelemetry', 'otel', 'tracing', 'instrumentation'],
    alternatives: [['Datadog-native tracer', 'Locks instrumentation to one vendor']],
  },
];
