import { Fragment, type ReactNode } from 'react';

/**
 * Where an address may wrap: after the `@` and before each `.` (DESIGN.md "Tables"), never inside a word —
 * so a narrow column shows `shot.admin@` / `example` / `.edu`, not `example.ed` / `u`. Returns the text
 * pieces in order; a `null` marks a break opportunity (`<wbr>`).
 */
export function emailBreakPieces(email: string): (string | null)[] {
  const pieces: (string | null)[] = [];
  let current = '';
  for (const character of email) {
    if (character === '.' && current !== '') {
      pieces.push(current, null);
      current = '';
    }
    current += character;
    if (character === '@') {
      pieces.push(current, null);
      current = '';
    }
  }
  if (current !== '') pieces.push(current);
  return pieces;
}

/**
 * An email address, isolated as LTR text (`<bdi dir="ltr">`) inside Arabic text, that wraps only
 * after the `@` and before a `.`. The text content is the address itself (`<wbr>` adds no characters).
 */
export function EmailAddress({ email }: Readonly<{ email: string }>) {
  const nodes: ReactNode[] = emailBreakPieces(email).map((piece, index) =>
    piece === null ? <wbr key={index} /> : <Fragment key={index}>{piece}</Fragment>,
  );
  return <bdi dir="ltr">{nodes}</bdi>;
}
