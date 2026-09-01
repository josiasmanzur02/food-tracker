import { useEffect, useMemo, useState } from 'react';
import type {
  ActivityLevelId,
  GoalRate,
  GoalType,
  Sex,
  UnitSystem
} from '../types';
import {
  ACTIVITY_LEVELS,
  GAIN_GOAL_RATES,
  LOSS_GOAL_RATES,
  calculateGoalType,
  calculateTarget,
  getGoalPaceDescription
} from '../utils/calories';
import { cmToFeetInches, convertWeightToKg, feetInchesToCm, formatWeight } from '../utils/units';

export interface OnboardingSubmission {
  unitSystem: UnitSystem;
  age: number;
  heightCm: number;
  sex: Sex;
  currentWeightKg: number;
  goalWeightKg: number;
  activityLevel: ActivityLevelId;
  goalRate: GoalRate | null;
}

type StepKey =
  | 'intro'
  | 'units'
  | 'personal'
  | 'goal'
  | 'activity'
  | 'pace'
  | 'summary';

interface OnboardingDraft {
  unitSystem: UnitSystem;
  age: string;
  sex: Sex;
  heightCm: string;
  heightFeet: string;
  heightInches: string;
  currentWeight: string;
  goalWeight: string;
  activityLevel: ActivityLevelId;
  goalRate: GoalRate;
}

const INITIAL_DRAFT: OnboardingDraft = {
  unitSystem: 'imperial',
  age: '',
  sex: 'female',
  heightCm: '',
  heightFeet: '',
  heightInches: '',
  currentWeight: '',
  goalWeight: '',
  activityLevel: 'moderatelyActive',
  goalRate: 'moderate'
};

function getHeightCm(draft: OnboardingDraft): number | null {
  if (draft.unitSystem === 'metric') {
    const parsed = Number(draft.heightCm);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  const feet = Number(draft.heightFeet);
  const inches = Number(draft.heightInches || 0);

  if (!Number.isFinite(feet) || feet <= 0 || !Number.isFinite(inches) || inches < 0) {
    return null;
  }

  return feetInchesToCm(feet, inches);
}

function getWeightKg(value: string, unitSystem: UnitSystem): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? convertWeightToKg(parsed, unitSystem) : null;
}

function getGoalRateOptions(goalType: GoalType) {
  return goalType === 'gain' ? GAIN_GOAL_RATES : LOSS_GOAL_RATES;
}

