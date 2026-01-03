import stringComparison from 'string-comparison';

const diceCoefficient = stringComparison.diceCoefficient;

/**
 * Calculate string similarity using Dice's Coefficient (bigram similarity)
 * Returns a value between 0 and 1, where 1 is identical
 */
export function calculateSimilarity(str1: string, str2: string): number {
  return diceCoefficient.similarity(str1, str2);
}

/**
 * Find the best matching string from a list based on similarity threshold
 */
export function findBestMatch(
  input: string,
  candidates: string[],
  threshold: number = 0.3
): { match: string; score: number } | null {
  let bestMatch: string | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const score = calculateSimilarity(input, candidate);
    if (score > bestScore && score >= threshold) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  return bestMatch ? { match: bestMatch, score: bestScore } : null;
}
