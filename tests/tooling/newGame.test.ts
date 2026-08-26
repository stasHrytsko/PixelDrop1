import { describe, expect, it } from 'vitest';
import { escapeFor, PLACEHOLDERS, TEMPLATE_FILES } from '../../scripts/placeholders.ts';

/**
 * new-game.ts rewrites the template by substituting text. The game title is the
 * only free-form value that goes in, and it lands inside a single-quoted TS
 * literal, an HTML element and a JSON string — three syntaxes with three
 * different things that need escaping.
 *
 * This is the first command a new game ever runs, so a broken substitution
 * hands someone a repository that does not compile before they have written a
 * line of their own code.
 */
describe('escapeFor', () => {
  it("keeps an apostrophe inside a single-quoted TypeScript literal", () => {
    expect(escapeFor('src/game.config.ts', "Bob's Puzzle")).toBe("Bob\\'s Puzzle");
  });

  it('escapes a backslash before it can escape something else', () => {
    expect(escapeFor('capacitor.config.ts', 'Back\\Slash')).toBe('Back\\\\Slash');
    // The backslash is doubled first, so the quote escape is not swallowed.
    expect(escapeFor('capacitor.config.ts', "a\\'b")).toBe("a\\\\\\'b");
  });

  it('escapes markup for the HTML title', () => {
    expect(escapeFor('index.html', 'A <b>Bold</b> & Big Game')).toBe(
      'A &lt;b&gt;Bold&lt;/b&gt; &amp; Big Game',
    );
  });

  it('escapes a quote for JSON without adding the surrounding quotes', () => {
    expect(escapeFor('package.json', 'He said "hi"')).toBe('He said \\"hi\\"');
  });

  it('leaves an ordinary name untouched in every target', () => {
    for (const file of TEMPLATE_FILES) {
      expect(escapeFor(file, 'Screw Mahjong')).toBe('Screw Mahjong');
    }
  });
});

describe('substitution', () => {
  it('treats $ in a name as a literal, not as a replacement pattern', () => {
    // String.replaceAll reads $&, $' and $` in a *string* replacement. new-game
    // passes a function instead; this pins the behaviour that requires.
    const source = "  appName: 'Game Template',";
    const escaped = escapeFor('capacitor.config.ts', "Cash $& Grab $' Now");
    // $& survives as itself; the apostrophe is escaped by the .ts rule as usual.
    expect(source.replaceAll('Game Template', () => escaped)).toBe(
      "  appName: 'Cash $& Grab $\\' Now',",
    );
  });
});

describe('placeholder list', () => {
  it('covers every token new-game.ts substitutes', () => {
    // The two lists are what keeps `npm run verify-template` honest: a token
    // that new-game replaces but check-placeholders does not know about would
    // never be reported as forgotten.
    const tokens = PLACEHOLDERS.map((placeholder) => placeholder.token);
    expect(tokens).toContain('com.example.gametemplate');
    expect(tokens).toContain('REPLACE_ME_WITH_A_RANDOM_TOPIC');
    expect(tokens).toContain('Game Template');
    expect(tokens).toContain('game-template');
  });
});
