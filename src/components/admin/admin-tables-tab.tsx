"use client";

import * as React from "react";
import Link from "next/link";
import {
  Plus,
  Trash2,
  Printer,
  Download,
  ExternalLink,
  Users,
  QrCode,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getAdminTablesAction,
  createTableAction,
  deleteTableAction,
  type AdminTableData,
} from "@/server/actions/admin";

export function AdminTablesTab() {
  const [tables, setTables] = React.useState<AdminTableData[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Add Table Modal
  const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
  const [tableNumber, setTableNumber] = React.useState("");
  const [capacity, setCapacity] = React.useState(4);
  const [isCreating, setIsCreating] = React.useState(false);

  const fetchTables = React.useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    setError(null);
    try {
      const res = await getAdminTablesAction();
      if (res.success && res.tables) {
        setTables(res.tables);
      } else {
        setError(res.error || "Failed to load tables");
      }
    } catch (err) {
      setError((err as Error).message || "Error loading tables");
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let isMounted = true;
    getAdminTablesAction().then((res) => {
      if (!isMounted) return;
      setIsLoading(false);
      if (res.success && res.tables) {
        setTables(res.tables);
      } else {
        setError(res.error || "Failed to load tables");
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleCreateTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tableNumber.trim()) return;

    setIsCreating(true);
    try {
      const res = await createTableAction({
        tableNumber: tableNumber.trim(),
        capacity: Number(capacity),
      });

      if (res.success) {
        setIsAddModalOpen(false);
        setTableNumber("");
        setCapacity(4);
        await fetchTables();
      } else {
        alert(res.error || "Failed to create table");
      }
    } catch (err) {
      alert((err as Error).message || "Error creating table");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteTable = async (table: AdminTableData) => {
    if (
      !confirm(
        `Are you sure you want to remove ${table.tableNumber}? Active guest sessions using this token will become invalid.`
      )
    ) {
      return;
    }

    try {
      const res = await deleteTableAction({ id: table.id });
      if (res.success) {
        await fetchTables();
      } else {
        alert(res.error || "Failed to delete table");
      }
    } catch (err) {
      alert((err as Error).message || "Error deleting table");
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Action Card */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-[var(--bg-surface)] p-5 rounded-2xl border border-[var(--border-subtle)] shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-serif text-lg font-bold text-[var(--text-primary)]">
              Tables & QR Standees
            </h3>
            <span className="rounded-full bg-[var(--primary)]/10 text-[var(--primary)] text-xs font-mono font-bold px-2 py-0.5">
              {tables.length} Total
            </span>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            Generate printable A4 tent cards pointing directly to guest table tokens with no app install required.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Print All Tables PDF Button */}
          <Link
            href="/api/admin/tables/qr-pdf"
            target="_blank"
            className="inline-flex items-center justify-center font-medium transition-colors select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 cursor-pointer bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] active:bg-[var(--primary-active)] shadow-sm h-9 px-3.5 text-xs gap-2 rounded-[var(--radius-md)]"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Generate Printable QRs (PDF)</span>
          </Link>

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchTables(true)}
            isLoading={isLoading}
            className="h-9 px-2.5 text-xs"
            title="Refresh tables"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setTableNumber(`Table ${tables.length + 1}`);
              setCapacity(4);
              setIsAddModalOpen(true);
            }}
            className="h-9 text-xs"
            leftIcon={<Plus className="h-3.5 w-3.5" />}
          >
            Add Table
          </Button>
        </div>
      </div>

      {/* Grid of Tables */}
      {error ? (
        <div className="p-8 text-center text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {tables.map((table) => {
            const guestUrl = `/t/${table.qrToken}`;

            return (
              <div
                key={table.id}
                tabIndex={0}
                className="group relative flex flex-col justify-between p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--primary)] hover:shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] transition-all shadow-xs"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-serif text-base font-bold text-[var(--text-primary)]">
                        {table.tableNumber}
                      </h4>
                      <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] mt-0.5">
                        <Users className="h-3 w-3" />
                        <span>Seats {table.capacity} Guests</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteTable(table)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 transition-opacity cursor-pointer"
                      title="Remove table"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* QR Token Preview Badge */}
                  <div className="mt-3 p-2 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] font-mono text-[11px] text-[var(--text-secondary)] flex items-center justify-between">
                    <span className="truncate max-w-[150px]">
                      Token: {table.qrToken}
                    </span>
                    <QrCode className="h-4 w-4 text-[var(--primary)] shrink-0" />
                  </div>
                </div>

                {/* Footer Action Links */}
                <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs">
                  <Link
                    href={`/api/admin/tables/qr-pdf?token=${table.qrToken}`}
                    target="_blank"
                    className="inline-flex items-center gap-1 text-[var(--text-secondary)] hover:text-[var(--primary)] font-medium transition-colors"
                    title="Download printable single table card"
                  >
                    <Printer className="h-3 w-3" />
                    <span>Print PDF</span>
                  </Link>

                  <Link
                    href={guestUrl}
                    target="_blank"
                    className="inline-flex items-center gap-1 text-[var(--primary)] hover:underline font-semibold transition-colors"
                    title="Test guest ordering experience for this table"
                  >
                    <span>Test Guest App</span>
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Table Modal */}
      {isAddModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-2xl p-6 text-[var(--text-primary)]">
            <h3 className="font-bold text-base mb-1">Add Dining Table</h3>
            <p className="text-xs text-[var(--text-secondary)] mb-4">
              Generates a cryptographically unguessable QR token for guest sessions.
            </p>

            <form onSubmit={handleCreateTable} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Table Number / Label
                </label>
                <input
                  type="text"
                  required
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                  placeholder="e.g. Table 13, Terrace 2, Booth A"
                  className="w-full h-9 px-3 text-xs rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Seating Capacity
                </label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  required
                  value={capacity}
                  onChange={(e) => setCapacity(Number(e.target.value))}
                  className="w-full h-9 px-3 text-xs rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--primary)]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  isLoading={isCreating}
                >
                  Generate Table
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
