import type {
  ActivityLevelId,
  ActivityLevelOption,
  CalorieEntry,
  GainGoalRate,
  GoalRate,
  GoalRateOption,
  GoalType,
  LossGoalRate,
  Sex,
  UnitSystem,
  UserProfile
} from '../types';
import { formatWeightNumber, kgToPounds } from './units';

export const ACTIVITY_LEVELS: ActivityLevelOption[] = [
  {
    id: 'sedentary',
    name: 'Sedentary',
    description: 'Little or no structured exercise.',
    multiplier: 1.2
  },
  {
    id: 'lightlyActive',
    name: 'Lightly Active',
    description: 'Light exercise approximately 1–3 days per week.',
    multiplier: 1.375
  },
  {
    id: 'moderatelyActive',
    name: 'Moderately Active',
    description: 'Exercise approximately 3–5 days per week.',
    multiplier: 1.55
  },
  {
    id: 'veryActive',
    name: 'Very Active',
    description: 'Hard exercise approximately 6–7 days per week.',
    multiplier: 1.725
  },
  {
    id: 'highlyActive',
    name: 'Highly Active',
    description: 'Very intense exercise or a physically demanding occupation.',
    multiplier: 1.9
  }
];

export const LOSS_GOAL_RATES: GoalRateOption[] = [
  { id: 'slow', name: 'Slow', description: 'Approximately 0.25% body weight per week.' },
  { id: 'moderate', name: 'Moderate', description: 'Approximately 0.5% body weight per week.' },
  { id: 'faster', name: 'Faster', description: 'Approximately 0.75% body weight per week.' },
  { id: 'aggressive', name: 'Aggressive', description: 'Approximately 1% body weight per week.' }
];

export const GAIN_GOAL_RATES: GoalRateOption[] = [
  { id: 'slow', name: 'Slow Gain', description: 'A conservative calorie surplus.' },
  { id: 'moderate', name: 'Moderate Gain', description: 'A steady but reasonable calorie surplus.' },
  { id: 'faster', name: 'Faster Gain', description: 'A larger surplus without going extreme.' }
];

const LOSS_RATE_PERCENTAGES: Record<LossGoalRate, number> = {
  slow: 0.25,
  moderate: 0.5,
  faster: 0.75,
  aggressive: 1
};

const GAIN_DAILY_SURPLUSES: Record<GainGoalRate, number> = {
  slow: 150,
  moderate: 250,
  faster: 350
};

const MAINTENANCE_EPSILON_KG = 0.05;

export interface TargetCalculationInput {
  age: number;
  heightCm: number;
  sex: Sex;
  activityLevel: ActivityLevelId;
  currentWeightKg: number;
  goalWeightKg: number;
  goalRate: GoalRate | null;
}

export interface TargetCalculationResult {
  goalType: GoalType;
  maintenanceCalories: number;
  targetCalories: number;
  targetNotice: string | null;
  weeklyChangeKg: number | null;
  dailyDeltaCalories: number;
}

export function calculateBmr(
  weightKg: number,
  heightCm: number,
  age: number,
  sex: Sex
): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'male' ? base + 5 : base - 161;
}

export function calculateGoalType(currentWeightKg: number, goalWeightKg: number): GoalType {
  const difference = goalWeightKg - currentWeightKg;

  if (Math.abs(difference) <= MAINTENANCE_EPSILON_KG) {
    return 'maintain';
  }

  return difference < 0 ? 'lose' : 'gain';
}

export function getActivityLevel(activityLevel: ActivityLevelId): ActivityLevelOption {
  return (
    ACTIVITY_LEVELS.find((option) => option.id === activityLevel) ?? ACTIVITY_LEVELS[0]
  );
}

