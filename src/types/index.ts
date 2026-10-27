export type AppPage = 'today' | 'training' | 'progress' | 'history' | 'settings';
export type AppTheme = 'system' | 'light' | 'dark';
export type UnitSystem = 'imperial' | 'metric';
export type Sex = 'male' | 'female';
export type ActivityLevelId =
  | 'sedentary'
  | 'lightlyActive'
  | 'moderatelyActive'
  | 'veryActive'
  | 'highlyActive';
export type GoalType = 'lose' | 'maintain' | 'gain';
export type LossGoalRate = 'slow' | 'moderate' | 'faster' | 'aggressive';
export type GainGoalRate = 'slow' | 'moderate' | 'faster';
export type GoalRate = LossGoalRate | GainGoalRate;
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'other';
export type EntrySource = 'manual' | 'ai' | 'food';
export type MealScanConfidence = 'low' | 'medium' | 'high';

export interface ActivityLevelOption {
  id: ActivityLevelId;
  name: string;
  description: string;
  multiplier: number;
}

export interface GoalRateOption {
  id: GoalRate;
  name: string;
  description: string;
}

export interface DetectedFood {
  id: string;
  name: string;
  estimatedPortion: string;
  estimatedCalories: number;
  confidence: MealScanConfidence;
}

export interface MealScanQuestion {
  id: string;
  prompt: string;
  options: string[];
}

export interface MealScanResult {
  foods: DetectedFood[];
  estimatedTotalCalories: number;
  estimatedLowCalories: number;
  estimatedHighCalories: number;
  confidence: MealScanConfidence;
  notes: string[];
  questions: MealScanQuestion[];
}

export interface AICalorieMetadata {
  foods: DetectedFood[];
  confidence: MealScanConfidence;
  estimatedLowCalories: number;
  estimatedHighCalories: number;
  notes: string[];
}

export interface CalorieEntry {
  id: string;
  date: string;
  calories: number;
  description?: string;
  meal?: MealType;
  source: EntrySource;
  createdAt: string;
  updatedAt: string;
  aiMetadata?: AICalorieMetadata;
}

export interface WeightEntry {
  id: string;
  date: string;
  weightKg: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  id: string;
  unitSystem: UnitSystem;
  age: number;
  heightCm: number;
  sex: Sex;
  startingWeightKg: number;
  goalWeightKg: number;
  activityLevel: ActivityLevelId;
  goalType: GoalType;
  goalRate: GoalRate | null;
  maintenanceCalories: number;
  calculatedTargetCalories: number;
  customTargetCalories: number | null;
  targetNotice: string | null;
  createdAt: string;
  updatedAt: string;
  onboardedAt: string;
}

export interface AppSettings {
  theme: AppTheme;
}

export interface AppData {
  dataVersion: number;
  profile: UserProfile | null;
  settings: AppSettings;
  calorieEntries: CalorieEntry[];
  weightEntries: WeightEntry[];
  training: TrainingData;
  activity: AppleHealthData;
}

export interface ActivityDay {
  date: string;
  steps: number | null;
  activeEnergyKcal: number | null;
  moveMinutes: number | null;
  moveMode: 'energy' | 'time';
  exerciseMinutes: number | null;
  standMinutes: number | null;
  standHours: number | null;
  moveGoal: number | null;
  exerciseGoalMinutes: number | null;
  standGoalHours: number | null;
}

export interface HealthWorkout {
  id: string;
  date: string;
  activity: string;
  name: string;
  start: string;
  end: string;
  minutes: number;
  distanceMeters: number | null;
  activeEnergyKcal: number | null;
}

export interface HealthSnapshot {
  startDate: string;
  endDate: string;
  syncedAt: string;
  days: ActivityDay[];
  workouts: HealthWorkout[];
}

export interface AppleHealthData {
  syncEnabled: boolean;
  snapshot: HealthSnapshot | null;
}

export interface ImportPreview {
  data: AppData;
  calorieEntryCount: number;
  weightEntryCount: number;
  workoutCount: number;
  profileCreatedAt: string | null;
}

export type ShinPain = 'none' | 'mild' | 'painful';
export type SessionKind = 'strengthA' | 'strengthB' | 'strength' | 'endurance' | 'skills' | 'primer' | 'recovery' | 'match' | 'rest';

export interface TrainingPreferences {
  level: 'returning' | 'regular';
  kettlebellsLb: number[];
  weeklyRunMinutes: number;
  maxImpactDays: number;
  allowRunning: boolean;
  allowJumping: boolean;
}

export interface FootballMatch {
  id: string;
  date: string;
  kickoff: string;
  label: string;
  plannedMinutes: number;
}

export interface TrainingCheckIn {
  date: string;
  energy: 'fresh' | 'okay' | 'tired';
  shinPain: ShinPain;
}

export interface TrainingDrill {
  name: string;
  dose: string;
  cue: string;
}

export interface TrainingSession {
  date: string;
  kind: SessionKind;
  title: string;
  minutes: number;
  runningMinutes: number;
  impact: boolean;
  intensity: 'easy' | 'moderate' | 'hard';
  reason: string;
  drills: TrainingDrill[];
  /** Present only on derived sessions, never on saved manual session snapshots. */
  source?: 'appleHealth';
  healthWorkoutIds?: string[];
}

export interface WorkoutLog {
  id: string;
  date: string;
  status: 'completed' | 'skipped';
  session: TrainingSession;
  minutes: number;
  runningMinutes: number;
  effort: number;
  shinPain: ShinPain;
  createdAt: string;
}

export interface TrainingData {
  preferences: TrainingPreferences;
  matches: FootballMatch[];
  weeks: Array<{ weekStart: string; matchStatus: 'unknown' | 'none' }>;
  checkIns: TrainingCheckIn[];
  logs: WorkoutLog[];
  /** null explicitly counts a Health workout separately; no entry uses automatic matching. */
  healthLinks: Array<{ workoutId: string; logId: string | null }>;
}
