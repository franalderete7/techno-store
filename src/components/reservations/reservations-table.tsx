"use client";

export function ReservationsTable() {
  return (
    <div className="rounded-xl border bg-card p-6">
      <h2 className="text-lg font-semibold">Reservations retired</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Dedicated reservations are no longer part of the live schema. Use customers,
        conversations, stock units, and purchases for the active flow.
      </p>
    </div>
  );
}
