/** Normalize table labels received from the API before displaying them. */
export function formatTableDisplayName(value: string | null | undefined): string {
  const cleaned = (value ?? "").trim().replace(/^(?:table\s*)+/i, "").trim();
  return cleaned ? `Table ${cleaned}` : "Table";
}
