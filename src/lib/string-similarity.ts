import stringComparison from 'string-comparison';

const diceCoefficient = stringComparison.diceCoefficient;

/**
 * Calculate string similarity using Dice's Coefficient (bigram similarity)
 * Returns a value between 0 and 1, where 1 is identical
 */
export function calculateSimilarity(str1: string, str2: string): number {
  // Normalize inputs: trim whitespace and convert to lowercase for consistent comparison
  const s1 = str1.trim().toLowerCase();
  const s2 = str2.trim().toLowerCase();
  
  // Handle edge cases
  if (s1 === s2) return 1;
  if (s1.length < 2 || s2.length < 2) return 0;
  
  return diceCoefficient.similarity(s1, s2);
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
