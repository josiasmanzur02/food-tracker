import type { UserProfile, WeightEntry } from '../types';

export interface WeightProgressSummary {
  currentWeightKg: number;
  totalChangeKg: number;
  remainingKg: number;
  progressPercent: number;
  goalReached: boolean;
}

export function sortWeightEntriesAscending(entries: WeightEntry[]): WeightEntry[] {
  return [...entries].sort((left, right) => left.date.localeCompare(right.date));
}

export function getLatestWeightEntry(entries: WeightEntry[]): WeightEntry | null {
  if (entries.length === 0) {
    return null;
  }

  return [...entries].sort((left, right) => {
    if (left.date !== right.date) {
      return right.date.localeCompare(left.date);
    }

    return right.updatedAt.localeCompare(left.updatedAt);
  })[0];
}

export function getWeightEntryForDate(
  entries: WeightEntry[],
  date: string
): WeightEntry | null {
  return entries.find((entry) => entry.date === date) ?? null;
}

export function getCurrentWeightKg(profile: UserProfile, entries: WeightEntry[]): number {
  return getLatestWeightEntry(entries)?.weightKg ?? profile.startingWeightKg;
}

export function calculateWeightProgress(
  profile: UserProfile,
  entries: WeightEntry[]
): WeightProgressSummary {
  const currentWeightKg = getCurrentWeightKg(profile, entries);

  if (profile.goalType === 'gain') {
    const totalGain = currentWeightKg - profile.startingWeightKg;
    const remaining = profile.goalWeightKg - currentWeightKg;
    const requiredGain = profile.goalWeightKg - profile.startingWeightKg;
    const rawProgress = requiredGain === 0 ? 1 : totalGain / requiredGain;

    return {
      currentWeightKg,
      totalChangeKg: totalGain,
      remainingKg: remaining,
      progressPercent: Math.max(0, Math.min(rawProgress, 1.5)),
      goalReached: currentWeightKg >= profile.goalWeightKg
    };
  }

  if (profile.goalType === 'maintain') {
    return {
      currentWeightKg,
      totalChangeKg: currentWeightKg - profile.startingWeightKg,
      remainingKg: 0,
      progressPercent: 1,
      goalReached: true
    };
  }

  const totalLoss = profile.startingWeightKg - currentWeightKg;
  const remaining = currentWeightKg - profile.goalWeightKg;
  const requiredLoss = profile.startingWeightKg - profile.goalWeightKg;
  const rawProgress = requiredLoss === 0 ? 1 : totalLoss / requiredLoss;

  return {
    currentWeightKg,
    totalChangeKg: totalLoss,
    remainingKg: remaining,
    progressPercent: Math.max(0, Math.min(rawProgress, 1.5)),
    goalReached: currentWeightKg <= profile.goalWeightKg
  };
}
