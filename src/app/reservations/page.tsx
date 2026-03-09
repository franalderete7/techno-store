export default function ReservationsPage() {
  return (
    <div className="min-h-screen bg-background px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-3xl rounded-2xl border bg-card p-6 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Reservations retired</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          The lean-schema migration moves reservation state out of the dedicated
          `reservations` table and into the core CRM flow. Use customer context,
          conversations, and stock status as the active funnel source of truth.
        </p>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          The dedicated table is already retired in Supabase. Keep this route
          only as a temporary signpost until the page is removed entirely.
        </p>
      </div>
    </div>
  );
}