export function OnboardingPage({
  onComplete
}: {
  onComplete: (submission: OnboardingSubmission) => void;
}) {
  const [draft, setDraft] = useState(INITIAL_DRAFT);
  const [stepIndex, setStepIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const heightCm = useMemo(() => getHeightCm(draft), [draft]);
  const currentWeightKg = useMemo(
    () => getWeightKg(draft.currentWeight, draft.unitSystem),
    [draft.currentWeight, draft.unitSystem]
  );
  const goalWeightKg = useMemo(
    () => getWeightKg(draft.goalWeight, draft.unitSystem),
    [draft.goalWeight, draft.unitSystem]
  );
  const goalType = currentWeightKg && goalWeightKg
    ? calculateGoalType(currentWeightKg, goalWeightKg)
    : 'maintain';

  const steps: StepKey[] =
    goalType === 'maintain'
      ? ['intro', 'units', 'personal', 'goal', 'activity', 'summary']
      : ['intro', 'units', 'personal', 'goal', 'activity', 'pace', 'summary'];

  const currentStep = steps[stepIndex];

  useEffect(() => {
    setStepIndex((current) => Math.min(current, steps.length - 1));
  }, [steps.length]);

  const calculation = useMemo(() => {
    const age = Number(draft.age);

    if (
      !Number.isFinite(age) ||
      !heightCm ||
      !currentWeightKg ||
      !goalWeightKg
    ) {
      return null;
    }

    return calculateTarget({
      age,
      heightCm,
      sex: draft.sex,
      activityLevel: draft.activityLevel,
      currentWeightKg,
      goalWeightKg,
      goalRate: goalType === 'maintain' ? null : draft.goalRate
    });
  }, [draft.activityLevel, draft.age, draft.goalRate, draft.sex, goalType, goalWeightKg, currentWeightKg, heightCm]);

  function handleUnitSystemChange(nextUnitSystem: UnitSystem) {
    setDraft((currentDraft) => {
      if (currentDraft.unitSystem === nextUnitSystem) {
        return currentDraft;
      }

      const currentHeightCm = getHeightCm(currentDraft);
      const currentWeightValue = getWeightKg(currentDraft.currentWeight, currentDraft.unitSystem);
      const goalWeightValue = getWeightKg(currentDraft.goalWeight, currentDraft.unitSystem);
      const convertedHeight = currentHeightCm ? cmToFeetInches(currentHeightCm) : null;

      return {
        ...currentDraft,
        unitSystem: nextUnitSystem,
        heightCm:
          nextUnitSystem === 'metric' && currentHeightCm
            ? String(Math.round(currentHeightCm))
            : '',
        heightFeet:
          nextUnitSystem === 'imperial' && convertedHeight
            ? String(convertedHeight.feet)
            : '',
        heightInches:
          nextUnitSystem === 'imperial' && convertedHeight
            ? String(convertedHeight.inches)
            : '',
        currentWeight:
          currentWeightValue
            ? formatWeight(currentWeightValue, nextUnitSystem).replace(/ (lb|kg)$/, '')
            : '',
        goalWeight:
          goalWeightValue
            ? formatWeight(goalWeightValue, nextUnitSystem).replace(/ (lb|kg)$/, '')
            : ''
      };
    });
  }

  function validateCurrentStep(): boolean {
    if (currentStep === 'personal') {
      const age = Number(draft.age);

      if (!Number.isFinite(age) || age < 10 || age > 120) {
        setErrorMessage('Enter a valid age.');
        return false;
      }

      if (!heightCm || heightCm < 90 || heightCm > 260) {
        setErrorMessage('Enter a valid height.');
        return false;
      }
    }

    if (currentStep === 'goal') {
      if (!currentWeightKg || !goalWeightKg) {
        setErrorMessage('Enter your current and goal weight.');
        return false;
      }
    }

    setErrorMessage(null);
    return true;
  }

  function handleContinue() {
    if (!validateCurrentStep()) {
      return;
    }

    setStepIndex((current) => Math.min(current + 1, steps.length - 1));
  }

  function handleBack() {
    setErrorMessage(null);
    setStepIndex((current) => Math.max(current - 1, 0));
  }

  function handleStartTracking() {
    const age = Number(draft.age);

    if (!heightCm || !currentWeightKg || !goalWeightKg || !Number.isFinite(age)) {
      setErrorMessage('Complete the missing fields to finish onboarding.');
      return;
    }

    onComplete({
      unitSystem: draft.unitSystem,
      age,
      heightCm,
      sex: draft.sex,
      currentWeightKg,
      goalWeightKg,
      activityLevel: draft.activityLevel,
      goalRate: goalType === 'maintain' ? null : draft.goalRate
    });
  }

  return (
    <main className="onboarding">
      <section className="onboarding__panel">
        <div className="onboarding__progress">
          <span>
            Step {stepIndex + 1} of {steps.length}
          </span>
          <div className="progress-track progress-track--soft" aria-hidden="true">
            <div
              className="progress-track__fill"
              style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}
            />
          </div>
        </div>

        {currentStep === 'intro' ? (
          <div className="onboarding__content">
            <p className="page-header__eyebrow">CalorieTrack</p>
            <h1>Let&apos;s calculate your daily calorie target.</h1>
            <p className="page-header__subtitle">
              We&apos;ll estimate how many calories your body uses each day and create a
              target based on your weight goal.
            </p>
          </div>
        ) : null}

        {currentStep === 'units' ? (
          <div className="onboarding__content">
            <p className="page-header__eyebrow">Units</p>
            <h1>Which units do you use?</h1>
            <div className="choice-grid">
              <button
                type="button"
                className={`choice-card ${draft.unitSystem === 'imperial' ? 'choice-card--active' : ''}`}
                onClick={() => handleUnitSystemChange('imperial')}
              >
                <strong>Imperial</strong>
                <span>pounds, feet and inches</span>
              </button>
              <button
                type="button"
                className={`choice-card ${draft.unitSystem === 'metric' ? 'choice-card--active' : ''}`}
                onClick={() => handleUnitSystemChange('metric')}
              >
                <strong>Metric</strong>
                <span>kilograms and centimeters</span>
              </button>
            </div>
          </div>
        ) : null}

        {currentStep === 'personal' ? (
          <div className="onboarding__content">
            <p className="page-header__eyebrow">Profile</p>
            <h1>Tell us a little about you.</h1>
            <form className="stack">
              <label className="field">
                <span>Age</span>
                <input
                  inputMode="numeric"
                  type="number"
                  min="10"
                  max="120"
                  value={draft.age}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, age: event.target.value }))
                  }
                />
              </label>
              {draft.unitSystem === 'metric' ? (
                <label className="field">
                  <span>Height (cm)</span>
                  <input
                    inputMode="numeric"
                    type="number"
                    min="90"
                    max="260"
                    value={draft.heightCm}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        heightCm: event.target.value
                      }))
                    }
                  />
                </label>
              ) : (
                <div className="field-row">
                  <label className="field">
                    <span>Height (ft)</span>
                    <input
                      inputMode="numeric"
                      type="number"
                      min="3"
                      max="8"
                      value={draft.heightFeet}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          heightFeet: event.target.value
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Height (in)</span>
                    <input
                      inputMode="numeric"
                      type="number"
                      min="0"
                      max="11"
                      value={draft.heightInches}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          heightInches: event.target.value
                        }))
                      }
                    />
                  </label>
                </div>
              )}
              <label className="field">
                <span>Sex used for calculation</span>
                <select
                  value={draft.sex}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      sex: event.target.value as Sex
                    }))
                  }
                >
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                </select>
              </label>
              <p className="supporting-copy">
                This is used only for estimating metabolic requirements.
              </p>
            </form>
          </div>
        ) : null}

        {currentStep === 'goal' ? (
          <div className="onboarding__content">
            <p className="page-header__eyebrow">Goal</p>
            <h1>Set your starting point and goal.</h1>
            <div className="field-row">
              <label className="field">
                <span>Current weight ({draft.unitSystem === 'imperial' ? 'lb' : 'kg'})</span>
                <input
                  inputMode="decimal"
                  type="number"
                  min="0"
                  step="0.1"
                  value={draft.currentWeight}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      currentWeight: event.target.value
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>Goal weight ({draft.unitSystem === 'imperial' ? 'lb' : 'kg'})</span>
                <input
                  inputMode="decimal"
                  type="number"
                  min="0"
                  step="0.1"
                  value={draft.goalWeight}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      goalWeight: event.target.value
                    }))
                  }
                />
              </label>
            </div>
            <div className="notice-card">
              <p>
                {goalType === 'lose'
                  ? 'You are currently aiming to lose weight.'
                  : goalType === 'gain'
                    ? 'You are currently aiming to gain weight.'
                    : 'You are currently aiming to maintain your weight.'}
              </p>
            </div>
          </div>
        ) : null}

        {currentStep === 'activity' ? (
          <div className="onboarding__content">
            <p className="page-header__eyebrow">Activity</p>
            <h1>How active are you most weeks?</h1>
            <div className="choice-stack">
              {ACTIVITY_LEVELS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`choice-card choice-card--wide ${draft.activityLevel === option.id ? 'choice-card--active' : ''}`}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      activityLevel: option.id
                    }))
                  }
                >
                  <strong>{option.name}</strong>
                  <span>{option.description}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {currentStep === 'pace' ? (
          <div className="onboarding__content">
            <p className="page-header__eyebrow">Goal pace</p>
            <h1>Choose a pace that feels sustainable.</h1>
            <div className="choice-stack">
              {getGoalRateOptions(goalType).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`choice-card choice-card--wide ${draft.goalRate === option.id ? 'choice-card--active' : ''}`}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      goalRate: option.id
                    }))
                  }
                >
                  <strong>{option.name}</strong>
                  <span>{option.description}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {currentStep === 'summary' && calculation ? (
          <div className="onboarding__content">
            <p className="page-header__eyebrow">Summary</p>
            <h1>Your estimated daily target</h1>
            <div className="summary-card">
              <p className="hero-card__value">{calculation.targetCalories.toLocaleString()}</p>
              <p className="hero-card__caption">kcal per day</p>
            </div>
            <div className="mini-grid mini-grid--summary">
              <div>
                <p className="stat-label">Estimated maintenance</p>
                <p className="stat-value">{calculation.maintenanceCalories.toLocaleString()} kcal</p>
              </div>
              <div>
                <p className="stat-label">Goal pace</p>
                <p className="stat-value">
                  {getGoalPaceDescription(calculation.weeklyChangeKg, draft.unitSystem)}
                </p>
              </div>
              <div>
                <p className="stat-label">Starting weight</p>
                <p className="stat-value">
                  {currentWeightKg ? formatWeight(currentWeightKg, draft.unitSystem) : '—'}
                </p>
              </div>
              <div>
                <p className="stat-label">Goal weight</p>
                <p className="stat-value">
                  {goalWeightKg ? formatWeight(goalWeightKg, draft.unitSystem) : '—'}
                </p>
              </div>
            </div>
            <p className="supporting-copy">
              These values are estimates and may need adjustment based on your actual progress.
            </p>
            {calculation.targetNotice ? (
              <div className="notice-card notice-card--warning">
                <p>{calculation.targetNotice}</p>
              </div>
            ) : null}
          </div>
        ) : null}

        {errorMessage ? <p className="form-message form-message--error">{errorMessage}</p> : null}

        <div className="sheet-actions onboarding__actions">
          {stepIndex > 0 ? (
            <button type="button" className="button button--ghost" onClick={handleBack}>
              Back
            </button>
          ) : (
            <span />
          )}
          {currentStep === 'summary' ? (
            <button type="button" className="button button--primary" onClick={handleStartTracking}>
              Start Tracking
            </button>
          ) : (
            <button type="button" className="button button--primary" onClick={handleContinue}>
              Continue
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
