const BLOCKED = [
  /\bdrop\s+database\b/i,
  /\bcopy\b[\s\S]*\bprogram\b/i,
  /\bpg_read_file\b/i,
  /\bpg_ls_dir\b/i,
  /\blo_import\b/i,
  /\blo_export\b/i,
];

export function assertSqlAllowed(sql) {
  if (!sql || typeof sql !== "string") {
    throw new Error("sql is required");
  }
  const trimmed = sql.trim();
  if (!trimmed) {
    throw new Error("sql is empty");
  }
  if (/;/.test(trimmed) && !/^(begin|commit|rollback)\s*;?$/i.test(trimmed)) {
    const parts = trimmed.split(";").map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1) {
      throw new Error("multi-statement SQL is not allowed");
    }
  }
  for (const re of BLOCKED) {
    if (re.test(trimmed)) {
      throw new Error("SQL rejected by policy");
    }
  }
}

export function isTransactionControl(sql) {
  const t = sql.trim().toUpperCase();
  return t === "BEGIN" || t === "COMMIT" || t === "ROLLBACK";
}