export function calculateTarget(input: TargetCalculationInput): TargetCalculationResult {
  const goalType = calculateGoalType(input.currentWeightKg, input.goalWeightKg);
  const bmr = calculateBmr(input.currentWeightKg, input.heightCm, input.age, input.sex);
  const tdee = bmr * getActivityLevel(input.activityLevel).multiplier;
  const maintenanceCalories = Math.round(tdee);

  if (goalType === 'maintain') {
    return {
      goalType,
      maintenanceCalories,
      targetCalories: maintenanceCalories,
      targetNotice: null,
      weeklyChangeKg: 0,
      dailyDeltaCalories: 0
    };
  }

  if (goalType === 'gain') {
    const selectedRate: GainGoalRate =
      input.goalRate === 'slow' || input.goalRate === 'faster' || input.goalRate === 'moderate'
        ? input.goalRate
        : 'moderate';
    const requestedSurplus = GAIN_DAILY_SURPLUSES[selectedRate];
    const maxAutomaticSurplus = tdee * 0.15;
    const appliedSurplus = Math.min(requestedSurplus, maxAutomaticSurplus);
    const targetCalories = Math.round(tdee + appliedSurplus);
    const weeklyChangeKg = Number(((appliedSurplus * 7) / 7700).toFixed(3));
    const targetNotice =
      appliedSurplus < requestedSurplus
        ? "We've adjusted your target to a more conservative calorie surplus."
        : null;

    return {
      goalType,
      maintenanceCalories,
      targetCalories,
      targetNotice,
      weeklyChangeKg,
      dailyDeltaCalories: targetCalories - maintenanceCalories
    };
  }

  const selectedRate: LossGoalRate =
    input.goalRate === 'slow' ||
    input.goalRate === 'moderate' ||
    input.goalRate === 'faster' ||
    input.goalRate === 'aggressive'
      ? input.goalRate
      : 'moderate';
  const weeklyLossKg =
    input.currentWeightKg * (LOSS_RATE_PERCENTAGES[selectedRate] / 100);
  const weeklyLossLb = kgToPounds(weeklyLossKg);
  const requestedDailyDeficit = (weeklyLossLb * 3500) / 7;
  const maxAutomaticDeficit = tdee * 0.25;
  const appliedDailyDeficit = Math.min(requestedDailyDeficit, maxAutomaticDeficit);
  const targetCalories = Math.round(tdee - appliedDailyDeficit);
  const targetNotice =
    appliedDailyDeficit < requestedDailyDeficit
      ? "The selected goal would require a very large calorie deficit. We've adjusted your target to a more reasonable estimate."
      : null;

  return {
    goalType,
    maintenanceCalories,
    targetCalories,
    targetNotice,
    weeklyChangeKg: -weeklyLossKg,
    dailyDeltaCalories: targetCalories - maintenanceCalories
  };
}

export function getDailyTarget(profile: UserProfile): number {
  return profile.customTargetCalories ?? profile.calculatedTargetCalories;
}

export function getGoalRateLabel(goalType: GoalType, goalRate: GoalRate | null): string {
  if (goalType === 'maintain') {
    return 'Maintain';
  }

  const options = goalType === 'gain' ? GAIN_GOAL_RATES : LOSS_GOAL_RATES;
  return options.find((option) => option.id === goalRate)?.name ?? 'Moderate';
}

export function getGoalPaceDescription(
  weeklyChangeKg: number | null,
  unitSystem: UnitSystem
): string {
  if (weeklyChangeKg === null || weeklyChangeKg === 0) {
    return 'Estimated maintenance';
  }

  const absoluteValue = Math.abs(weeklyChangeKg);
  const unitLabel = unitSystem === 'imperial' ? 'lb' : 'kg';
  return `About ${formatWeightNumber(absoluteValue, unitSystem, 1)} ${unitLabel} per week`;
}

export function calculateAverageDailyCalories(entries: CalorieEntry[]): number | null {
  if (entries.length === 0) {
    return null;
  }

  const totalsByDate = new Map<string, number>();

  for (const entry of entries) {
    totalsByDate.set(entry.date, (totalsByDate.get(entry.date) ?? 0) + entry.calories);
  }

  if (totalsByDate.size === 0) {
    return null;
  }

  const totalCalories = Array.from(totalsByDate.values()).reduce(
    (sum, value) => sum + value,
    0
  );

  return Math.round(totalCalories / totalsByDate.size);
}
