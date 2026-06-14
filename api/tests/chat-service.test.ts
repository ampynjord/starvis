import { describe, expect, it } from 'vitest';
import { validateQueryDatabaseSql } from '../src/services/chat/sql-guard.js';

describe('validateQueryDatabaseSql', () => {
  it('allows schema-qualified public SELECT queries and caps returned rows', () => {
    const result = validateQueryDatabaseSql('SELECT name, cargo_capacity FROM game.ships WHERE env = $1 ORDER BY cargo_capacity DESC', [
      'live',
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.params).toEqual(['live']);
    expect(result.sql).toBe(
      'SELECT * FROM (SELECT name, cargo_capacity FROM game.ships WHERE env = $1 ORDER BY cargo_capacity DESC) AS starvis_chat_query LIMIT 50',
    );
  });

  it('rejects non-SELECT statements', () => {
    const result = validateQueryDatabaseSql('UPDATE game.ships SET name = $1', ['nope']);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('Only SELECT');
  });

  it('rejects SELECT star expansion', () => {
    const result = validateQueryDatabaseSql('SELECT * FROM game.ships', []);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('SELECT *');
  });

  it('rejects non-public schemas', () => {
    const result = validateQueryDatabaseSql('SELECT email FROM meta.users', []);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('meta.users');
  });

  it('requires schema-qualified table names', () => {
    const result = validateQueryDatabaseSql('SELECT name FROM ships', []);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('schema-qualified');
  });

  it('rejects comments and semicolons', () => {
    expect(validateQueryDatabaseSql('SELECT name FROM game.ships -- trailing comment', []).ok).toBe(false);
    expect(validateQueryDatabaseSql('SELECT name FROM game.ships; SELECT email FROM meta.users', []).ok).toBe(false);
  });

  it('rejects unsafe parameter types', () => {
    const result = validateQueryDatabaseSql('SELECT name FROM game.ships WHERE env = $1', [{ env: 'live' }]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('parameters');
  });
});
