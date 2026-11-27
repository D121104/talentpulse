export type PageToken = number | 'ellipsis';

/** Build compact page numbers with leading, trailing, and active-window bounds. */
export function getVisiblePageNumbers(
  currentPage: number,
  totalPages: number,
  siblingCount = 1,
): PageToken[] {
  const safeTotal = Math.max(1, Math.floor(totalPages));
  const safeCurrent = Math.min(safeTotal, Math.max(1, Math.floor(currentPage)));

  if (safeTotal <= 7) {
    return Array.from({ length: safeTotal }, (_, i) => i + 1);
  }

  const leftSibling = Math.max(2, safeCurrent - siblingCount);
  const rightSibling = Math.min(safeTotal - 1, safeCurrent + siblingCount);

  const tokens: PageToken[] = [1];

  if (leftSibling > 2) {
    tokens.push('ellipsis');
  } else {
    for (let p = 2; p < leftSibling; p += 1) {
      tokens.push(p);
    }
  }

  for (let p = leftSibling; p <= rightSibling; p += 1) {
    tokens.push(p);
  }

  if (rightSibling < safeTotal - 1) {
    tokens.push('ellipsis');
  } else {
    for (let p = rightSibling + 1; p < safeTotal; p += 1) {
      tokens.push(p);
    }
  }

  tokens.push(safeTotal);
  return tokens;
}
