import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@aurevo/design-system';

interface StubPageProps {
  title: string;
  /** What this section will do in a follow-up pass; kept honest — no fake data. */
  description: string;
}

/**
 * Honest placeholder for admin sections not yet built in Phase 7.
 * It explicitly states the section is not implemented rather than pretending
 * to show data.
 */
export function StubPage({ title, description }: StubPageProps) {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-[var(--color-text-secondary)]">Admin</p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle as="h2">Not implemented yet</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="info">
            This section is a placeholder for a Phase 7 follow-up. No data is
            loaded or shown here — it is not a real view yet.
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
