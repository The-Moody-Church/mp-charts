import { describe, it, expect } from 'vitest';
import { sanitizeIdentifier } from './guards';

describe('sanitizeIdentifier', () => {
  it.each([
    'Contacts',
    'dp_Users',
    'dp_User_User_Groups',
    '_Deployments',
    'Participant_Milestones',
    'api_Custom_Get_Contacts',
    'Table1',
    'a'.repeat(128),
  ])('accepts %s unchanged', (name) => {
    expect(sanitizeIdentifier(name, 'table name')).toBe(name);
  });

  it.each([
    ['a path traversal', '../procs/x'],
    ['a dot-segment', '..'],
    ['a slash', 'a/b'],
    ['a dot', 'a.b'],
    ['an encoded dot', '%2e'],
    ['a backslash', 'a\\b'],
    ['a query', 'Contacts?x=1'],
    ['a fragment', 'Contacts#x'],
    ['a space', 'Contact Log'],
    ['a hyphen', 'Contact-Log'],
    ['a newline', 'Contacts\n'],
    ['a leading digit', '1Contacts'],
    ['the empty string', ''],
    ['129 characters', 'a'.repeat(129)],
    ['a non-ASCII letter', 'Contactś'],
  ])('rejects %s', (_label, value) => {
    expect(() => sanitizeIdentifier(value, 'table name')).toThrow('Invalid table name');
  });

  it.each([
    ['a number', 42],
    ['null', null],
    ['undefined', undefined],
    ['an array', ['Contacts']],
    ['an object with toString', { toString: () => 'Contacts' }],
  ])('rejects a non-string (%s)', (_label, value) => {
    expect(() => sanitizeIdentifier(value, 'procedure name')).toThrow('Invalid procedure name');
  });

  it('never echoes the rejected value', () => {
    // Capture outside the try, so the assertion cannot be swallowed by the catch.
    let thrown: unknown;
    try {
      sanitizeIdentifier('../SECRET\nforged', 'table name');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe('Invalid table name');
  });
});
