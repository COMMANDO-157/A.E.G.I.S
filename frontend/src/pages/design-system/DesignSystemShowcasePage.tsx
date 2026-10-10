/**
 * A.E.G.I.S 4.0 — Guardian Design System Component Showcase
 * WP-4.1.2 | Development-Only Inspection Tool
 *
 * Demonstrates: tokens, typography, buttons, cards, badges, alerts,
 * form components, loading indicators, empty states, status indicators, and modal dialogs.
 * Uses synthetic non-sensitive data exclusively.
 *
 * PRODUCTION ISOLATION:
 * This component and its route are completely disabled when import.meta.env.DEV is false.
 */

import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Badge,
  Alert,
  TextField,
  TextareaField,
  SelectField,
  CheckboxField,
  LoadingIndicator,
  EmptyState,
  StatusIndicator,
  SectionHeader,
  Dialog,
} from '@/components/ui';
import styles from './DesignSystemShowcasePage.module.css';

export default function DesignSystemShowcasePage() {
  // Strict development guard
  if (!import.meta.env.DEV) {
    return <Navigate to="/" replace />;
  }

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [alertDismissed, setAlertDismissed] = useState(false);

  const colors = [
    { name: 'Guardian Navy', hex: '#102A43', bg: 'var(--aegis-navy)' },
    { name: 'Trust Teal', hex: '#147D78', bg: 'var(--aegis-teal)' },
    { name: 'Safe White', hex: '#F4F8FA', bg: 'var(--aegis-white)' },
    { name: 'Professional Slate', hex: '#64748B', bg: 'var(--aegis-slate)' },
    { name: 'Alert Amber', hex: '#D99B30', bg: 'var(--aegis-amber)' },
    { name: 'Critical Red', hex: '#DC2626', bg: 'var(--aegis-red-500)' },
    { name: 'Success Green', hex: '#16A34A', bg: 'var(--aegis-green-500)' },
    { name: 'Dark Surface', hex: '#071520', bg: 'var(--aegis-navy-900)' },
  ];

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.devBadge}>
          <span aria-hidden="true">🛠️</span> DEVELOPMENT ONLY SHOWCASE
        </div>
        <SectionHeader
          title="Guardian Design System 4.0"
          description="Component library, WCAG 2.2 AA accessibility tokens, and visual foundation for A.E.G.I.S."
        />
      </header>

      {/* 1. Color Palette */}
      <section className={styles.section} aria-labelledby="palette-heading">
        <h2 id="palette-heading" className={styles.sectionTitle}>
          1. Color Palette
        </h2>
        <div className={styles.paletteGrid}>
          {colors.map((c) => (
            <div key={c.name} className={styles.swatch}>
              <div className={styles.swatchColor} style={{ backgroundColor: c.bg }} />
              <div className={styles.swatchInfo}>
                <div className={styles.swatchName}>{c.name}</div>
                <div className={styles.swatchHex}>{c.hex}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 2. Typography Scale */}
      <section className={styles.section} aria-labelledby="typography-heading">
        <h2 id="typography-heading" className={styles.sectionTitle}>
          2. Typography Scale
        </h2>
        <Card>
          <CardBody style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
            <div>
              <span className="badge badge-neutral">Display 4xl (clamp)</span>
              <h1 style={{ fontSize: 'var(--font-size-4xl)' }}>Protection-First Campus Shield</h1>
            </div>
            <div>
              <span className="badge badge-neutral">Heading 2xl (clamp)</span>
              <h2 style={{ fontSize: 'var(--font-size-2xl)' }}>Structured Incident Verification</h2>
            </div>
            <div>
              <span className="badge badge-neutral">Section lg</span>
              <h3 style={{ fontSize: 'var(--font-size-lg)' }}>Authority Jurisdictional Scope</h3>
            </div>
            <div>
              <span className="badge badge-neutral">Body Base (Inter with Tamil/Telugu Fallback)</span>
              <p style={{ fontSize: 'var(--font-size-base)' }}>
                All reports submitted through A.E.G.I.S follow strict anti-retaliation protocols.
                Your submissions are processed directly through the institutional escalation engine.
              </p>
            </div>
            <div>
              <span className="badge badge-neutral">Monospace Code (JetBrains Mono)</span>
              <pre style={{ background: 'var(--color-bg-subtle)', padding: 'var(--spacing-3)', borderRadius: 'var(--radius-md)' }}>
                <code>POST /api/complaints/:id/verification HTTP/1.1</code>
              </pre>
            </div>
          </CardBody>
        </Card>
      </section>

      {/* 3. Buttons */}
      <section className={styles.section} aria-labelledby="buttons-heading">
        <h2 id="buttons-heading" className={styles.sectionTitle}>
          3. Button Variants &amp; Sizes
        </h2>
        <div className={styles.componentRow}>
          <Button variant="primary">Primary Action</Button>
          <Button variant="secondary">Secondary Action</Button>
          <Button variant="outline">Outline Action</Button>
          <Button variant="destructive">Destructive Action</Button>
          <Button variant="ghost">Ghost Action</Button>
          <Button variant="primary" loading>Loading Button</Button>
          <Button variant="primary" disabled>Disabled</Button>
        </div>
        <div className={styles.componentRow} style={{ marginTop: 'var(--spacing-3)' }}>
          <Button variant="primary" size="sm">Small (32px)</Button>
          <Button variant="primary" size="md">Medium (40px)</Button>
          <Button variant="primary" size="lg">Large (48px)</Button>
        </div>
      </section>

      {/* 4. Cards */}
      <section className={styles.section} aria-labelledby="cards-heading">
        <h2 id="cards-heading" className={styles.sectionTitle}>
          4. Card Variants &amp; Composition
        </h2>
        <div className={styles.grid2}>
          <Card variant="standard">
            <CardHeader>
              <h3 style={{ fontSize: 'var(--font-size-lg)' }}>Standard Card</h3>
            </CardHeader>
            <CardBody>
              <p>Standard container for campus safety overviews and student notices.</p>
            </CardBody>
            <CardFooter>
              <Button variant="outline" size="sm">Action</Button>
            </CardFooter>
          </Card>

          <Card variant="interactive">
            <CardHeader>
              <h3 style={{ fontSize: 'var(--font-size-lg)' }}>Interactive Card (Hover / Focus)</h3>
            </CardHeader>
            <CardBody>
              <p>Elevates smoothly on hover or keyboard focus-within. Ideal for dashboard navigation cards.</p>
            </CardBody>
            <CardFooter>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-link)' }}>
                Click to explore &rarr;
              </span>
            </CardFooter>
          </Card>
        </div>
      </section>

      {/* 5. Badges & Status Indicators */}
      <section className={styles.section} aria-labelledby="badges-heading">
        <h2 id="badges-heading" className={styles.sectionTitle}>
          5. Badges &amp; Status Indicators (Dual-Coded)
        </h2>
        <div className={styles.componentRow}>
          <Badge variant="neutral">Neutral Status</Badge>
          <Badge variant="information">Information</Badge>
          <Badge variant="success">Resolved</Badge>
          <Badge variant="warning">Under Review</Badge>
          <Badge variant="critical">Critical Urgency</Badge>
        </div>
        <div className={styles.componentRow} style={{ marginTop: 'var(--spacing-3)' }}>
          <StatusIndicator status="active" label="Active Case" />
          <StatusIndicator status="pending" label="Pending Verification" />
          <StatusIndicator status="critical" label="Immediate Escalation" />
          <StatusIndicator status="resolved" label="Concluded Case" />
          <StatusIndicator status="neutral" label="Archived Record" />
        </div>
      </section>

      {/* 6. Alerts */}
      <section className={styles.section} aria-labelledby="alerts-heading">
        <h2 id="alerts-heading" className={styles.sectionTitle}>
          6. Alerts (ARIA Live Regions)
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
          <Alert variant="information" title="Institutional Policy">
            All reports submitted through A.E.G.I.S follow strict anti-retaliation protocols.
          </Alert>
          <Alert variant="success" title="Verification Recorded">
            The factual statement was substantiated by the committee review panel.
          </Alert>
          <Alert variant="warning" title="Jurisdiction Warning">
            This case exceeds departmental resolution time limits and will be escalated.
          </Alert>
          {!alertDismissed && (
            <Alert
              variant="error"
              title="Immediate Danger Action"
              onDismiss={() => setAlertDismissed(true)}
            >
              Emergency dispatch alerted. Dismissable notice test.
            </Alert>
          )}
        </div>
      </section>

      {/* 7. Form Components */}
      <section className={styles.section} aria-labelledby="forms-heading">
        <h2 id="forms-heading" className={styles.sectionTitle}>
          7. Accessible Form Controls
        </h2>
        <Card>
          <CardBody style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-5)' }}>
            <div className={styles.grid2}>
              <TextField
                label="Student Registration Number"
                placeholder="e.g. 2026-CS-041"
                helpText="Your official campus identifier for verification"
                required
              />
              <TextField
                label="Validation Error State"
                defaultValue="invalid-input-format"
                error="Reference format must match institutional pattern"
                required
              />
            </div>

            <div className={styles.grid2}>
              <SelectField
                label="Campus Department Jurisdiction"
                placeholder="Select departmental branch..."
                options={[
                  { value: 'cs', label: 'Computer Science & Engineering' },
                  { value: 'ee', label: 'Electrical Engineering' },
                  { value: 'me', label: 'Mechanical Engineering' },
                ]}
                required
              />
              <SelectField
                label="Urgency Assessment"
                options={[
                  { value: 'routine', label: 'Routine (72h SLA)' },
                  { value: 'urgent', label: 'Urgent (24h SLA)' },
                  { value: 'immediate', label: 'Immediate Danger (Active Emergency)' },
                ]}
                defaultValue="urgent"
              />
            </div>

            <TextareaField
              label="Incident Description"
              placeholder="Provide objective facts regarding the grievance..."
              maxLength={300}
              showCharCount
              helpText="Describe locations, dates, and individuals involved."
              required
            />

            <CheckboxField
              label="Request Anonymous Masking"
              description="Your identity will be concealed from departmental reviewers."
              defaultChecked
            />
          </CardBody>
        </Card>
      </section>

      {/* 8. Feedback & Modals */}
      <section className={styles.section} aria-labelledby="feedback-heading">
        <h2 id="feedback-heading" className={styles.sectionTitle}>
          8. Feedback, Loading &amp; Accessible Dialog
        </h2>
        <div className={styles.componentRow}>
          <LoadingIndicator size="sm" label="Loading data..." />
          <LoadingIndicator size="md" label="Processing request..." />
          <LoadingIndicator size="lg" label="Synchronizing cases..." />
          <Button variant="primary" onClick={() => setIsDialogOpen(true)}>
            Open Accessible Dialog Modal
          </Button>
        </div>

        <EmptyState
          title="No Active Investigations"
          description="There are currently no open cases assigned to this jurisdictional scope."
          action={<Button variant="outline" size="sm">Refresh Registry</Button>}
          style={{ marginTop: 'var(--spacing-4)' }}
        />

        <Dialog
          isOpen={isDialogOpen}
          onClose={() => setIsDialogOpen(false)}
          title="Accessible Dialog Test"
          description="A fully accessible modal dialog with focus trap and Escape key listener."
          footer={
            <>
              <Button variant="secondary" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => setIsDialogOpen(false)}>
                Confirm Action
              </Button>
            </>
          }
        >
          <p>
            This modal traps keyboard focus (Tab / Shift+Tab), disables body scroll,
            restores focus to the trigger button upon close, and responds to the Escape key.
          </p>
        </Dialog>
      </section>
    </div>
  );
}
